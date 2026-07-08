use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

use crate::voice_python_setup;

pub const EMBEDDED_AUDIO_ENGINE: &str =
    include_str!("../../packages/veloce-audio/python/audio_engine.py");
pub const EMBEDDED_TTS_ENGINE: &str =
    include_str!("../../packages/veloce-audio/python/tts_engine.py");

#[derive(Default)]
pub struct VoiceState {
    pub sidecar_child: Arc<Mutex<Option<CommandChild>>>,
    pub recording: Arc<Mutex<bool>>,
    pub enabled: Arc<Mutex<bool>>,
    pub tts_child: Arc<Mutex<Option<std::process::Child>>>,
}

#[derive(Deserialize)]
struct SidecarMessage {
    transcription: Option<String>,
    #[serde(default)]
    response_ms: Option<f64>,
    #[serde(default)]
    is_final: Option<bool>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    vu_meter: Option<serde_json::Value>,
}

fn engine_script_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let engine_dir = app_data.join("voice-engine");
    fs::create_dir_all(&engine_dir).map_err(|e| e.to_string())?;
    let script = engine_dir.join("audio_engine.py");
    if !script.exists() || fs::read_to_string(&script).ok().as_deref() != Some(EMBEDDED_AUDIO_ENGINE)
    {
        fs::write(&script, EMBEDDED_AUDIO_ENGINE).map_err(|e| e.to_string())?;
    }
    Ok(script)
}

fn dev_tts_script_path() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest
        .join("..")
        .join("packages")
        .join("veloce-audio")
        .join("python")
        .join("tts_engine.py");
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

fn tts_script_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let engine_dir = app_data.join("voice-engine");
    fs::create_dir_all(&engine_dir).map_err(|e| e.to_string())?;
    let script = engine_dir.join("tts_engine.py");
    if !script.exists() || fs::read_to_string(&script).ok().as_deref() != Some(EMBEDDED_TTS_ENGINE)
    {
        fs::write(&script, EMBEDDED_TTS_ENGINE).map_err(|e| e.to_string())?;
    }
    Ok(script)
}

fn dev_script_path() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest
        .join("..")
        .join("packages")
        .join("veloce-audio")
        .join("python")
        .join("audio_engine.py");
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

pub async fn spawn_audio_engine<R: Runtime>(
    app: &AppHandle<R>,
    state: &VoiceState,
) -> Result<(), String> {
    if state
        .sidecar_child
        .lock()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        let _ = app.emit("voice-status", "ready");
        return Ok(());
    }

    let _ = app.emit("voice-status", "engine-starting");

    let python_exe = voice_python_setup::setup_python_environment(app).await?;
    let script_path = if cfg!(debug_assertions) {
        dev_script_path().unwrap_or(engine_script_path(app)?)
    } else {
        engine_script_path(app)?
    };

    let (mut rx, child) = app
        .shell()
        .command(python_exe.to_string_lossy().to_string())
        .args([script_path.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| format!("voice engine spawn failed: {e}"))?;

    {
        let mut lock = state.sidecar_child.lock().map_err(|e| e.to_string())?;
        *lock = Some(child);
    }

    let app_clone = app.clone();
    let child_arc = state.sidecar_child.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    if let Ok(msg) = serde_json::from_str::<SidecarMessage>(&line) {
                        if let Some(text) = msg.transcription {
                            let _ = app_clone.emit(
                                "transcription-update",
                                serde_json::json!({
                                    "text": text,
                                    "response_ms": msg.response_ms,
                                    "is_final": msg.is_final.unwrap_or(false),
                                }),
                            );
                        }
                        if let Some(err) = msg.error {
                            let _ = app_clone.emit("voice-error", err);
                        }
                        if let Some(status) = msg.status {
                            let _ = app_clone.emit("voice-status", status);
                        }
                        if let Some(vu) = msg.vu_meter {
                            let _ = app_clone.emit("vu-update", vu);
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                    if !line.is_empty() {
                        let _ = app_clone.emit("voice-error", line);
                    }
                }
                CommandEvent::Terminated(_) => {
                    if let Ok(mut lock) = child_arc.lock() {
                        *lock = None;
                    }
                    let _ = app_clone.emit("voice-status", "stopped");
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn write_command(state: &VoiceState, command: &str) -> Result<(), String> {
    let mut lock = state.sidecar_child.lock().map_err(|e| e.to_string())?;
    let Some(child) = lock.as_mut() else {
        return Err("voice engine is not running".into());
    };
    child
        .write(command.as_bytes())
        .map_err(|e| format!("voice stdin write failed: {e}"))?;
    Ok(())
}

pub fn stop_audio_engine(state: &VoiceState) {
    let _ = write_command(state, "EXIT\n");
    if let Ok(mut lock) = state.sidecar_child.lock() {
        if let Some(child) = lock.take() {
            let _ = child.kill();
        }
    }
    if let Ok(mut rec) = state.recording.lock() {
        *rec = false;
    }
}

#[tauri::command]
pub async fn voice_toggle_recording<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
) -> Result<bool, String> {
    if !*state.enabled.lock().map_err(|e| e.to_string())? {
        return Err("voice disabled (set DEVHUB_VOICE_ENABLED=1)".into());
    }

    if state.sidecar_child.lock().map_err(|e| e.to_string())?.is_none() {
        spawn_audio_engine(&app, &state).await?;
    }

    let mut recording = state.recording.lock().map_err(|e| e.to_string())?;
    *recording = !*recording;
    if *recording {
        stop_tts(&state);
    }
    let cmd = if *recording { "START\n" } else { "STOP\n" };
    write_command(&state, cmd)?;
    let _ = app.emit("recording-state", *recording);
    Ok(*recording)
}

#[tauri::command]
pub fn voice_set_enabled(state: State<'_, VoiceState>, enabled: bool) -> Result<(), String> {
    let mut lock = state.enabled.lock().map_err(|e| e.to_string())?;
    *lock = enabled;
    Ok(())
}

#[tauri::command]
pub async fn voice_start_engine<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
) -> Result<(), String> {
    spawn_audio_engine(&app, &state).await
}

#[tauri::command]
pub fn voice_stop_engine(state: State<'_, VoiceState>) -> Result<(), String> {
    stop_audio_engine(&state);
    Ok(())
}

fn stop_tts(state: &VoiceState) {
    if let Ok(mut lock) = state.tts_child.lock() {
        if let Some(mut child) = lock.take() {
            let _ = child.kill();
        }
    }
    // ponytail: best-effort stop paplay/aplay/ffplay spawned by tts_engine play_wav
    #[cfg(target_os = "linux")]
    {
        for player in ["paplay", "aplay", "ffplay"] {
            let _ = std::process::Command::new("pkill")
                .args(["-f", player])
                .status();
        }
    }
}

#[tauri::command]
pub fn voice_stop_speak(state: State<'_, VoiceState>) -> Result<(), String> {
    stop_tts(&state);
    Ok(())
}

#[tauri::command]
pub async fn voice_set_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
    settings: serde_json::Value,
) -> Result<(), String> {
    if state.sidecar_child.lock().map_err(|e| e.to_string())?.is_none() {
        spawn_audio_engine(&app, &state).await?;
    }
    let payload = settings.to_string();
    write_command(&state, &format!("CONFIG {payload}\n"))
}

#[tauri::command]
pub async fn voice_speak<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
    text: String,
    // Opaque passthrough merged into the SPEAK payload as-is (e.g. `voice`,
    // `length_scale`) so new tts_engine.py knobs don't need a matching Rust
    // struct field + IPC casing to keep in sync on every change.
    options: Option<serde_json::Value>,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    stop_tts(&state);

    let python_exe = voice_python_setup::setup_python_environment(&app).await?;
    let tts_script = if cfg!(debug_assertions) {
        dev_tts_script_path().unwrap_or(tts_script_path(&app)?)
    } else {
        tts_script_path(&app)?
    };

    let venv_bin = python_exe
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let path_env = std::env::var("PATH").unwrap_or_default();
    let merged_path = if venv_bin.as_os_str().is_empty() {
        path_env
    } else {
        format!("{}:{}", venv_bin.to_string_lossy(), path_env)
    };

    let mut payload_obj = serde_json::Map::new();
    payload_obj.insert("text".to_string(), serde_json::Value::String(text.clone()));
    if let Some(serde_json::Value::Object(opts)) = options {
        for (key, value) in opts {
            payload_obj.insert(key, value);
        }
    }
    let payload = serde_json::Value::Object(payload_obj).to_string();
    let child = std::process::Command::new(&python_exe)
        .arg(&tts_script)
        .env("PATH", merged_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("tts spawn failed: {e}"))?;

    {
        let mut lock = state.tts_child.lock().map_err(|e| e.to_string())?;
        *lock = Some(child);
    }

    let tts_arc = state.tts_child.clone();
    let app_clone = app.clone();
    let text_for_task = text.clone();

    tauri::async_runtime::spawn(async move {
        let output = {
            let mut lock = match tts_arc.lock() {
                Ok(l) => l,
                Err(_) => return,
            };
            let Some(mut child) = lock.take() else {
                return;
            };
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = writeln!(stdin, "SPEAK {payload}");
            }
            child.wait_with_output()
        };

        if let Ok(mut lock) = tts_arc.lock() {
            *lock = None;
        }

        let output = match output {
            Ok(o) => o,
            Err(e) => {
                let _ = app_clone.emit("tts-error", e.to_string());
                return;
            }
        };

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let msg = if err.trim().is_empty() {
                "tts failed".to_string()
            } else {
                err.trim().to_string()
            };
            let _ = app_clone.emit("tts-error", &msg);
            return;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                if val.get("type").and_then(|t| t.as_str()) == Some("tts-error") {
                    let _ = app_clone.emit(
                        "tts-error",
                        val.get("error").cloned().unwrap_or_default(),
                    );
                    return;
                }
                if val.get("type").and_then(|t| t.as_str()) == Some("tts-done") {
                    let _ = app_clone.emit("tts-done", ());
                }
            }
        }

        let _ = text_for_task;
    });

    Ok(())
}

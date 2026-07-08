use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const PYTHON_DIR_NAME: &str = "python-embed";
const REQUIREMENTS_FILE_NAME: &str = "requirements.txt";
const REQUIREMENTS_LITE_FILE_NAME: &str = "requirements-lite.txt";
const TORCH_CPU_INDEX: &str = "https://download.pytorch.org/whl/cpu";

static VENV_SETUP: Mutex<()> = Mutex::new(());

fn emit_log<R: Runtime>(app: &AppHandle<R>, msg: &str) {
    let _ = app.emit("voice-status", msg);
    println!("[voice-setup] {}", msg);
}

fn locate_requirements_file<R: Runtime>(app: &AppHandle<R>, file_name: &str) -> Option<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        paths.push(resources.join("python").join(file_name));
        paths.push(resources.join("veloce-audio").join(file_name));
        paths.push(resources.join(file_name));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    paths.push(
        manifest
            .join("..")
            .join("packages")
            .join("veloce-audio")
            .join("python")
            .join(file_name),
    );
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("veloce-audio").join(file_name));
        }
    }
    paths.into_iter().find(|p| p.exists())
}

fn locate_requirements<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    locate_requirements_file(app, REQUIREMENTS_FILE_NAME)
}

#[cfg(target_os = "windows")]
fn locate_requirements_lite<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    locate_requirements_file(app, REQUIREMENTS_LITE_FILE_NAME)
}

fn run_pip<R: Runtime>(_app: &AppHandle<R>, python_exe: &Path, args: &[&str]) -> Result<(), String> {
    let status = Command::new(python_exe)
        .args(args)
        .status()
        .map_err(|e| format!("pip failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("pip {:?} failed", args))
    }
}

fn pip_install<R: Runtime>(
    app: &AppHandle<R>,
    python_exe: &Path,
    req: &Path,
    install_torch: bool,
) -> Result<(), String> {
    emit_log(app, "preparing-deps");
    let _ = run_pip(
        app,
        python_exe,
        &["-m", "pip", "install", "--upgrade", "pip"],
    );

    let req_str = req.to_string_lossy().into_owned();
    run_pip(
        app,
        python_exe,
        &["-m", "pip", "install", "-r", req_str.as_str()],
    )?;

    if install_torch {
        emit_log(app, "installing-torch-cpu");
        run_pip(
            app,
            python_exe,
            &[
                "-m",
                "pip",
                "install",
                "torch",
                "torchaudio",
                "--index-url",
                TORCH_CPU_INDEX,
            ],
        )?;
    }

    emit_log(app, "deps-ready");
    Ok(())
}

fn dev_bundled_python() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let python = manifest
        .join("..")
        .join("packages")
        .join("veloce-audio")
        .join("python")
        .join(".venv")
        .join("bin")
        .join("python");
    let marker = manifest
        .join("..")
        .join("packages")
        .join("veloce-audio")
        .join("python")
        .join(".venv")
        .join(".voice_deps_ok");
    if python.exists() && marker.exists() {
        Some(python)
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
pub async fn setup_python_environment<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(py) = dev_bundled_python() {
        emit_log(app, "using-dev-voice-venv");
        return Ok(py);
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let python_dir = app_dir.join(PYTHON_DIR_NAME);
    let python_exe = python_dir.join("bin").join("python");
    let marker = python_dir.join(".voice_deps_ok");

    if python_exe.exists() && marker.exists() {
        return Ok(python_exe);
    }

    let _guard = VENV_SETUP
        .lock()
        .map_err(|e| format!("voice setup lock poisoned: {e}"))?;

    if python_exe.exists() && marker.exists() {
        return Ok(python_exe);
    }

    emit_log(app, "preparing-venv");

    if !python_dir.exists() {
        fs::create_dir_all(&python_dir).map_err(|e| e.to_string())?;
        let status = Command::new("python3")
            .args(["-m", "venv", &python_dir.to_string_lossy().into_owned()])
            .status()
            .map_err(|e| format!("python3 -m venv failed: {e}"))?;
        if !status.success() {
            return Err("python3-venv required. Install python3-venv package.".into());
        }
    }

    if let Some(req) = locate_requirements(app) {
        pip_install(app, &python_exe, &req, true)?;
        let _ = fs::write(&marker, "ok");
    } else {
        emit_log(app, "requirements-missing");
        return Err("voice requirements.txt not found".into());
    }

    Ok(python_exe)
}

// Windows gets a lightweight, cloud-only setup: no torch/faster-whisper, just
// enough (numpy/sounddevice/pyyaml) to run mic capture + VAD and hand audio
// segments to Grok STT (xAI) over REST. See requirements-lite.txt. Local
// Whisper on Windows stays out of scope (openspec decision in the Grok STT
// plan) -- upgrade path is to add a "full" Windows profile mirroring the
// Linux branch above (venv + requirements.txt + torch CPU wheel) later.
#[cfg(target_os = "windows")]
fn dev_bundled_python_lite() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let venv = manifest
        .join("..")
        .join("packages")
        .join("veloce-audio")
        .join("python")
        .join(".venv");
    let python = venv.join("Scripts").join("python.exe");
    let marker = venv.join(".voice_deps_lite_ok");
    if python.exists() && marker.exists() {
        Some(python)
    } else {
        None
    }
}

// Resolves a system Python launcher: `python` first (python.org/MS Store
// installs put this on PATH), then the `py -3` launcher that Windows ships
// even when a bare `python3`/`python` command doesn't exist. Note: if only
// the Microsoft Store's "App Execution Alias" stub is present (Python not
// actually installed), `python --version` still exits non-zero/fast rather
// than hanging, so this check stays quick either way.
#[cfg(target_os = "windows")]
fn resolve_system_python() -> Option<(String, Vec<String>)> {
    let has_python = Command::new("python")
        .arg("--version")
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if has_python {
        return Some(("python".to_string(), Vec::new()));
    }

    let has_py_launcher = Command::new("py")
        .args(["-3", "--version"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if has_py_launcher {
        return Some(("py".to_string(), vec!["-3".to_string()]));
    }

    None
}

#[cfg(target_os = "windows")]
pub async fn setup_python_environment<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(py) = dev_bundled_python_lite() {
        emit_log(app, "using-dev-voice-venv-lite");
        return Ok(py);
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let python_dir = app_dir.join(PYTHON_DIR_NAME);
    let python_exe = python_dir.join("Scripts").join("python.exe");
    let marker = python_dir.join(".voice_deps_lite_ok");

    if python_exe.exists() && marker.exists() {
        return Ok(python_exe);
    }

    let _guard = VENV_SETUP
        .lock()
        .map_err(|e| format!("voice setup lock poisoned: {e}"))?;

    if python_exe.exists() && marker.exists() {
        return Ok(python_exe);
    }

    emit_log(app, "preparing-venv-lite");

    if !python_exe.exists() {
        let (launcher, mut launcher_args) = resolve_system_python().ok_or_else(|| {
            "No se encontró Python en el sistema. Instala Python 3 desde python.org o Microsoft Store, luego reintenta.".to_string()
        })?;

        launcher_args.push("-m".to_string());
        launcher_args.push("venv".to_string());
        launcher_args.push(python_dir.to_string_lossy().into_owned());

        let status = Command::new(&launcher)
            .args(&launcher_args)
            .status()
            .map_err(|e| format!("{launcher} -m venv failed: {e}"))?;
        if !status.success() {
            return Err("No se pudo crear el entorno virtual de Python para el motor de voz.".into());
        }
    }

    if let Some(req) = locate_requirements_lite(app) {
        pip_install(app, &python_exe, &req, false)?;
        let _ = fs::write(&marker, "ok");
    } else {
        emit_log(app, "requirements-lite-missing");
        return Err("voice requirements-lite.txt not found".into());
    }

    Ok(python_exe)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub async fn setup_python_environment<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let _ = app;
    Err("DevHub voice engine is only wired for Linux and Windows in this build.".into())
}

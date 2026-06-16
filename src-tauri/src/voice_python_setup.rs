use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const PYTHON_DIR_NAME: &str = "python-embed";
const REQUIREMENTS_FILE_NAME: &str = "requirements.txt";
const TORCH_CPU_INDEX: &str = "https://download.pytorch.org/whl/cpu";

static VENV_SETUP: Mutex<()> = Mutex::new(());

fn emit_log<R: Runtime>(app: &AppHandle<R>, msg: &str) {
    let _ = app.emit("voice-status", msg);
    println!("[voice-setup] {}", msg);
}

fn locate_requirements<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        paths.push(resources.join("python").join(REQUIREMENTS_FILE_NAME));
        paths.push(resources.join("veloce-audio").join(REQUIREMENTS_FILE_NAME));
        paths.push(resources.join(REQUIREMENTS_FILE_NAME));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    paths.push(
        manifest
            .join("..")
            .join("packages")
            .join("veloce-audio")
            .join("python")
            .join(REQUIREMENTS_FILE_NAME),
    );
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("veloce-audio").join(REQUIREMENTS_FILE_NAME));
        }
    }
    paths.into_iter().find(|p| p.exists())
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

fn pip_install<R: Runtime>(app: &AppHandle<R>, python_exe: &Path, req: &Path) -> Result<(), String> {
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
        pip_install(app, &python_exe, &req)?;
        let _ = fs::write(&marker, "ok");
    } else {
        emit_log(app, "requirements-missing");
        return Err("voice requirements.txt not found".into());
    }

    Ok(python_exe)
}

#[cfg(not(target_os = "linux"))]
pub async fn setup_python_environment<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let _ = app;
    Err("DevHub voice engine is only wired for Linux in this build.".into())
}

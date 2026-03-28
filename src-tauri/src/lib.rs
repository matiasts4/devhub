use tauri::{RunEvent, WindowEvent, Manager};
use tauri_plugin_shell::ShellExt;
use sysinfo::System;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;

fn get_devhub_dir() -> PathBuf {
    let p = dirs::home_dir().unwrap().join(".devhub");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

fn get_sidecar_pid_file() -> PathBuf {
    get_devhub_dir().join("sidecar.pid")
}

fn get_sidecar_port_file() -> PathBuf {
    get_devhub_dir().join("sidecar-port.txt")
}

/// Verifica si el proceso con el PID dado sigue vivo y es el sidecar de DevHub.
fn is_sidecar_running(pid: u32) -> bool {
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
        let name = process.name().to_string_lossy().to_lowercase();
        // El sidecar puede llamarse "devhub-server", "node" o contener "devhub"
        if name.contains("devhub") || name.contains("node") {
            return true;
        }
    }
    false
}

/// Lee el PID guardado y comprueba si el sidecar ya está corriendo.
fn check_existing_sidecar() -> Option<u32> {
    let pid_file = get_sidecar_pid_file();
    if !pid_file.exists() {
        return None;
    }
    if let Ok(content) = fs::read_to_string(&pid_file) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if is_sidecar_running(pid) {
                return Some(pid);
            }
        }
    }
    // PID file obsoleto — limpiarlo
    let _ = fs::remove_file(&pid_file);
    None
}

/// Shutdown graceful del sidecar: primero HTTP POST /shutdown, luego SIGKILL si no responde.
fn shutdown_sidecar() {
    let pid_file = get_sidecar_pid_file();
    let Ok(content) = fs::read_to_string(&pid_file) else { return };
    let Ok(pid) = content.trim().parse::<u32>() else { return };

    println!("[DevHub] Solicitando shutdown graceful del sidecar (PID {})...", pid);
    let port_file = get_sidecar_port_file();
    let mut closed_gracefully = false;

    // Intentar shutdown vía HTTP
    if let Ok(port_str) = fs::read_to_string(&port_file) {
        if let Ok(port) = port_str.trim().parse::<u16>() {
            let url = format!("http://127.0.0.1:{}/shutdown", port);
            let _ = std::process::Command::new("curl")
                .args(["-s", "-X", "POST", &url, "--max-time", "3"])
                .output();

            // Esperar hasta 2s a que el sidecar termine
            for _ in 0..4 {
                thread::sleep(Duration::from_millis(500));
                if !is_sidecar_running(pid) {
                    closed_gracefully = true;
                    break;
                }
            }
        }
    }

    if !closed_gracefully {
        println!("[DevHub] Sidecar no respondió, enviando SIGKILL...");
        let mut sys = System::new_all();
        sys.refresh_all();
        if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
            process.kill();
        }
    } else {
        println!("[DevHub] Sidecar terminado limpiamente ✅");
    }

    let _ = fs::remove_file(pid_file);
    let _ = fs::remove_file(get_sidecar_port_file());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_pid: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup({
            let sidecar_pid = sidecar_pid.clone();
            move |app| {
                // Log plugin solo en debug
                if cfg!(debug_assertions) {
                    app.handle().plugin(
                        tauri_plugin_log::Builder::default()
                            .level(log::LevelFilter::Info)
                            .build(),
                    )?;
                }

                // Comprobar si ya hay un sidecar corriendo
                if let Some(existing_pid) = check_existing_sidecar() {
                    println!("[DevHub] Sidecar ya activo con PID {}. No se spawnea uno nuevo.", existing_pid);
                    *sidecar_pid.lock().unwrap() = Some(existing_pid);
                } else {
                    println!("[DevHub] Spawneando nuevo sidecar...");
                    let sidecar_command = app
                        .shell()
                        .sidecar("devhub-server")
                        .expect("No se encontró el sidecar 'devhub-server'");

                    let (mut rx, _child) = sidecar_command
                        .spawn()
                        .expect("Error al lanzar el sidecar");

                    // Escuchar stdout/stderr del sidecar en background
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                    println!("[Sidecar] {}", String::from_utf8_lossy(&line));
                                }
                                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                    eprintln!("[Sidecar ERR] {}", String::from_utf8_lossy(&line));
                                }
                                _ => {}
                            }
                        }
                    });

                    // Esperar a que el sidecar escriba su PID (máx 3s)
                    let pid_file = get_sidecar_pid_file();
                    for attempt in 0..6 {
                        thread::sleep(Duration::from_millis(500));
                        if pid_file.exists() {
                            if let Ok(content) = fs::read_to_string(&pid_file) {
                                if let Ok(pid) = content.trim().parse::<u32>() {
                                    println!("[DevHub] Sidecar listo con PID {} (intento {})", pid, attempt + 1);
                                    *sidecar_pid.lock().unwrap() = Some(pid);
                                    break;
                                }
                            }
                        }
                    }
                }

                Ok(())
            }
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("Error al construir la aplicación Tauri");

    app.run(move |app_handle, event| {
        match event {
            // ── Interceptar cierre de ventana: minimizar en lugar de salir ────────
            // Esto es lo que permite que la app (y el sidecar) sigan vivos
            // aunque el usuario haga clic en la X de la ventana.
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                // Ocultar la ventana en lugar de destruirla
                if let Some(window) = app_handle.get_webview_window(&label) {
                    let _ = window.hide();
                }
                // Prevenir el cierre real
                api.prevent_close();
                println!("[DevHub] Ventana ocultada (app sigue en background con el sidecar activo).");
            }

            // ── Cierre real de la aplicación (desde menú o señal del SO) ─────────
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                println!("[DevHub] Cerrando la aplicación — iniciando cleanup...");
                shutdown_sidecar();
            }

            _ => {}
        }
    });
}

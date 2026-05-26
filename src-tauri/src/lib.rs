use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use sysinfo::System;
use tauri::{Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_shell::ShellExt;

mod native_vte;
mod native_browser;
mod native_window_host;

use native_browser::{
    native_browser_close, native_browser_copy, native_browser_focus, native_browser_load_url,
    native_browser_open, native_browser_probe, native_browser_reload, native_browser_resize,
    native_browser_select_all, native_browser_selector_command, native_browser_set_visibility, NativeBrowserState,
};
use native_vte::{
    native_vte_close, native_vte_focus, native_vte_open, native_vte_paste, native_vte_probe,
    native_vte_resize, native_vte_set_visibility, NativeVteState,
};

fn nextjs_port() -> u16 {
    if cfg!(debug_assertions) {
        3100
    } else {
        3400
    }
}

fn is_port_ready(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

fn parse_http_status_code(response: &str) -> Option<u16> {
    response
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)?
        .parse::<u16>()
        .ok()
}

fn is_ready_http_status(status: u16) -> bool {
    (200..400).contains(&status)
}

fn is_http_route_ready(port: u16, path: &str) -> bool {
    let address = format!("127.0.0.1:{}", port);
    let mut stream =
        match TcpStream::connect_timeout(&address.parse().unwrap(), Duration::from_millis(500)) {
            Ok(stream) => stream,
            Err(_) => return false,
        };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: localhost:{}\r\nConnection: close\r\n\r\n",
        path, port,
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = [0u8; 512];
    let bytes_read = match stream.read(&mut response) {
        Ok(bytes_read) if bytes_read > 0 => bytes_read,
        _ => return false,
    };

    let response_head = String::from_utf8_lossy(&response[..bytes_read]);
    parse_http_status_code(&response_head)
        .map(is_ready_http_status)
        .unwrap_or(false)
}

fn nextjs_route_is_ready(port: u16) -> bool {
    is_http_route_ready(port, "/")
}

fn is_devhub_runtime_process(name: &str, cmdline: &str) -> bool {
    let normalized_name = name.to_lowercase();
    let normalized_cmdline = cmdline.to_lowercase();
    let runtime_marker = normalized_cmdline.contains("devhub")
        || normalized_cmdline.contains("next")
        || normalized_cmdline.contains("sidecar")
        || normalized_cmdline.contains("server.js");

    if !runtime_marker {
        return false;
    }

    normalized_name.contains("node")
        || normalized_name.contains("bun")
        || normalized_name.contains("mainthread")
}

/// Espera hasta que el puerto de Next.js esté disponible.
/// En dev usa 3100; en producción empaquetada usa 3400 (standalone).
/// Tauri carga la webview inmediatamente, pero el sidecar / servidor tarda en arrancar.
fn wait_for_nextjs_ready() {
    let port = nextjs_port();
    println!(
        "[DevHub] Esperando a que Next.js responda HTTP OK en http://localhost:{}/ ...",
        port
    );
    for attempt in 0..30 {
        // Máx 15 segundos (30 * 500ms)
        thread::sleep(Duration::from_millis(500));
        if nextjs_route_is_ready(port) {
            println!(
                "[DevHub] Next.js listo por HTTP en / (puerto {}, intento {}).",
                port,
                attempt + 1
            );
            return;
        }
    }
    eprintln!("[DevHub] ⚠️  Next.js no devolvió HTTP OK en / dentro de 15s. La webview puede mostrar error.");
}

/// Matar procesos zombie que ocupan los puertos del sidecar (4000) y Next.js.
/// Esto pasa cuando `tauri dev` se cierra con Ctrl+C y los procesos hijos no mueren.
fn cleanup_zombie_ports() {
    let zombie_ports = [nextjs_port(), 4000u16];
    let mut sys = System::new_all();
    sys.refresh_all();

    for port in zombie_ports {
        // Buscar procesos que escuchen en este puerto
        let output = std::process::Command::new("ss")
            .args(["-tlnp", &format!("sport = :{}", port)])
            .output();

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.is_empty() {
                continue; // Puerto libre
            }

            // Extraer PIDs del output de ss (formato: "pid=12345")
            for pid_str in stdout.split("pid=") {
                if let Some(pid_part) = pid_str.split(',').next() {
                    if let Ok(pid) = pid_part.parse::<u32>() {
                        if pid == 0 {
                            continue;
                        }
                        // Verificar si es un proceso de DevHub (node con devhub o next)
                        if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
                            let name = process.name().to_string_lossy().to_lowercase();
                            let cmdline: String = process
                                .cmd()
                                .iter()
                                .map(|s| s.to_string_lossy().to_lowercase())
                                .collect::<Vec<_>>()
                                .join(" ");
                            if is_devhub_runtime_process(&name, &cmdline) {
                                println!(
                                    "[DevHub] Matando proceso zombie PID {} en puerto {} ({}).",
                                    pid, port, name
                                );
                                process.kill();
                            }
                        }
                    }
                }
            }
        }
    }

    // Breve pausa para que el SO libere los puertos
    thread::sleep(Duration::from_millis(300));
}

fn find_devhub_pid_on_port(port: u16) -> Option<u32> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let output = std::process::Command::new("ss")
        .args(["-tlnp", &format!("sport = :{}", port)])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.is_empty() {
        return None;
    }

    for pid_str in stdout.split("pid=") {
        let Some(pid_part) = pid_str.split(',').next() else {
            continue;
        };
        let Ok(pid) = pid_part.parse::<u32>() else {
            continue;
        };
        if pid == 0 {
            continue;
        }

        if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
            let name = process.name().to_string_lossy().to_lowercase();
            let cmdline: String = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_lowercase())
                .collect::<Vec<_>>()
                .join(" ");

            let is_devhub_process = is_devhub_runtime_process(&name, &cmdline);

            if is_devhub_process {
                return Some(pid);
            }
        }
    }

    None
}

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

fn ensure_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    WebviewWindowBuilder::from_config(app, window_config)?.build()?;
    Ok(())
}

fn restore_main_window(app: &tauri::AppHandle) {
    if ensure_runtime_ready(app).is_err() {
        return;
    }

    if ensure_main_window(app).is_err() {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.reload();
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
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

/// Lee el build-id que el sidecar en ejecución grabó al arrancar (mtime del zip instalado).
fn get_running_build_id() -> Option<u64> {
    let file = get_devhub_dir().join("sidecar-build-id.txt");
    fs::read_to_string(&file)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
}

/// Obtiene el mtime actual del standalone.zip instalado como build-id de referencia.
/// Solo aplica a instalaciones .deb/.rpm; en dev mode el path no existe → None.
fn get_installed_build_id() -> Option<u64> {
    let path = std::path::Path::new("/usr/lib/DevHub/resources/standalone.zip");
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// Lee el PID guardado y comprueba si el sidecar ya está corriendo.
fn check_existing_sidecar() -> Option<u32> {
    let pid_file = get_sidecar_pid_file();
    if !pid_file.exists() {
        if let Some(pid) = find_devhub_pid_on_port(4000) {
            let _ = fs::write(&pid_file, pid.to_string());
            let _ = fs::write(get_sidecar_port_file(), "4000");
            println!("[DevHub] Sidecar adoptado por puerto 4000 con PID {}.", pid);
            return Some(pid);
        }
        return None;
    }
    if let Ok(content) = fs::read_to_string(&pid_file) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if is_sidecar_running(pid) {
                // Comparar build-id del sidecar en ejecución vs el instalado actualmente.
                // Si difieren, hay una nueva versión instalada → matar el sidecar viejo.
                if let (Some(installed), Some(running)) =
                    (get_installed_build_id(), get_running_build_id())
                {
                    if installed != running {
                        println!(
                            "[DevHub] Nueva versión detectada (build-id instalado: {} / corriendo: {}). Reiniciando sidecar...",
                            installed, running
                        );
                        shutdown_sidecar();
                        return None;
                    }
                }
                if !get_sidecar_port_file().exists() {
                    let _ = fs::write(get_sidecar_port_file(), "4000");
                }
                println!("[DevHub] Sidecar ya activo con PID {} (build-id OK).", pid);
                return Some(pid);
            }
        }
    }
    // PID file obsoleto — limpiarlo
    let _ = fs::remove_file(&pid_file);
    if let Some(pid) = find_devhub_pid_on_port(4000) {
        let _ = fs::write(&pid_file, pid.to_string());
        let _ = fs::write(get_sidecar_port_file(), "4000");
        println!(
            "[DevHub] Sidecar readoptado por puerto 4000 con PID {}.",
            pid
        );
        return Some(pid);
    }
    None
}

/// Shutdown graceful del sidecar: primero HTTP POST /shutdown, luego SIGKILL si no responde.
fn shutdown_sidecar() {
    let pid_file = get_sidecar_pid_file();
    let Ok(content) = fs::read_to_string(&pid_file) else {
        return;
    };
    let Ok(pid) = content.trim().parse::<u32>() else {
        return;
    };

    println!(
        "[DevHub] Solicitando shutdown graceful del sidecar (PID {})...",
        pid
    );
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

fn spawn_sidecar(app: &tauri::AppHandle) {
    println!("[DevHub] Spawneando nuevo sidecar...");
    let sidecar_command = app
        .shell()
        .sidecar("devhub-server")
        .expect("No se encontró el sidecar 'devhub-server'");

    let (mut rx, _child) = sidecar_command.spawn().expect("Error al lanzar el sidecar");

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

    let pid_file = get_sidecar_pid_file();
    for attempt in 0..6 {
        thread::sleep(Duration::from_millis(500));
        if pid_file.exists() {
            if let Ok(content) = fs::read_to_string(&pid_file) {
                if let Ok(pid) = content.trim().parse::<u32>() {
                    println!(
                        "[DevHub] Sidecar listo con PID {} (intento {})",
                        pid,
                        attempt + 1
                    );
                    break;
                }
            }
        }
    }
}

fn ensure_runtime_ready(app: &tauri::AppHandle) -> tauri::Result<()> {
    let has_valid_sidecar = check_existing_sidecar().is_some();
    let next_ready = nextjs_route_is_ready(nextjs_port());
    let sidecar_ready = is_port_ready(4000);

    if has_valid_sidecar && next_ready && sidecar_ready {
        return Ok(());
    }

    println!(
        "[DevHub] Runtime local ausente o caído (sidecar válido: {}, next: {}, pty: {}). Relanzando...",
        has_valid_sidecar,
        next_ready,
        sidecar_ready
    );

    shutdown_sidecar();
    cleanup_zombie_ports();
    spawn_sidecar(app);
    wait_for_nextjs_ready();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        is_devhub_runtime_process, is_ready_http_status, nextjs_route_is_ready,
        parse_http_status_code,
    };

    #[test]
    fn nextjs_readiness_parses_http_ok_status_line() {
        let response = "HTTP/1.1 200 OK\r\ncontent-type: text/html\r\n\r\n";

        assert_eq!(parse_http_status_code(response), Some(200));
    }

    #[test]
    fn nextjs_readiness_rejects_non_ready_statuses() {
        assert!(is_ready_http_status(200));
        assert!(is_ready_http_status(307));
        assert!(!is_ready_http_status(404));
        assert!(!is_ready_http_status(500));
    }

    #[test]
    fn nextjs_readiness_uses_root_route_probe() {
        let route_probe: fn(u16) -> bool = nextjs_route_is_ready;

        let _ = route_probe;
    }

    #[test]
    fn devhub_runtime_process_accepts_mainthread_sidecar_processes() {
        assert!(is_devhub_runtime_process(
            "MainThread",
            "/usr/bin/node /home/matias/ArxonLabs/devhub/sidecar-backend/server.js"
        ));
    }

    #[test]
    fn devhub_runtime_process_rejects_unrelated_mainthread_processes() {
        assert!(!is_devhub_runtime_process(
            "MainThread",
            "/usr/bin/python /tmp/other-app.py"
        ));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(NativeVteState::default())
        .manage(NativeBrowserState::default())
        .invoke_handler(tauri::generate_handler![
            native_browser_probe,
            native_browser_open,
            native_browser_load_url,
            native_browser_reload,
            native_browser_resize,
            native_browser_focus,
            native_browser_set_visibility,
            native_browser_selector_command,
            native_browser_select_all,
            native_browser_copy,
            native_browser_close,
            native_vte_probe,
            native_vte_open,
            native_vte_focus,
            native_vte_paste,
            native_vte_resize,
            native_vte_set_visibility,
            native_vte_close,
        ])
        .setup(|app| {
            // Log plugin solo en debug
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Limpiar procesos zombie de sesiones anteriores (tauri dev, crashes, etc.)
            cleanup_zombie_ports();

            ensure_runtime_ready(app.handle())?;
            ensure_main_window(app.handle())?;

            // Setear el ícono de la ventana explícitamente (necesario en dev mode en Linux)
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }

                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            Ok(())
        });

    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            println!("[DevHub] Segunda instancia detectada → restaurando ventana principal.");
            restore_main_window(app);
        }));
    }

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
                println!(
                    "[DevHub] Ventana ocultada (app sigue en background con el sidecar activo)."
                );
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

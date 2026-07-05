use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use sysinfo::System;
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_shell::ShellExt;

mod native_browser;
mod native_window_host;
mod alacritty_terminal_host;
mod system_clipboard;
mod voice_engine;
mod voice_python_setup;

use native_browser::{
    native_browser_close, native_browser_copy, native_browser_focus, native_browser_load_url,
    native_browser_open, native_browser_probe, native_browser_raise, native_browser_reload,
    native_browser_resize, native_browser_select_all, native_browser_selector_command,
    native_browser_set_visibility, NativeBrowserState,
};
use system_clipboard::{
    read_system_clipboard_image, read_system_clipboard_text, write_clipboard_image_to_temp_file,
};
use voice_engine::{
    spawn_audio_engine, voice_set_enabled, voice_set_settings, voice_speak, voice_start_engine,
    voice_stop_engine, voice_stop_speak, voice_toggle_recording, VoiceState,
};

const NEXTJS_READY_POLL_MS: u64 = 500;
// 30 s en release (antes 240 → 2 min), 15 s en dev. La ventana se muestra
// igual mientras tanto; este timeout solo limita cuánto esperamos antes de
// delegar al recovery en background.
const NEXTJS_READY_STARTUP_ATTEMPTS: usize = 60;
const NEXTJS_READY_RECOVERY_ATTEMPTS: usize = 60;

/// Canonical absolute path to the server entry point inside the packaged standalone.
/// Works from both dev (`.next/standalone/server.js`) and installed
/// (`~/.devhub/standalone/server.js`) layouts.
#[allow(dead_code)]
fn standalone_server_path() -> PathBuf {
    let dir = devhub_dir();
    // Installed layout: ~/.devhub/standalone/server.js
    let installed = dir.join("standalone").join("server.js");
    if installed.exists() {
        return installed;
    }
    // Dev layout: $PROJECT/.next/standalone/server.js
    // Heuristic: detect via DEVHUB_HOME if it points to a project dir.
    let dev_path = std::env::var("DEVHUB_DEV_PROJECT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    dev_path.join(".next").join("standalone").join("server.js")
}

fn nextjs_port() -> u16 {
    if cfg!(debug_assertions) {
        3100
    } else {
        3400
    }
}

fn sidecar_port() -> u16 {
    std::env::var("SIDECAR_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| if cfg!(debug_assertions) { 4001 } else { 4000 })
}

fn ws_port() -> u16 {
    std::env::var("DEVHUB_WS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| if cfg!(debug_assertions) { 3402 } else { 3401 })
}

fn tty_port() -> u16 {
    std::env::var("DEVHUB_TTY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| if cfg!(debug_assertions) { 4078 } else { 4077 })
}

fn devhub_dir() -> PathBuf {
    let p = std::env::var("DEVHUB_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            if cfg!(debug_assertions) {
                dirs::home_dir().unwrap().join(".devhub-dev")
            } else {
                dirs::home_dir().unwrap().join(".devhub")
            }
        });
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
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
    // Timeouts más generosos: en dev (Turbopack + first-hit compilation) la respuesta
    // puede demorar >500ms fácilmente. En prod standalone es más rápido.
    let connect_timeout_ms: u64 = if cfg!(debug_assertions) { 3000 } else { 1500 };
    let read_timeout_ms: u64 = if cfg!(debug_assertions) { 8000 } else { 3000 };
    let write_timeout_ms: u64 = 2000;

    let mut stream = match TcpStream::connect_timeout(
        &address.parse().unwrap(),
        Duration::from_millis(connect_timeout_ms),
    ) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(read_timeout_ms)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(write_timeout_ms)));

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: localhost:{}\r\nConnection: close\r\nUser-Agent: DevHub-Readiness/1.0\r\nAccept: */*\r\n\r\n",
        path, port,
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = [0u8; 1024];
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

/// Decide whether a process is safe to kill as a DevHub runtime zombie.
/// We require both a runtime executable (node/next-server/devhub-server) AND
/// a command line that clearly belongs to this app, so we never kill generic
/// node dev servers from other projects.
fn is_devhub_runtime_process(name: &str, cmdline: &str) -> bool {
    let normalized_name = name.to_lowercase();
    let normalized_cmdline = cmdline.to_lowercase();

    let is_runtime_executable = normalized_name.contains("node")
        || normalized_name.contains("devhub-server")
        || normalized_name.contains("mainthread")
        || normalized_name.contains("next-server");

    if !is_runtime_executable {
        return false;
    }

    let is_devhub_cmdline = normalized_cmdline.contains("devhub")
        || normalized_cmdline.contains("sidecar-backend/server.js")
        || normalized_cmdline.contains(".devhub/standalone/server.js")
        || normalized_cmdline.contains(".devhub-dev/standalone/server.js");

    is_devhub_cmdline
}

/// Espera hasta que el puerto de Next.js esté disponible.
/// En dev usa 3100; en producción empaquetada usa 3400 (standalone).
/// Devuelve true cuando la ruta raíz responde HTTP OK.
fn wait_for_nextjs_ready(max_attempts: usize, context: &str) -> bool {
    let port = nextjs_port();
    log::info!(
        "[DevHub] Esperando a que Next.js responda HTTP OK en http://localhost:{}/ ... ({})",
        port,
        context
    );
    for attempt in 0..max_attempts {
        thread::sleep(Duration::from_millis(NEXTJS_READY_POLL_MS));
        if nextjs_route_is_ready(port) {
            log::info!(
                "[DevHub] Next.js listo por HTTP en / (puerto {}, intento {}, {}).",
                port,
                attempt + 1,
                context
            );
            return true;
        }
    }
    let waited_ms = max_attempts as u64 * NEXTJS_READY_POLL_MS;
    log::error!(
        "[DevHub] ⚠️  Next.js no devolvió HTTP OK en / dentro de {}ms ({}).",
        waited_ms,
        context
    );
    false
}

fn schedule_main_window_recovery(app: tauri::AppHandle, reason: &str) {
    let reason = reason.to_string();
    thread::spawn(move || {
        if !wait_for_nextjs_ready(
            NEXTJS_READY_RECOVERY_ATTEMPTS,
            &format!("recovery: {}", reason),
        ) {
            log::error!(
                "[DevHub] ❌ Next.js siguió sin responder; la ventana principal queda oculta para evitar una pantalla en blanco."
            );
            return;
        }

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.reload();
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            log::info!(
                "[DevHub] Ventana principal recargada cuando Next.js quedó listo ({}).",
                reason
            );
        }
    });
}

fn listener_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(target_os = "windows")]
    {
        let cmd = format!(
            "netstat -ano -p tcp | findstr :{} | findstr LISTENING",
            port
        );
        let output = match std::process::Command::new("cmd").args(["/C", &cmd]).output() {
            Ok(out) => out,
            Err(_) => return Vec::new(),
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut pids = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            if let Some(pid) = parts.last().and_then(|s| s.parse::<u32>().ok()) {
                if pid > 0 {
                    pids.push(pid);
                }
            }
        }
        pids.sort_unstable();
        pids.dedup();
        return pids;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = match std::process::Command::new("ss")
            .args(["-tlnp", &format!("sport = :{}", port)])
            .output()
        {
            Ok(out) => out,
            Err(_) => return Vec::new(),
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.is_empty() {
            return Vec::new();
        }

        let mut pids = Vec::new();
        for pid_str in stdout.split("pid=") {
            let Some(pid_part) = pid_str.split(',').next() else {
                continue;
            };
            let Ok(pid) = pid_part.parse::<u32>() else {
                continue;
            };
            if pid > 0 {
                pids.push(pid);
            }
        }
        pids.sort_unstable();
        pids.dedup();
        pids
    }
}

/// Matar procesos zombie que ocupan los puertos del sidecar/PTY y (solo en prod) Next.js.
/// En dev NO tocamos el puerto de Next porque lo maneja el beforeDevCommand de `tauri dev`.
/// Esto pasa cuando `tauri dev` se cierra con Ctrl+C y los procesos hijos no mueren.
fn cleanup_zombie_ports() {
    // En dev (tauri dev) el Next.js es lanzado por beforeDevCommand y es "propiedad" del harness de Tauri.
    // NO debemos matarlo aquí, o matamos el servidor que el propio `tauri:dev` acaba de iniciar.
    // Solo limpiamos el sidecar/PTY (que sí puede quedar zombi de sesiones previas).
    // En builds empaquetadas sí limpiamos también el next (porque lo lanza nuestro sidecar wrapper).
    let mut zombie_ports: Vec<u16> = vec![sidecar_port()];
    if !cfg!(debug_assertions) {
        zombie_ports.push(nextjs_port());
    }

    let mut sys = System::new_all();
    sys.refresh_all();

    for port in zombie_ports {
        for pid in listener_pids_on_port(port) {
            if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
                let name = process.name().to_string_lossy().to_lowercase();
                let cmdline: String = process
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy().to_lowercase())
                    .collect::<Vec<_>>()
                    .join(" ");
                if is_devhub_runtime_process(&name, &cmdline) {
                    log::info!(
                        "[DevHub] Matando proceso zombie PID {} en puerto {} ({}).",
                        pid,
                        port,
                        name
                    );
                    process.kill();
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

    for pid in listener_pids_on_port(port) {
        if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
            let name = process.name().to_string_lossy().to_lowercase();
            let cmdline: String = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_lowercase())
                .collect::<Vec<_>>()
                .join(" ");

            if is_devhub_runtime_process(&name, &cmdline) {
                return Some(pid);
            }
        }
    }

    None
}

fn get_devhub_dir() -> PathBuf {
    devhub_dir()
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

/// Restaura la ventana principal cuando una segunda instancia es detectada.
/// Es CRÍTICO no reiniciar el runtime aquí: el sidecar de la instancia activa
/// ya está corriendo y matarlo desconectaría todas las terminales PTY.
fn restore_main_window(app: &tauri::AppHandle) {
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

/// Verifica si el proceso con el PID dado sigue vivo y es realmente el sidecar de DevHub.
fn is_sidecar_running(pid: u32) -> bool {
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
        let name = process.name().to_string_lossy().to_lowercase();
        let cmdline: String = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_lowercase())
            .collect::<Vec<_>>()
            .join(" ");

        // El sidecar corre como node <...>/sidecar-backend/server.js
        let is_runtime_executable =
            name.contains("node") || name.contains("devhub-server") || name.contains("mainthread");
        let is_devhub_cmdline = cmdline.contains("devhub")
            || cmdline.contains("sidecar-backend/server.js")
            || cmdline.contains(".devhub/standalone/server.js")
            || cmdline.contains(".devhub-dev/standalone/server.js");

        return is_runtime_executable && is_devhub_cmdline;
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

fn installed_standalone_zip_path() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let candidates = [
            PathBuf::from("/usr/lib/DevHub/resources/standalone.zip"),
            PathBuf::from("/usr/local/lib/DevHub/resources/standalone.zip"),
        ];
        return candidates.into_iter().find(|path| path.exists());
    }

    #[cfg(target_os = "windows")]
    {
        let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
        let candidates = [
            exe_dir.join("resources").join("standalone.zip"),
            exe_dir.join("_up_").join("resources").join("standalone.zip"),
            exe_dir.join("standalone.zip"),
        ];
        return candidates.into_iter().find(|path| path.exists());
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

/// Obtiene el mtime actual del standalone.zip instalado como build-id de referencia.
/// Solo aplica a instalaciones empaquetadas; en dev mode el path no existe → None.
fn get_installed_build_id() -> Option<u64> {
    let path = installed_standalone_zip_path()?;
    fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// Lee el PID guardado y comprueba si el sidecar ya está corriendo.
fn check_existing_sidecar() -> Option<u32> {
    let pid_file = get_sidecar_pid_file();
    if !pid_file.exists() {
        if let Some(pid) = find_devhub_pid_on_port(sidecar_port()) {
            let _ = fs::write(&pid_file, pid.to_string());
            let _ = fs::write(get_sidecar_port_file(), sidecar_port().to_string());
            log::info!(
                "[DevHub] Sidecar adoptado por puerto {} con PID {}.",
                sidecar_port(),
                pid
            );
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
                        log::info!(
                            "[DevHub] Nueva versión detectada (build-id instalado: {} / corriendo: {}). Reiniciando sidecar...",
                            installed, running
                        );
                        shutdown_sidecar();
                        return None;
                    }
                }
                if !get_sidecar_port_file().exists() {
                    let _ = fs::write(get_sidecar_port_file(), sidecar_port().to_string());
                }
                log::info!("[DevHub] Sidecar ya activo con PID {} (build-id OK).", pid);
                return Some(pid);
            }
        }
    }
    // PID file obsoleto — limpiarlo
    let _ = fs::remove_file(&pid_file);
    if let Some(pid) = find_devhub_pid_on_port(sidecar_port()) {
        let _ = fs::write(&pid_file, pid.to_string());
        let _ = fs::write(get_sidecar_port_file(), sidecar_port().to_string());
        log::info!(
            "[DevHub] Sidecar readoptado por puerto {} con PID {}.",
            sidecar_port(),
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

    log::info!(
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
        log::info!("[DevHub] Sidecar no respondió, enviando SIGKILL...");
        let mut sys = System::new_all();
        sys.refresh_all();
        if let Some(process) = sys.process(sysinfo::Pid::from(pid as usize)) {
            process.kill();
        }
    } else {
        log::info!("[DevHub] Sidecar terminado limpiamente ✅");
    }

    let _ = fs::remove_file(pid_file);
    let _ = fs::remove_file(get_sidecar_port_file());
}

fn spawn_sidecar(app: &tauri::AppHandle) {
    log::info!("[DevHub] Spawneando nuevo sidecar...");
    let sidecar_command = app
        .shell()
        .sidecar("devhub-server")
        .expect("No se encontró el sidecar 'devhub-server'")
        .env("DEVHUB_HOME", devhub_dir().to_string_lossy().as_ref())
        .env("SIDECAR_PORT", sidecar_port().to_string())
        .env("DEVHUB_WS_PORT", ws_port().to_string())
        .env("DEVHUB_TTY_PORT", tty_port().to_string())
        .env(
            "NODE_PATH",
            devhub_dir()
                .join("standalone")
                .join("node_modules")
                .to_string_lossy()
                .as_ref(),
        )
        .env(
            "DEVHUB_NODE_BIN",
            std::env::var("DEVHUB_NODE_BIN").unwrap_or_default(),
        )
        .env(
            "DEVHUB_NPM_BIN",
            std::env::var("DEVHUB_NPM_BIN").unwrap_or_default(),
        )
        .env(
            "DEVHUB_ALLOW_NODE24",
            std::env::var("DEVHUB_ALLOW_NODE24").unwrap_or_default(),
        );

    let (mut rx, _child) = sidecar_command.spawn().expect("Error al lanzar el sidecar");

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    log::info!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    log::warn!("[Sidecar ERR] {}", String::from_utf8_lossy(&line));
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
                    log::info!(
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

fn ensure_runtime_ready(app: &tauri::AppHandle) -> tauri::Result<bool> {
    let has_valid_sidecar = check_existing_sidecar().is_some();
    let next_ready = nextjs_route_is_ready(nextjs_port());
    let sidecar_ready = is_port_ready(sidecar_port());

    if has_valid_sidecar && next_ready && sidecar_ready {
        return Ok(true);
    }

    log::info!(
        "[DevHub] Runtime local ausente o caído (sidecar válido: {}, next: {}, pty: {}). Relanzando...",
        has_valid_sidecar,
        next_ready,
        sidecar_ready
    );

    shutdown_sidecar();
    cleanup_zombie_ports();
    spawn_sidecar(app);

    // En dev mode el Next.js ya está corriendo (lo lanzó beforeDevCommand del tauri dev).
    // No esperes 60s ni mates nada del next. Solo verifica sidecar/pty y hacé una espera corta
    // por si el primer request a Next tarda un poco (Turbopack on-demand).
    let next_ready = if cfg!(debug_assertions) {
        // Espera corta y tolerante (máx ~15s). Si no responde, igual seguimos:
        // la ventana se muestra igual y Tauri carga el devUrl directamente.
        // El recovery también es más corto en dev.
        wait_for_nextjs_ready(30, "startup-dev")
    } else {
        wait_for_nextjs_ready(NEXTJS_READY_STARTUP_ATTEMPTS, "startup")
    };

    Ok(next_ready)
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

// ── Operator Action Contract — Tauri IPC Bridge ─────────────────────
// Exposes dh_dispatch_action so native menu items and keyboard shortcuts
// can trigger operator actions with policy enforcement.
//
// The Rust side proxies to the Next.js /api/operator/dispatch endpoint
// via HTTP, keeping the policy logic in JavaScript.
#[derive(serde::Serialize)]
struct DispatchResult {
    status: String,
    error_detail: Option<String>,
}

#[tauri::command]
async fn dh_dispatch_action(
    action_id: String,
    params_json: String,
    target_json: String,
) -> Result<DispatchResult, String> {
    use std::time::Duration;

    let port = nextjs_port();
    let url = format!("http://127.0.0.1:{}/api/operator/dispatch", port);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("reqwest build failed: {}", e))?;

    #[derive(serde::Serialize)]
    struct DispatchPayload<'a> {
        action_id: &'a str,
        params: serde_json::Value,
        target: serde_json::Value,
        actor_role: &'a str,
        actor_session_id: &'a str,
        confirmation: serde_json::Value,
        devhub_version: &'a str,
    }

    let params: serde_json::Value = serde_json::from_str(&params_json).unwrap_or(serde_json::Value::Object(Default::default()));
    let target: serde_json::Value = serde_json::from_str(&target_json).unwrap_or(serde_json::Value::Null);
    let confirmation = serde_json::Value::Null;

    let body = serde_json::to_string(&DispatchPayload {
        action_id: &action_id,
        params,
        target,
        actor_role: "sys",   // native callers are always sys role
        actor_session_id: "tauri-native",
        confirmation,
        devhub_version: "0.1.0",
    }).map_err(|e| format!("serialization failed: {}", e))?;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("dispatch request failed: {}", e))?;

    let result: serde_json::Value = resp.json().await.map_err(|e| format!("parse response failed: {}", e))?;

    Ok(DispatchResult {
        status: result.get("status").and_then(|v| v.as_str()).unwrap_or("DEFERRED").to_string(),
        error_detail: result.get("error_detail").and_then(|v| v.as_str()).map(String::from),
    })
}

/// Construye el tray icon con menú contextual para que el usuario pueda
/// recuperar la ventana aunque la oculte con la X.
///
/// Esto resuelve el caso donde la app se queda invisible: sin tray, cerrar
/// la ventana con la X solo la oculta y no había forma de traerla de vuelta.
fn build_main_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .items(&[
            &MenuItem::with_id(app, "show", "Mostrar ventana", true, None::<&str>)?,
            &MenuItem::with_id(app, "hide", "Ocultar ventana", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?,
        ])
        .build()?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("DevHub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    log::info!("[DevHub] Tray menu: mostrar ventana principal.");
                } else {
                    log::warn!("[DevHub] Tray menu show: ventana 'main' no encontrada.");
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                    log::info!("[DevHub] Tray menu: ocultar ventana principal.");
                } else {
                    log::warn!("[DevHub] Tray menu hide: ventana 'main' no encontrada.");
                }
            }
            "quit" => {
                log::info!("[DevHub] Tray menu: salir solicitado por el usuario.");
                app.exit(0);
            }
            _ => {
                log::warn!(
                    "[DevHub] Tray menu: id de menú no reconocido '{}'.",
                    event.id.as_ref()
                );
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Click izquierdo: toggle de visibilidad. En Linux tauri no emite
            // este evento (solo el menú contextual con click derecho), pero
            // dejamos el handler para Windows/macOS.
            if let TrayIconEvent::Click { button, .. } = event {
                if button == MouseButton::Left {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let visible = window.is_visible().unwrap_or(false);
                        if visible {
                            let _ = window.hide();
                            log::info!("[DevHub] Tray click izquierdo: ocultar ventana.");
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            log::info!("[DevHub] Tray click izquierdo: mostrar ventana.");
                        }
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(NativeBrowserState::default())
        .manage(VoiceState::default())
        .invoke_handler(tauri::generate_handler![
            native_browser_probe,
            native_browser_open,
            native_browser_load_url,
            native_browser_reload,
            native_browser_resize,
            native_browser_focus,
            native_browser_raise,
            native_browser_set_visibility,
            native_browser_selector_command,
            native_browser_select_all,
            native_browser_copy,
            native_browser_close,
            read_system_clipboard_text,
            read_system_clipboard_image,
            write_clipboard_image_to_temp_file,
            dh_dispatch_action,
            voice_toggle_recording,
            voice_set_enabled,
            voice_set_settings,
            voice_start_engine,
            voice_stop_engine,
            voice_stop_speak,
            voice_speak,
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

            if let Some(voice_state) = app.handle().try_state::<VoiceState>() {
                let enabled = std::env::var("DEVHUB_VOICE_ENABLED")
                    .ok()
                    .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                    .unwrap_or(cfg!(debug_assertions));
                if let Ok(mut lock) = voice_state.enabled.lock() {
                    *lock = enabled;
                }
                if enabled {
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(state) = app_handle.try_state::<VoiceState>() {
                            if let Err(err) = spawn_audio_engine(&app_handle, &state).await {
                                let _ = app_handle.emit("voice-error", err);
                            }
                        }
                    });
                }
            }

            // Limpiar procesos zombie de sesiones anteriores (tauri dev, crashes, etc.)
            cleanup_zombie_ports();

            let next_ready = ensure_runtime_ready(app.handle())?;
            ensure_main_window(app.handle())?;

            // Setear el ícono de la ventana explícitamente (necesario en dev mode en Linux)
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }

                // Always show the window early (with a loading state served by the
                // Next standalone or the page.js skeleton). This avoids the "minutes
                // of nothing / gray" perception when the backend takes time on first
                // extract or cold start. The old hide was to "avoid blank screen" but
                // users saw gray/empty anyway; frontend now owns a branded loading UI.
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();

                if !next_ready {
                    schedule_main_window_recovery(app.handle().clone(), "setup");
                }
            }

            // Tray icon con menú contextual: punto de recuperación cuando el
            // usuario oculta la ventana con la X. Si falla, la app sigue
            // funcionando, solo no hay tray.
            if let Err(err) = build_main_tray(app.handle()) {
                log::warn!("[DevHub] No se pudo crear el tray icon: {}", err);
            }

            Ok(())
        });

    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("[DevHub] Segunda instancia detectada → restaurando ventana principal.");
            restore_main_window(app);
            // Forzar show DESPUÉS de restore_main_window: el gate de next_ready
            // dentro de restore_main_window puede ocultar la ventana, pero en
            // segunda instancia el sidecar ya está corriendo y el usuario
            // espera ver la ventana de inmediato.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
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
                log::info!(
                    "[DevHub] Ventana ocultada (app sigue en background con el sidecar activo)."
                );
            }

            // ── Cierre real de la aplicación (desde menú o señal del SO) ─────────
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                log::info!("[DevHub] Cerrando la aplicación — iniciando cleanup...");
                shutdown_sidecar();
            }

            _ => {}
        }
    });
}

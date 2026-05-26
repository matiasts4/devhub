use serde::Serialize;
use std::collections::BTreeSet;
use std::path::Path;
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use std::{cell::RefCell, collections::HashMap, ffi::OsString, path::PathBuf, sync::{mpsc, Once}};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "linux")]
use gtk::prelude::*;

#[cfg(target_os = "linux")]
use zoha_vte::{traits::TerminalExt, PtyFlags, Terminal};

#[cfg(target_os = "linux")]
use crate::native_window_host::{
    ensure_shared_native_overlay, widget_matches_native_overlay, widget_name_matches,
};

const NATIVE_VTE_EVENT_NAME: &str = "native-vte-event";
const PROBE_FAILED_REASON: &str = "probe-failed";
const PROBE_MISSING_MAIN_WINDOW_REASON: &str = "probe-missing-main-window";
const PROBE_MISSING_DEFAULT_VBOX_REASON: &str = "probe-missing-default-vbox";
const PROBE_MISSING_WEBVIEW_HANDLE_REASON: &str = "probe-missing-webview-handle";
const PROBE_MISSING_HOST_PRIMITIVES_REASON: &str = "probe-missing-host-primitives";
const OPEN_FAILED_REASON: &str = "open-failed";
const PANEL_NOT_ACTIVE_REASON: &str = "panel-not-active";
const MISSING_BOUNDS_REASON: &str = "missing-bounds";
const DEFAULT_SHELL_COMMAND: &str = "exec \"${SHELL:-/bin/bash}\" -l";
#[cfg(target_os = "linux")]
const NATIVE_VTE_SEPARATOR_GUTTER_PX: i32 = 1;
#[cfg(target_os = "linux")]
static NATIVE_VTE_HOST_STYLES_ONCE: Once = Once::new();
#[cfg(target_os = "linux")]
const STRIPPED_SHELL_ENV_KEYS: [&str; 2] = ["npm_config_prefix", "NPM_CONFIG_PREFIX"];
#[cfg(target_os = "linux")]
const NATIVE_ZSH_LOGIN_COMMAND: &str = "exec zsh -i";

#[derive(Default)]
pub struct NativeVteState {
    focused_panel_id: Mutex<Option<String>>,
    visible_panel_ids: Mutex<BTreeSet<String>>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct NativeVteStateSnapshot {
    pub focused_panel_id: Option<String>,
    pub visible_panel_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct NativeVteProbeResponse {
    pub ready: bool,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeVteOpenResponse {
    pub opened: bool,
    pub reason: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVteProbeRequest {
    pub panel_id: Option<String>,
    pub requested_mode: Option<String>,
    pub tauri_available: Option<bool>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVteOpenRequest {
    pub panel_id: String,
    pub session_id: Option<String>,
    pub cwd: Option<String>,
    pub initial_command: Option<String>,
    pub bounds: Option<NativeVteBounds>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVtePanelRequest {
    pub panel_id: String,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeVteCommandResponse {
    pub supported: bool,
    pub reason: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVteVisibilityRequest {
    pub panel_id: String,
    pub visible: bool,
    pub reason: Option<String>,
    pub bounds: Option<NativeVteBounds>,
}

#[derive(serde::Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeVteBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeVteEventPayload {
    pub panel_id: String,
    pub r#type: String,
    pub reason: Option<String>,
    pub session_id: Option<String>,
    pub initial_command: Option<String>,
}

#[cfg(target_os = "linux")]
const NATIVE_VTE_LAYOUT_NAME: &str = "devhub-native-vte-layout";

#[cfg(target_os = "linux")]
thread_local! {
    static NATIVE_VTE_REGISTRY: RefCell<NativeVteRegistry> = RefCell::new(NativeVteRegistry::default());
}

#[cfg(target_os = "linux")]
#[derive(Default)]
struct NativeVteRegistry {
    focused_panel_id: Option<String>,
    _overlay: Option<gtk::Overlay>,
    layout: Option<gtk::Fixed>,
    session_ids: HashMap<String, Option<String>>,
    panels: HashMap<String, NativeVtePanelHost>,
}

#[cfg(target_os = "linux")]
struct NativeVtePanelHost {
    wrapper: gtk::Frame,
    terminal: Terminal,
    child_pid: Option<glib::Pid>,
    visible: bool,
}

fn unsupported_platform_reason() -> Option<String> {
    Some("unsupported-platform".to_string())
}

fn emit_runtime_event(app: &AppHandle, payload: NativeVteEventPayload) {
    let _ = app.emit(NATIVE_VTE_EVENT_NAME, payload);
}

fn emit_runtime_session_detected(
    app: &AppHandle,
    panel_id: &str,
    request_session_id: Option<&str>,
    initial_command: Option<&str>,
) {
    let Some(payload) = detect_native_session_event(panel_id, request_session_id, initial_command)
    else {
        return;
    };

    emit_runtime_event(app, payload);
}

fn emit_panel_activated_runtime_event(
    app: &AppHandle,
    panel_id: &str,
    session_id: Option<&str>,
) {
    emit_runtime_event(app, build_panel_activated_event_payload(panel_id, session_id));
}

fn emit_runtime_error(
    app: &AppHandle,
    panel_id: String,
    session_id: Option<String>,
    reason: impl Into<String>,
) {
    emit_runtime_event(
        app,
        NativeVteEventPayload {
            panel_id,
            r#type: "runtime-error".to_string(),
            reason: Some(reason.into()),
            session_id,
            initial_command: None,
        },
    );
}

fn extract_opencode_session_id(initial_command: Option<&str>) -> Option<String> {
    let mut tokens = initial_command?.split_whitespace();
    let mut saw_opencode = false;

    while let Some(token) = tokens.next() {
        if !saw_opencode {
            if token.eq_ignore_ascii_case("opencode") {
                saw_opencode = true;
            }
            continue;
        }

        if token == "--session" {
            let session_id = tokens.next()?.trim();
            if session_id.starts_with("ses_") {
                return Some(session_id.to_string());
            }
            return None;
        }
    }

    None
}

fn is_hermes_launch_command(initial_command: Option<&str>) -> bool {
    initial_command
        .map(|command| {
            command
                .split_whitespace()
                .any(|token| token.eq_ignore_ascii_case("hermes"))
        })
        .unwrap_or(false)
}

fn derive_native_hermes_session_id(panel_id: &str, request_session_id: Option<&str>) -> String {
    match request_session_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(session_id) if session_id.starts_with("hermes-") => session_id.to_string(),
        Some(session_id) => format!("hermes-{}", session_id),
        None => format!("hermes-{}", panel_id),
    }
}

fn detect_native_session_event(
    panel_id: &str,
    request_session_id: Option<&str>,
    initial_command: Option<&str>,
) -> Option<NativeVteEventPayload> {
    if let Some(session_id) = extract_opencode_session_id(initial_command) {
        return Some(NativeVteEventPayload {
            panel_id: panel_id.to_string(),
            r#type: "opencode-session-detected".to_string(),
            reason: None,
            session_id: Some(session_id),
            initial_command: initial_command.map(str::to_string),
        });
    }

    if is_hermes_launch_command(initial_command) {
        return Some(NativeVteEventPayload {
            panel_id: panel_id.to_string(),
            r#type: "hermes-session-detected".to_string(),
            reason: None,
            session_id: Some(derive_native_hermes_session_id(
                panel_id,
                request_session_id,
            )),
            initial_command: initial_command.map(str::to_string),
        });
    }

    None
}

fn build_terminal_exit_event_payload(
    panel_id: &str,
    session_id: Option<&str>,
    initial_command: Option<&str>,
    status: i32,
) -> NativeVteEventPayload {
    NativeVteEventPayload {
        panel_id: panel_id.to_string(),
        r#type: "terminal-exit".to_string(),
        reason: Some(format!("child-exited:{}", status)),
        session_id: session_id.map(str::to_string),
        initial_command: initial_command.map(str::to_string),
    }
}

fn build_panel_activated_event_payload(
    panel_id: &str,
    session_id: Option<&str>,
) -> NativeVteEventPayload {
    NativeVteEventPayload {
        panel_id: panel_id.to_string(),
        r#type: "panel-activated".to_string(),
        reason: None,
        session_id: session_id.map(str::to_string),
        initial_command: None,
    }
}

fn snapshot_native_vte_state(state: &NativeVteState) -> Result<NativeVteStateSnapshot, String> {
    Ok(NativeVteStateSnapshot {
        focused_panel_id: state
            .focused_panel_id
            .lock()
            .map_err(|_| "state-poisoned".to_string())?
            .clone(),
        visible_panel_ids: state
            .visible_panel_ids
            .lock()
            .map_err(|_| "state-poisoned".to_string())?
            .iter()
            .cloned()
            .collect(),
    })
}

fn plan_native_vte_open(
    state: &NativeVteState,
    _requested_panel_id: &str,
) -> Result<(Option<String>, bool), String> {
    let snapshot = snapshot_native_vte_state(state)?;
    let previous_panel_id = snapshot.focused_panel_id;
    let should_close_previous = false;
    Ok((previous_panel_id, should_close_previous))
}

fn set_focused_panel_metadata(state: &NativeVteState, panel_id: &str) -> Result<(), String> {
    let mut focused_panel_id = state
        .focused_panel_id
        .lock()
        .map_err(|_| "state-poisoned".to_string())?;
    *focused_panel_id = Some(panel_id.to_string());
    Ok(())
}

fn clear_focused_panel_metadata(state: &NativeVteState) -> Result<(), String> {
    let mut focused_panel_id = state
        .focused_panel_id
        .lock()
        .map_err(|_| "state-poisoned".to_string())?;
    *focused_panel_id = None;
    Ok(())
}

fn set_panel_visibility_metadata(
    state: &NativeVteState,
    panel_id: &str,
    visible: bool,
) -> Result<(), String> {
    let mut visible_panel_ids = state
        .visible_panel_ids
        .lock()
        .map_err(|_| "state-poisoned".to_string())?;

    if visible {
        visible_panel_ids.insert(panel_id.to_string());
    } else {
        visible_panel_ids.remove(panel_id);
    }

    Ok(())
}

fn close_panel_metadata(state: &NativeVteState, panel_id: &str) -> Result<(), String> {
    set_panel_visibility_metadata(state, panel_id, false)?;

    let snapshot = snapshot_native_vte_state(state)?;
    if snapshot.focused_panel_id.as_deref() == Some(panel_id) {
        clear_focused_panel_metadata(state)?;
    }

    Ok(())
}

fn require_registered_panel(
    focused_panel_id: Option<&str>,
    requested_panel_id: &str,
) -> Result<(), String> {
    if focused_panel_id == Some(requested_panel_id) {
        Ok(())
    } else {
        Err(PANEL_NOT_ACTIVE_REASON.to_string())
    }
}

fn should_reuse_native_panel(
    _focused_panel_id: Option<&str>,
    _requested_panel_id: &str,
    has_live_terminal: bool,
) -> bool {
    has_live_terminal
}

fn resolve_same_window_host_prep_result(
    default_vbox_child_count: usize,
    overlay_present: bool,
    direct_webview_accessible: bool,
) -> Result<(), String> {
    if overlay_present || default_vbox_child_count > 0 || direct_webview_accessible {
        Ok(())
    } else {
        Err(PROBE_FAILED_REASON.to_string())
    }
}

fn resolve_same_window_probe_result(
    default_vbox_child_count: usize,
    overlay_present: bool,
    direct_webview_accessible: bool,
) -> Result<(), String> {
    if overlay_present || default_vbox_child_count > 0 || direct_webview_accessible {
        Ok(())
    } else {
        Err(PROBE_MISSING_HOST_PRIMITIVES_REASON.to_string())
    }
}

fn native_vte_overlay_layout_passes_through_to_webview() -> bool {
    true
}

fn execute_main_thread_job<T, R, J>(runner: R, job: J) -> Result<T, String>
where
    T: Send + 'static,
    R: FnOnce(Box<dyn FnOnce() + Send>) -> Result<(), String>,
    J: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    runner(Box::new(move || {
        let _ = tx.send(job());
    }))?;
    rx.recv().map_err(|_| OPEN_FAILED_REASON.to_string())?
}

#[cfg(target_os = "linux")]
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "linux")]
fn build_native_shell_script(cwd: Option<String>, initial_command: Option<String>) -> String {
    let mut segments = Vec::new();

    if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) {
        segments.push(format!("cd {}", shell_single_quote(cwd.trim())));
    }

    if let Some(command) = initial_command.filter(|value| !value.trim().is_empty()) {
        segments.push(format!("exec {}", command.trim()));
    } else {
        segments.push(DEFAULT_SHELL_COMMAND.to_string());
    }

    segments.join(" && ")
}

#[cfg(target_os = "linux")]
fn derive_terminal_grid(
    bounds: &NativeVteBounds,
    terminal_metrics: Option<(i32, i32)>,
) -> (i64, i64) {
    let (char_width, char_height) = terminal_metrics.unwrap_or((9, 18));
    let columns = ((bounds.width / f64::from(char_width.max(1))).floor() as i64).max(2);
    let rows = ((bounds.height / f64::from(char_height.max(1))).floor() as i64).max(2);
    (columns, rows)
}

#[cfg(target_os = "linux")]
fn ensure_linux_probe_preconditions(request: &NativeVteProbeRequest) -> Result<(), String> {
    if request.requested_mode.as_deref() != Some("vte-experimental") {
        return Err(PROBE_FAILED_REASON.to_string());
    }

    if !request.tauri_available.unwrap_or(false) {
        return Err("tauri-unavailable".to_string());
    }

    if request
        .panel_id
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        return Err(PROBE_FAILED_REASON.to_string());
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn with_main_webview_access<T, F>(
    window: &tauri::WebviewWindow,
    missing_webview_reason: &str,
    job: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&tauri::WebviewWindow, webkit2gtk::WebView) -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let window_for_closure = window.clone();
    let missing_webview_reason = missing_webview_reason.to_string();

    window
        .with_webview(move |webview| {
            let result = job(&window_for_closure, webview.inner());
            let _ = tx.send(result);
        })
        .map_err(|_| missing_webview_reason.clone())?;

    rx.recv().map_err(|_| missing_webview_reason)?
}

#[cfg(target_os = "linux")]
fn inspect_same_window_host(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| PROBE_MISSING_MAIN_WINDOW_REASON.to_string())?;

    with_main_webview_access(
        &window,
        PROBE_MISSING_WEBVIEW_HANDLE_REASON,
        move |window, webview| {
            let _gtk_window = window
                .gtk_window()
                .map_err(|_| PROBE_MISSING_MAIN_WINDOW_REASON.to_string())?;
            let default_vbox = window
                .default_vbox()
                .map_err(|_| PROBE_MISSING_DEFAULT_VBOX_REASON.to_string())?;
            let children = default_vbox.children();
            let overlay_present = children.iter().any(widget_matches_native_overlay);
            let direct_webview_accessible = webview.is::<gtk::Widget>();

            resolve_same_window_probe_result(
                children.len(),
                overlay_present,
                direct_webview_accessible,
            )
        },
    )
}

#[cfg(target_os = "linux")]
fn prepare_same_window_host(app: &AppHandle, failure_reason: &str) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| failure_reason.to_string())?;
    let failure_reason = failure_reason.to_string();

    with_main_webview_access(&window, OPEN_FAILED_REASON, move |window, webview| {
        let _gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
        let default_vbox = window.default_vbox().map_err(|error| error.to_string())?;
        let children = default_vbox.children();
        let overlay_present = children.iter().any(widget_matches_native_overlay);
        let direct_webview_accessible = webview.is::<gtk::Widget>();

        resolve_same_window_host_prep_result(
            children.len(),
            overlay_present,
            direct_webview_accessible,
        )
        .map_err(|_| failure_reason.clone())?;

        ensure_native_host(window, Some(webview))
            .map(|_| ())
            .map_err(|_| failure_reason.clone())
    })
}

#[cfg(target_os = "linux")]
fn with_native_vte_registry<T>(
    job: impl FnOnce(&mut NativeVteRegistry) -> Result<T, String>,
) -> Result<T, String> {
    NATIVE_VTE_REGISTRY.with(|registry| job(&mut registry.borrow_mut()))
}

#[cfg(target_os = "linux")]
fn ensure_native_host(
    window: &tauri::WebviewWindow,
    direct_webview: Option<webkit2gtk::WebView>,
) -> Result<(gtk::Overlay, gtk::Fixed), String> {
    let overlay = ensure_shared_native_overlay(window, direct_webview, OPEN_FAILED_REASON)?;

    install_native_vte_host_styles();

    let layout = if let Some(existing_layout) = overlay
        .children()
        .into_iter()
        .find(|child| widget_name_matches(child, NATIVE_VTE_LAYOUT_NAME))
        .and_then(|child| child.downcast::<gtk::Fixed>().ok())
    {
        existing_layout
    } else {
        for stale_layout in overlay
            .children()
            .into_iter()
            .filter(|child| widget_name_matches(child, NATIVE_VTE_LAYOUT_NAME))
        {
            overlay.remove(&stale_layout);
        }

        let layout = gtk::Fixed::new();
        layout.set_widget_name(NATIVE_VTE_LAYOUT_NAME);
        layout.set_halign(gtk::Align::Fill);
        layout.set_valign(gtk::Align::Fill);
        layout.set_size_request(-1, -1);
        overlay.add_overlay(&layout);
        overlay.reorder_overlay(&layout, -1);
        layout
    };

    overlay.set_overlay_pass_through(
        &layout,
        native_vte_overlay_layout_passes_through_to_webview(),
    );
    overlay.show_all();
    layout.show_all();

    Ok((overlay, layout))
}

#[cfg(target_os = "linux")]
fn build_native_spawn_argv(cwd: Option<String>, initial_command: Option<String>) -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let shell_program = Path::new(shell.as_str())
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if shell_program == "zsh"
        && initial_command
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        return vec![
            PathBuf::from(shell),
            PathBuf::from("-lic"),
            PathBuf::from(NATIVE_ZSH_LOGIN_COMMAND),
            PathBuf::from("devhub-shell"),
            PathBuf::from("--no-use"),
        ];
    }

    let script = build_native_shell_script(cwd, initial_command);

    vec![
        PathBuf::from(shell),
        PathBuf::from("-lc"),
        PathBuf::from(script),
    ]
}

#[cfg(target_os = "linux")]
fn should_strip_native_spawn_env_key(key: &str) -> bool {
    STRIPPED_SHELL_ENV_KEYS.contains(&key)
}

#[cfg(target_os = "linux")]
fn build_native_spawn_env_from_iter<I, K, V>(vars: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = (K, V)>,
    K: Into<OsString>,
    V: Into<OsString>,
{
    vars.into_iter()
        .filter_map(|(key, value)| {
            let key = key.into();
            if should_strip_native_spawn_env_key(key.to_string_lossy().as_ref()) {
                return None;
            }

            let mut entry = key;
            entry.push("=");
            entry.push(value.into());
            Some(PathBuf::from(entry))
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn build_native_spawn_env() -> Vec<PathBuf> {
    build_native_spawn_env_from_iter(std::env::vars_os())
}

#[cfg(target_os = "linux")]
fn with_noop_child_setup<T, E>(
    mut run: impl FnMut(Option<&mut dyn FnMut()>) -> Result<T, E>,
) -> Result<T, E> {
    let mut noop_child_setup = || {};
    run(Some(&mut noop_child_setup))
}

#[cfg(target_os = "linux")]
fn normalize_terminal_metrics(terminal: &Terminal) -> Option<(i32, i32)> {
    let char_width = terminal.char_width() as i32;
    let char_height = terminal.char_height() as i32;

    if char_width > 0 && char_height > 0 {
        Some((char_width, char_height))
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
#[derive(Debug, PartialEq, Eq)]
struct NativeVteLayoutGeometry {
    terminal_x: i32,
    terminal_y: i32,
    width: i32,
    height: i32,
    columns: i64,
    rows: i64,
}

#[cfg(target_os = "linux")]
#[derive(Debug, PartialEq, Eq)]
struct NativeVtePanelGeometry {
    wrapper_x: i32,
    wrapper_y: i32,
    wrapper_width: i32,
    wrapper_height: i32,
    terminal_width: i32,
    terminal_height: i32,
    columns: i64,
    rows: i64,
}

#[cfg(target_os = "linux")]
fn derive_native_vte_layout_geometry(
    bounds: &NativeVteBounds,
    terminal_metrics: Option<(i32, i32)>,
) -> NativeVteLayoutGeometry {
    let terminal_x = bounds.x.round().max(0.0) as i32;
    let terminal_y = bounds.y.round().max(0.0) as i32;
    let width = bounds.width.round().max(1.0) as i32;
    let height = bounds.height.round().max(1.0) as i32;
    let (columns, rows) = derive_terminal_grid(bounds, terminal_metrics);

    NativeVteLayoutGeometry {
        terminal_x,
        terminal_y,
        width,
        height,
        columns,
        rows,
    }
}

#[cfg(target_os = "linux")]
fn derive_native_vte_panel_geometry(
    bounds: &NativeVteBounds,
    terminal_metrics: Option<(i32, i32)>,
    gutter_px: i32,
) -> NativeVtePanelGeometry {
    let wrapper_x = bounds.x.round().max(0.0) as i32;
    let wrapper_y = bounds.y.round().max(0.0) as i32;
    let wrapper_width = bounds.width.round().max(1.0) as i32;
    let wrapper_height = bounds.height.round().max(1.0) as i32;
    let inset = gutter_px.max(0);
    let horizontal_inset = (inset * 2).min((wrapper_width - 1).max(0));
    let vertical_inset = (inset * 2).min((wrapper_height - 1).max(0));
    let terminal_width = (wrapper_width - horizontal_inset).max(1);
    let terminal_height = (wrapper_height - vertical_inset).max(1);
    let (columns, rows) = derive_terminal_grid(
        &NativeVteBounds {
            x: 0.0,
            y: 0.0,
            width: f64::from(terminal_width),
            height: f64::from(terminal_height),
        },
        terminal_metrics,
    );

    NativeVtePanelGeometry {
        wrapper_x,
        wrapper_y,
        wrapper_width,
        wrapper_height,
        terminal_width,
        terminal_height,
        columns,
        rows,
    }
}

#[cfg(target_os = "linux")]
fn derive_hidden_native_vte_panel_bounds() -> NativeVteBounds {
    NativeVteBounds {
        x: -10_000.0,
        y: -10_000.0,
        width: 1.0,
        height: 1.0,
    }
}

#[cfg(target_os = "linux")]
fn apply_terminal_bounds(
    layout: &gtk::Fixed,
    wrapper: &gtk::Frame,
    terminal: &Terminal,
    bounds: &NativeVteBounds,
) {
    let geometry = derive_native_vte_panel_geometry(
        bounds,
        normalize_terminal_metrics(terminal),
        NATIVE_VTE_SEPARATOR_GUTTER_PX,
    );

    layout.set_halign(gtk::Align::Fill);
    layout.set_valign(gtk::Align::Fill);
    layout.set_margin_start(0);
    layout.set_margin_top(0);
    layout.set_size_request(-1, -1);
    layout.move_(wrapper, geometry.wrapper_x, geometry.wrapper_y);
    wrapper.set_size_request(geometry.wrapper_width, geometry.wrapper_height);
    terminal.set_margin_start(NATIVE_VTE_SEPARATOR_GUTTER_PX.max(0));
    terminal.set_margin_end(NATIVE_VTE_SEPARATOR_GUTTER_PX.max(0));
    terminal.set_margin_top(NATIVE_VTE_SEPARATOR_GUTTER_PX.max(0));
    terminal.set_margin_bottom(NATIVE_VTE_SEPARATOR_GUTTER_PX.max(0));
    terminal.set_size_request(geometry.terminal_width, geometry.terminal_height);
    terminal.set_size(geometry.columns, geometry.rows);
    terminal.queue_resize();
    wrapper.queue_resize();
    layout.queue_resize();
}

#[cfg(target_os = "linux")]
fn native_rgba(red: f64, green: f64, blue: f64, alpha: f64) -> gtk::gdk::RGBA {
    gtk::gdk::RGBA::new(red, green, blue, alpha)
}

#[cfg(target_os = "linux")]
fn native_rgb(red: u8, green: u8, blue: u8) -> gtk::gdk::RGBA {
    native_rgba(
        f64::from(red) / 255.0,
        f64::from(green) / 255.0,
        f64::from(blue) / 255.0,
        1.0,
    )
}

#[cfg(target_os = "linux")]
fn apply_native_terminal_theme(terminal: &Terminal) {
    let background = native_rgb(0x0D, 0x11, 0x17);
    let foreground = native_rgb(0xF0, 0xF6, 0xFC);
    let cursor = native_rgb(0x58, 0xA6, 0xFF);
    let selection = native_rgba(0.133, 0.275, 0.478, 0.70);
    let palette = [
        native_rgb(0x48, 0x4F, 0x58),
        native_rgb(0xFF, 0x7B, 0x72),
        native_rgb(0x3F, 0xB9, 0x50),
        native_rgb(0xD2, 0x99, 0x22),
        native_rgb(0x79, 0xC0, 0xFF),
        native_rgb(0xBC, 0x8C, 0xFF),
        native_rgb(0x39, 0xC5, 0xCF),
        native_rgb(0xB1, 0xBA, 0xC4),
        native_rgb(0x6E, 0x76, 0x81),
        native_rgb(0xFF, 0xA1, 0x98),
        native_rgb(0x56, 0xD3, 0x64),
        native_rgb(0xE3, 0xB3, 0x41),
        native_rgb(0x79, 0xC0, 0xFF),
        native_rgb(0xD2, 0xA8, 0xFF),
        native_rgb(0x56, 0xD4, 0xDD),
        native_rgb(0xF0, 0xF6, 0xFC),
    ];

    terminal.set_colors(Some(&foreground), Some(&background), &palette);
    terminal.set_color_cursor(Some(&cursor));
    terminal.set_color_highlight(Some(&selection));
    terminal.set_color_highlight_foreground(Some(&foreground));
}

#[cfg(target_os = "linux")]
fn install_native_vte_host_styles() {
    NATIVE_VTE_HOST_STYLES_ONCE.call_once(|| {
        let provider = gtk::CssProvider::new();
        let css = br#"
            frame.devhub-native-vte-host {
                background-color: rgba(13, 17, 23, 0.96);
                border: none;
                border-radius: 0;
                box-shadow: none;
            }

            frame.devhub-native-vte-host border {
                background: transparent;
                border: none;
                box-shadow: none;
            }
        "#;

        if provider.load_from_data(css).is_err() {
            return;
        }

        if let Some(screen) = gtk::gdk::Screen::default() {
            gtk::StyleContext::add_provider_for_screen(
                &screen,
                &provider,
                gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
        }
    });
}

#[cfg(target_os = "linux")]
fn terminate_native_child(child_pid: Option<glib::Pid>) {
    if let Some(pid) = child_pid {
        unsafe {
            libc::kill(pid.0, libc::SIGTERM);
        }
    }
}

#[cfg(target_os = "linux")]
fn sync_registry_layout_visibility(registry: &NativeVteRegistry) {
    let Some(layout) = registry.layout.as_ref() else {
        return;
    };

    let should_show_layout = registry.panels.values().any(|panel| panel.visible);
    layout.set_visible(should_show_layout);
    if should_show_layout {
        layout.show();
    } else {
        layout.hide();
    }
}

#[cfg(target_os = "linux")]
fn registry_show_panel(
    registry: &mut NativeVteRegistry,
    panel_id: &str,
) -> Result<(), String> {
    let panel = registry
        .panels
        .get_mut(panel_id)
        .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
    panel.wrapper.set_visible(true);
    panel.terminal.set_visible(true);
    panel.visible = true;
    panel.wrapper.show_all();
    sync_registry_layout_visibility(registry);

    Ok(())
}

#[cfg(target_os = "linux")]
fn registry_close_panel_by_id(
    registry: &mut NativeVteRegistry,
    panel_id: &str,
) -> Result<(), String> {
    let mut panel = registry
        .panels
        .remove(panel_id)
        .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;

    if let Some(layout) = registry.layout.as_ref() {
        layout.remove(&panel.wrapper);
    }

    terminate_native_child(panel.child_pid.take());
    registry.session_ids.remove(panel_id);

    if registry.focused_panel_id.as_deref() == Some(panel_id) {
        registry.focused_panel_id = None;
    }

    sync_registry_layout_visibility(registry);

    Ok(())
}

#[cfg(target_os = "linux")]
fn registry_open_panel(app: &AppHandle, request: &NativeVteOpenRequest) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

    let (overlay, layout) = ensure_native_host(&window, None)?;

    with_native_vte_registry(|registry| {
        registry._overlay = Some(overlay);
        registry.layout = Some(layout.clone());

        if should_reuse_native_panel(
            registry.focused_panel_id.as_deref(),
            request.panel_id.as_str(),
            registry.panels.contains_key(request.panel_id.as_str()),
        ) {
            registry_show_panel(registry, request.panel_id.as_str())?;
            if let Some(panel) = registry.panels.get(request.panel_id.as_str()) {
                if let Some(bounds) = request.bounds.as_ref() {
                    apply_terminal_bounds(&layout, &panel.wrapper, &panel.terminal, bounds);
                }
            }
            registry
                .session_ids
                .insert(request.panel_id.clone(), request.session_id.clone());
            return Ok(());
        }

        let terminal = Terminal::new();
        terminal.set_widget_name(&format!("devhub-native-vte-terminal-{}", request.panel_id));
        terminal.set_input_enabled(true);
        terminal.set_rewrap_on_resize(true);
        apply_native_terminal_theme(&terminal);

        let wrapper = gtk::Frame::new(None);
        wrapper.set_widget_name(&format!("devhub-native-vte-host-{}", request.panel_id));
        wrapper.style_context().add_class("devhub-native-vte-host");
        wrapper.set_shadow_type(gtk::ShadowType::None);
        wrapper.set_halign(gtk::Align::Fill);
        wrapper.set_valign(gtk::Align::Fill);
        wrapper.add(&terminal);

        let activated_app = app.clone();
        let activated_panel_id = request.panel_id.clone();
        let activated_session_id = request.session_id.clone();
        terminal.connect_focus_in_event(move |_, _| {
            emit_panel_activated_runtime_event(
                &activated_app,
                activated_panel_id.as_str(),
                activated_session_id.as_deref(),
            );
            gtk::glib::Propagation::Proceed
        });

        let activated_app = app.clone();
        let activated_panel_id = request.panel_id.clone();
        let activated_session_id = request.session_id.clone();
        terminal.connect_button_press_event(move |_, _| {
            emit_panel_activated_runtime_event(
                &activated_app,
                activated_panel_id.as_str(),
                activated_session_id.as_deref(),
            );
            gtk::glib::Propagation::Proceed
        });

        layout.put(&wrapper, 0, 0);
        wrapper.show_all();

        let argv = build_native_spawn_argv(request.cwd.clone(), request.initial_command.clone());
        let argv_refs: Vec<&Path> = argv.iter().map(PathBuf::as_path).collect();
        let envv = build_native_spawn_env();
        let envv_refs: Vec<&Path> = envv.iter().map(PathBuf::as_path).collect();
        let child_pid = with_noop_child_setup(|child_setup| {
            terminal.spawn_sync(
                PtyFlags::DEFAULT,
                request
                    .cwd
                    .as_deref()
                    .filter(|value| !value.trim().is_empty()),
                &argv_refs,
                &envv_refs,
                glib::SpawnFlags::SEARCH_PATH,
                child_setup,
                None::<&gtk::gio::Cancellable>,
            )
        })
        .map_err(|error: glib::Error| {
            layout.remove(&wrapper);
            error.to_string()
        })?;

        terminal.watch_child(child_pid);
        let panel_id = request.panel_id.clone();
        let session_id = request.session_id.clone();
        let initial_command = request.initial_command.clone();
        let app_handle = app.clone();
        terminal.connect_child_exited(move |_, status| {
            emit_runtime_event(
                &app_handle,
                build_terminal_exit_event_payload(
                    panel_id.as_str(),
                    session_id.as_deref(),
                    initial_command.as_deref(),
                    status,
                ),
            );
        });

        emit_runtime_session_detected(
            app,
            request.panel_id.as_str(),
            request.session_id.as_deref(),
            request.initial_command.as_deref(),
        );

        if let Some(bounds) = request.bounds.as_ref() {
            apply_terminal_bounds(&layout, &wrapper, &terminal, bounds);
        }

        registry
            .session_ids
            .insert(request.panel_id.clone(), request.session_id.clone());
        registry.panels.insert(
            request.panel_id.clone(),
            NativeVtePanelHost {
                wrapper,
                terminal,
                child_pid: Some(child_pid),
                visible: true,
            },
        );
        registry_show_panel(registry, request.panel_id.as_str())?;

        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_focus_panel(panel_id: &str) -> Result<(), String> {
    with_native_vte_registry(|registry| {
        registry_show_panel(registry, panel_id)?;
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
        panel.terminal.grab_focus();
        registry.focused_panel_id = Some(panel_id.to_string());
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_paste_panel(panel_id: &str) -> Result<(), String> {
    with_native_vte_registry(|registry| {
        registry_show_panel(registry, panel_id)?;
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
        panel.terminal.paste_clipboard();
        registry.focused_panel_id = Some(panel_id.to_string());
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_resize_panel(panel_id: &str, bounds: &NativeVteBounds) -> Result<(), String> {
    with_native_vte_registry(|registry| {
        let layout = registry
            .layout
            .as_ref()
            .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
        apply_terminal_bounds(layout, &panel.wrapper, &panel.terminal, bounds);
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_set_panel_visibility(
    panel_id: &str,
    visible: bool,
    bounds: Option<NativeVteBounds>,
) -> Result<(), String> {
    with_native_vte_registry(|registry| {
        let layout = registry.layout.clone();
        if visible {
            if let (Some(layout), Some(bounds)) = (layout.as_ref(), bounds.as_ref()) {
                let panel = registry
                    .panels
                    .get(panel_id)
                    .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
                apply_terminal_bounds(layout, &panel.wrapper, &panel.terminal, bounds);
            }
            registry_show_panel(registry, panel_id)?;
        } else {
            let panel = registry
                .panels
                .get_mut(panel_id)
                .ok_or_else(|| PANEL_NOT_ACTIVE_REASON.to_string())?;
            if let Some(layout) = layout.as_ref() {
                let hidden_bounds = derive_hidden_native_vte_panel_bounds();
                apply_terminal_bounds(layout, &panel.wrapper, &panel.terminal, &hidden_bounds);
            }
            panel.wrapper.set_visible(false);
            panel.terminal.set_visible(false);
            panel.visible = false;

            if registry.focused_panel_id.as_deref() == Some(panel_id) {
                registry.focused_panel_id = None;
            }

            sync_registry_layout_visibility(registry);
        }

        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_close_panel(panel_id: &str) -> Result<(), String> {
    with_native_vte_registry(|registry| registry_close_panel_by_id(registry, panel_id))
}

#[tauri::command]
pub fn native_vte_probe(
    app: AppHandle,
    _state: State<'_, NativeVteState>,
    request: NativeVteProbeRequest,
) -> NativeVteProbeResponse {
    #[cfg(target_os = "linux")]
    {
        match ensure_linux_probe_preconditions(&request)
            .and_then(|_| inspect_same_window_host(&app))
        {
            Ok(()) => NativeVteProbeResponse {
                ready: true,
                reason: None,
            },
            Err(reason) => NativeVteProbeResponse {
                ready: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        NativeVteProbeResponse {
            ready: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_vte_open(
    app: AppHandle,
    state: State<'_, NativeVteState>,
    request: NativeVteOpenRequest,
) -> NativeVteOpenResponse {
    #[cfg(target_os = "linux")]
    {
        let Some(bounds) = request.bounds.clone() else {
            emit_runtime_error(
                &app,
                request.panel_id,
                request.session_id,
                MISSING_BOUNDS_REASON,
            );
            return NativeVteOpenResponse {
                opened: false,
                reason: Some(MISSING_BOUNDS_REASON.to_string()),
            };
        };

        let _ = derive_terminal_grid(&bounds, None);
        let _ = build_native_shell_script(request.cwd.clone(), request.initial_command.clone());

        let open_plan = plan_native_vte_open(&state, request.panel_id.as_str());
        let panel_id = request.panel_id.clone();
        let session_id = request.session_id.clone();
        let request_for_ui = request;

        match open_plan
            .and_then(|_| prepare_same_window_host(&app, OPEN_FAILED_REASON))
            .and_then(|_| {
                let window = app
                    .get_webview_window("main")
                    .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

                execute_main_thread_job(
                    |job| {
                        window
                            .run_on_main_thread(job)
                            .map_err(|error| error.to_string())
                    },
                    {
                        let app = app.clone();
                        move || registry_open_panel(&app, &request_for_ui)
                    },
                )
            }) {
            Ok(()) => match set_panel_visibility_metadata(&state, panel_id.as_str(), true) {
                Ok(()) => NativeVteOpenResponse {
                    opened: true,
                    reason: None,
                },
                Err(reason) => {
                    emit_runtime_error(&app, panel_id, session_id, reason.clone());
                    NativeVteOpenResponse {
                        opened: false,
                        reason: Some(reason),
                    }
                }
            },
            Err(reason) => {
                let _ = close_panel_metadata(&state, panel_id.as_str());
                emit_runtime_error(&app, panel_id, session_id, reason.clone());
                NativeVteOpenResponse {
                    opened: false,
                    reason: Some(reason),
                }
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = state;
        let _ = request;
        NativeVteOpenResponse {
            opened: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_vte_focus(
    _app: AppHandle,
    state: State<'_, NativeVteState>,
    request: NativeVtePanelRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_focus = panel_id.clone();
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_focus_panel(&panel_id_for_focus),
        )?;

        set_focused_panel_metadata(&state, panel_id.as_str())?;
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = _state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_vte_paste(
    _app: AppHandle,
    state: State<'_, NativeVteState>,
    request: NativeVtePanelRequest,
) -> NativeVteCommandResponse {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;

        match registry_paste_panel(panel_id.as_str()).and_then(|_| {
            set_focused_panel_metadata(&state, panel_id.as_str())?;
            Ok(())
        }) {
            Ok(()) => NativeVteCommandResponse {
                supported: true,
                reason: None,
            },
            Err(reason) => NativeVteCommandResponse {
                supported: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = _app;
        let _ = state;
        let _ = request;
        NativeVteCommandResponse {
            supported: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_vte_resize(
    _app: AppHandle,
    _state: State<'_, NativeVteState>,
    request: NativeVteOpenRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let bounds = request
            .bounds
            .ok_or_else(|| MISSING_BOUNDS_REASON.to_string())?;

        let panel_id = request.panel_id;
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_resize_panel(&panel_id, &bounds),
        )
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_vte_set_visibility(
    _app: AppHandle,
    state: State<'_, NativeVteState>,
    request: NativeVteVisibilityRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_visibility = panel_id.clone();
        let visible = request.visible;
        let bounds = request.bounds;
        let _reason = request.reason;
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_set_panel_visibility(&panel_id_for_visibility, visible, bounds),
        )?;

        set_panel_visibility_metadata(&state, panel_id.as_str(), visible)?;

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_vte_close(
    _app: AppHandle,
    state: State<'_, NativeVteState>,
    request: NativeVtePanelRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_close = panel_id.clone();
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_close_panel(&panel_id_for_close),
        )?;

        close_panel_metadata(&state, panel_id.as_str())?;
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_native_shell_script, build_terminal_exit_event_payload, close_panel_metadata,
        derive_native_hermes_session_id, derive_native_vte_layout_geometry,
        derive_terminal_grid, detect_native_session_event, execute_main_thread_job,
        extract_opencode_session_id, is_hermes_launch_command,
        native_vte_overlay_layout_passes_through_to_webview, plan_native_vte_open,
        require_registered_panel, resolve_same_window_host_prep_result,
        resolve_same_window_probe_result, set_focused_panel_metadata,
        set_panel_visibility_metadata, shell_single_quote, should_reuse_native_panel,
        snapshot_native_vte_state, with_noop_child_setup, NativeVteBounds,
        NativeVteLayoutGeometry, NativeVteState,
    };
    #[cfg(target_os = "linux")]
    use super::{
        build_native_spawn_argv, build_native_spawn_env_from_iter,
        derive_hidden_native_vte_panel_bounds, derive_native_vte_panel_geometry, NativeVtePanelGeometry,
        NATIVE_VTE_SEPARATOR_GUTTER_PX,
    };

    #[test]
    fn native_vte_shell_quotes_single_quotes_for_safe_cd_commands() {
        assert_eq!(
            shell_single_quote("/tmp/devhub's workspace"),
            "'/tmp/devhub'\\''s workspace'"
        );
    }

    #[test]
    fn native_vte_shell_script_cd_execs_initial_command() {
        assert_eq!(
            build_native_shell_script(
                Some("/workspace/devhub".to_string()),
                Some("npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js".to_string()),
            ),
            "cd '/workspace/devhub' && exec npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js"
        );
    }

    #[test]
    fn native_vte_shell_script_defaults_to_login_shell_when_initial_command_missing() {
        assert_eq!(
            build_native_shell_script(Some("/workspace/devhub".to_string()), None),
            "cd '/workspace/devhub' && exec \"${SHELL:-/bin/bash}\" -l"
        );
    }

    #[test]
    fn native_vte_extracts_opencode_session_id_from_launch_command() {
        assert_eq!(
            extract_opencode_session_id(Some("opencode --session ses_term10")),
            Some("ses_term10".to_string())
        );
        assert_eq!(
            extract_opencode_session_id(Some("env FOO=1 opencode --session ses_nested")),
            Some("ses_nested".to_string())
        );
    }

    #[test]
    fn native_vte_ignores_non_resumable_opencode_and_non_matching_commands() {
        assert_eq!(extract_opencode_session_id(Some("opencode")), None);
        assert_eq!(extract_opencode_session_id(Some("bash -lc pwd")), None);
        assert_eq!(
            extract_opencode_session_id(Some("opencode --session invalid")),
            None
        );
    }

    #[test]
    fn native_vte_detects_hermes_launch_commands_and_derives_stable_session_ids() {
        assert!(is_hermes_launch_command(Some("hermes")));
        assert!(is_hermes_launch_command(Some(
            "env DEBUG=1 hermes --resume"
        )));
        assert!(!is_hermes_launch_command(Some("bash -lc pwd")));

        assert_eq!(
            derive_native_hermes_session_id("panel-1", Some("panel-1")),
            "hermes-panel-1".to_string()
        );
        assert_eq!(
            derive_native_hermes_session_id("panel-1", Some("hermes-existing")),
            "hermes-existing".to_string()
        );
    }

    #[test]
    fn native_vte_builds_session_detected_payloads_for_supported_tui_commands() {
        assert_eq!(
            detect_native_session_event(
                "panel-7",
                Some("panel-7"),
                Some("opencode --session ses_panel7")
            )
            .map(|payload| (
                payload.r#type,
                payload.session_id,
                payload.initial_command
            )),
            Some((
                "opencode-session-detected".to_string(),
                Some("ses_panel7".to_string()),
                Some("opencode --session ses_panel7".to_string())
            ))
        );

        assert_eq!(
            detect_native_session_event("panel-9", Some("panel-9"), Some("hermes --resume"))
                .map(|payload| (payload.r#type, payload.session_id)),
            Some((
                "hermes-session-detected".to_string(),
                Some("hermes-panel-9".to_string())
            ))
        );
    }

    #[test]
    fn native_vte_terminal_exit_payload_preserves_existing_browser_contract_fields() {
        assert_eq!(
            build_terminal_exit_event_payload(
                "panel-3",
                Some("panel-3"),
                Some("opencode --session ses_panel3"),
                0,
            ),
            super::NativeVteEventPayload {
                panel_id: "panel-3".to_string(),
                r#type: "terminal-exit".to_string(),
                reason: Some("child-exited:0".to_string()),
                session_id: Some("panel-3".to_string()),
                initial_command: Some("opencode --session ses_panel3".to_string()),
            }
        );
    }

    #[test]
    fn native_vte_panel_activation_payload_preserves_panel_identity() {
        assert_eq!(
            build_panel_activated_event_payload("panel-left", Some("ses_left")),
            super::NativeVteEventPayload {
                panel_id: "panel-left".to_string(),
                r#type: "panel-activated".to_string(),
                reason: None,
                session_id: Some("ses_left".to_string()),
                initial_command: None,
            }
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_vte_spawn_argv_uses_zsh_no_use_mode_for_interactive_login_shell() {
        let original_shell = std::env::var_os("SHELL");
        std::env::set_var("SHELL", "/bin/zsh");

        let argv = build_native_spawn_argv(Some("/workspace/devhub".to_string()), None);
        let argv = argv
            .iter()
            .map(|entry| entry.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        match original_shell {
            Some(value) => std::env::set_var("SHELL", value),
            None => std::env::remove_var("SHELL"),
        }

        assert_eq!(
            argv,
            vec![
                "/bin/zsh".to_string(),
                "-lic".to_string(),
                "exec zsh -i".to_string(),
                "devhub-shell".to_string(),
                "--no-use".to_string(),
            ]
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_vte_spawn_env_strips_npm_prefix_variables() {
        let env_entries = build_native_spawn_env_from_iter([
            ("npm_config_prefix", "/home/user/.npm-global"),
            ("NPM_CONFIG_PREFIX", "/home/user/.npm-global-upper"),
            ("PATH", "/usr/bin"),
            ("DEVHUB_PROJECT_DIR", "/workspace/devhub"),
        ]);
        let env_entries = env_entries
            .iter()
            .map(|entry| entry.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(env_entries.iter().any(|entry| entry == "PATH=/usr/bin"));
        assert!(env_entries
            .iter()
            .any(|entry| entry == "DEVHUB_PROJECT_DIR=/workspace/devhub"));
        assert!(!env_entries
            .iter()
            .any(|entry| entry.starts_with("npm_config_prefix=")));
        assert!(!env_entries
            .iter()
            .any(|entry| entry.starts_with("NPM_CONFIG_PREFIX=")));
    }

    #[test]
    fn native_vte_reuses_live_panel_on_reopen_for_view_switches() {
        assert!(should_reuse_native_panel(Some("panel-a"), "panel-a", true));
        assert!(should_reuse_native_panel(Some("panel-a"), "panel-b", true));
        assert!(!should_reuse_native_panel(
            Some("panel-a"),
            "panel-a",
            false
        ));
        assert!(should_reuse_native_panel(None, "panel-a", true));
    }

    #[test]
    fn native_vte_grid_uses_bounds_and_terminal_metrics() {
        assert_eq!(
            derive_terminal_grid(
                &NativeVteBounds {
                    x: 12.0,
                    y: 20.0,
                    width: 960.0,
                    height: 540.0,
                },
                Some((9, 18)),
            ),
            (106, 30)
        );
    }

    #[test]
    fn native_vte_grid_falls_back_to_default_metrics_and_minimums() {
        assert_eq!(
            derive_terminal_grid(
                &NativeVteBounds {
                    x: 0.0,
                    y: 0.0,
                    width: 10.0,
                    height: 8.0,
                },
                None,
            ),
            (2, 2)
        );
    }

    #[test]
    fn native_vte_layout_geometry_routes_each_terminal_to_its_panel_bounds() {
        assert_eq!(
            derive_native_vte_layout_geometry(
                &NativeVteBounds {
                    x: 64.0,
                    y: 104.0,
                    width: 1200.0,
                    height: 640.0,
                },
                Some((10, 20)),
            ),
            NativeVteLayoutGeometry {
                terminal_x: 64,
                terminal_y: 104,
                width: 1200,
                height: 640,
                columns: 120,
                rows: 32,
            }
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_vte_panel_geometry_keeps_native_separator_gutter_inside_panel_bounds() {
        assert_eq!(
            derive_native_vte_panel_geometry(
                &NativeVteBounds {
                    x: 320.0,
                    y: 48.0,
                    width: 640.0,
                    height: 480.0,
                },
                Some((10, 20)),
                NATIVE_VTE_SEPARATOR_GUTTER_PX,
            ),
            NativeVtePanelGeometry {
                wrapper_x: 320,
                wrapper_y: 48,
                wrapper_width: 640,
                wrapper_height: 480,
                terminal_width: 638,
                terminal_height: 478,
                columns: 63,
                rows: 23,
            }
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_vte_panel_geometry_clamps_separator_gutter_for_tiny_split_panels() {
        assert_eq!(
            derive_native_vte_panel_geometry(
                &NativeVteBounds {
                    x: 0.0,
                    y: 0.0,
                    width: 3.0,
                    height: 4.0,
                },
                Some((9, 18)),
                NATIVE_VTE_SEPARATOR_GUTTER_PX,
            ),
            NativeVtePanelGeometry {
                wrapper_x: 0,
                wrapper_y: 0,
                wrapper_width: 3,
                wrapper_height: 4,
                terminal_width: 1,
                terminal_height: 2,
                columns: 2,
                rows: 2,
            }
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_vte_hidden_panel_bounds_reset_geometry_offscreen_during_suspend() {
        assert_eq!(
            derive_hidden_native_vte_panel_bounds(),
            NativeVteBounds {
                x: -10_000.0,
                y: -10_000.0,
                width: 1.0,
                height: 1.0,
            }
        );
    }

    #[test]
    fn native_vte_panel_activation_payload_preserves_panel_identity() {
        assert_eq!(
            build_panel_activated_event_payload("panel-left", Some("ses_left")),
            super::NativeVteEventPayload {
                panel_id: "panel-left".to_string(),
                r#type: "panel-activated".to_string(),
                reason: None,
                session_id: Some("ses_left".to_string()),
                initial_command: None,
            }
        );
    }

    #[test]
    fn native_vte_overlay_layout_passes_pointer_events_back_to_the_webview() {
        assert!(native_vte_overlay_layout_passes_through_to_webview());
    }

    #[test]
    fn native_vte_state_snapshot_tracks_focus_and_visible_panels() {
        let state = NativeVteState::default();

        assert_eq!(
            snapshot_native_vte_state(&state).unwrap(),
            super::NativeVteStateSnapshot {
                focused_panel_id: None,
                visible_panel_ids: vec![],
            }
        );
    }

    #[test]
    fn native_vte_open_plan_preserves_previous_focus_before_switch() {
        let state = NativeVteState::default();
        *state.focused_panel_id.lock().unwrap() = Some("panel-a".to_string());

        assert_eq!(
            plan_native_vte_open(&state, "panel-b").unwrap(),
            (Some("panel-a".to_string()), false)
        );
        assert_eq!(
            plan_native_vte_open(&state, "panel-a").unwrap(),
            (Some("panel-a".to_string()), false)
        );
    }

    #[test]
    fn native_vte_rejects_unregistered_panels_before_main_thread_routing() {
        assert_eq!(
            require_registered_panel(Some("panel-a"), "panel-b"),
            Err("panel-not-active".to_string())
        );
        assert_eq!(require_registered_panel(Some("panel-a"), "panel-a"), Ok(()));
    }

    #[test]
    fn native_vte_main_thread_job_executes_through_runner() {
        let mut runner_called = false;

        let result = execute_main_thread_job(
            |job| {
                runner_called = true;
                job();
                Ok(())
            },
            || Ok::<_, String>("main-thread-ok".to_string()),
        )
        .unwrap();

        assert!(runner_called);
        assert_eq!(result, "main-thread-ok");
    }

    #[test]
    fn native_vte_metadata_updates_focused_panel_without_storing_widget_state() {
        let state = NativeVteState::default();

        set_focused_panel_metadata(&state, "panel-c").unwrap();
        set_panel_visibility_metadata(&state, "panel-a", true).unwrap();
        set_panel_visibility_metadata(&state, "panel-c", true).unwrap();
        assert_eq!(
            snapshot_native_vte_state(&state).unwrap(),
            super::NativeVteStateSnapshot {
                focused_panel_id: Some("panel-c".to_string()),
                visible_panel_ids: vec!["panel-a".to_string(), "panel-c".to_string()],
            }
        );

        close_panel_metadata(&state, "panel-c").unwrap();
        assert_eq!(
            snapshot_native_vte_state(&state).unwrap(),
            super::NativeVteStateSnapshot {
                focused_panel_id: None,
                visible_panel_ids: vec!["panel-a".to_string()],
            }
        );
    }

    #[test]
    fn native_vte_probe_accepts_same_window_host_without_webview_parent_heuristic() {
        assert_eq!(resolve_same_window_probe_result(1, false, false), Ok(()));
        assert_eq!(resolve_same_window_probe_result(2, false, false), Ok(()));
    }

    #[test]
    fn native_vte_probe_accepts_existing_native_overlay_host() {
        assert_eq!(resolve_same_window_probe_result(0, true, false), Ok(()));
        assert_eq!(resolve_same_window_probe_result(1, true, false), Ok(()));
    }

    #[test]
    fn native_vte_probe_accepts_direct_webview_handle_even_without_vbox_children() {
        assert_eq!(resolve_same_window_probe_result(0, false, true), Ok(()));
    }

    #[test]
    fn native_vte_probe_rejects_missing_same_window_host_primitives() {
        assert_eq!(
            resolve_same_window_probe_result(0, false, false),
            Err("probe-missing-host-primitives".to_string())
        );
    }

    #[test]
    fn native_vte_open_host_prep_accepts_existing_overlay_or_real_vbox_children() {
        assert_eq!(resolve_same_window_host_prep_result(0, true, false), Ok(()));
        assert_eq!(
            resolve_same_window_host_prep_result(1, false, false),
            Ok(())
        );
    }

    #[test]
    fn native_vte_open_host_prep_accepts_direct_webview_handle_without_vbox_children() {
        assert_eq!(resolve_same_window_host_prep_result(0, false, true), Ok(()));
    }

    #[test]
    fn native_vte_shared_host_recognizes_legacy_browser_overlay_name() {
        assert!(crate::native_window_host::native_overlay_name_matches(
            "devhub-native-browser-overlay"
        ));
    }

    #[test]
    fn native_vte_spawn_wrapper_always_supplies_child_setup_callback() {
        let callback_present = with_noop_child_setup(|child_setup| {
            if let Some(callback) = child_setup {
                callback();
                Ok::<_, String>(true)
            } else {
                Ok::<_, String>(false)
            }
        })
        .unwrap();

        assert!(callback_present);
    }
}

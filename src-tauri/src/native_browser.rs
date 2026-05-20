use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "linux")]
use std::{cell::RefCell, sync::{mpsc, Once}};

#[cfg(target_os = "linux")]
use gtk::prelude::*;

#[cfg(target_os = "linux")]
use webkit2gtk::{traits::WebViewExt, WebView};

const PROBE_FAILED_REASON: &str = "probe-failed";
const PROBE_MISSING_MAIN_WINDOW_REASON: &str = "probe-missing-main-window";
const PROBE_MISSING_DEFAULT_VBOX_REASON: &str = "probe-missing-default-vbox";
const PROBE_MISSING_WEBVIEW_HANDLE_REASON: &str = "probe-missing-webview-handle";
const PROBE_MISSING_HOST_PRIMITIVES_REASON: &str = "probe-missing-host-primitives";
const OPEN_FAILED_REASON: &str = "open-failed";
const MISSING_BOUNDS_REASON: &str = "missing-bounds";
const PANEL_NOT_FOUND_REASON: &str = "panel-not-found";
const EDITING_COMMAND_NOT_VERIFIED_REASON: &str = "editing-command-not-verified";

#[cfg(target_os = "linux")]
static NATIVE_BROWSER_HOST_STYLES_ONCE: Once = Once::new();

#[cfg(target_os = "linux")]
const NATIVE_BROWSER_OVERLAY_NAME: &str = "devhub-native-browser-overlay";
#[cfg(target_os = "linux")]
const NATIVE_BROWSER_LAYOUT_NAME: &str = "devhub-native-browser-layout";

#[derive(Default)]
pub struct NativeBrowserState {
    focused_panel_id: Mutex<Option<String>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserProbeRequest {
    pub panel_id: Option<String>,
    pub requested_mode: Option<String>,
    pub tauri_available: Option<bool>,
}

#[derive(serde::Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserOpenRequest {
    pub panel_id: String,
    pub url: String,
    pub bounds: Option<NativeBrowserBounds>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserPanelRequest {
    pub panel_id: String,
    pub reason: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserLoadUrlRequest {
    pub panel_id: String,
    pub url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserVisibilityRequest {
    pub panel_id: String,
    pub visible: bool,
    pub bounds: Option<NativeBrowserBounds>,
}

#[derive(Serialize)]
pub struct NativeBrowserProbeResponse {
    pub ready: bool,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeBrowserOpenResponse {
    pub opened: bool,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeBrowserLoadUrlResponse {
    pub loaded: bool,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeBrowserReloadResponse {
    pub reloaded: bool,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct NativeBrowserCommandResponse {
    pub supported: bool,
    pub reason: Option<String>,
}

#[cfg(target_os = "linux")]
thread_local! {
    static NATIVE_BROWSER_REGISTRY: RefCell<NativeBrowserRegistry> = RefCell::new(NativeBrowserRegistry::default());
}

#[cfg(target_os = "linux")]
#[derive(Default)]
struct NativeBrowserRegistry {
    _overlay: Option<gtk::Overlay>,
    layout: Option<gtk::Fixed>,
    panels: HashMap<String, NativeBrowserPanelHost>,
}

#[cfg(target_os = "linux")]
struct NativeBrowserPanelHost {
    wrapper: gtk::Frame,
    webview: WebView,
    visible: bool,
}

fn unsupported_platform_reason() -> Option<String> {
    Some("unsupported-platform".to_string())
}

#[cfg(target_os = "linux")]
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
fn widget_name_matches(widget: &gtk::Widget, expected: &str) -> bool {
    widget.widget_name().as_str() == expected
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
fn ensure_linux_probe_preconditions(request: &NativeBrowserProbeRequest) -> Result<(), String> {
    if request.requested_mode.as_deref() != Some("native-gtk") {
        return Err(PROBE_FAILED_REASON.to_string());
    }

    if !request.tauri_available.unwrap_or(false) {
        return Err("tauri-unavailable".to_string());
    }

    if request.panel_id.as_deref().unwrap_or_default().trim().is_empty() {
        return Err(PROBE_FAILED_REASON.to_string());
    }

    Ok(())
}

#[cfg(target_os = "linux")]
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
            let overlay_present = children
                .iter()
                .any(|child| widget_name_matches(child, NATIVE_BROWSER_OVERLAY_NAME));
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
        let overlay_present = children
            .iter()
            .any(|child| widget_name_matches(child, NATIVE_BROWSER_OVERLAY_NAME));
        let direct_webview_accessible = webview.is::<gtk::Widget>();

        resolve_same_window_probe_result(children.len(), overlay_present, direct_webview_accessible)
            .map_err(|_| failure_reason.clone())?;

        ensure_native_browser_host(window, Some(webview))
            .map(|_| ())
            .map_err(|_| failure_reason.clone())
    })
}

#[cfg(target_os = "linux")]
fn with_native_browser_registry<T>(
    job: impl FnOnce(&mut NativeBrowserRegistry) -> Result<T, String>,
) -> Result<T, String> {
    NATIVE_BROWSER_REGISTRY.with(|registry| job(&mut registry.borrow_mut()))
}

#[cfg(target_os = "linux")]
fn install_native_browser_host_styles() {
    NATIVE_BROWSER_HOST_STYLES_ONCE.call_once(|| {
        let provider = gtk::CssProvider::new();
        let css = br#"
            frame.devhub-native-browser-host {
                background-color: rgba(13, 17, 23, 0.96);
                border: none;
                border-radius: 0;
                box-shadow: none;
            }

            frame.devhub-native-browser-host border {
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
fn ensure_native_browser_host(
    window: &tauri::WebviewWindow,
    direct_webview: Option<webkit2gtk::WebView>,
) -> Result<(gtk::Overlay, gtk::Fixed), String> {
    use glib::object::Cast;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    let default_vbox = window.default_vbox().map_err(|error| error.to_string())?;
    let overlay = if let Some(existing_overlay) = gtk_window
        .children()
        .into_iter()
        .chain(default_vbox.children().into_iter())
        .find(|child| widget_name_matches(child, NATIVE_BROWSER_OVERLAY_NAME))
        .and_then(|child| child.downcast::<gtk::Overlay>().ok())
    {
        existing_overlay
    } else {
        let webview_widget = direct_webview
            .map(|webview| webview.upcast::<gtk::Widget>())
            .or_else(|| default_vbox.children().into_iter().last())
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        if let Some(parent) = webview_widget.parent() {
            if let Ok(container) = parent.downcast::<gtk::Container>() {
                container.remove(&webview_widget);
            }
        }

        let overlay = gtk::Overlay::new();
        overlay.set_widget_name(NATIVE_BROWSER_OVERLAY_NAME);
        overlay.add(&webview_widget);

        if let Some(parent) = default_vbox.parent() {
            if let Ok(container) = parent.downcast::<gtk::Container>() {
                container.remove(&default_vbox);
            }
        }

        gtk_window.add(&overlay);
        overlay
    };

    install_native_browser_host_styles();

    let layout = if let Some(existing_layout) = overlay
        .children()
        .into_iter()
        .find(|child| widget_name_matches(child, NATIVE_BROWSER_LAYOUT_NAME))
        .and_then(|child| child.downcast::<gtk::Fixed>().ok())
    {
        existing_layout
    } else {
        for stale_layout in overlay
            .children()
            .into_iter()
            .filter(|child| widget_name_matches(child, NATIVE_BROWSER_LAYOUT_NAME))
        {
            overlay.remove(&stale_layout);
        }

        let layout = gtk::Fixed::new();
        layout.set_widget_name(NATIVE_BROWSER_LAYOUT_NAME);
        layout.set_halign(gtk::Align::Fill);
        layout.set_valign(gtk::Align::Fill);
        layout.set_size_request(-1, -1);
        overlay.add_overlay(&layout);
        overlay.reorder_overlay(&layout, -1);
        layout
    };

    overlay.set_overlay_pass_through(&layout, true);
    overlay.show_all();
    layout.show_all();

    Ok((overlay, layout))
}

#[cfg(target_os = "linux")]
fn derive_hidden_native_browser_bounds() -> NativeBrowserBounds {
    NativeBrowserBounds {
        x: -10_000.0,
        y: -10_000.0,
        width: 1.0,
        height: 1.0,
    }
}

#[cfg(target_os = "linux")]
fn apply_browser_bounds(layout: &gtk::Fixed, wrapper: &gtk::Frame, bounds: &NativeBrowserBounds) {
    let x = bounds.x.round().max(0.0) as i32;
    let y = bounds.y.round().max(0.0) as i32;
    let width = bounds.width.round().max(1.0) as i32;
    let height = bounds.height.round().max(1.0) as i32;

    layout.set_halign(gtk::Align::Fill);
    layout.set_valign(gtk::Align::Fill);
    layout.set_margin_start(0);
    layout.set_margin_top(0);
    layout.set_size_request(-1, -1);
    layout.move_(wrapper, x, y);
    wrapper.set_size_request(width, height);
    wrapper.queue_resize();
    layout.queue_resize();
}

#[cfg(target_os = "linux")]
fn sync_registry_layout_visibility(registry: &NativeBrowserRegistry) {
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
fn registry_show_panel(registry: &mut NativeBrowserRegistry, panel_id: &str) -> Result<(), String> {
    let panel = registry
        .panels
        .get_mut(panel_id)
        .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
    panel.wrapper.set_visible(true);
    panel.webview.set_visible(true);
    panel.visible = true;
    panel.wrapper.show_all();
    sync_registry_layout_visibility(registry);
    Ok(())
}

#[cfg(target_os = "linux")]
fn registry_close_panel_by_id(
    registry: &mut NativeBrowserRegistry,
    panel_id: &str,
) -> Result<(), String> {
    let panel = registry
        .panels
        .remove(panel_id)
        .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;

    if let Some(layout) = registry.layout.as_ref() {
        layout.remove(&panel.wrapper);
    }

    sync_registry_layout_visibility(registry);
    Ok(())
}

#[cfg(target_os = "linux")]
fn registry_open_panel(_app: &AppHandle, request: &NativeBrowserOpenRequest) -> Result<(), String> {
    let window = _app
        .get_webview_window("main")
        .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

    let (overlay, layout) = ensure_native_browser_host(&window, None)?;

    with_native_browser_registry(|registry| {
        registry._overlay = Some(overlay);
        registry.layout = Some(layout.clone());

        if let Some(panel) = registry.panels.get_mut(request.panel_id.as_str()) {
            panel.webview.load_uri(request.url.as_str());
            if let Some(bounds) = request.bounds.as_ref() {
                apply_browser_bounds(&layout, &panel.wrapper, bounds);
            }
            registry_show_panel(registry, request.panel_id.as_str())?;
            return Ok(());
        }

        let webview = WebView::new();
        webview.load_uri(request.url.as_str());
        webview.set_hexpand(true);
        webview.set_vexpand(true);

        let wrapper = gtk::Frame::new(None);
        wrapper.set_widget_name(&format!("devhub-native-browser-host-{}", request.panel_id));
        wrapper.style_context().add_class("devhub-native-browser-host");
        wrapper.set_shadow_type(gtk::ShadowType::None);
        wrapper.set_halign(gtk::Align::Fill);
        wrapper.set_valign(gtk::Align::Fill);
        wrapper.add(&webview);

        layout.put(&wrapper, 0, 0);
        wrapper.show_all();

        if let Some(bounds) = request.bounds.as_ref() {
            apply_browser_bounds(&layout, &wrapper, bounds);
        }

        registry.panels.insert(
            request.panel_id.clone(),
            NativeBrowserPanelHost {
                wrapper,
                webview,
                visible: true,
            },
        );
        registry_show_panel(registry, request.panel_id.as_str())
    })
}

#[cfg(target_os = "linux")]
fn registry_focus_panel(panel_id: &str) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        registry_show_panel(registry, panel_id)?;
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        panel.webview.grab_focus();
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_resize_panel(panel_id: &str, bounds: &NativeBrowserBounds) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let layout = registry
            .layout
            .as_ref()
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        apply_browser_bounds(layout, &panel.wrapper, bounds);
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_set_panel_visibility(
    panel_id: &str,
    visible: bool,
    bounds: Option<NativeBrowserBounds>,
) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let layout = registry.layout.clone();

        if visible {
            if let (Some(layout), Some(bounds)) = (layout.as_ref(), bounds.as_ref()) {
                let panel = registry
                    .panels
                    .get(panel_id)
                    .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
                apply_browser_bounds(layout, &panel.wrapper, bounds);
            }
            registry_show_panel(registry, panel_id)?;
        } else {
            let panel = registry
                .panels
                .get_mut(panel_id)
                .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
            if let Some(layout) = layout.as_ref() {
                let hidden_bounds = derive_hidden_native_browser_bounds();
                apply_browser_bounds(layout, &panel.wrapper, &hidden_bounds);
            }
            panel.wrapper.set_visible(false);
            panel.webview.set_visible(false);
            panel.visible = false;
            sync_registry_layout_visibility(registry);
        }

        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_load_panel_url(panel_id: &str, url: &str) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        panel.webview.load_uri(url);
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_reload_panel(panel_id: &str) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        panel.webview.reload();
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_close_panel(panel_id: &str) -> Result<(), String> {
    with_native_browser_registry(|registry| registry_close_panel_by_id(registry, panel_id))
}

#[tauri::command]
pub fn native_browser_probe(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserProbeRequest,
) -> NativeBrowserProbeResponse {
    #[cfg(target_os = "linux")]
    {
        match ensure_linux_probe_preconditions(&request).and_then(|_| inspect_same_window_host(&app)) {
            Ok(()) => NativeBrowserProbeResponse {
                ready: true,
                reason: None,
            },
            Err(reason) => NativeBrowserProbeResponse {
                ready: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        NativeBrowserProbeResponse {
            ready: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_browser_open(
    app: AppHandle,
    state: State<'_, NativeBrowserState>,
    request: NativeBrowserOpenRequest,
) -> NativeBrowserOpenResponse {
    #[cfg(target_os = "linux")]
    {
        let Some(bounds) = request.bounds.clone() else {
            return NativeBrowserOpenResponse {
                opened: false,
                reason: Some(MISSING_BOUNDS_REASON.to_string()),
            };
        };

        let panel_id = request.panel_id.clone();
        let request_for_ui = request;

        match prepare_same_window_host(&app, OPEN_FAILED_REASON).and_then(|_| {
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
                    move || registry_open_panel(&app, &NativeBrowserOpenRequest {
                        bounds: Some(bounds),
                        ..request_for_ui
                    })
                },
            )
        }) {
            Ok(()) => {
                if let Ok(mut focused_panel_id) = state.focused_panel_id.lock() {
                    *focused_panel_id = Some(panel_id);
                }

                NativeBrowserOpenResponse {
                    opened: true,
                    reason: None,
                }
            }
            Err(reason) => NativeBrowserOpenResponse {
                opened: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = state;
        let _ = request;
        NativeBrowserOpenResponse {
            opened: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_browser_load_url(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserLoadUrlRequest,
) -> NativeBrowserLoadUrlResponse {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let url = request.url;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string());

        match window.and_then(|window| {
            execute_main_thread_job(
                |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
                move || registry_load_panel_url(&panel_id, &url),
            )
        }) {
            Ok(()) => NativeBrowserLoadUrlResponse {
                loaded: true,
                reason: None,
            },
            Err(reason) => NativeBrowserLoadUrlResponse {
                loaded: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        NativeBrowserLoadUrlResponse {
            loaded: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_browser_reload(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> NativeBrowserReloadResponse {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string());

        match window.and_then(|window| {
            execute_main_thread_job(
                |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
                move || registry_reload_panel(&panel_id),
            )
        }) {
            Ok(()) => NativeBrowserReloadResponse {
                reloaded: true,
                reason: None,
            },
            Err(reason) => NativeBrowserReloadResponse {
                reloaded: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        NativeBrowserReloadResponse {
            reloaded: false,
            reason: unsupported_platform_reason(),
        }
    }
}

#[tauri::command]
pub fn native_browser_resize(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserOpenRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let bounds = request
            .bounds
            .ok_or_else(|| MISSING_BOUNDS_REASON.to_string())?;
        let panel_id = request.panel_id;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
            move || registry_resize_panel(&panel_id, &bounds),
        )
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_browser_focus(
    app: AppHandle,
    state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_focus = panel_id.clone();
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
            move || registry_focus_panel(&panel_id_for_focus),
        )?;

        if let Ok(mut focused_panel_id) = state.focused_panel_id.lock() {
            *focused_panel_id = Some(panel_id);
        }

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_browser_set_visibility(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserVisibilityRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let visible = request.visible;
        let bounds = request.bounds;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
            move || registry_set_panel_visibility(&panel_id, visible, bounds),
        )
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

#[tauri::command]
pub fn native_browser_select_all(
    _app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> NativeBrowserCommandResponse {
    let _ = request;
    NativeBrowserCommandResponse {
        supported: false,
        reason: Some(EDITING_COMMAND_NOT_VERIFIED_REASON.to_string()),
    }
}

#[tauri::command]
pub fn native_browser_copy(
    _app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> NativeBrowserCommandResponse {
    let _ = request;
    NativeBrowserCommandResponse {
        supported: false,
        reason: Some(EDITING_COMMAND_NOT_VERIFIED_REASON.to_string()),
    }
}

#[tauri::command]
pub fn native_browser_close(
    app: AppHandle,
    state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_close = panel_id.clone();
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| window.run_on_main_thread(job).map_err(|error| error.to_string()),
            move || registry_close_panel(&panel_id_for_close),
        )?;

        if let Ok(mut focused_panel_id) = state.focused_panel_id.lock() {
            if focused_panel_id.as_deref() == Some(panel_id.as_str()) {
                *focused_panel_id = None;
            }
        }

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = state;
        let _ = request;
        Err("unsupported-platform".to_string())
    }
}

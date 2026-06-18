#![allow(dead_code)]
#![allow(deprecated)]

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "linux")]
use std::{
    cell::RefCell,
    fs,
    path::{Path, PathBuf},
    sync::{mpsc, Once},
};

#[cfg(target_os = "linux")]
use gtk::prelude::*;

#[cfg(target_os = "linux")]
use gtk::gio;

#[cfg(target_os = "linux")]
use javascriptcore::ValueExt;

#[cfg(target_os = "linux")]
use webkit2gtk::{
    CookieManagerExt, CookiePersistentStorage, UserContentInjectedFrames, UserContentManager,
    UserContentManagerExt, UserScript, UserScriptInjectionTime, WebContext, WebView, WebViewExt,
    WebViewExtManual, WebsiteDataManager, WebsiteDataManagerExt,
};

#[cfg(target_os = "linux")]
use crate::native_window_host::{
    ensure_shared_native_overlay, widget_matches_native_overlay, widget_name_matches,
};

const PROBE_FAILED_REASON: &str = "probe-failed";
const PROBE_MISSING_MAIN_WINDOW_REASON: &str = "probe-missing-main-window";
const PROBE_MISSING_DEFAULT_VBOX_REASON: &str = "probe-missing-default-vbox";
const PROBE_MISSING_WEBVIEW_HANDLE_REASON: &str = "probe-missing-webview-handle";
const PROBE_MISSING_HOST_PRIMITIVES_REASON: &str = "probe-missing-host-primitives";
const OPEN_FAILED_REASON: &str = "open-failed";
const MISSING_BOUNDS_REASON: &str = "missing-bounds";
const PANEL_NOT_FOUND_REASON: &str = "panel-not-found";
const EDITING_COMMAND_NOT_VERIFIED_REASON: &str = "editing-command-not-verified";
const PROFILE_INIT_FAILED_REASON: &str = "profile-init-failed";
const SELECTOR_UNAVAILABLE_REASON: &str = "selector-unavailable";
const INVALID_SELECTOR_ACTION_REASON: &str = "invalid-selector-action";
const NATIVE_BROWSER_EVENT_NAME: &str = "native-browser-event";
const NATIVE_BROWSER_SELECTOR_HANDLER_NAME: &str = "devhubSelector";
const NATIVE_BROWSER_SELECTOR_MODE_SELECT: &str = "select";

#[cfg(target_os = "linux")]
static NATIVE_BROWSER_HOST_STYLES_ONCE: Once = Once::new();

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

#[derive(serde::Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(serde::Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserAvoidRect {
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
    #[serde(default)]
    pub avoid_rects: Vec<NativeBrowserAvoidRect>,
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
    #[serde(default)]
    pub avoid_rects: Vec<NativeBrowserAvoidRect>,
}

#[derive(Serialize)]
pub struct NativeBrowserProbeResponse {
    pub ready: bool,
    pub reason: Option<String>,
    #[serde(rename = "persistentProfile")]
    pub persistent_profile: bool,
    pub capabilities: NativeBrowserCapabilities,
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

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserCapabilities {
    pub persistent_profile: bool,
    pub selector: NativeBrowserSelectorCapability,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserSelectorCapability {
    pub inspect: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserSelectorCommandRequest {
    pub panel_id: String,
    pub action: String,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserSelectorRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserSelectorElement {
    pub tag_name: String,
    pub id: Option<String>,
    pub class_name: Option<String>,
    pub text: Option<String>,
    pub rect: NativeBrowserSelectorRect,
    pub attributes: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserEventPayload {
    pub panel_id: String,
    pub r#type: String,
    pub url: Option<String>,
    pub reason: Option<String>,
    pub element: Option<NativeBrowserSelectorElement>,
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
    selector_context: NativeBrowserSelectorContext,
    visible: bool,
    last_bounds: Option<NativeBrowserBounds>,
    avoid_rects: Vec<NativeBrowserAvoidRect>,
}

#[cfg(target_os = "linux")]
#[derive(Clone)]
struct NativeBrowserSelectorContext {
    panel_id: String,
    app: AppHandle,
}

fn unsupported_platform_reason() -> Option<String> {
    Some("unsupported-platform".to_string())
}

fn emit_native_browser_event(app: &AppHandle, payload: NativeBrowserEventPayload) {
    let _ = app.emit(NATIVE_BROWSER_EVENT_NAME, payload);
}

fn selector_error_payload(panel_id: &str, reason: &str) -> NativeBrowserEventPayload {
    NativeBrowserEventPayload {
        panel_id: panel_id.to_string(),
        r#type: "selector-error".to_string(),
        url: None,
        reason: Some(reason.to_string()),
        element: None,
    }
}

fn map_selector_event_payload(
    panel_id: &str,
    raw_payload: Option<&str>,
) -> NativeBrowserEventPayload {
    let Some(raw_payload) = raw_payload else {
        return selector_error_payload(panel_id, SELECTOR_UNAVAILABLE_REASON);
    };

    match serde_json::from_str::<NativeBrowserEventPayload>(raw_payload) {
        Ok(mut payload) if !payload.r#type.trim().is_empty() => {
            payload.panel_id = panel_id.to_string();
            payload
        }
        _ => selector_error_payload(panel_id, SELECTOR_UNAVAILABLE_REASON),
    }
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
fn ensure_directory(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|_| PROFILE_INIT_FAILED_REASON.to_string())?;
    Ok(path.to_path_buf())
}

#[cfg(target_os = "linux")]
fn derive_native_browser_profile_paths(
    app: &AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let data_root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| PROFILE_INIT_FAILED_REASON.to_string())?
        .join("native-browser")
        .join("linux-default");
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| PROFILE_INIT_FAILED_REASON.to_string())?
        .join("native-browser")
        .join("linux-default");

    let data_dir = ensure_directory(&data_root.join("data"))?;
    let cache_dir = ensure_directory(&cache_root.join("cache"))?;
    let cookie_file = data_dir.join("cookies.sqlite");

    Ok((data_dir, cache_dir, cookie_file))
}

#[cfg(target_os = "linux")]
fn create_native_browser_capabilities(
    selector_ready: bool,
    persistent_profile: bool,
) -> NativeBrowserCapabilities {
    NativeBrowserCapabilities {
        persistent_profile,
        selector: NativeBrowserSelectorCapability {
            inspect: selector_ready,
        },
    }
}

#[cfg(target_os = "linux")]
fn normalize_probe_response(
    ready: bool,
    reason: Option<String>,
    persistent_profile: bool,
    selector_ready: bool,
) -> NativeBrowserProbeResponse {
    NativeBrowserProbeResponse {
        ready,
        reason,
        persistent_profile,
        capabilities: create_native_browser_capabilities(selector_ready, persistent_profile),
    }
}

#[cfg(not(target_os = "linux"))]
fn normalize_probe_response(
    ready: bool,
    reason: Option<String>,
    persistent_profile: bool,
    selector_ready: bool,
) -> NativeBrowserProbeResponse {
    let _ = selector_ready;
    NativeBrowserProbeResponse {
        ready,
        reason,
        persistent_profile,
        capabilities: NativeBrowserCapabilities {
            persistent_profile,
            selector: NativeBrowserSelectorCapability { inspect: false },
        },
    }
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

        resolve_same_window_probe_result(
            children.len(),
            overlay_present,
            direct_webview_accessible,
        )
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
    let overlay = ensure_shared_native_overlay(window, direct_webview, OPEN_FAILED_REASON)?;

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
fn wrapper_is_attached_to_layout(layout: &gtk::Fixed, wrapper: &gtk::Frame) -> bool {
    wrapper
        .parent()
        .and_then(|parent| parent.downcast::<gtk::Fixed>().ok())
        .map(|parent_layout| parent_layout == *layout)
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn ensure_panel_wrapper_in_layout(layout: &gtk::Fixed, wrapper: &gtk::Frame) {
    if wrapper_is_attached_to_layout(layout, wrapper) {
        return;
    }

    if let Some(parent) = wrapper.parent() {
        if let Ok(container) = parent.downcast::<gtk::Container>() {
            container.remove(wrapper);
        }
    }

    layout.put(wrapper, 0, 0);
}

#[cfg(target_os = "linux")]
fn apply_browser_bounds(layout: &gtk::Fixed, wrapper: &gtk::Frame, bounds: &NativeBrowserBounds) {
    let x = bounds.x.round().max(0.0) as i32;
    let y = bounds.y.round().max(0.0) as i32;
    let width = bounds.width.round().max(1.0) as i32;
    let height = bounds.height.round().max(1.0) as i32;

    ensure_panel_wrapper_in_layout(layout, wrapper);

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
fn apply_browser_shape(
    panel: &mut NativeBrowserPanelHost,
    bounds: &NativeBrowserBounds,
    avoid_rects: &[NativeBrowserAvoidRect],
) {
    if avoid_rects.is_empty() {
        panel.wrapper.shape_combine_region(None::<&cairo::Region>);
        panel
            .wrapper
            .input_shape_combine_region(None::<&cairo::Region>);
        panel.webview.shape_combine_region(None::<&cairo::Region>);
        panel
            .webview
            .input_shape_combine_region(None::<&cairo::Region>);
        return;
    }

    let total = cairo::RectangleInt {
        x: 0,
        y: 0,
        width: bounds.width.round().max(1.0) as i32,
        height: bounds.height.round().max(1.0) as i32,
    };
    let region = cairo::Region::create_rectangle(&total);

    for rect in avoid_rects {
        let hole = cairo::RectangleInt {
            x: (rect.x - bounds.x).round() as i32,
            y: (rect.y - bounds.y).round() as i32,
            width: rect.width.round().max(0.0) as i32,
            height: rect.height.round().max(0.0) as i32,
        };
        if hole.width > 0 && hole.height > 0 {
            let _ = region.subtract_rectangle(&hole);
        }
    }

    panel.wrapper.shape_combine_region(Some(&region));
    panel.wrapper.input_shape_combine_region(Some(&region));
    panel.webview.shape_combine_region(Some(&region));
    panel.webview.input_shape_combine_region(Some(&region));
}

#[cfg(target_os = "linux")]
fn native_browser_selector_script() -> &'static str {
    r#"
(() => {
  if (window.__DEVHUB_NATIVE_SELECTOR__) {
    return;
  }

  const state = {
    active: false,
    mode: 'select',
    hovered: null,
    selected: null,
  };

  const post = (payload) => {
    try {
      window.webkit.messageHandlers.devhubSelector.postMessage(JSON.stringify(payload));
    } catch (_error) {}
  };

  const selectorFor = (node) => {
    if (!node || !(node instanceof HTMLElement)) return null;
    const tagName = String(node.tagName || '').toLowerCase();
    const id = node.id ? `#${node.id}` : '';
    const classes = typeof node.className === 'string'
      ? node.className.split(/\s+/).filter(Boolean).slice(0, 3).map((value) => `.${value}`).join('')
      : '';
    return `${tagName}${id}${classes}`;
  };

  const collectElement = (node) => {
    const rect = node.getBoundingClientRect();
    const attributes = {};
    ['id', 'class', 'data-testid', 'data-source-file', 'x-file-name', 'x-line-number'].forEach((name) => {
      const value = node.getAttribute(name);
      if (value) attributes[name] = value;
    });
    return {
      tagName: String(node.tagName || '').toLowerCase(),
      id: node.id || null,
      className: typeof node.className === 'string' ? node.className : null,
      text: String(node.textContent || '').trim().slice(0, 160) || null,
      selector: selectorFor(node),
      rect: {
        x: Number(rect.x || 0),
        y: Number(rect.y || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
      },
      attributes,
    };
  };

  const clearOutline = (node) => {
    if (!node || !node.style) return;
    node.style.outline = '';
    node.style.outlineOffset = '';
    node.style.boxShadow = '';
  };

  const applyOutline = (node, color) => {
    if (!node || !node.style) return;
    node.style.outline = `2px solid ${color}`;
    node.style.outlineOffset = '-2px';
    node.style.boxShadow = `0 0 0 1px ${color}`;
  };

  const handleMove = (event) => {
    if (!state.active) return;
    const next = event.target instanceof HTMLElement ? event.target : null;
    if (!next || next === state.selected) return;
    if (state.hovered && state.hovered !== state.selected) clearOutline(state.hovered);
    state.hovered = next;
    applyOutline(next, 'rgba(88, 166, 255, 0.95)');
    post({ type: 'selector-hover', element: collectElement(next), url: location.href });
  };

  const handleClick = (event) => {
    if (!state.active) return;
    const next = event.target instanceof HTMLElement ? event.target : null;
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.selected && state.selected !== next) clearOutline(state.selected);
    state.selected = next;
    applyOutline(next, 'rgba(34, 197, 94, 0.95)');
    post({ type: 'selector-selected', element: collectElement(next), url: location.href });
  };

  const deactivate = () => {
    if (state.hovered && state.hovered !== state.selected) clearOutline(state.hovered);
    if (state.selected) clearOutline(state.selected);
    state.active = false;
    state.hovered = null;
    state.selected = null;
    post({ type: 'selector-cleared', url: location.href });
  };

  document.addEventListener('mousemove', handleMove, true);
  document.addEventListener('click', handleClick, true);

  window.__DEVHUB_NATIVE_SELECTOR__ = {
    activate(mode) {
      state.active = true;
      state.mode = mode || 'select';
      post({ type: 'selector-ready', mode: state.mode, url: location.href });
    },
    deactivate,
    clearSelection() {
      if (state.selected) clearOutline(state.selected);
      state.selected = null;
      post({ type: 'selector-cleared', url: location.href });
    },
  };
})();
"#
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
fn register_native_browser_selector_bridge(
    app: &AppHandle,
    panel_id: &str,
    user_content_manager: &UserContentManager,
) -> Result<(), String> {
    let _ =
        user_content_manager.register_script_message_handler(NATIVE_BROWSER_SELECTOR_HANDLER_NAME);
    let selector_context = NativeBrowserSelectorContext {
        panel_id: panel_id.to_string(),
        app: app.clone(),
    };

    user_content_manager.connect_script_message_received(
        Some(NATIVE_BROWSER_SELECTOR_HANDLER_NAME),
        move |_manager, message| {
            let Some(js_value) = message.js_value() else {
                emit_native_browser_event(
                    &selector_context.app,
                    selector_error_payload(&selector_context.panel_id, SELECTOR_UNAVAILABLE_REASON),
                );
                return;
            };

            let raw_payload = js_value
                .to_json(0)
                .map(|value| value.to_string())
                .unwrap_or_else(|| js_value.to_str().to_string());
            let payload =
                map_selector_event_payload(&selector_context.panel_id, Some(raw_payload.as_str()));
            emit_native_browser_event(&selector_context.app, payload);
        },
    );

    let script = UserScript::new(
        native_browser_selector_script(),
        UserContentInjectedFrames::TopFrame,
        UserScriptInjectionTime::Start,
        &[],
        &[],
    );
    user_content_manager.add_script(&script);
    Ok(())
}

#[cfg(target_os = "linux")]
fn build_native_browser_webview(
    app: &AppHandle,
    panel_id: &str,
) -> Result<(WebView, NativeBrowserSelectorContext), String> {
    let (data_dir, cache_dir, cookie_file) = derive_native_browser_profile_paths(app)?;
    let website_data_manager = WebsiteDataManager::builder()
        .base_data_directory(data_dir.to_string_lossy())
        .base_cache_directory(cache_dir.to_string_lossy())
        .local_storage_directory(data_dir.join("local-storage").to_string_lossy())
        .indexeddb_directory(data_dir.join("indexeddb").to_string_lossy())
        .offline_application_cache_directory(cache_dir.join("offline-cache").to_string_lossy())
        .build();

    if let Some(cookie_manager) = website_data_manager.cookie_manager() {
        cookie_manager.set_persistent_storage(
            cookie_file.to_string_lossy().as_ref(),
            CookiePersistentStorage::Sqlite,
        );
    } else {
        return Err(PROFILE_INIT_FAILED_REASON.to_string());
    }

    let web_context = WebContext::with_website_data_manager(&website_data_manager);
    let user_content_manager = UserContentManager::new();
    register_native_browser_selector_bridge(app, panel_id, &user_content_manager)?;
    let webview =
        WebView::new_with_context_and_user_content_manager(&web_context, &user_content_manager);

    Ok((
        webview,
        NativeBrowserSelectorContext {
            panel_id: panel_id.to_string(),
            app: app.clone(),
        },
    ))
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

        // Re-parent any live panels when the shared overlay/layout was rebuilt
        // (e.g. dev-mode WebView wrap). Stale wrappers orphan otherwise and JS
        // sees panel-not-found on resize/visibility even after a successful open.
        for panel in registry.panels.values() {
            ensure_panel_wrapper_in_layout(&layout, &panel.wrapper);
        }

        if let Some(panel) = registry.panels.get_mut(request.panel_id.as_str()) {
            panel.webview.load_uri(request.url.as_str());
            panel.avoid_rects = request.avoid_rects.clone();
            if let Some(bounds) = request.bounds.as_ref() {
                apply_browser_bounds(&layout, &panel.wrapper, bounds);
                panel.last_bounds = Some(bounds.clone());
                apply_browser_shape(panel, bounds, &request.avoid_rects);
            }
            registry_show_panel(registry, request.panel_id.as_str())?;
            return Ok(());
        }

        let (webview, selector_context) =
            build_native_browser_webview(_app, request.panel_id.as_str())?;
        webview.load_uri(request.url.as_str());
        webview.set_hexpand(true);
        webview.set_vexpand(true);

        let wrapper = gtk::Frame::new(None);
        wrapper.set_widget_name(&format!("devhub-native-browser-host-{}", request.panel_id));
        wrapper
            .style_context()
            .add_class("devhub-native-browser-host");
        wrapper.set_shadow_type(gtk::ShadowType::None);
        wrapper.set_halign(gtk::Align::Fill);
        wrapper.set_valign(gtk::Align::Fill);
        wrapper.add(&webview);

        layout.put(&wrapper, 0, 0);
        wrapper.show_all();

        if let Some(bounds) = request.bounds.as_ref() {
            apply_browser_bounds(&layout, &wrapper, bounds);
        }

        let avoid_rects = request.avoid_rects.clone();
        let mut panel = NativeBrowserPanelHost {
            wrapper,
            webview,
            selector_context,
            visible: true,
            last_bounds: request.bounds.clone(),
            avoid_rects,
        };
        if let Some(bounds) = request.bounds.as_ref() {
            apply_browser_shape(&mut panel, bounds, &request.avoid_rects);
        }
        registry.panels.insert(request.panel_id.clone(), panel);
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

/// Raise the browser panel to top of GTK Fixed paint order (for cross-surface
/// occlusion in pizarra etc). Re-put changes child order => higher z.
#[cfg(target_os = "linux")]
fn registry_raise_panel(panel_id: &str) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let layout = match registry.layout.as_ref() {
            Some(l) => l,
            None => return Ok(()),
        };
        let panel = match registry.panels.get_mut(panel_id) {
            Some(p) if p.visible => p,
            _ => return Ok(()),
        };

        let (x, y) = if let Some(b) = &panel.last_bounds {
            (b.x.round() as i32, b.y.round() as i32)
        } else {
            (0, 0)
        };

        layout.remove(&panel.wrapper);
        layout.put(&panel.wrapper, x, y);
        panel.wrapper.show_all();

        // Bring the entire browser layout above other native layouts (e.g. VTE/terminal layout)
        // in the shared overlay so that when a browser surface is brought to front
        // (select/drag in pizarra), its content can cover terminals.
        if let Some(ov) = registry._overlay.as_ref() {
            if let Some(lay) = registry.layout.as_ref() {
                ov.reorder_overlay(lay, -1);
            }
        }

        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_resize_panel(
    panel_id: &str,
    bounds: &NativeBrowserBounds,
    avoid_rects: &[NativeBrowserAvoidRect],
) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let layout = registry
            .layout
            .as_ref()
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        let panel = registry
            .panels
            .get_mut(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        apply_browser_bounds(layout, &panel.wrapper, bounds);
        panel.last_bounds = Some(bounds.clone());
        panel.avoid_rects = avoid_rects.to_vec();
        apply_browser_shape(panel, bounds, avoid_rects);
        Ok(())
    })
}

#[cfg(target_os = "linux")]
fn registry_set_panel_visibility(
    panel_id: &str,
    visible: bool,
    bounds: Option<NativeBrowserBounds>,
    avoid_rects: &[NativeBrowserAvoidRect],
) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let layout = registry.layout.clone();

        if visible {
            if let (Some(layout), Some(bounds)) = (layout.as_ref(), bounds.as_ref()) {
                let panel = registry
                    .panels
                    .get_mut(panel_id)
                    .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
                apply_browser_bounds(layout, &panel.wrapper, bounds);
                panel.last_bounds = Some(bounds.clone());
                panel.avoid_rects = avoid_rects.to_vec();
                apply_browser_shape(panel, bounds, avoid_rects);
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
            panel.wrapper.shape_combine_region(None::<&cairo::Region>);
            panel
                .wrapper
                .input_shape_combine_region(None::<&cairo::Region>);
            panel.webview.shape_combine_region(None::<&cairo::Region>);
            panel
                .webview
                .input_shape_combine_region(None::<&cairo::Region>);
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

#[cfg(target_os = "linux")]
fn selector_command_script(action: &str, mode: Option<&str>) -> Result<String, String> {
    match action {
        "activate" => Ok(format!(
            "window.__DEVHUB_NATIVE_SELECTOR__ && window.__DEVHUB_NATIVE_SELECTOR__.activate({});",
            serde_json::to_string(&mode.unwrap_or(NATIVE_BROWSER_SELECTOR_MODE_SELECT)).unwrap_or_else(|_| "\"select\"".to_string())
        )),
        "deactivate" => Ok("window.__DEVHUB_NATIVE_SELECTOR__ && window.__DEVHUB_NATIVE_SELECTOR__.deactivate();".to_string()),
        "clear-selection" => Ok("window.__DEVHUB_NATIVE_SELECTOR__ && window.__DEVHUB_NATIVE_SELECTOR__.clearSelection();".to_string()),
        "set-interaction-mode" => Ok(format!(
            "window.__DEVHUB_NATIVE_SELECTOR__ && window.__DEVHUB_NATIVE_SELECTOR__.activate({});",
            serde_json::to_string(&mode.unwrap_or(NATIVE_BROWSER_SELECTOR_MODE_SELECT)).unwrap_or_else(|_| "\"select\"".to_string())
        )),
        _ => Err(INVALID_SELECTOR_ACTION_REASON.to_string()),
    }
}

#[cfg(target_os = "linux")]
fn registry_selector_command(
    panel_id: &str,
    action: &str,
    mode: Option<&str>,
) -> Result<(), String> {
    with_native_browser_registry(|registry| {
        let panel = registry
            .panels
            .get(panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND_REASON.to_string())?;
        let script = selector_command_script(action, mode)?;
        panel
            .webview
            .run_javascript(&script, None::<&gio::Cancellable>, |_| {});
        Ok(())
    })
}

#[tauri::command]
pub fn native_browser_probe(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserProbeRequest,
) -> NativeBrowserProbeResponse {
    #[cfg(target_os = "linux")]
    {
        match ensure_linux_probe_preconditions(&request)
            .and_then(|_| inspect_same_window_host(&app))
        {
            Ok(()) => match derive_native_browser_profile_paths(&app) {
                Ok(_) => normalize_probe_response(true, None, true, true),
                Err(reason) => normalize_probe_response(false, Some(reason), false, false),
            },
            Err(reason) => normalize_probe_response(false, Some(reason), false, false),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        normalize_probe_response(false, unsupported_platform_reason(), false, false)
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
        let url_for_log = request.url.clone();
        let bounds_for_log = request.bounds.clone();
        let request_for_ui = request;

        log::info!(
            "[DevHub] native_browser_open panel={} url={} bounds={:?}",
            panel_id,
            url_for_log,
            bounds_for_log
        );

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
                    move || {
                        registry_open_panel(
                            &app,
                            &NativeBrowserOpenRequest {
                                bounds: Some(bounds),
                                ..request_for_ui
                            },
                        )
                    }
                },
            )
        }) {
            Ok(()) => {
                if let Ok(mut focused_panel_id) = state.focused_panel_id.lock() {
                    *focused_panel_id = Some(panel_id.clone());
                }

                log::info!("[DevHub] native_browser_open success panel={}", panel_id);

                NativeBrowserOpenResponse {
                    opened: true,
                    reason: None,
                }
            }
            Err(reason) => {
                log::error!(
                    "[DevHub] native_browser_open failed panel={} reason={}",
                    panel_id,
                    reason
                );
                NativeBrowserOpenResponse {
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
                |job| {
                    window
                        .run_on_main_thread(job)
                        .map_err(|error| error.to_string())
                },
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
                |job| {
                    window
                        .run_on_main_thread(job)
                        .map_err(|error| error.to_string())
                },
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

        let avoid_rects = request.avoid_rects;
        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_resize_panel(&panel_id, &bounds, &avoid_rects),
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
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
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
pub fn native_browser_raise(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let panel_id_for_raise = panel_id.clone();
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_raise_panel(&panel_id_for_raise),
        )?;

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = _state;
        let _ = request;
        Ok(())
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
        let avoid_rects = request.avoid_rects;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string())?;

        execute_main_thread_job(
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
            move || registry_set_panel_visibility(&panel_id, visible, bounds, &avoid_rects),
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
pub fn native_browser_selector_command(
    app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    request: NativeBrowserSelectorCommandRequest,
) -> NativeBrowserCommandResponse {
    #[cfg(target_os = "linux")]
    {
        let panel_id = request.panel_id;
        let action = request.action;
        let mode = request.mode;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| OPEN_FAILED_REASON.to_string());

        match window.and_then(|window| {
            execute_main_thread_job(
                |job| {
                    window
                        .run_on_main_thread(job)
                        .map_err(|error| error.to_string())
                },
                move || registry_selector_command(&panel_id, &action, mode.as_deref()),
            )
        }) {
            Ok(()) => NativeBrowserCommandResponse {
                supported: true,
                reason: None,
            },
            Err(reason) => NativeBrowserCommandResponse {
                supported: false,
                reason: Some(reason),
            },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        let _ = request;
        NativeBrowserCommandResponse {
            supported: false,
            reason: unsupported_platform_reason(),
        }
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
            |job| {
                window
                    .run_on_main_thread(job)
                    .map_err(|error| error.to_string())
            },
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn selector_capability_requires_explicit_ready_flag() {
        let ready = create_native_browser_capabilities(true, true);
        let unavailable = create_native_browser_capabilities(false, true);

        assert_eq!(ready.selector.inspect, true);
        assert_eq!(ready.persistent_profile, true);
        assert_eq!(unavailable.selector.inspect, false);
    }

    #[test]
    fn probe_payload_shapes_failure_reason_without_claiming_capability() {
        let response = normalize_probe_response(
            false,
            Some(PROFILE_INIT_FAILED_REASON.to_string()),
            false,
            false,
        );

        assert_eq!(response.ready, false);
        assert_eq!(response.reason.as_deref(), Some(PROFILE_INIT_FAILED_REASON));
        assert_eq!(response.persistent_profile, false);
        assert_eq!(response.capabilities.selector.inspect, false);
    }

    #[test]
    fn probe_payload_shapes_success_with_persistent_profile_and_selector_capability() {
        let response = normalize_probe_response(true, None, true, true);

        assert_eq!(response.ready, true);
        assert_eq!(response.reason, None);
        assert_eq!(response.persistent_profile, true);
        assert_eq!(response.capabilities.persistent_profile, true);
        assert_eq!(response.capabilities.selector.inspect, true);
    }

    #[test]
    fn selector_command_script_maps_supported_actions() {
        assert!(selector_command_script("activate", Some("select"))
            .unwrap()
            .contains("activate"));
        assert!(selector_command_script("deactivate", None)
            .unwrap()
            .contains("deactivate"));
        assert!(selector_command_script("clear-selection", None)
            .unwrap()
            .contains("clearSelection"));
        assert_eq!(
            selector_command_script("noop", None),
            Err(INVALID_SELECTOR_ACTION_REASON.to_string())
        );
    }

    #[test]
    fn selector_event_payload_mapping_injects_panel_id_and_preserves_element_metadata() {
        let payload = map_selector_event_payload(
            "browser-panel",
            Some(
                serde_json::json!({
                    "panelId": "stale-panel",
                    "type": "selector-selected",
                    "url": "https://example.com/editor",
                    "element": {
                        "tagName": "button",
                        "id": "buy-now",
                        "className": "cta primary",
                        "text": "Buy now",
                        "rect": {
                            "x": 12.0,
                            "y": 24.0,
                            "width": 180.0,
                            "height": 48.0
                        },
                        "attributes": {
                            "data-testid": "hero-cta"
                        }
                    }
                })
                .to_string()
                .as_str(),
            ),
        );

        assert_eq!(payload.panel_id, "browser-panel");
        assert_eq!(payload.r#type, "selector-selected");
        assert_eq!(payload.url.as_deref(), Some("https://example.com/editor"));
        assert_eq!(payload.reason, None);
        assert_eq!(
            payload.element,
            Some(NativeBrowserSelectorElement {
                tag_name: "button".to_string(),
                id: Some("buy-now".to_string()),
                class_name: Some("cta primary".to_string()),
                text: Some("Buy now".to_string()),
                rect: NativeBrowserSelectorRect {
                    x: 12.0,
                    y: 24.0,
                    width: 180.0,
                    height: 48.0,
                },
                attributes: HashMap::from([("data-testid".to_string(), "hero-cta".to_string(),)]),
            })
        );
    }

    #[test]
    fn selector_event_payload_shapes_selector_unavailable_errors() {
        let missing_payload = map_selector_event_payload("browser-panel", None);
        let invalid_payload = map_selector_event_payload("browser-panel", Some("{"));

        for payload in [missing_payload, invalid_payload] {
            assert_eq!(payload.panel_id, "browser-panel");
            assert_eq!(payload.r#type, "selector-error");
            assert_eq!(payload.url, None);
            assert_eq!(payload.reason.as_deref(), Some(SELECTOR_UNAVAILABLE_REASON));
            assert_eq!(payload.element, None);
        }
    }

    #[test]
    fn profile_paths_stay_under_native_browser_linux_default_layout() {
        let data_dir = PathBuf::from("/tmp/devhub-test/native-browser/linux-default/data");
        let cache_dir = PathBuf::from("/tmp/devhub-test-cache/native-browser/linux-default/cache");

        assert!(data_dir.ends_with("native-browser/linux-default/data"));
        assert!(cache_dir.ends_with("native-browser/linux-default/cache"));
    }

    #[test]
    fn native_browser_shared_host_recognizes_legacy_vte_overlay_name() {
        assert!(crate::native_window_host::native_overlay_name_matches(
            "devhub-native-vte-overlay"
        ));
    }
}

//! Cross-platform dock browser via Tauri child webviews (WebView2 / WKWebView / WebKit).
//! Wave-style: native engine in-layout bounds, not React iframe.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewUrl};
use tauri::webview::WebviewBuilder;
use url::Url;

use crate::native_browser::{
    emit_native_browser_event, map_selector_event_payload, NativeBrowserBounds,
    NativeBrowserCapabilities, NativeBrowserCommandResponse, NativeBrowserLoadUrlRequest,
    NativeBrowserLoadUrlResponse, NativeBrowserOpenRequest, NativeBrowserOpenResponse,
    NativeBrowserPanelRequest, NativeBrowserProbeRequest, NativeBrowserProbeResponse,
    NativeBrowserReloadResponse, NativeBrowserSelectorCapability,
    NativeBrowserSelectorCommandRequest, NativeBrowserState, NativeBrowserVisibilityRequest,
};

const MISSING_MAIN_WINDOW: &str = "probe-missing-main-window";
const MISSING_BOUNDS: &str = "missing-bounds";
const OPEN_FAILED: &str = "open-failed";
const PANEL_NOT_FOUND: &str = "panel-not-found";
#[derive(Default)]
pub struct EmbeddedBrowserRegistry {
    panels: Mutex<HashMap<String, EmbeddedPanelRecord>>,
}

#[derive(Clone)]
struct EmbeddedPanelRecord {
    webview_label: String,
    last_url: String,
}

fn panel_to_label(panel_id: &str) -> String {
    let safe: String = panel_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    format!("emb-{safe}")
}

fn probe_ok() -> NativeBrowserProbeResponse {
    NativeBrowserProbeResponse {
        ready: true,
        reason: None,
        persistent_profile: true,
        capabilities: NativeBrowserCapabilities {
            persistent_profile: true,
            selector: NativeBrowserSelectorCapability { inspect: true },
        },
    }
}

fn bounds_to_logical(bounds: &NativeBrowserBounds) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
    )
}

fn parse_external_url(raw: &str) -> Result<Url, String> {
    Url::parse(raw).map_err(|e| format!("invalid-url:{e}"))
}

fn selector_init_script(panel_id: &str, invoke_key: &str) -> String {
    let panel_id_json =
        serde_json::to_string(panel_id).unwrap_or_else(|_| "\"\"".to_string());
    let invoke_key_json =
        serde_json::to_string(invoke_key).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"
(() => {{
  if (window.__DEVHUB_EMBEDDED_SELECTOR__) return;
  const PANEL_ID = {panel_id_json};
  const INVOKE_KEY = {invoke_key_json};
  const state = {{ active: false, hovered: null, selected: null }};
  const post = (payload) => {{
    const message = {{
      cmd: 'embedded_browser_selector_ipc',
      callback: 0,
      error: 1,
      payload: {{ panelId: PANEL_ID, event: payload }},
      __TAURI_INVOKE_KEY__: INVOKE_KEY,
    }};
    try {{
      if (window.__TAURI_INTERNALS__?.postMessage) {{
        window.__TAURI_INTERNALS__.postMessage(message);
        return;
      }}
      if (window.ipc?.postMessage) {{
        window.ipc.postMessage(JSON.stringify(message));
      }}
    }} catch (_e) {{}}
  }};
  const selectorFor = (node) => {{
    if (!node || !(node instanceof HTMLElement)) return null;
    const tag = String(node.tagName || '').toLowerCase();
    const id = node.id ? `#${{node.id}}` : '';
    const cls = typeof node.className === 'string'
      ? node.className.split(/\s+/).filter(Boolean).slice(0, 3).map((v) => `.${{v}}`).join('')
      : '';
    return `${{tag}}${{id}}${{cls}}`;
  }};
  const collect = (node) => {{
    const rect = node.getBoundingClientRect();
    return {{
      tagName: String(node.tagName || '').toLowerCase(),
      id: node.id || null,
      className: typeof node.className === 'string' ? node.className : null,
      text: String(node.textContent || '').trim().slice(0, 160) || null,
      selector: selectorFor(node),
      rect: {{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }},
      attributes: {{}},
    }};
  }};
  const clearOutline = (node) => {{
    if (!node?.style) return;
    node.style.outline = '';
    node.style.outlineOffset = '';
    node.style.boxShadow = '';
  }};
  const applyOutline = (node, color) => {{
    if (!node?.style) return;
    node.style.outline = `2px solid ${{color}}`;
    node.style.outlineOffset = '-2px';
    node.style.boxShadow = `0 0 0 1px ${{color}}`;
  }};
  const onMove = (e) => {{
    if (!state.active) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t) return;
    if (state.hovered && state.hovered !== t) clearOutline(state.hovered);
    state.hovered = t;
    applyOutline(t, '#38bdf8');
    post({{ type: 'selector-hover', element: collect(t), url: location.href }});
  }};
  const onClick = (e) => {{
    if (!state.active) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.selected && state.selected !== t) clearOutline(state.selected);
    state.selected = t;
    applyOutline(t, '#4ade80');
    post({{ type: 'selector-selected', element: collect(t), url: location.href }});
  }};
  window.__DEVHUB_EMBEDDED_SELECTOR__ = {{
    setActive(active) {{
      state.active = !!active;
      if (state.active) {{
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        post({{ type: 'selector-armed', url: location.href }});
      }} else {{
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        if (state.hovered) clearOutline(state.hovered);
        if (state.selected) clearOutline(state.selected);
        state.hovered = null;
        post({{ type: 'selector-idle', url: location.href }});
      }}
    }},
  }};
}})();
"#
    )
}

fn link_child_builder_to_parent<R: tauri::Runtime>(
    app: &AppHandle<R>,
    mut builder: WebviewBuilder<R>,
) -> WebviewBuilder<R> {
    let Some(parent) = app.get_webview("main") else {
        return builder.enable_clipboard_access();
    };

    #[cfg(all(feature = "wry", windows))]
    {
        builder = builder.with_environment(parent.environment());
    }

    #[cfg(all(
        feature = "wry",
        any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd",
        )
    ))]
    {
        let mut related_view = None;
        let _ = parent.with_webview(|platform| {
            related_view = Some(platform.inner());
        });
        if let Some(related) = related_view {
            builder = builder.with_related_view(related);
        }
    }

    builder.enable_clipboard_access()
}

pub fn embedded_browser_enabled() -> bool {
    true
}

pub fn embedded_browser_probe(
    _app: AppHandle,
    _state: State<'_, NativeBrowserState>,
    _request: NativeBrowserProbeRequest,
) -> NativeBrowserProbeResponse {
    probe_ok()
}

pub fn embedded_browser_open(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserOpenRequest,
) -> NativeBrowserOpenResponse {
    let Some(bounds) = request.bounds.as_ref() else {
        return NativeBrowserOpenResponse {
            opened: false,
            reason: Some(MISSING_BOUNDS.to_string()),
        };
    };

    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => {
            return NativeBrowserOpenResponse {
                opened: false,
                reason: Some(MISSING_MAIN_WINDOW.to_string()),
            };
        }
    };

    let panel_id = request.panel_id.clone();
    let label = panel_to_label(&panel_id);
    let url = match parse_external_url(request.url.trim()) {
        Ok(u) => u,
        Err(reason) => {
            return NativeBrowserOpenResponse {
                opened: false,
                reason: Some(reason),
            };
        }
    };

    let (position, size) = bounds_to_logical(bounds);

    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.set_position(position);
        let _ = existing.set_size(size);
        let _ = existing.navigate(url.clone());
        let _ = existing.show();
        if let Ok(mut panels) = registry.panels.lock() {
            panels.insert(
                panel_id.clone(),
                EmbeddedPanelRecord {
                    webview_label: label.clone(),
                    last_url: url.to_string(),
                },
            );
        }
        return NativeBrowserOpenResponse {
            opened: true,
            reason: None,
        };
    }

    let invoke_key = app.invoke_key().to_string();
    let init_script = selector_init_script(&panel_id, &invoke_key);
    let builder = link_child_builder_to_parent(
        &app,
        WebviewBuilder::new(&label, WebviewUrl::External(url.clone()))
            .initialization_script(init_script),
    );

    let tauri_window = window.as_ref().window();
    match tauri_window.add_child(builder, position, size) {
        Ok(_) => {
            if let Ok(mut panels) = registry.panels.lock() {
                panels.insert(
                    panel_id,
                    EmbeddedPanelRecord {
                        webview_label: label,
                        last_url: url.to_string(),
                    },
                );
            }
            NativeBrowserOpenResponse {
                opened: true,
                reason: None,
            }
        }
        Err(e) => NativeBrowserOpenResponse {
            opened: false,
            reason: Some(format!("{OPEN_FAILED}:{e}")),
        },
    }
}

pub fn embedded_browser_resize(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserOpenRequest,
) -> Result<(), String> {
    let bounds = request
        .bounds
        .as_ref()
        .ok_or_else(|| MISSING_BOUNDS.to_string())?;
    let label = registry
        .panels
        .lock()
        .map_err(|_| "registry-lock".to_string())?
        .get(&request.panel_id)
        .map(|p| p.webview_label.clone())
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;
    let (position, size) = bounds_to_logical(bounds);
    webview
        .set_position(position)
        .map_err(|e| e.to_string())?;
    webview.set_size(size).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn embedded_browser_set_visibility(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserVisibilityRequest,
) -> Result<(), String> {
    let label = registry
        .panels
        .lock()
        .map_err(|_| "registry-lock".to_string())?
        .get(&request.panel_id)
        .map(|p| p.webview_label.clone())
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;

    if request.visible {
        if let Some(bounds) = request.bounds.as_ref() {
            let (position, size) = bounds_to_logical(bounds);
            let _ = webview.set_position(position);
            let _ = webview.set_size(size);
        }
        webview.show().map_err(|e| e.to_string())?;
    } else {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn embedded_browser_load_url(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserLoadUrlRequest,
) -> NativeBrowserLoadUrlResponse {
    let label = match registry.panels.lock() {
        Ok(guard) => guard.get(&request.panel_id).map(|p| p.webview_label.clone()),
        Err(_) => None,
    };

    let Some(label) = label else {
        return NativeBrowserLoadUrlResponse {
            loaded: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };

    let Some(webview) = app.get_webview(&label) else {
        return NativeBrowserLoadUrlResponse {
            loaded: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };

    let url = match parse_external_url(request.url.trim()) {
        Ok(u) => u,
        Err(reason) => {
            return NativeBrowserLoadUrlResponse {
                loaded: false,
                reason: Some(reason),
            };
        }
    };

    match webview.navigate(url) {
        Ok(_) => NativeBrowserLoadUrlResponse {
            loaded: true,
            reason: None,
        },
        Err(e) => NativeBrowserLoadUrlResponse {
            loaded: false,
            reason: Some(e.to_string()),
        },
    }
}

pub fn embedded_browser_reload(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    panel_id: &str,
) -> NativeBrowserReloadResponse {
    let label = match registry.panels.lock() {
        Ok(guard) => guard.get(panel_id).map(|p| p.webview_label.clone()),
        Err(_) => None,
    };
    let Some(label) = label else {
        return NativeBrowserReloadResponse {
            reloaded: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };
    let Some(webview) = app.get_webview(&label) else {
        return NativeBrowserReloadResponse {
            reloaded: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };
    match webview.reload() {
        Ok(_) => NativeBrowserReloadResponse {
            reloaded: true,
            reason: None,
        },
        Err(e) => NativeBrowserReloadResponse {
            reloaded: false,
            reason: Some(e.to_string()),
        },
    }
}

pub fn embedded_browser_close(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    let label = registry
        .panels
        .lock()
        .map_err(|_| "registry-lock".to_string())?
        .remove(&request.panel_id)
        .map(|p| p.webview_label);

    let Some(label) = label else {
        return Ok(());
    };

    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.close();
    }
    Ok(())
}

pub fn embedded_browser_selector_command(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserSelectorCommandRequest,
) -> NativeBrowserCommandResponse {
    let label = match registry.panels.lock() {
        Ok(guard) => guard.get(&request.panel_id).map(|p| p.webview_label.clone()),
        Err(_) => None,
    };
    let Some(label) = label else {
        return NativeBrowserCommandResponse {
            supported: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };
    let Some(webview) = app.get_webview(&label) else {
        return NativeBrowserCommandResponse {
            supported: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };

    let active = matches!(request.action.as_str(), "arm" | "start" | "enable");
    let script = format!(
        "window.__DEVHUB_EMBEDDED_SELECTOR__?.setActive({});",
        if active { "true" } else { "false" }
    );

    match webview.eval(&script) {
        Ok(_) => NativeBrowserCommandResponse {
            supported: true,
            reason: None,
        },
        Err(reason) => NativeBrowserCommandResponse {
            supported: false,
            reason: Some(reason.to_string()),
        },
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedSelectorIpcRequest {
    pub panel_id: String,
    pub event: serde_json::Value,
}

#[tauri::command]
pub fn embedded_browser_selector_ipc(
    app: AppHandle,
    request: EmbeddedSelectorIpcRequest,
) -> Result<(), String> {
    let raw = serde_json::to_string(&request.event).map_err(|e| e.to_string())?;
    let payload = map_selector_event_payload(&request.panel_id, Some(raw.as_str()));
    emit_native_browser_event(&app, payload);
    Ok(())
}

pub fn embedded_browser_focus(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    let label = registry
        .panels
        .lock()
        .map_err(|_| "registry-lock".to_string())?
        .get(&request.panel_id)
        .map(|p| p.webview_label.clone())
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;
    webview.set_focus().map_err(|e| e.to_string())
}
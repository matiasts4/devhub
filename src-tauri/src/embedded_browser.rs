//! Cross-platform dock browser via Tauri child webviews (WebView2 / WKWebView / WebKit).
//! Wave-style: native engine in-layout bounds, not React iframe.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewUrl};
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use url::Url;

use crate::native_browser::{
    emit_native_browser_event, map_selector_event_payload, NativeBrowserBounds,
    NativeBrowserCapabilities, NativeBrowserCommandResponse, NativeBrowserEventPayload,
    NativeBrowserLoadUrlRequest, NativeBrowserLoadUrlResponse, NativeBrowserOpenRequest,
    NativeBrowserOpenResponse, NativeBrowserPanelRequest, NativeBrowserProbeRequest,
    NativeBrowserProbeResponse, NativeBrowserReloadResponse, NativeBrowserSelectorCapability,
    NativeBrowserSelectorCommandRequest, NativeBrowserState, NativeBrowserVisibilityRequest,
};

const MISSING_MAIN_WINDOW: &str = "probe-missing-main-window";
const MISSING_BOUNDS: &str = "missing-bounds";
const OPEN_FAILED: &str = "open-failed";
const PANEL_NOT_FOUND: &str = "panel-not-found";
#[derive(Default)]
pub struct EmbeddedBrowserRegistry {
    panels: Mutex<HashMap<String, EmbeddedPanelRecord>>,
    label_seq: AtomicU64,
}

#[derive(Clone)]
struct EmbeddedPanelRecord {
    webview_label: String,
    last_url: String,
    position: LogicalPosition<f64>,
    size: LogicalSize<f64>,
}

fn panel_to_label(panel_id: &str) -> String {
    let safe: String = panel_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    format!("emb-{safe}")
}

// ponytail: recreating a child webview on navigate/reload must never reuse the outgoing
// webview's label — close() on WebView2 isn't guaranteed to finish tearing down the native
// controller before add_child runs again, so a same-label recreate can race and silently
// fail (seen as "first navigation works, next ones don't"). A fresh label per recreate makes
// that race impossible; panel_id (not label) is the stable external key everywhere else
// (registry lookups, selector routing via the baked-in PANEL_ID).
fn next_child_label(registry: &EmbeddedBrowserRegistry, panel_id: &str) -> String {
    let seq = registry.label_seq.fetch_add(1, Ordering::Relaxed);
    format!("{}-{seq}", panel_to_label(panel_id))
}

// Dispatches close() on the main thread (WebView2 calls are STA-bound) without waiting for
// completion — safe now that recreate always uses a fresh label, so there is no teardown race.
fn close_embedded_child_fire_and_forget(main_window: &tauri::WebviewWindow, webview: tauri::Webview) {
    let _ = main_window.as_ref().window().run_on_main_thread(move || {
        let _ = webview.close();
    });
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

// rebuild-marker: 20260708t — force cargo recompile for visibility+bounds live sync
fn bounds_to_logical(bounds: &NativeBrowserBounds) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
    )
}

fn parse_external_url(raw: &str) -> Result<Url, String> {
    Url::parse(raw).map_err(|e| format!("invalid-url:{e}"))
}

// ponytail: HWND_TOP on WebView2 parent blocked the whole Tauri window (toolbar, pizarra).
// Z-order is handled by Tauri child webview bounds; do not raise the native HWND.
fn raise_embedded_webview<R: tauri::Runtime>(_webview: &tauri::Webview<R>) {}

/// In-page navigation via JS. Prefer this over `webview.navigate()` (no-op on Windows child
/// WebView2) and over destroy/recreate (flash + teardown races that left the toolbar dead).
fn eval_assign_url<R: tauri::Runtime>(webview: &tauri::Webview<R>, url: &str) -> Result<(), String> {
    let encoded = serde_json::to_string(url).map_err(|e| e.to_string())?;
    let script = format!(
        "(function(){{ try {{ window.location.assign({u}); }} catch (_e) {{ window.location.href = {u}; }} }})();",
        u = encoded
    );
    webview.eval(&script).map_err(|e| e.to_string())
}

fn eval_reload_page<R: tauri::Runtime>(webview: &tauri::Webview<R>) -> Result<(), String> {
    webview
        .eval("window.location.reload();")
        .map_err(|e| e.to_string())
}

fn update_registry_last_url(app: &AppHandle, panel_id: &str, url: &str) {
    let registry = app.state::<EmbeddedBrowserRegistry>();
    if let Ok(mut panels) = registry.panels.lock() {
        if let Some(record) = panels.get_mut(panel_id) {
            record.last_url = url.to_string();
        }
    };
}

fn attach_page_load_emitter(
    app: &AppHandle,
    panel_id: &str,
    builder: WebviewBuilder<tauri::Wry>,
) -> WebviewBuilder<tauri::Wry> {
    let app_for_load = app.clone();
    let panel_id_for_load = panel_id.to_string();
    builder.on_page_load(move |_webview, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }
        let url = payload.url().to_string();
        update_registry_last_url(&app_for_load, &panel_id_for_load, &url);
        emit_native_browser_event(
            &app_for_load,
            NativeBrowserEventPayload {
                panel_id: panel_id_for_load.clone(),
                r#type: "url-changed".to_string(),
                url: Some(url),
                reason: None,
                element: None,
            },
        );
    })
}

// ponytail: WebView2 child.navigate() is a documented no-op ceiling on Windows (the child
// controller doesn't repaint on in-place navigate the way top-level WebviewWindows do).
// Primary path is now JS location.assign/reload (eval). Recreate via add_child remains the
// fallback when the child is missing or eval fails, and is still used for the first open.
async fn spawn_embedded_child(
    app: &AppHandle,
    main_window: &tauri::WebviewWindow,
    panel_id: &str,
    label: &str,
    url: Url,
    position: LogicalPosition<f64>,
    size: LogicalSize<f64>,
) -> Result<tauri::Webview, String> {
    let invoke_key = app.invoke_key().to_string();
    let init_script = selector_init_script(panel_id, &invoke_key);
    // ponytail: WebView2's default background is white; painting the app's dark theme color
    // instead softens the flash during the brief window between closing the old child and the
    // new one's first paint (recreate-on-navigate always has this gap).
    let builder = link_child_builder_to_parent(
        app,
        attach_page_load_emitter(
            app,
            panel_id,
            WebviewBuilder::new(label, WebviewUrl::External(url))
                .initialization_script(init_script)
                .background_color(tauri::webview::Color(13, 13, 13, 255)),
        ),
    );

    let main_window_for_thread = main_window.as_ref().window().clone();
    let (tx, mut rx) =
        tauri::async_runtime::channel::<Result<tauri::Webview, tauri::Error>>(1);
    let dispatch_ok = main_window.as_ref().window().run_on_main_thread(move || {
        // ponytail: this is a tokio mpsc sender — its async `send()` future was being created
        // and dropped unpolled here (sync closure), so the result never arrived and every open
        // reported `add-child-disconnected` even though add_child had already succeeded.
        // `try_send` is sync and always has room (capacity 1, single send).
        let _ = tx.try_send(main_window_for_thread.add_child(builder, position, size));
    });

    if let Err(e) = dispatch_ok {
        return Err(format!("{OPEN_FAILED}:dispatch:{e}"));
    }

    match rx.recv().await {
        Some(Ok(child)) => Ok(child),
        Some(Err(e)) => Err(format!("{OPEN_FAILED}:{e}")),
        None => Err(format!("{OPEN_FAILED}:add-child-disconnected")),
    }
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
    clearSelection() {{
      if (state.selected) clearOutline(state.selected);
      state.selected = null;
      post({{ type: 'selector-cleared', url: location.href }});
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
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd",
    ))]
    {
        let Some(parent) = app.get_webview("main") else {
            return builder.enable_clipboard_access();
        };
        let mut related_view = None;
        let _ = parent.with_webview(|platform| {
            related_view = Some(platform.inner());
        });
        if let Some(related) = related_view {
            builder = builder.with_related_view(related);
        }
    }

    #[cfg(not(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd",
    )))]
    {
        let _ = app;
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

pub async fn embedded_browser_open(
    app: AppHandle,
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
    let registry = app.state::<EmbeddedBrowserRegistry>();

    // Existing-panel path — look up the *live* label via the registry (panel_id is the stable
    // key; the label itself may have changed if a previous navigate recreated the webview).
    let existing_record = registry
        .panels
        .lock()
        .ok()
        .and_then(|guard| guard.get(&panel_id).cloned());

    if let Some(record) = existing_record {
        if let Some(existing) = app.get_webview(&record.webview_label) {
            let url_string = url.to_string();

            let _ = existing.set_position(position);
            let _ = existing.set_size(size);
            let _ = existing.show();
            raise_embedded_webview(&existing);

            if record.last_url != url_string {
                // Prefer in-page JS navigation (works on WebView2 children). Recreate only if eval fails.
                if let Err(eval_err) = eval_assign_url(&existing, &url_string) {
                    log::warn!(
                        "[embedded-browser] eval navigate failed panel={} err={} — recreating",
                        panel_id,
                        eval_err
                    );
                    close_embedded_child_fire_and_forget(&window, existing);
                    let new_label = next_child_label(&registry, &panel_id);
                    return match spawn_embedded_child(
                        &app,
                        &window,
                        &panel_id,
                        &new_label,
                        url.clone(),
                        position,
                        size,
                    )
                    .await
                    {
                        Ok(child) => {
                            let _ = child.show();
                            raise_embedded_webview(&child);
                            if let Ok(mut panels) = registry.panels.lock() {
                                panels.insert(
                                    panel_id,
                                    EmbeddedPanelRecord {
                                        webview_label: new_label,
                                        last_url: url_string,
                                        position,
                                        size,
                                    },
                                );
                            }
                            NativeBrowserOpenResponse {
                                opened: true,
                                reason: None,
                            }
                        }
                        Err(e) => {
                            log::error!(
                                "[embedded-browser] recreate failed panel={}: {e}",
                                panel_id
                            );
                            if let Ok(mut panels) = registry.panels.lock() {
                                panels.remove(&panel_id);
                            }
                            NativeBrowserOpenResponse {
                                opened: false,
                                reason: Some(e),
                            }
                        }
                    };
                }
            }

            if let Ok(mut panels) = registry.panels.lock() {
                panels.insert(
                    panel_id,
                    EmbeddedPanelRecord {
                        webview_label: record.webview_label,
                        last_url: url_string,
                        position,
                        size,
                    },
                );
            }
            return NativeBrowserOpenResponse {
                opened: true,
                reason: None,
            };
        }
        // Registry pointed at a label that no longer exists (e.g. closed externally) — fall
        // through and create a fresh webview below.
    }

    let label = next_child_label(&registry, &panel_id);
    log::info!(
        "[embedded-browser] open panel={} url={} bounds=({},{} {}x{})",
        panel_id,
        url,
        position.x,
        position.y,
        size.width,
        size.height
    );

    match spawn_embedded_child(&app, &window, &panel_id, &label, url.clone(), position, size).await
    {
        Ok(child) => {
            let _ = child.show();
            raise_embedded_webview(&child);
            if let Ok(mut panels) = registry.panels.lock() {
                panels.insert(
                    panel_id,
                    EmbeddedPanelRecord {
                        webview_label: label.clone(),
                        last_url: url.to_string(),
                        position,
                        size,
                    },
                );
            }
            log::info!("[embedded-browser] open success panel={}", label);
            NativeBrowserOpenResponse {
                opened: true,
                reason: None,
            }
        }
        Err(e) => {
            log::error!("[embedded-browser] add_child failed panel={}: {e}", label);
            NativeBrowserOpenResponse {
                opened: false,
                reason: Some(e),
            }
        }
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
    let (position, size) = bounds_to_logical(bounds);

    let label = {
        let mut panels = registry.panels.lock().map_err(|_| "registry-lock".to_string())?;
        let record = panels
            .get_mut(&request.panel_id)
            .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;
        record.position = position;
        record.size = size;
        record.webview_label.clone()
    };

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| PANEL_NOT_FOUND.to_string())?;

    // ponytail: apply synchronously like open/set_visibility. A previous
    // run_on_main_thread fire-and-forget returned Ok before HWND moved; JS
    // then cached the bounds and skipped further sync — browser stuck full-size.
    // Live gestures already coalesce to ~1 IPC/frame in scheduleNativeBrowserResize.
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
            webview
                .set_position(position)
                .map_err(|e| e.to_string())?;
            webview.set_size(size).map_err(|e| e.to_string())?;
            if let Ok(mut panels) = registry.panels.lock() {
                if let Some(record) = panels.get_mut(&request.panel_id) {
                    record.position = position;
                    record.size = size;
                }
            };
        }
        webview.show().map_err(|e| e.to_string())?;
        raise_embedded_webview(&webview);
        // ponytail: never auto-focus here — every bounds-sync called visibility+focus and
        // stole keyboard/clicks from the React toolbar (URL, back/forward/reload).
        Ok(())
    } else {
        // ponytail: hide() keeps the panel alive for modals/overlays; close() belongs to
        // embedded_browser_close only. Destroy-on-hide forced a full recreate after every
        // occlude and made DOM overlays (edit panel, loading veil) impossible to show.
        // WebView2 HWND always paints above React — hide is required for modals/dialogs.
        let _ = webview.hide();
        Ok(())
    }
}

pub fn embedded_browser_raise(
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
    raise_embedded_webview(&webview);
    Ok(())
}

pub async fn embedded_browser_load_url(
    app: AppHandle,
    request: NativeBrowserLoadUrlRequest,
) -> NativeBrowserLoadUrlResponse {
    let panel_id = request.panel_id.clone();

    let existing = {
        let registry = app.state::<EmbeddedBrowserRegistry>();
        let locked = registry.panels.lock();
        match locked {
            Ok(guard) => guard.get(&panel_id).cloned(),
            Err(_) => None,
        }
    };

    let Some(existing) = existing else {
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
    let url_string = url.to_string();

    // Primary: JS location.assign — works on Windows WebView2 child surfaces.
    if let Some(webview) = app.get_webview(&existing.webview_label) {
        match eval_assign_url(&webview, &url_string) {
            Ok(()) => {
                update_registry_last_url(&app, &panel_id, &url_string);
                return NativeBrowserLoadUrlResponse {
                    loaded: true,
                    reason: None,
                };
            }
            Err(eval_err) => {
                log::warn!(
                    "[embedded-browser] load_url eval failed panel={} err={} — recreating",
                    panel_id,
                    eval_err
                );
            }
        }
    }

    let Some(main_window) = app.get_webview_window("main") else {
        return NativeBrowserLoadUrlResponse {
            loaded: false,
            reason: Some(MISSING_MAIN_WINDOW.to_string()),
        };
    };

    // Fallback: recreate child (first-open path) if eval is unavailable.
    let registry = app.state::<EmbeddedBrowserRegistry>();
    if let Some(webview) = app.get_webview(&existing.webview_label) {
        close_embedded_child_fire_and_forget(&main_window, webview);
    }
    let new_label = next_child_label(&registry, &panel_id);

    match spawn_embedded_child(
        &app,
        &main_window,
        &panel_id,
        &new_label,
        url,
        existing.position,
        existing.size,
    )
    .await
    {
        Ok(child) => {
            let _ = child.show();
            raise_embedded_webview(&child);
            if let Ok(mut panels) = registry.panels.lock() {
                panels.insert(
                    panel_id,
                    EmbeddedPanelRecord {
                        webview_label: new_label,
                        last_url: url_string,
                        position: existing.position,
                        size: existing.size,
                    },
                );
            }
            NativeBrowserLoadUrlResponse {
                loaded: true,
                reason: None,
            }
        }
        Err(e) => {
            if let Ok(mut panels) = registry.panels.lock() {
                panels.remove(&panel_id);
            }
            log::error!(
                "[embedded-browser] load_url recreate failed panel={}: {e}",
                panel_id
            );
            NativeBrowserLoadUrlResponse {
                loaded: false,
                reason: Some(e),
            }
        }
    }
}

pub async fn embedded_browser_reload(app: AppHandle, panel_id: String) -> NativeBrowserReloadResponse {
    let registry = app.state::<EmbeddedBrowserRegistry>();
    let existing = match registry.panels.lock() {
        Ok(guard) => guard.get(&panel_id).cloned(),
        Err(_) => None,
    };
    let Some(existing) = existing else {
        return NativeBrowserReloadResponse {
            reloaded: false,
            reason: Some(PANEL_NOT_FOUND.to_string()),
        };
    };

    // Primary: JS reload — avoids the destroy/recreate flash and race that made toolbar
    // reload appear broken after the first couple of presses.
    if let Some(webview) = app.get_webview(&existing.webview_label) {
        match eval_reload_page(&webview) {
            Ok(()) => {
                return NativeBrowserReloadResponse {
                    reloaded: true,
                    reason: None,
                };
            }
            Err(eval_err) => {
                log::warn!(
                    "[embedded-browser] reload eval failed panel={} err={} — recreating",
                    panel_id,
                    eval_err
                );
            }
        }
    }

    let Some(main_window) = app.get_webview_window("main") else {
        return NativeBrowserReloadResponse {
            reloaded: false,
            reason: Some(MISSING_MAIN_WINDOW.to_string()),
        };
    };

    let url = match parse_external_url(&existing.last_url) {
        Ok(u) => u,
        Err(reason) => {
            return NativeBrowserReloadResponse {
                reloaded: false,
                reason: Some(reason),
            };
        }
    };

    if let Some(webview) = app.get_webview(&existing.webview_label) {
        close_embedded_child_fire_and_forget(&main_window, webview);
    }
    let new_label = next_child_label(&registry, &panel_id);

    match spawn_embedded_child(
        &app,
        &main_window,
        &panel_id,
        &new_label,
        url,
        existing.position,
        existing.size,
    )
    .await
    {
        Ok(child) => {
            let _ = child.show();
            raise_embedded_webview(&child);
            if let Ok(mut panels) = registry.panels.lock() {
                panels.insert(
                    panel_id,
                    EmbeddedPanelRecord {
                        webview_label: new_label,
                        last_url: existing.last_url,
                        position: existing.position,
                        size: existing.size,
                    },
                );
            }
            NativeBrowserReloadResponse {
                reloaded: true,
                reason: None,
            }
        }
        Err(e) => {
            if let Ok(mut panels) = registry.panels.lock() {
                panels.remove(&panel_id);
            }
            log::error!("[embedded-browser] reload recreate failed panel={}: {e}", panel_id);
            NativeBrowserReloadResponse {
                reloaded: false,
                reason: Some(e),
            }
        }
    }
}

pub fn embedded_browser_close(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
    request: NativeBrowserPanelRequest,
) -> Result<(), String> {
    let registry_label = registry
        .panels
        .lock()
        .map_err(|_| "registry-lock".to_string())?
        .remove(&request.panel_id)
        .map(|p| p.webview_label);

    // ponytail: labels carry a per-recreate counter suffix (`emb-<safe>-<n>`), so a stale
    // registry (e.g. after a failed open) can leave orphans an exact-label close would miss.
    // Sweep everything belonging to this panel: registry label, legacy `emb-<safe>`, and any
    // suffixed variant. The trailing dash keeps `...-ws1-` from matching `...-ws10-3`.
    let base = panel_to_label(&request.panel_id);
    let prefix = format!("{base}-");
    let labels: Vec<String> = app
        .webviews()
        .into_keys()
        .filter(|label| {
            Some(label) == registry_label.as_ref() || label == &base || label.starts_with(&prefix)
        })
        .collect();

    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    Ok(())
}

/// Close every child dock webview (`emb-*`). Orphans steal clicks on the title bar on Windows.
pub fn embedded_browser_purge_orphans(
    app: AppHandle,
    registry: State<'_, EmbeddedBrowserRegistry>,
) -> usize {
    let labels: Vec<String> = app
        .webviews()
        .into_keys()
        .filter(|label| label.starts_with("emb-"))
        .collect();

    let mut closed = 0usize;
    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
            closed += 1;
        }
    }

    if let Ok(mut panels) = registry.panels.lock() {
        panels.clear();
    }

    closed
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

    let script = match request.action.as_str() {
        "activate" | "arm" | "start" | "enable" | "set-interaction-mode" => {
            "window.__DEVHUB_EMBEDDED_SELECTOR__?.setActive(true);".to_string()
        }
        "deactivate" => "window.__DEVHUB_EMBEDDED_SELECTOR__?.setActive(false);".to_string(),
        "clear-selection" => {
            "window.__DEVHUB_EMBEDDED_SELECTOR__?.clearSelection();".to_string()
        }
        _ => {
            return NativeBrowserCommandResponse {
                supported: false,
                reason: Some(format!("invalid-selector-action:{}", request.action)),
            };
        }
    };

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
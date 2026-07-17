// Overlay helpers are Linux/GTK-only; keep symbols for shared tests/call sites.
#![allow(dead_code)]

pub const SHARED_NATIVE_OVERLAY_NAME: &str = "devhub-native-window-overlay";
const LEGACY_NATIVE_BROWSER_OVERLAY_NAME: &str = "devhub-native-browser-overlay";
const LEGACY_NATIVE_VTE_OVERLAY_NAME: &str = "devhub-native-vte-overlay";

#[cfg(target_os = "linux")]
use gtk::prelude::*;

pub fn native_overlay_name_matches(name: &str) -> bool {
    matches!(
        name,
        SHARED_NATIVE_OVERLAY_NAME
            | LEGACY_NATIVE_BROWSER_OVERLAY_NAME
            | LEGACY_NATIVE_VTE_OVERLAY_NAME
    )
}

#[cfg(target_os = "linux")]
pub fn widget_name_matches(widget: &gtk::Widget, expected: &str) -> bool {
    widget.widget_name().as_str() == expected
}

#[cfg(target_os = "linux")]
pub fn widget_matches_native_overlay(widget: &gtk::Widget) -> bool {
    native_overlay_name_matches(widget.widget_name().as_str())
}

#[cfg(target_os = "linux")]
pub fn ensure_shared_native_overlay(
    window: &tauri::WebviewWindow,
    direct_webview: Option<webkit2gtk::WebView>,
    open_failed_reason: &str,
) -> Result<gtk::Overlay, String> {
    use glib::object::Cast;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    let default_vbox = window.default_vbox().map_err(|error| error.to_string())?;

    if let Some(existing_overlay) = gtk_window
        .children()
        .into_iter()
        .chain(default_vbox.children().into_iter())
        .find(|child| widget_matches_native_overlay(child))
        .and_then(|child| child.downcast::<gtk::Overlay>().ok())
    {
        existing_overlay.set_widget_name(SHARED_NATIVE_OVERLAY_NAME);
        return Ok(existing_overlay);
    }

    // En dev mode el WebView principal de Tauri todavía está cargando `devUrl`
    // (Next.js). Lo envolvemos en un gtk::Overlay dentro del default_vbox para
    // que los WebView nativos del browser puedan flotar encima como
    // add_overlay() children, sin remover el WebView del árbol GTK (eso rompía
    // la composición y dejaba la pantalla en blanco en dev).
    if cfg!(debug_assertions) && direct_webview.is_none() {
        // Tomar el WebView principal de Tauri (último hijo del default_vbox)
        let webview_widget = default_vbox
            .children()
            .into_iter()
            .last()
            .ok_or_else(|| open_failed_reason.to_string())?;

        // Sacarlo del vbox temporalmente para meterlo en el overlay como "main"
        if let Some(parent) = webview_widget.parent() {
            if let Ok(container) = parent.downcast::<gtk::Container>() {
                container.remove(&webview_widget);
            }
        }

        let overlay = gtk::Overlay::new();
        overlay.set_widget_name(SHARED_NATIVE_OVERLAY_NAME);
        overlay.set_hexpand(true);
        overlay.set_vexpand(true);
        overlay.add(&webview_widget);
        default_vbox.pack_start(&overlay, true, true, 0);
        overlay.show_all();
        return Ok(overlay);
    }

    let webview_widget = direct_webview
        .map(|webview| webview.upcast::<gtk::Widget>())
        .or_else(|| default_vbox.children().into_iter().last())
        .ok_or_else(|| open_failed_reason.to_string())?;

    if let Some(parent) = webview_widget.parent() {
        if let Ok(container) = parent.downcast::<gtk::Container>() {
            container.remove(&webview_widget);
        }
    }

    let overlay = gtk::Overlay::new();
    overlay.set_widget_name(SHARED_NATIVE_OVERLAY_NAME);
    overlay.add(&webview_widget);

    if let Some(parent) = default_vbox.parent() {
        if let Ok(container) = parent.downcast::<gtk::Container>() {
            container.remove(&default_vbox);
        }
    }

    gtk_window.add(&overlay);
    Ok(overlay)
}

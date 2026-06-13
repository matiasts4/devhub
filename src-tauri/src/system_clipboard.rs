#[tauri::command]
pub fn read_system_clipboard_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;

        if !gtk::is_initialized() {
            gtk::init().map_err(|err| format!("gtk init failed: {err}"))?;
        }

        let display = gtk::gdk::Display::default().ok_or("no gdk display")?;
        let clipboard = gtk::Clipboard::default(&display).ok_or("no clipboard")?;
        return Ok(clipboard.wait_for_text().map(|text| text.to_string()));
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(None)
    }
}
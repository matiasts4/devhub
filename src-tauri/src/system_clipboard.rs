use base64::Engine;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(serde::Serialize, Clone)]
pub struct ClipboardImage {
    pub data: String,
    pub mime_type: String,
}

fn encode_image_as_png(width: usize, height: usize, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buffer, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|err| format!("png header failed: {err}"))?;
        writer
            .write_image_data(rgba)
            .map_err(|err| format!("png encode failed: {err}"))?;
    }
    Ok(buffer)
}

#[tauri::command]
pub fn read_system_clipboard_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        if !gtk::is_initialized() {
            gtk::init().map_err(|err| format!("gtk init failed: {err}"))?;
        }

        let display = gtk::gdk::Display::default().ok_or("no gdk display")?;
        let clipboard = gtk::Clipboard::default(&display).ok_or("no clipboard")?;
        return Ok(clipboard.wait_for_text().map(|text| text.to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|err| format!("clipboard init failed: {err}"))?;
        return Ok(clipboard.get_text().ok());
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn write_clipboard_image_to_temp_file(
    data_base64: String,
    extension: Option<String>,
) -> Result<String, String> {
    let ext = extension.unwrap_or_else(|| "png".to_string());
    let ext = ext.trim_start_matches('.');
    if ext.is_empty() {
        return Err("empty file extension".to_string());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|err| format!("base64 decode failed: {err}"))?;

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let file_name = format!(
        "devhub-paste-{}-{}-{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        COUNTER.fetch_add(1, Ordering::Relaxed),
        ext
    );

    let path = std::env::temp_dir().join(file_name);
    std::fs::write(&path, &bytes).map_err(|err| format!("write temp file failed: {err}"))?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "invalid temp path".to_string())
}

#[tauri::command]
pub fn read_system_clipboard_image() -> Result<Option<ClipboardImage>, String> {
    #[cfg(target_os = "linux")]
    {
        if !gtk::is_initialized() {
            gtk::init().map_err(|err| format!("gtk init failed: {err}"))?;
        }

        let display = gtk::gdk::Display::default().ok_or("no gdk display")?;
        let clipboard = gtk::Clipboard::default(&display).ok_or("no clipboard")?;
        let pixbuf = match clipboard.wait_for_image() {
            Some(pixbuf) => pixbuf,
            None => return Ok(None),
        };

        let png_bytes = pixbuf
            .save_to_bufferv("png", &[], &[])
            .map_err(|err| format!("pixbuf save failed: {err}"))?;
        let data = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

        return Ok(Some(ClipboardImage {
            data,
            mime_type: "image/png".to_string(),
        }));
    }

    #[cfg(target_os = "windows")]
    {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|err| format!("clipboard init failed: {err}"))?;
        let image = match clipboard.get_image() {
            Ok(image) => image,
            Err(_) => return Ok(None),
        };

        let png_bytes = encode_image_as_png(image.width, image.height, &image.bytes)?;
        let data = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

        return Ok(Some(ClipboardImage {
            data,
            mime_type: "image/png".to_string(),
        }));
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Ok(None)
    }
}

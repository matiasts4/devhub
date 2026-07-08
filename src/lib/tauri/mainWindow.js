'use client';

/** Resolve the primary Tauri window (`main` label) for chrome actions. */
export async function getTauriMainWindow() {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
    return null;
  }

  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const main = await WebviewWindow.getByLabel('main');
    if (main) return main;
  } catch {
    // Fall through to getCurrentWindow.
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  } catch {
    return null;
  }
}

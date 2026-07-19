/**
 * Desktop runtime detection (Electron / Tauri / web).
 * Pure helpers — no side effects.
 */

export function hasWindow(globalRef = typeof window !== 'undefined' ? window : undefined) {
  return Boolean(globalRef);
}

export function isElectronDesktop(globalRef = typeof window !== 'undefined' ? window : undefined) {
  return hasWindow(globalRef) && globalRef.devhubDesktop?.isElectron === true;
}

export function isTauriDesktop(globalRef = typeof window !== 'undefined' ? window : undefined) {
  return hasWindow(globalRef) && Boolean(globalRef.__TAURI_INTERNALS__ || globalRef.__TAURI__);
}

/**
 * Preference: Electron → Tauri → web.
 * @returns {'electron'|'tauri'|'web'}
 */
export function detectDesktopRuntime(
  globalRef = typeof window !== 'undefined' ? window : undefined
) {
  if (isElectronDesktop(globalRef)) return 'electron';
  if (isTauriDesktop(globalRef)) return 'tauri';
  return 'web';
}

export function isDesktopHost(globalRef = typeof window !== 'undefined' ? window : undefined) {
  const runtime = detectDesktopRuntime(globalRef);
  return runtime === 'electron' || runtime === 'tauri';
}

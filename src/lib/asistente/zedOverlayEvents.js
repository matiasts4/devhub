/** @typedef {'idle' | 'open' | 'executing' | 'responding'} ZedAmbientPhase */

export const ZED_OVERLAY_TOGGLE_EVENT = 'devhub:zed-overlay-toggle';
export const ZED_OVERLAY_OPEN_EVENT = 'devhub:zed-overlay-open';
export const ZED_OVERLAY_CLOSE_EVENT = 'devhub:zed-overlay-close';

export function dispatchZedOverlayToggle() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ZED_OVERLAY_TOGGLE_EVENT));
}

export function dispatchZedOverlayOpen() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ZED_OVERLAY_OPEN_EVENT));
}

export function dispatchZedOverlayClose() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ZED_OVERLAY_CLOSE_EVENT));
}

/**
 * @param {boolean} isLoading
 * @param {boolean} isOpen
 * @param {string|null} statusLine
 * @returns {ZedAmbientPhase}
 */
export function resolveZedAmbientPhase(isLoading, isOpen, statusLine) {
  if (isLoading) return 'executing';
  if (statusLine) return 'responding';
  if (isOpen) return 'open';
  return 'idle';
}

export function shouldShowZedAura(phase) {
  return phase !== 'idle';
}
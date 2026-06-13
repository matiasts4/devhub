/** @typedef {'idle' | 'open' | 'executing' | 'responding'} ZedAmbientPhase */
/** @typedef {'terminal' | 'browser' | 'file' | null} ZedAmbientToolType */

export const ZED_OVERLAY_TOGGLE_EVENT = 'devhub:zed-overlay-toggle';
export const ZED_OVERLAY_OPEN_EVENT = 'devhub:zed-overlay-open';
export const ZED_OVERLAY_CLOSE_EVENT = 'devhub:zed-overlay-close';
export const ZED_AURA_TOOL_TYPE_EVENT = 'devhub:zed-aura-tool-type';
export const ZED_AURA_OUTCOME_EVENT = 'devhub:zed-aura-outcome';

/** @typedef {'success' | 'error' | null} ZedAuraOutcome */

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
 * Dispatch a discrete tool-type signal to the Zed ambient overlay.
 * SSR-safe: returns undefined without throwing when `window` is not defined.
 * @param {ZedAmbientToolType} toolType
 */
export function dispatchZedAuraToolType(toolType) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ZED_AURA_TOOL_TYPE_EVENT, { detail: { toolType } }));
}

/**
 * Brief success/error pulse for ambient aura (Phase 5.4).
 * @param {ZedAuraOutcome} outcome
 */
export function dispatchZedAuraOutcome(outcome) {
  if (typeof window === 'undefined') return;
  if (outcome !== 'success' && outcome !== 'error') return;
  window.dispatchEvent(new CustomEvent(ZED_AURA_OUTCOME_EVENT, { detail: { outcome } }));
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

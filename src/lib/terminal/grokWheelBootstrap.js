/**
 * Grok cold-start wheel bootstrap.
 *
 * Observed: first Grok panel after cold app start often has dead scroll; a second
 * Grok panel (or any Grok after Ctrl+R) works. Root pattern: host-side mouse modes
 * get enabled while native passthrough is on → wheel is swallowed. Grok is now
 * inject-only; this bootstrap only promotes session flags and re-attaches focus,
 * without repeated resetTerminalModesForReattach (Ctrl+L spam) that races Grok boot.
 */

import {
  detectGrokReadyFromTerminalBuffer,
  isGrokLaunchCommand,
} from '@/lib/terminal/grokReadyMarker';

/** Delays (ms) from session `ready` — promote flags as Grok finishes booting. */
export const GROK_WHEEL_BOOTSTRAP_DELAYS_MS = Object.freeze([
  800, 2000, 4000, 7000, 11000,
]);

/**
 * @param {object} opts
 * @returns {() => void} cancel
 */
export function scheduleGrokWheelBootstrap({
  getTerm,
  isCancelled = () => false,
  initialCommand = '',
  tuiSessionActiveRef = null,
  isGrokSessionRef = null,
  grokTuiReadyRef = null,
  setNativeWheelPassthrough = null,
  prepareActiveTuiTerminalFocus = null,
  terminalHasActiveMouseReporting = null,
  /** Optional — only used once when chrome is first seen, not every tick. */
  resetTerminalModesForReattach = null,
  delaysMs = GROK_WHEEL_BOOTSTRAP_DELAYS_MS,
} = {}) {
  if (!isGrokLaunchCommand(initialCommand)) {
    return () => {};
  }

  let cancelled = false;
  let didFullReset = false;
  const timers = [];

  const tick = (attemptIndex) => {
    if (cancelled || isCancelled()) return;
    const term = typeof getTerm === 'function' ? getTerm() : null;
    if (!term) return;

    if (tuiSessionActiveRef) tuiSessionActiveRef.current = true;
    if (isGrokSessionRef) isGrokSessionRef.current = true;

    const chromeInBuffer = detectGrokReadyFromTerminalBuffer(term);
    const mouseLive =
      typeof terminalHasActiveMouseReporting === 'function'
        ? terminalHasActiveMouseReporting(term)
        : false;
    const forceReady = attemptIndex >= 1 || chromeInBuffer || mouseLive;

    if (forceReady) {
      if (grokTuiReadyRef) grokTuiReadyRef.current = true;
      // Do NOT enable nativeWheelPassthrough for Grok — inject-only strategy.
      if (typeof setNativeWheelPassthrough === 'function') {
        setNativeWheelPassthrough(false);
      }
    }

    // One full rebind when chrome appears (or late force) — not every 600ms.
    if (
      !didFullReset &&
      (chromeInBuffer || attemptIndex >= 2) &&
      typeof resetTerminalModesForReattach === 'function'
    ) {
      didFullReset = true;
      resetTerminalModesForReattach(term, { tuiSessionActive: true });
    } else if (typeof prepareActiveTuiTerminalFocus === 'function') {
      // Light rebind only (no Ctrl+L storm during Grok boot).
      prepareActiveTuiTerminalFocus(term, { tuiSessionActive: true });
    }
  };

  (delaysMs || []).forEach((ms, index) => {
    timers.push(setTimeout(() => tick(index), ms));
  });

  return () => {
    cancelled = true;
    timers.forEach((id) => clearTimeout(id));
  };
}

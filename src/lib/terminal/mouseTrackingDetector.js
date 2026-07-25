/* eslint-disable no-control-regex -- terminal escape sequences require ESC in regex */
/**
 * mouseTrackingDetector.js — generic DECSET/DECRST mouse-tracking observation.
 *
 * Any TUI that enables xterm mouse tracking (DECSET 1000 normal / 1002 button
 * motion / 1003 any motion, usually combined with the 1006 SGR extension) can
 * consume SGR wheel/click reports. Observing these private-mode sequences in
 * the PTY output stream lets DevHub route wheel and pass mouse input through
 * WITHOUT per-agent configuration — the TUI itself declares the capability.
 *
 * Encoding-only modes (1005 UTF-8, 1006 SGR, 1015 urxvt) do NOT enable tracking
 * by themselves and are ignored unless paired with 1000/1002/1003.
 */

const MOUSE_DECSET_RE = /\x1b\[\?((?:\d+;)*\d*)([hl])/g;
const MOUSE_TRACKING_MODES = new Set(['1000', '1002', '1003']);

/**
 * Scan a PTY output chunk for mouse-tracking mode changes.
 *
 * Handles combined sequences (e.g. ESC[?1000;1006h) and multiple transitions
 * in one chunk (last one wins).
 *
 * @param {string} chunk - raw PTY output
 * @returns {boolean|null} true = tracking enabled, false = disabled, null = no change
 */
export function detectMouseTrackingChange(chunk) {
  if (typeof chunk !== 'string' || !chunk || chunk.indexOf('\x1b[?') === -1) return null;
  let result = null;
  MOUSE_DECSET_RE.lastIndex = 0;
  let match;
  while ((match = MOUSE_DECSET_RE.exec(chunk)) !== null) {
    const params = match[1].split(';');
    if (!params.some((p) => MOUSE_TRACKING_MODES.has(p))) continue;
    result = match[2] === 'h';
  }
  return result;
}

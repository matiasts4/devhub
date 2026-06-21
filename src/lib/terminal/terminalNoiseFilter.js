/* eslint-disable no-control-regex -- terminal escape sequences require ESC in regex */
/**
 * terminalNoiseFilter.js — single source of truth for filtering terminal
 * capability/status response sequences (DA1/DA2/DSR/CPR).
 *
 * The pattern matches ONLY these xterm response sequences:
 *   CSI ? Pd c     — Primary Device Attributes (DA1) reply
 *   CSI > Pp c     — Secondary Device Attributes (DA2) reply
 *   CSI Pd n       — Device Status Report (DSR) reply
 *   CSI Pd R       — Cursor Position Report (CPR)
 *
 * The regex is deliberately narrow so it cannot false-positive on legitimate
 * TUI text (progress bars, table cells, SGR color codes, percentage labels
 * containing digits and semicolons). See the regression test
 * "does not over-strip legitimate TUI output" in
 * tests/unit/sidecar-sessionTransport.test.js for the safe-text contract.
 *
 * Filter direction is symmetric:
 *   - PTY → client  (output):  strips noise before it can be rendered or replayed
 *   - client → PTY  (input):   drops pure-noise chunks entirely (e.g. xterm.js
 *                              answerback from auto-probe); strips noise from
 *                              mixed input and forwards the rest
 *
 * Used by:
 *   - src/lib/terminal/ttyServer.js           (ESM, output filter on broadcast)
 *   - src/components/TerminalTTY.jsx         (ESM, input filter before WS send)
 *   - sidecar-backend/sessionTransport.js     (CJS, keeps a local copy of the
 *                                              regex — Tauri bundles the
 *                                              sidecar as a resource and cannot
 *                                              import this ESM module at
 *                                              runtime. The two copies must
 *                                              stay in sync. See comment at
 *                                              the top of that file.)
 */

export const SHELL_TERMINAL_RESPONSE_RE =
  /(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[\$(?:\d+;)*\d+p|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;

/** Window-size / manipulation replies (CSI Ps ; Ps ; Ps t), e.g. ESC[4;1024;1920t. */
export const TERMINAL_WINDOW_REPORT_RE = /\x1b\[(?:\d+;)*\d+t/g;

/** DEC mode 1004 focus-in/out events xterm emits via onData when focus changes. */
export const TERMINAL_FOCUS_REPORTING_RE = /\x1b\[[IO]/g;

/** SGR mouse wheel/click reports (e.g. ESC[<0;3;3M) leaked on scroll/focus churn. */
export const TERMINAL_MOUSE_REPORT_RE = /\x1b\[<[\d;]*[mM]/g;

/** Motion/drag SGR reports (button 32+) — shells echo them as visible garbage on hover. */
export const TERMINAL_MOUSE_MOTION_LEAK_RE = /\x1b\[<(?!0;|[1-3];|64;|65;)\d+;[\d;]*[mM]/g;

/** Page Up/Down echoed when a plain shell receives synthetic wheel injection. */
export const TERMINAL_WHEEL_PAGE_LEAK_RE = /\x1b\[[56]~/g;

/** Click/drag only (buttons 0–3) — wheel buttons 64/65 must reach TUIs (OpenCode/grok). */
export const TERMINAL_MOUSE_CLICK_LEAK_RE = /\x1b\[<(0|[1-3]);[\d;]*[mM]/g;

/** Partial DECSET/SGR mouse leaks when ESC bytes were eaten — shell echo garbage. */
export const TERMINAL_MOUSE_DECSET_LEAK_RE = /\?(?:1000|1002|1003|1006|1007|1015)[hl]/g;

export const TERMINAL_MOUSE_SGR_FRAGMENT_LEAK_RE = /(?:<|^)(?:0|[1-3]|64|65);\d+;\d+[mM]/g;

export function stripTerminalMouseDecsetLeak(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk
    .replace(TERMINAL_MOUSE_DECSET_LEAK_RE, '')
    .replace(TERMINAL_MOUSE_SGR_FRAGMENT_LEAK_RE, '');
}

export function stripTerminalFocusReporting(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_FOCUS_REPORTING_RE, '');
}

export function stripTerminalMouseMotionLeak(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_MOUSE_MOTION_LEAK_RE, '');
}

export function stripTerminalMouseReporting(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_MOUSE_REPORT_RE, '');
}

/** Input path: strip click leaks only; preserve SGR wheel (64/65) for TUI transcript scroll. */
export function stripTerminalMouseClickLeak(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_MOUSE_CLICK_LEAK_RE, '');
}

export function stripShellTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk
    .replace(TERMINAL_WINDOW_REPORT_RE, '')
    .replace(TERMINAL_MOUSE_REPORT_RE, '')
    .replace(TERMINAL_WHEEL_PAGE_LEAK_RE, '')
    .replace(SHELL_TERMINAL_RESPONSE_RE, '')
    .replace(TERMINAL_MOUSE_DECSET_LEAK_RE, '')
    .replace(TERMINAL_MOUSE_SGR_FRAGMENT_LEAK_RE, '');
}

/**
 * @param {string} chunk
 * @param {{ mode?: 'tui' | 'shell'; tuiReady?: boolean; panelHidden?: boolean; panelInactive?: boolean } | null | undefined} [ctx]
 */
export function stripTerminalInputNoise(chunk, ctx) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  const baseStripped = chunk
    .replace(TERMINAL_WINDOW_REPORT_RE, '')
    .replace(SHELL_TERMINAL_RESPONSE_RE, '');
  const focusStripped = stripTerminalFocusReporting(baseStripped);
  const motionStripped = stripTerminalMouseMotionLeak(focusStripped);
  const tuiLive =
    ctx &&
    ctx.mode === 'tui' &&
    ctx.tuiReady === true &&
    ctx.panelHidden !== true &&
    ctx.panelInactive !== true;
  if (tuiLive) {
    return motionStripped;
  }
  return stripTerminalMouseDecsetLeak(stripTerminalMouseReporting(motionStripped));
}

/** Input noise check — treats any SGR mouse report as noise; tui-ready strip path still preserves it. */
export function containsTerminalInputNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return false;
  SHELL_TERMINAL_RESPONSE_RE.lastIndex = 0;
  TERMINAL_FOCUS_REPORTING_RE.lastIndex = 0;
  TERMINAL_WINDOW_REPORT_RE.lastIndex = 0;
  TERMINAL_MOUSE_REPORT_RE.lastIndex = 0;
  return (
    SHELL_TERMINAL_RESPONSE_RE.test(chunk) ||
    TERMINAL_FOCUS_REPORTING_RE.test(chunk) ||
    TERMINAL_WINDOW_REPORT_RE.test(chunk) ||
    TERMINAL_MOUSE_REPORT_RE.test(chunk)
  );
}

export function containsTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return false;
  SHELL_TERMINAL_RESPONSE_RE.lastIndex = 0;
  TERMINAL_FOCUS_REPORTING_RE.lastIndex = 0;
  TERMINAL_WINDOW_REPORT_RE.lastIndex = 0;
  TERMINAL_MOUSE_REPORT_RE.lastIndex = 0;
  return (
    SHELL_TERMINAL_RESPONSE_RE.test(chunk) ||
    TERMINAL_FOCUS_REPORTING_RE.test(chunk) ||
    TERMINAL_WINDOW_REPORT_RE.test(chunk) ||
    TERMINAL_MOUSE_REPORT_RE.test(chunk)
  );
}

/**
 * Symmetric to filterTerminalOutputForSession in sidecar-backend.
 *
 * Returns:
 *   - null  if the chunk is PURE noise (every byte is a terminal response).
 *           The caller should drop the chunk entirely — sending it to the
 *           PTY would insert visible artifacts into the prompt.
 *   - a stripped string otherwise. Any embedded response sequences are
 *           removed and the surrounding input (user keystrokes, etc.) is
 *           forwarded as-is.
 *
 * `ctx` gates SGR click passthrough when `mode === 'tui' && tuiReady === true`.
 * Null/undefined preserves legacy shell behavior (strip click leaks).
 */

export function filterTerminalInputForSession(ctx, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  if (!containsTerminalInputNoise(chunk)) return chunk;
  const stripped = stripTerminalInputNoise(chunk, ctx);
  return stripped.length === 0 ? null : stripped;
}

const INCOMPLETE_TERMINAL_ESCAPE_SUFFIX_RE = /\x1b(?:\[[\d;?$<>]*|\][\d;]*)?$/;

/**
 * Hold a trailing partial ESC/CSI across WS chunks so strip regexes cannot
 * leave visible fragments like `p)` or `M` when sequences span messages.
 */
export function stripTerminalOutputWithPending(pendingRef, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  const pending = pendingRef?.value || '';
  const combined = pending + chunk;
  const incomplete = combined.match(INCOMPLETE_TERMINAL_ESCAPE_SUFFIX_RE);
  if (incomplete) {
    if (pendingRef) pendingRef.value = incomplete[0];
    return stripShellTerminalResponseNoise(
      combined.slice(0, combined.length - incomplete[0].length)
    );
  }
  if (pendingRef) pendingRef.value = '';
  return stripShellTerminalResponseNoise(combined);
}

/** Client→display: strip capability noise before rendering (belt-and-suspenders). */
export function filterTerminalOutputForSession(_session, chunk, pendingRef = null) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  if (pendingRef) return stripTerminalOutputWithPending(pendingRef, chunk);
  return stripShellTerminalResponseNoise(chunk);
}

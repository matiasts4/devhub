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

export const SHELL_TERMINAL_RESPONSE_RE = /(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[\$(?:\d+;)*\d+p|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;

export function stripShellTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(SHELL_TERMINAL_RESPONSE_RE, '');
}

export function containsTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return false;
  SHELL_TERMINAL_RESPONSE_RE.lastIndex = 0;
  return SHELL_TERMINAL_RESPONSE_RE.test(chunk);
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
 * The `session` argument is currently informational and accepted for
 * symmetry with the output filter; future gating by session.mode can be
 * added here without changing call sites.
 */
// eslint-disable-next-line no-unused-vars
export function filterTerminalInputForSession(_session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  if (!containsTerminalResponseNoise(chunk)) return chunk;
  const stripped = stripShellTerminalResponseNoise(chunk);
  return stripped.length === 0 ? null : stripped;
}

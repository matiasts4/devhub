/**
 * Native TUI bootstrap paste — wait for agent TUI readiness, paste like human
 * Ctrl+V (caller supplies formatPayload), then send Enter as a separate write.
 */

export const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 15_000;
export const BOOTSTRAP_ENTER = '\r';
export const BOOTSTRAP_POLL_MS = 50;
export const BOOTSTRAP_SETTLE_MS = 80;

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeBootstrapText(text) {
  if (typeof text !== 'string') return '';
  // Strip trailing newlines — Enter is a separate keystroke after paste.
  return text.replace(/[\r\n]+$/g, '').trimEnd();
}

/**
 * @param {{ program?: string|null, signals?: {
 *   grokReady?: boolean,
 *   kimiReady?: boolean,
 *   opencodeFooterReady?: boolean,
 *   tuiActive?: boolean,
 * } }} opts
 * @returns {boolean}
 */
export function isBootstrapReady({ program, signals } = {}) {
  const s = signals || {};
  const grokReady = s.grokReady === true;
  const kimiReady = s.kimiReady === true;
  const opencodeFooterReady = s.opencodeFooterReady === true;
  const prog = typeof program === 'string' && program.trim() ? program.trim().toLowerCase() : '';

  // IMPORTANT: do NOT treat launch-command heuristics as ready.
  // TerminalTTY initializes tuiSessionActiveRef=true for agent initialCommand,
  // which would paste into the shell before the TUI is actually interactive.
  if (prog === 'grok') return grokReady;
  if (prog === 'kimi') return kimiReady;
  if (prog === 'opencode') return opencodeFooterReady;
  // codex / hermes / unknown: only confirmed runtime signals
  return grokReady || kimiReady || opencodeFooterReady;
}

/**
 * @param {object} opts
 * @param {() => {
 *   grokReady?: boolean,
 *   kimiReady?: boolean,
 *   opencodeFooterReady?: boolean,
 *   tuiActive?: boolean,
 * }} opts.getSignals
 * @param {string} [opts.program]
 * @param {string} opts.text
 * @param {number} [opts.timeoutMs]
 * @param {(text: string) => string} opts.formatPayload
 * @param {(data: string) => boolean | Promise<boolean>} opts.sendInput
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {() => number} [opts.now]
 * @param {() => boolean} [opts.isCancelled]
 * @returns {Promise<{ status: string, reason?: string }>}
 */
export async function runNativeTuiBootstrapPaste({
  getSignals,
  program = null,
  text,
  timeoutMs = DEFAULT_BOOTSTRAP_TIMEOUT_MS,
  formatPayload,
  sendInput,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  isCancelled = () => false,
} = {}) {
  const normalized = normalizeBootstrapText(text);
  if (!normalized) {
    return { status: 'skipped', reason: 'empty' };
  }
  if (typeof formatPayload !== 'function' || typeof sendInput !== 'function') {
    return { status: 'failed', reason: 'missing_deps' };
  }
  if (typeof getSignals !== 'function') {
    return { status: 'failed', reason: 'missing_getSignals' };
  }

  const deadline = now() + Math.max(0, Number(timeoutMs) || DEFAULT_BOOTSTRAP_TIMEOUT_MS);

  while (!isBootstrapReady({ program, signals: getSignals() || {} })) {
    if (isCancelled()) {
      return { status: 'cancelled' };
    }
    if (now() >= deadline) {
      return { status: 'timeout', reason: 'tui_not_ready' };
    }
    await sleep(BOOTSTRAP_POLL_MS);
  }

  if (isCancelled()) {
    return { status: 'cancelled' };
  }

  if (BOOTSTRAP_SETTLE_MS > 0) {
    await sleep(BOOTSTRAP_SETTLE_MS);
  }

  if (isCancelled()) {
    return { status: 'cancelled' };
  }

  const payload = formatPayload(normalized);
  if (typeof payload !== 'string' || payload.length === 0) {
    return { status: 'failed', reason: 'empty_payload' };
  }

  const pasteOk = await sendInput(payload);
  if (!pasteOk) {
    return { status: 'send_failed', reason: 'paste' };
  }

  const enterOk = await sendInput(BOOTSTRAP_ENTER);
  if (!enterOk) {
    return { status: 'send_failed', reason: 'enter' };
  }

  return { status: 'pasted' };
}

/**
 * Minimal Kimi TUI readiness detector (Capa B).
 * Intentionally small — no wheel/focus/detach logic (see KIMI_REBUILD_PLAN.md).
 */

export function normalizeKimiLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

export function isKimiLaunchCommand(initialCommand) {
  return /\bkimi\b/i.test(normalizeKimiLaunchCommand(initialCommand));
}

/**
 * Strong Kimi signals — unambiguous Kimi TUI chrome that never appears in
 * generic log output. Any single strong hit is enough to promote a session
 * to an agent from output alone (see agentOutputPromotion.js).
 */
const KIMI_STRONG_SIGNALS = [
  /welcome to kimi/i,
  /kimi code cli v\d/i,
  /\]0;kimi\b/i,
  /k2(?:\.\d+)?\s+code/i,
];

/**
 * Promoting weak signals — TUI footer hints that are specific enough to count
 * toward output-based promotion, but only in combination (≥2 distinct signals
 * in the same chunk): a real Ink footer repaints several of these per frame,
 * while log noise (e.g. `pnpm electron:up` piping DevHub's own startup logs)
 * prints at most one. Generic, log-prone patterns (`session_<hex>`,
 * `thinking … / N% (`) are deliberately NOT here — they only mark readiness
 * once the session is already known to be an agent.
 */
const KIMI_PROMOTING_SIGNALS = [
  /mcp\s*\/\s*status/i,
  /[⊙⊛]\s*\d+\s+mcp/i,
  /ctrl\+p\s+commands/i,
  /esc\s+interrupt/i,
];

/** True when a single unambiguous Kimi TUI signal is present. */
export function detectKimiStrongSignal(text) {
  if (!text || typeof text !== 'string') return false;
  return KIMI_STRONG_SIGNALS.some((re) => re.test(text));
}

/** Count of DISTINCT promoting weak signals present in the chunk (0..4). */
export function countKimiPromotingSignals(text) {
  if (!text || typeof text !== 'string') return 0;
  let count = 0;
  for (const re of KIMI_PROMOTING_SIGNALS) {
    if (re.test(text)) count += 1;
  }
  return count;
}

/** True when Kimi interactive chrome is visible in PTY output. */
export function detectKimiTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (detectKimiStrongSignal(text)) return true;
  if (countKimiPromotingSignals(text) > 0) return true;
  if (/session_[a-f0-9-]{8,}/i.test(text)) return true;
  if (/\bthinking\b/i.test(text) && /\/\s*[\d.]+%\s*\(/i.test(text)) return true;
  return false;
}

/** Live kimi Ink TUI — scroll lives in the PTY app, not xterm scrollback. */
export function isKimiTuiLive({
  initialCommand = '',
  kimiReady = false,
  tuiSessionActive = false,
  hasConnectedOnce = false,
} = {}) {
  if (!isKimiLaunchCommand(initialCommand)) return false;
  if (kimiReady) return true;
  return Boolean(hasConnectedOnce && tuiSessionActive);
}

/**
 * Skip fit/PTY resize on workspace/window show when cols already match the container.
 * Kimi transcript scroll resets on redundant SIGWINCH at unchanged dims; when the
 * container wants wider cols after a switch, caller must run a real fit + SIGWINCH.
 */
export function shouldFreezeKimiTuiViewportOnWorkspaceShow({
  initialCommand = '',
  kimiReady = false,
  proposedDimsMatch = true,
} = {}) {
  if (!isKimiLaunchCommand(initialCommand) && !kimiReady) return false;
  return proposedDimsMatch;
}

/** Kimi Ink scroll resets on redundant PTY resize even when cols/rows are unchanged. */
export function shouldSkipKimiTuiPtyResize({
  initialCommand = '',
  hasConnectedOnce = false,
  kimiReady = false,
  tuiSessionActive = false,
} = {}) {
  return isKimiTuiLive({
    initialCommand,
    kimiReady,
    tuiSessionActive,
    hasConnectedOnce,
  });
}

/** Scan xterm scrollback for kimi chrome after reattach before fresh output arrives. */
export function detectKimiReadyFromTerminalBuffer(term) {
  const buffer = term?.buffer?.active;
  if (!buffer || buffer.length === 0) return false;

  try {
    const lines = [];
    const start = Math.max(0, buffer.length - 48);
    for (let lineIndex = start; lineIndex < buffer.length; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (line) lines.push(line.translateToString(true));
    }
    return detectKimiTuiReady(lines.join('\n'));
  } catch {
    return false;
  }
}

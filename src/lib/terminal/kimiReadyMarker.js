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

/** True when Kimi interactive chrome is visible in PTY output. */
export function detectKimiTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  if (/welcome to kimi/i.test(lower)) return true;
  if (/kimi code cli v\d/i.test(lower)) return true;
  if (/\]0;kimi\b/i.test(text)) return true;
  if (/mcp\s*\/\s*status/i.test(text) || /[⊙⊛]\s*\d+\s+mcp/i.test(text)) return true;
  if (/ctrl\+p\s+commands/i.test(text) || /esc\s+interrupt/i.test(text)) return true;
  if (/session_[a-f0-9-]{8,}/i.test(text)) return true;
  if (/k2(?:\.\d+)?\s+code/i.test(text)) return true;
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

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
export function isKimiTuiLive({ initialCommand = '', kimiReady = false } = {}) {
  return isKimiLaunchCommand(initialCommand) && kimiReady;
}

const KIMI_WORKSPACE_FREEZE_REASON_RE =
  /workspace-switch|workspace-show-layout|workspace-show-raf|layout-settled-workspace-switch-/;

/**
 * Skip fit/PTY resize on workspace tab switches when cols/rows are unchanged.
 * SIGWINCH reflow resets Kimi transcript scroll even though xterm viewportY stays 0.
 */
export function shouldFreezeKimiTuiViewportOnWorkspaceShow({
  reason = '',
  sizeUnchanged = false,
  initialCommand = '',
  kimiReady = false,
} = {}) {
  if (!isKimiTuiLive({ initialCommand, kimiReady }) || !sizeUnchanged) return false;
  return KIMI_WORKSPACE_FREEZE_REASON_RE.test(String(reason));
}

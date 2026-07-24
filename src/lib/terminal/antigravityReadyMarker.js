/** Antigravity (agy) TUI readiness markers — shared by client helpers and ttyServer. */

export function normalizeAntigravityLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

/** True when the launch command is an Antigravity (agy) TUI session. */
export function isAntigravityLaunchCommand(initialCommand) {
  return /\b(?:agy|antigravity)\b/i.test(normalizeAntigravityLaunchCommand(initialCommand));
}

/**
 * True when Antigravity TUI chrome is visible in PTY output.
 *
 * Signals ported from src/lib/terminal/agentStateDetection/manifests/antigravity.js
 * (idle/working footer rules) and verified against
 * tests/fixtures/agent-screens/antigravity-*.txt:
 *   - "? for shortcuts"         — idle footer hint
 *   - "accept-edits · <model>"  — footer mode/model status row
 *   - "antigravity>" prompt     — bare agent prompt line
 *   - "esc to cancel"           — working footer (also proves the TUI is live)
 *   - OSC title "]0;antigravity"— window title set by the TUI
 *
 * Accepts either `(text)` (matching the kimi/opencode/grok detector shape) or
 * `(session, text)` for call-site symmetry; the session argument is unused.
 */
export function detectAntigravityTuiReady(sessionOrText, maybeText) {
  const text = maybeText !== undefined ? maybeText : sessionOrText;
  if (!text || typeof text !== 'string') return false;
  // OSC window title set by the Antigravity TUI
  if (/\]0;antigravity\b/i.test(text)) return true;
  // Idle footer hint line
  if (/\?\s+for shortcuts/i.test(text)) return true;
  // Footer status row: "<permission-mode> · <model>", e.g. "accept-edits · Gemini 3.5 Flash"
  if (/accept-edits\s*·/i.test(text)) return true;
  // Bare agent prompt line ("antigravity>" / "antigravity" / "antigravity (v1.2.3)")
  if (/^\s*antigravity(?:\s*\(v[^)]*\))?\s*>?\s*$/im.test(text)) return true;
  if (/^\s*antigravity>/im.test(text)) return true;
  // Working footer (esc/ctrl+c to cancel|interrupt)
  if (/esc\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/ctrl\+c\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  // Permission prompt — proves the TUI is live even though it is not "ready
  // for input" (needed so pre-attached panels blocked on a prompt still enter
  // agent detection).
  if (/requesting permission for:/i.test(text)) return true;
  if (/do you want to proceed\?/i.test(text)) return true;
  return false;
}

/** Output-based session detector (tmux/pre-attach) — mirrors detectGrokSessionFromOutput. */
export function detectAntigravitySessionFromOutput(text) {
  if (!text || typeof text !== 'string') return false;
  return detectAntigravityTuiReady(text);
}

/** Scan xterm scrollback for Antigravity chrome after reattach before fresh output arrives. */
export function detectAntigravityReadyFromTerminalBuffer(term) {
  const buffer = term?.buffer?.active;
  if (!buffer || buffer.length === 0) return false;

  try {
    const lines = [];
    const start = Math.max(0, buffer.length - 48);
    for (let lineIndex = start; lineIndex < buffer.length; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (line) lines.push(line.translateToString(true));
    }
    return detectAntigravityTuiReady(lines.join('\n'));
  } catch {
    return false;
  }
}

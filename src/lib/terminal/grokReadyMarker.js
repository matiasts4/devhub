/** Grok TUI readiness markers — shared by client helpers and ttyServer. */

export function detectGrokTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    /Shift\+Tab\s+mode/i.test(text) ||
    /ctrl\+c:cancel/i.test(text) ||
    /user_prompt_submit/i.test(text) ||
    /ctrl\+c\s+cancel/i.test(text) ||
    /esc\s+cancel/i.test(text)
  );
}

export function detectGrokSessionFromOutput(text) {
  if (!text || typeof text !== 'string') return false;
  return /\]0;grok\b/i.test(text) || detectGrokTuiReady(text);
}

/** True when the launch command is a Grok Build TUI session. */
export function isGrokLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return false;
  return /\bgrok\b/i.test(initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim());
}

/** Scan xterm scrollback for Grok chrome after reattach/reload before fresh PTY output. */
export function detectGrokReadyFromTerminalBuffer(term) {
  const buffer = term?.buffer?.active;
  if (!buffer || buffer.length === 0) return false;

  try {
    const lines = [];
    const start = Math.max(0, buffer.length - 48);
    for (let lineIndex = start; lineIndex < buffer.length; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (line) lines.push(line.translateToString(true));
    }
    return detectGrokSessionFromOutput(lines.join('\n'));
  } catch {
    return false;
  }
}

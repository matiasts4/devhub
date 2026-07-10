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

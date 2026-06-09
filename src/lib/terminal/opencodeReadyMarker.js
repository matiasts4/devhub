/**
 * Marker file written when OpenCode TUI is ready for bootstrap injection.
 * Path: /tmp/devhub-opencode-ready-<tmux-session>
 */

export function resolveOpencodeReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-opencode-ready-${safe}`;
}

/** OpenCode interactive TUI footer — input area is ready for paste. */
export function detectOpenCodeTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  return /ctrl\+p\s+commands/i.test(text) || /esc\s+interrupt/i.test(text);
}

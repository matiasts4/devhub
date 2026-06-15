/**
 * Shell fragments to hide tmux status lines in DevHub panel PTYs.
 * The outer panel tmux session often stays visible while swarm agents
 * attach an inner session — a lingering status bar steals one row and
 * shows as a green band below OpenCode / shell TUIs.
 */

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Disable global + per-session tmux status (safe no-op when tmux is missing). */
export function buildTmuxDisableStatusFragment(sessionName = null) {
  const parts = [
    'tmux set -g status off 2>/dev/null || true',
    'tmux set -g status-interval 0 2>/dev/null || true',
  ];
  if (sessionName) {
    const quoted = shellQuote(sessionName);
    parts.push(`tmux set-option -t ${quoted} status off 2>/dev/null || true`);
    parts.push(`tmux set-option -t ${quoted} status-interval 0 2>/dev/null || true`);
  }
  return parts.join('; ');
}

/**
 * Attach (or create) a tmux session with status bar disabled before and after attach.
 */
export function buildTmuxPanelAttachCommand(sessionName, cwd = null) {
  const quotedSession = shellQuote(sessionName);
  const cwdFlag = cwd ? ` -c ${shellQuote(cwd)}` : '';
  return [
    buildTmuxDisableStatusFragment(sessionName),
    `tmux new-session -A -s ${quotedSession}${cwdFlag}`,
    buildTmuxDisableStatusFragment(sessionName),
    `tmux refresh-client -t ${quotedSession} 2>/dev/null || true`,
  ].join('; ');
}

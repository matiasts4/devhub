/** Lightweight read-only view of in-process ttyServer sessions (no node-pty import). */

export const GLOBAL_TTY_SESSIONS_KEY = '__DEVHUB_TTY_SESSIONS__';

export function getTTYSessionsSnapshot() {
  const sessions = globalThis[GLOBAL_TTY_SESSIONS_KEY];
  if (!sessions || typeof sessions.values !== 'function') return [];

  const snapshot = [];
  for (const [terminalId, session] of sessions.entries()) {
    snapshot.push({
      terminalId,
      mode: session.mode || 'shell',
      socketCount: session.sockets?.size || 0,
      createdAt: session.createdAt || null,
      lastActivityAt: session.lastActivityAt || null,
      lastSeenAt: session.lastSeenAt || null,
      cwd: session.cwd || null,
      shell: session.shell || null,
      title: session.title || null,
      restored: session.restored || false,
      alive: true,
      opencodeSessionId: session.opencodeSessionId || null,
      hermesSessionId: session.hermesSessionId || null,
      agentType: session.agentType || null,
      agentSessionId: session.agentSessionId || null,
      agentTuiState: session.agentTuiState || null,
      agentTuiStateAt: session.agentTuiStateAt || null,
      initialCommand: session.initialCommand || null,
    });
  }

  return snapshot;
}

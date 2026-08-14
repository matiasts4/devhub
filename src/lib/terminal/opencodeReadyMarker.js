/**
 * Marker files written when an agent TUI is ready for bootstrap injection.
 *
 * Legacy path (OpenCode): /tmp/devhub-opencode-ready-<tmux-session>
 * Generic path:          /tmp/devhub-agent-ready-<program>-<tmux-session>
 */

export function resolveAgentReadyMarkerPath(tmuxSession, program = 'opencode') {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safeProgram = String(program || 'opencode').replace(/[^a-zA-Z0-9._-]/g, '');
  const safeSession = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeSession) return null;
  return `/tmp/devhub-agent-ready-${safeProgram}-${safeSession}`;
}

export function resolveAgentReadyMarkerPaths(tmuxSession, program = 'opencode') {
  const generic = resolveAgentReadyMarkerPath(tmuxSession, program);
  const legacy = resolveOpencodeReadyMarkerPath(tmuxSession);
  return { generic, legacy };
}

export function resolveOpencodeReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-opencode-ready-${safe}`;
}

export function isOpenCodeLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return false;
  return /\bopencode\b/i.test(initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim());
}

/** Scan xterm scrollback for OpenCode footer after reattach/reload before fresh PTY output. */
export function detectOpenCodeReadyFromTerminalBuffer(term) {
  const buffer = term?.buffer?.active;
  if (!buffer || buffer.length === 0) return false;

  try {
    const lines = [];
    const start = Math.max(0, buffer.length - 48);
    for (let lineIndex = start; lineIndex < buffer.length; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (line) lines.push(line.translateToString(true));
    }
    return detectOpenCodeTuiReady(lines.join('\n'));
  } catch {
    return false;
  }
}

/**
 * Once OpenCode/Grok ready is confirmed, skip the per-flush ready hot path
 * (footer re-detect + mouse DECSET rebind) — footer strings linger in the output tail.
 */
export function shouldSkipConfirmedTuiReadyHotPath({
  footerConfirmed = false,
  grokReady = false,
} = {}) {
  return Boolean(footerConfirmed || grokReady);
}

/** Session-scoped once-guard for swarm ready-marker FS writes. */
export function claimSessionFlagOnce(session, flagKey) {
  if (!session || typeof session !== 'object' || !flagKey) return false;
  if (session[flagKey]) return false;
  session[flagKey] = true;
  return true;
}

/**
 * Strong OpenCode signal — the MiniMax provider row is unambiguous OpenCode
 * TUI chrome that never appears in generic log output. One strong hit is
 * enough to promote a session to an agent from output alone (see
 * agentOutputPromotion.js). Both checks are case-insensitive, so in practice
 * the `minimax.io` domain alone satisfies them.
 */
export function detectOpenCodeStrongSignal(text) {
  if (!text || typeof text !== 'string') return false;
  return /minimax\.io/i.test(text) && /MiniMax/i.test(text);
}

/**
 * Promoting weak signals — OpenCode footer hints that count toward
 * output-based promotion only in combination (≥2 distinct signals in the
 * same chunk). The generic `/status x.y` version pattern is deliberately
 * excluded: it appears in plain log output and must never promote.
 */
const OPENCODE_PROMOTING_SIGNALS = [
  /ctrl\+p\s+commands/i,
  /esc\s+interrupt/i,
  /\bMCP\s*\/\s*status\b/i,
  /[⊙⊛]\s*\d+\s+MCP/i,
];

/** Count of DISTINCT promoting weak signals present in the chunk (0..4). */
export function countOpenCodePromotingSignals(text) {
  if (!text || typeof text !== 'string') return 0;
  let count = 0;
  for (const re of OPENCODE_PROMOTING_SIGNALS) {
    if (re.test(text)) count += 1;
  }
  return count;
}

/** OpenCode interactive TUI footer — input area is ready for paste. */
export function detectOpenCodeTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (detectOpenCodeStrongSignal(text)) return true;
  if (countOpenCodePromotingSignals(text) > 0) return true;
  if (/\/status\s+\d+\.\d+(?:\.\d+)?/i.test(text)) return true;
  return false;
}

/**
 * OpenCode footers replayed after a resize/mode transition paint a second
 * status row in scrollback — discard small catchup buffers that are mostly footer.
 */
export function shouldDiscardOpenCodeCatchupReplay(text) {
  if (!text || typeof text !== 'string') return false;
  return detectOpenCodeTuiReady(text);
}

/** DevHub client attached and rendered the tmux pane (bootstrap/inbox gate fallback). */
export function detectViewportReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-viewport-ready-${safe}`;
}

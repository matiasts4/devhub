// ============================================================
// WIP: pre-sdd-batch (2026-06-08)
// Marked by orchestrator to isolate the prior fix pass from the
// upcoming "swarm-launch-hardening" SDD change. DO NOT EDIT until
// the SDD proposal is approved and the new change decides whether
// to absorb, refactor, or revert these changes.
// Last verified: 149/149 targeted tests passing (1 suite skipped:
// useSharedSurfaceRegistry.test.js due to missing
// @testing-library/react dep — not a code regression).
// ============================================================
/**
 * SYNC NOTE — `SHELL_TERMINAL_RESPONSE_RE` and `stripShellTerminalResponseNoise`
 * below are intentionally duplicated from `src/lib/terminal/terminalNoiseFilter.js`
 * (ESM). The Tauri desktop bundle ships `sidecar-backend/` as an external resource
 * and the sidecar runs as plain Node CJS, so it cannot import the ESM module at
 * runtime. The two copies must stay in sync. The shared module is the source of
 * truth; this copy exists for CJS consumers only.
 *
 * When updating the regex, update BOTH:
 *   - src/lib/terminal/terminalNoiseFilter.js (ESM source of truth)
 *   - sidecar-backend/sessionTransport.js     (this CJS mirror)
 */
const SHELL_TERMINAL_RESPONSE_RE = /(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[\$(?:\d+;)*\d+p|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;

function getTransportMode(requestUrl = '/') {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  return pathname === '/tty' ? 'json' : 'raw';
}

function parseClientMessage(rawMessage, transport = 'raw') {
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage?.toString?.() || '';

  if (transport !== 'json') {
    return { type: 'input', data: message };
  }

  if (!message.trim().startsWith('{')) {
    return { type: 'input', data: message };
  }

  try {
    const payload = JSON.parse(message);
    if (payload?.type === 'resize' && payload.cols && payload.rows) {
      return payload;
    }
    if (payload?.type === 'input' && typeof payload.data === 'string') {
      return payload;
    }
  } catch {
    return { type: 'input', data: message };
  }

  return { type: 'input', data: message };
}

function buildServerMessage(transport, payload) {
  if (transport === 'json') {
    return JSON.stringify(payload);
  }

  if (payload?.type === 'output') {
    return payload.data || '';
  }

  return JSON.stringify(payload);
}

function detectOpenCodeSessionId(text) {
  if (!text || typeof text !== 'string') return null;

  const commandMatch = text.match(/opencode\s+(?:--session\s+)(ses_[\w]+)/i);
  if (commandMatch?.[1]) return commandMatch[1];

  const outputMatch = text.match(/\bses_[a-zA-Z0-9_]+\b/);
  return outputMatch?.[0] || null;
}

function stripShellTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(SHELL_TERMINAL_RESPONSE_RE, '');
}

function filterTerminalOutputForSession(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  // Apply in ALL modes. The regex matches only terminal response sequences
  // (CSI ? Pd c / CSI > Pp c / CSI Pd n / CSI Pd R) — it cannot false-positive
  // on normal TUI text. Previously gated to shell-only, which leaked the bytes
  // for opencode/hermes panels and surfaced them as the "1;2c0;276;0c..." garbage
  // at the prompt on every panel focus/click. See ttyServer.js handleSessionOutput
  // for the dev/test mirror of this filter.
  return stripShellTerminalResponseNoise(chunk);
}

/**
 * Symmetric to filterTerminalOutputForSession but for the client→PTY direction.
 *
 * Returns:
 *   - null if the chunk is PURE terminal response noise. The caller should drop
 *     the chunk entirely (e.g. xterm.js auto-probe answerback bytes that get
 *     captured by terminal.onData and re-sent as input).
 *   - a stripped string otherwise: any embedded response sequences are removed
 *     and the rest of the input is forwarded as-is.
 *
 * This is belt-and-suspenders defense for the real bug surface (client→PTY
 * input). The primary fix is in src/components/TerminalTTY.jsx onData; this
 * sidecar filter protects against stale frontend bundles and raw-transport
 * clients that bypass the frontend filter.
 */
function filterTerminalInputForSession(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  SHELL_TERMINAL_RESPONSE_RE.lastIndex = 0;
  if (!SHELL_TERMINAL_RESPONSE_RE.test(chunk)) return chunk;
  const stripped = stripShellTerminalResponseNoise(chunk);
  return stripped.length === 0 ? null : stripped;
}

function buildHistoryReplay(session) {
  if (!session?.historyEnabled || !Array.isArray(session.history) || session.history.length === 0) {
    return '';
  }

  return filterTerminalOutputForSession(session, session.history.join(''));
}

function switchSessionToTuiMode(session) {
  if (!session) return;
  session.mode = 'tui';
  session.historyEnabled = false;
  session.history = [];
}

function updateSessionModeFromInput(session, input) {
  if (!session || !input || typeof input !== 'string') return;

  if (/^[\x00-\x20]*opencode\b/i.test(input)) {
    switchSessionToTuiMode(session);
    return;
  }

  if (/^[\x00-\x20]*hermes\b/i.test(input)) {
    switchSessionToTuiMode(session);
    return;
  }

  session.pendingInput = `${session.pendingInput || ''}${input}`;
  const lines = session.pendingInput.split(/\r\n|\n|\r/);
  session.pendingInput = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\s*opencode\b/i.test(trimmed) || /^\s*hermes\b/i.test(trimmed)) {
      switchSessionToTuiMode(session);
      return;
    }
  }
}

module.exports = {
  buildHistoryReplay,
  buildServerMessage,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
  detectOpenCodeSessionId,
  getTransportMode,
  parseClientMessage,
  stripShellTerminalResponseNoise,
  updateSessionModeFromInput,
};

const SHELL_TERMINAL_RESPONSE_RE = /(?:\x1b\[\?(?:\d+;)*\d+[cnR]|\x1b\[>(?:\d+;)*\d+c|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;

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
  if (session?.mode !== 'shell') return chunk;
  return stripShellTerminalResponseNoise(chunk);
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
  filterTerminalOutputForSession,
  detectOpenCodeSessionId,
  getTransportMode,
  parseClientMessage,
  stripShellTerminalResponseNoise,
  updateSessionModeFromInput,
};

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

module.exports = {
  buildServerMessage,
  detectOpenCodeSessionId,
  getTransportMode,
  parseClientMessage,
};

const {
  buildServerMessage,
  detectOpenCodeSessionId,
  getTransportMode,
  parseClientMessage,
} = require('../../sidecar-backend/sessionTransport');

describe('sidecar session transport contract', () => {
  test('uses json transport for the production sidecar tty path', () => {
    expect(getTransportMode('/tty?sessionId=p1')).toBe('json');
    expect(getTransportMode('/?sessionId=p1')).toBe('raw');
  });

  test('parses json transport input and resize messages', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'input', data: 'opencode --session ses_123\r' }), 'json')).toEqual({
      type: 'input',
      data: 'opencode --session ses_123\r',
    });
    expect(parseClientMessage(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }), 'json')).toEqual({
      type: 'resize',
      cols: 120,
      rows: 40,
    });
  });

  test('builds structured json events for output, exit, and reopen detection', () => {
    expect(buildServerMessage('json', { type: 'output', data: 'hello' })).toBe(
      JSON.stringify({ type: 'output', data: 'hello' })
    );
    expect(buildServerMessage('json', { type: 'exit', exitCode: 1, signal: null })).toBe(
      JSON.stringify({ type: 'exit', exitCode: 1, signal: null })
    );
    expect(buildServerMessage('json', { type: 'opencode-session-detected', sessionId: 'ses_123' })).toBe(
      JSON.stringify({ type: 'opencode-session-detected', sessionId: 'ses_123' })
    );
  });

  test('detects OpenCode session ids from input and output streams', () => {
    expect(detectOpenCodeSessionId('opencode --session ses_abc123\r')).toBe('ses_abc123');
    expect(detectOpenCodeSessionId('Attached to ses_abc123 successfully')).toBe('ses_abc123');
    expect(detectOpenCodeSessionId('plain shell output')).toBeNull();
  });
});

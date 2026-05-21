const {
  buildHistoryReplay,
  buildServerMessage,
  filterTerminalOutputForSession,
  updateSessionModeFromInput,
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

  test('filters shell terminal response noise for shell sessions only', () => {
    const session = { mode: 'shell', historyEnabled: true };
    const noisy = 'prompt\u001b[?1;2c\u001b[>0;276;0c ok';

    expect(filterTerminalOutputForSession(session, noisy)).toBe('prompt ok');
    expect(filterTerminalOutputForSession({ mode: 'tui', historyEnabled: false }, noisy)).toBe(noisy);
  });

  test('builds replay without stripped terminal responses for shell sessions', () => {
    const session = { mode: 'shell', historyEnabled: true, history: ['a', '\u001b[?1;2c', 'b', '\u001b[>0;276;0c'] };

    expect(buildHistoryReplay(session)).toBe('ab');
    expect(buildHistoryReplay({ mode: 'tui', historyEnabled: false, history: ['raw', '\u001b[?1;2c'] })).toBe('');
  });

  test('switches to tui mode conservatively for opencode and hermes commands', () => {
    const shellSession = { mode: 'shell', historyEnabled: true, history: ['shell'], pendingInput: '' };
    updateSessionModeFromInput(shellSession, 'opencode --session ses_123\r');

    expect(shellSession.mode).toBe('tui');
    expect(shellSession.historyEnabled).toBe(false);
    expect(shellSession.history).toEqual([]);

    const untouchedSession = { mode: 'shell', historyEnabled: true, history: ['shell'], pendingInput: '' };
    updateSessionModeFromInput(untouchedSession, 'echo opencode-docs\r');

    expect(untouchedSession.mode).toBe('shell');
    expect(untouchedSession.historyEnabled).toBe(true);
    expect(untouchedSession.history).toEqual(['shell']);
  });
});

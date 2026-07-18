const {
  buildHistoryReplay,
  buildServerMessage,
  filterTerminalOutputForSession,
  updateSessionModeFromInput,
  detectOpenCodeSessionId,
  detectOpenCodeTuiReady,
  getTransportMode,
  parseClientMessage,
} = require('../../sidecar-backend/sessionTransport');

describe('sidecar session transport contract', () => {
  test('uses json transport for the production sidecar tty path', () => {
    expect(getTransportMode('/tty?sessionId=p1')).toBe('json');
    expect(getTransportMode('/?sessionId=p1')).toBe('raw');
  });

  test('parses json transport input and resize messages', () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'input', data: 'opencode --session ses_123\r' }),
        'json'
      )
    ).toEqual({
      type: 'input',
      data: 'opencode --session ses_123\r',
    });
    expect(
      parseClientMessage(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }), 'json')
    ).toEqual({
      type: 'resize',
      cols: 120,
      rows: 40,
    });
  });

  test('keeps panel-focus and session-meta as control frames (not PTY input)', () => {
    // Regression: these used to fall through to `{ type: 'input', data: <json> }`,
    // so every focus/connect injected {"type":"panel-focus",...} into the shell.
    expect(
      parseClientMessage(JSON.stringify({ type: 'panel-focus', focused: true }), 'json')
    ).toEqual({ type: 'panel-focus', focused: true });
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'session-meta', launchCommand: 'opencode' }),
        'json'
      )
    ).toEqual({ type: 'session-meta', launchCommand: 'opencode' });
  });

  test('builds structured json events for output, exit, and reopen detection', () => {
    expect(buildServerMessage('json', { type: 'output', data: 'hello' })).toBe(
      JSON.stringify({ type: 'output', data: 'hello' })
    );
    expect(buildServerMessage('json', { type: 'exit', exitCode: 1, signal: null })).toBe(
      JSON.stringify({ type: 'exit', exitCode: 1, signal: null })
    );
    expect(
      buildServerMessage('json', { type: 'opencode-session-detected', sessionId: 'ses_123' })
    ).toBe(JSON.stringify({ type: 'opencode-session-detected', sessionId: 'ses_123' }));
  });

  test('detects OpenCode session ids from input and output streams', () => {
    expect(detectOpenCodeSessionId('opencode --session ses_abc123\r')).toBe('ses_abc123');
    expect(detectOpenCodeSessionId('Attached to ses_abc123 successfully')).toBe('ses_abc123');
    expect(detectOpenCodeSessionId('plain shell output')).toBeNull();
  });

  test('detects OpenCode TUI footer as ready-for-input signal', () => {
    expect(detectOpenCodeTuiReady('ctrl+p commands  esc interrupt')).toBe(true);
    expect(detectOpenCodeTuiReady('still loading...')).toBe(false);
  });

  test('filters terminal response noise in all session modes', () => {
    // Contract change (deliberate): filtering used to be shell-only, which
    // leaked "1;2c0;276;0c" garbage into opencode/hermes TUI panels on focus.
    // The regex only matches terminal response sequences, so it is safe to
    // apply in tui mode too. See filterTerminalOutputForSession in
    // sidecar-backend/sessionTransport.js.
    const noisy = 'prompt\u001b[?1;2c\u001b[>0;276;0c ok';

    expect(filterTerminalOutputForSession({ mode: 'shell', historyEnabled: true }, noisy)).toBe(
      'prompt ok'
    );
    expect(filterTerminalOutputForSession({ mode: 'tui', historyEnabled: false }, noisy)).toBe(
      'prompt ok'
    );
  });

  test('builds replay without stripped terminal responses for shell sessions', () => {
    const session = {
      mode: 'shell',
      historyEnabled: true,
      history: ['a', '\u001b[?1;2c', 'b', '\u001b[>0;276;0c'],
    };

    expect(buildHistoryReplay(session)).toBe('ab');
    expect(
      buildHistoryReplay({ mode: 'tui', historyEnabled: false, history: ['raw', '\u001b[?1;2c'] })
    ).toBe('');
  });

  test('switches to tui mode per the shared agentTuiMetadata contract', () => {
    // Detection delegates to sidecar-backend/agentTuiMetadata.js (mirror of
    // src/lib/terminal/agentTuiMetadata.shared.js) which uses word-boundary
    // matching: any input containing the standalone word "opencode" (including
    // "opencode-docs", since "-" is a boundary) flips the session to tui.
    const shellSession = {
      mode: 'shell',
      historyEnabled: true,
      history: ['shell'],
      pendingInput: '',
    };
    updateSessionModeFromInput(shellSession, 'opencode --session ses_123\r');

    expect(shellSession.mode).toBe('tui');
    expect(shellSession.historyEnabled).toBe(false);
    expect(shellSession.history).toEqual([]);

    const untouchedSession = {
      mode: 'shell',
      historyEnabled: true,
      history: ['shell'],
      pendingInput: '',
    };
    updateSessionModeFromInput(untouchedSession, 'git status\r');

    expect(untouchedSession.mode).toBe('shell');
    expect(untouchedSession.historyEnabled).toBe(true);
    expect(untouchedSession.history).toEqual(['shell']);
  });
});

const {
  buildAgentStateFrame,
  buildHistoryReplay,
  buildServerMessage,
  countTypedAgentShellPromptLines,
  detectAntigravityTuiReady,
  filterTerminalOutputForSession,
  reapTypedAgentSessionIfExited,
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

  test('marks typed agent launches with agentLaunchOrigin=typed (W7 reaper gate)', () => {
    const session = { mode: 'shell', historyEnabled: true, history: [], pendingInput: '' };
    updateSessionModeFromInput(session, 'agy\r');
    expect(session.agentType).toBe('agy');
    expect(session.agentLaunchOrigin).toBe('typed');

    // A second detection while the agent is already active must not
    // re-tag the origin (e.g. typing "agy" inside the agy prompt).
    session.agentLaunchOrigin = 'output';
    updateSessionModeFromInput(session, 'agy\r');
    expect(session.agentLaunchOrigin).toBe('output');
  });
});

describe('sidecar buildAgentStateFrame (N4/N5 schema)', () => {
  test('builds the base shape and optional fields only when defined', () => {
    expect(buildAgentStateFrame({ agentTuiStateAt: 10 }, 'running')).toEqual({
      type: 'agent-state',
      agentTuiState: 'running',
      at: 10,
    });

    const frame = buildAgentStateFrame(
      { agentType: 'agy', agentTuiStateAt: 10, _lastAgentStateEvent: { wasCancelled: true } },
      'idle'
    );
    expect(frame.agentType).toBe('agy');
    expect(frame.wasCancelled).toBe(true);
    expect(frame).not.toHaveProperty('reason');

    const noExtras = buildAgentStateFrame({ agentTuiStateAt: 10 }, 'idle');
    expect(noExtras).not.toHaveProperty('agentType');
    expect(noExtras).not.toHaveProperty('wasCancelled');
    expect(Object.values(noExtras)).not.toContain(null);
  });

  test('supports terminal frames with explicit reason and agentType override', () => {
    const frame = buildAgentStateFrame({ agentType: null }, 'idle', {
      reason: 'exit',
      agentType: 'agy',
      at: 42,
    });
    expect(frame).toEqual({
      type: 'agent-state',
      agentTuiState: 'idle',
      at: 42,
      agentType: 'agy',
      reason: 'exit',
    });
    expect(buildAgentStateFrame({}, null)).toBeNull();
  });
});

describe('sidecar typed-agent child-exit reaper (W7)', () => {
  function makeTypedAgySession() {
    return {
      id: 's1',
      mode: 'tui',
      historyEnabled: false,
      agentType: 'agy',
      agentSessionId: 'agy-s1',
      agentTuiState: 'running',
      agentTuiStateAt: 1000,
      agentLaunchOrigin: 'typed',
      hookState: null,
      lastWorkingAt: 1000,
    };
  }

  test('detectAntigravityTuiReady matches agy chrome', () => {
    expect(detectAntigravityTuiReady('? for shortcuts')).toBe(true);
    expect(detectAntigravityTuiReady('accept-edits · Gemini 3.5 Flash')).toBe(true);
    expect(detectAntigravityTuiReady('esc to cancel')).toBe(true);
    expect(detectAntigravityTuiReady('antigravity>')).toBe(true);
    expect(detectAntigravityTuiReady('plain shell output')).toBe(false);
  });

  test('countTypedAgentShellPromptLines recognizes common prompts, not PS2', () => {
    expect(countTypedAgentShellPromptLines('PS C:\\Users\\PC> ')).toBe(1);
    expect(countTypedAgentShellPromptLines('C:\\dev\\devhub>')).toBe(1);
    expect(countTypedAgentShellPromptLines('user@host:~/repo$ ')).toBe(1);
    expect(countTypedAgentShellPromptLines('/home/user$')).toBe(1);
    expect(countTypedAgentShellPromptLines('$')).toBe(1);
    // Bash PS2 continuation must NOT count (it matches the agy idle rule too).
    expect(countTypedAgentShellPromptLines('> ')).toBe(0);
    expect(countTypedAgentShellPromptLines('some regular output')).toBe(0);
  });

  test('reaps only after 2 prompt lines spanning the quiet window', () => {
    const session = makeTypedAgySession();
    const t0 = 10_000;

    // Single prompt line — no reap.
    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0)).toBeNull();
    expect(session.agentType).toBe('agy');

    // Second line too soon after the first — no reap (needs >= 3s span).
    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0 + 500)).toBeNull();
    expect(session.agentType).toBe('agy');

    // Second prompt-looking chunk after the quiet window — reap fires.
    const frame = reapTypedAgentSessionIfExited(session, 'output\nPS C:\\Users\\PC> ', t0 + 4000);
    expect(frame).toMatchObject({
      type: 'agent-state',
      agentTuiState: 'idle',
      agentType: 'agy',
      reason: 'agent-exit',
    });
    expect(session.agentType).toBeNull();
    expect(session.mode).toBe('shell');
    expect(session.tuiReady).toBe(false);
    expect(session.historyEnabled).toBe(true);
    expect(session.agentLaunchOrigin).toBeNull();
  });

  test('agent chrome in fresh output resets the reaper', () => {
    const session = makeTypedAgySession();
    const t0 = 10_000;

    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0)).toBeNull();
    expect(reapTypedAgentSessionIfExited(session, 'esc to cancel', t0 + 1000)).toBeNull();
    // Counter was reset; the next prompt line is line #1 of a new window.
    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0 + 5000)).toBeNull();
    expect(session.agentType).toBe('agy');
    expect(session._typedAgentReaper.promptLines).toBe(1);
  });

  test('recent working signals block the reap (quiet window gate)', () => {
    const session = makeTypedAgySession();
    const t0 = 10_000;

    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0)).toBeNull();
    // Simulate visible working output arriving between prompt lines.
    session.lastWorkingAt = t0 + 3500;
    expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0 + 4000)).toBeNull();
    expect(session.agentType).toBe('agy');
  });

  test('never reaps non-typed launch origins', () => {
    for (const origin of ['initialCommand', 'output', null, undefined]) {
      const session = makeTypedAgySession();
      session.agentLaunchOrigin = origin;
      const t0 = 10_000;
      expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0)).toBeNull();
      expect(reapTypedAgentSessionIfExited(session, 'PS C:\\Users\\PC> ', t0 + 5000)).toBeNull();
      expect(session.agentType).toBe('agy');
    }
  });
});

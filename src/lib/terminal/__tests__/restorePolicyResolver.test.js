const {
  extractOpenCodeSessionId,
  inferPanelSessionKind,
  isSwarmLaunchWrapperCommand,
  resolveEffectiveRestorePolicy,
  resolveOpenCodeSessionIdForPanel,
  normalizeOpenCodePanelCommand,
  normalizeProviderPanelCommand,
  normalizeWorkspacesOpenCodeCommands,
  shouldPersistOpenCodeSessionForPanel,
  resolveTerminalInjectCommand,
  readAgentRunForPanel,
  buildProviderResumeCommand,
  getProviderContinueCommand,
  extractProviderSessionIdFromCommand,
  resolveAgentSessionIdForPanel,
  mapAgentTypeToRestoreKind,
  isAgentProviderKind,
} = require('../restorePolicyResolver');
const { RESTORE_POLICY } = require('../restorePreferences');

describe('restorePolicyResolver', () => {
  test('extractOpenCodeSessionId parses durable command', () => {
    expect(extractOpenCodeSessionId('opencode --session abc-123')).toBe('abc-123');
  });

  test('resolveEffectiveRestorePolicy prefers per-session policy', () => {
    expect(
      resolveEffectiveRestorePolicy({
        sessionKind: 'opencode',
        perSessionPolicy: 'manual',
        preferences: { opencode: 'auto', generic: 'auto', swarm: 'auto' },
      })
    ).toBe('manual');
  });

  test('resolveEffectiveRestorePolicy falls back to workspace default', () => {
    expect(
      resolveEffectiveRestorePolicy({
        sessionKind: 'opencode',
        perSessionPolicy: null,
        preferences: { opencode: 'off', generic: 'auto', swarm: 'auto' },
      })
    ).toBe('off');
  });

  test('normalizeOpenCodePanelCommand upgrades plain opencode to session command', () => {
    const panel = normalizeOpenCodePanelCommand(
      { id: 'p1', initialCommand: 'opencode' },
      { opencodeSessionId: 'sess-9' }
    );
    expect(panel.initialCommand).toBe('opencode --session sess-9');
  });

  test('normalizeOpenCodePanelCommand upgrades Zed/bash launch wrapper when session id is known', () => {
    const panel = normalizeOpenCodePanelCommand(
      { id: 'p1', initialCommand: 'bash /tmp/devhub-launch-launch-1-zed.sh' },
      { opencodeSessionId: 'oc-zed-1' }
    );
    expect(panel.initialCommand).toBe('opencode --session oc-zed-1');
  });

  test('resolveTerminalInjectCommand resumes OpenCode instead of re-sending bash wrapper', () => {
    expect(
      resolveTerminalInjectCommand('bash /tmp/devhub-launch-launch-1-zed.sh', {
        opencodeSessionId: 'oc-zed-1',
      })
    ).toBe('opencode --session oc-zed-1');
  });

  test('resolveTerminalInjectCommand skips one-shot launch wrapper without session id', () => {
    expect(
      resolveTerminalInjectCommand('bash /tmp/devhub-launch-launch-1-zed.sh', null)
    ).toBeNull();
  });

  test('fresh swarm launch uses wrapper command in TerminalTTY (not resolveTerminalInjectCommand)', () => {
    const wrapper = 'bash /tmp/devhub-launch-launch-1-zed.sh';
    expect(resolveTerminalInjectCommand(wrapper, null)).toBeNull();
    expect(isSwarmLaunchWrapperCommand(wrapper)).toBe(true);
  });

  test('readAgentRunForPanel returns newest run for panel', () => {
    const storage = {
      getItem: jest.fn(() =>
        JSON.stringify({
          old: { panelId: 'p1', opencodeSessionId: 'oc-old', launchedAt: 1 },
          fresh: { panelId: 'p1', opencodeSessionId: 'oc-new', launchedAt: 99 },
        })
      ),
    };

    expect(readAgentRunForPanel(storage, 'p1')?.opencodeSessionId).toBe('oc-new');
  });

  test('normalizeWorkspacesOpenCodeCommands applies agent run session ids', () => {
    const workspaces = normalizeWorkspacesOpenCodeCommands(
      [
        {
          id: 'ws1',
          columns: [{ id: 'c1', panels: [{ id: 'p1', initialCommand: 'opencode' }] }],
        },
      ],
      { p1: { opencodeSessionId: 'oc-1' } }
    );

    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe('opencode --session oc-1');
  });

  test('shouldPersistOpenCodeSessionForPanel allows provider switch, blocks only swarm', () => {
    // Cross-provider switch in the same panel: the detected opencode session
    // must REPLACE the previous provider binding (events are panel-local).
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p1', initialCommand: 'grok' }, null)).toBe(
      true
    );
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p2', initialCommand: 'hermes' }, null)).toBe(
      true
    );
    expect(
      shouldPersistOpenCodeSessionForPanel(
        { id: 'p3', initialCommand: 'opencode --session oc-1' },
        null
      )
    ).toBe(true);
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p4', initialCommand: null }, null)).toBe(
      true
    );
    expect(shouldPersistOpenCodeSessionForPanel(null, null)).toBe(false);
    expect(
      shouldPersistOpenCodeSessionForPanel(
        { id: 'p5', initialCommand: 'bash' },
        { launchOrigin: 'swarm-control-launch' }
      )
    ).toBe(false);
  });

  test('inferPanelSessionKind detects swarm runs', () => {
    expect(
      inferPanelSessionKind({
        initialCommand: 'bash',
        agentRun: { launchOrigin: 'swarm-control-launch' },
      })
    ).toBe('swarm');
  });

  test('invalid per-session policy uses global opencode default', () => {
    expect(
      resolveEffectiveRestorePolicy({
        sessionKind: 'opencode',
        perSessionPolicy: 'bogus',
        preferences: { opencode: RESTORE_POLICY.MANUAL, generic: 'auto', swarm: 'auto' },
      })
    ).toBe(RESTORE_POLICY.MANUAL);
  });

  test('resolveOpenCodeSessionIdForPanel prefers agent run over stale panel command', () => {
    expect(
      resolveOpenCodeSessionIdForPanel({
        panel: { id: 'p1', initialCommand: 'bash /tmp/devhub-launch-launch-1-zed.sh' },
        agentRun: { opencodeSessionId: 'from-run' },
      })
    ).toBe('from-run');

    expect(
      resolveOpenCodeSessionIdForPanel({
        panel: { id: 'p1', initialCommand: 'opencode --session from-cmd' },
        agentRun: { opencodeSessionId: 'from-run' },
      })
    ).toBe('from-run');
  });
});

describe('restorePolicyResolver — multiprovider kinds', () => {
  test('inferPanelSessionKind maps verified provider commands to their own kind', () => {
    expect(inferPanelSessionKind({ initialCommand: 'kimi' })).toBe('kimi');
    expect(inferPanelSessionKind({ initialCommand: 'kimi --session abc' })).toBe('kimi');
    expect(inferPanelSessionKind({ initialCommand: 'grok' })).toBe('grok');
    expect(inferPanelSessionKind({ initialCommand: 'grok --session-id u-1' })).toBe('grok');
    expect(inferPanelSessionKind({ initialCommand: 'codex' })).toBe('codex');
    expect(inferPanelSessionKind({ initialCommand: 'codex resume cx-1' })).toBe('codex');
    expect(inferPanelSessionKind({ initialCommand: 'qodercli --resume q-1' })).toBe('qoder');
    expect(inferPanelSessionKind({ initialCommand: 'qodercli --session-id q-2' })).toBe('qoder');
  });

  test('inferPanelSessionKind keeps generic for unknown or unmapped agent types', () => {
    expect(inferPanelSessionKind({ initialCommand: 'bash' })).toBe('generic');
    expect(inferPanelSessionKind({ initialCommand: 'claude' })).toBe('generic');
    expect(inferPanelSessionKind({ initialCommand: 'hermes' })).toBe('generic');
    expect(inferPanelSessionKind({ initialCommand: null })).toBe('generic');
  });

  test('inferPanelSessionKind checks swarm signals before provider commands', () => {
    expect(
      inferPanelSessionKind({
        initialCommand: 'kimi --session abc',
        panel: { swarmContext: { isSwarmRole: true, launchId: 'l-1', roleKey: 'coder' } },
      })
    ).toBe('swarm');
    expect(
      inferPanelSessionKind({
        initialCommand: 'grok',
        agentRun: { launchOrigin: 'swarm-control-launch' },
      })
    ).toBe('swarm');
  });

  test('mapAgentTypeToRestoreKind maps qodercli to qoder and ignores others', () => {
    expect(mapAgentTypeToRestoreKind('qodercli')).toBe('qoder');
    expect(mapAgentTypeToRestoreKind('kimi')).toBe('kimi');
    expect(mapAgentTypeToRestoreKind('claude')).toBeNull();
    expect(mapAgentTypeToRestoreKind(null)).toBeNull();
    expect(isAgentProviderKind('qoder')).toBe(true);
    expect(isAgentProviderKind('qodercli')).toBe(true);
    expect(isAgentProviderKind('generic')).toBe(false);
    expect(isAgentProviderKind('swarm')).toBe(false);
  });

  test('buildProviderResumeCommand emits the verified resume forms', () => {
    expect(buildProviderResumeCommand('opencode', 'oc-1')).toBe('opencode --session oc-1');
    expect(buildProviderResumeCommand('kimi', 'k-1')).toBe('kimi --session k-1');
    expect(buildProviderResumeCommand('grok', 'g-1')).toBe('grok --resume g-1');
    expect(buildProviderResumeCommand('codex', 'c-1')).toBe('codex resume c-1');
    expect(buildProviderResumeCommand('qoder', 'q-1')).toBe('qodercli --resume q-1');
    expect(buildProviderResumeCommand('qodercli', 'q-1')).toBe('qodercli --resume q-1');
    expect(buildProviderResumeCommand('generic', 'x')).toBeNull();
    expect(buildProviderResumeCommand('kimi', '')).toBeNull();
  });

  test('getProviderContinueCommand returns verified continue forms, null for opencode', () => {
    expect(getProviderContinueCommand('kimi')).toBe('kimi --continue');
    expect(getProviderContinueCommand('grok')).toBe('grok --continue');
    expect(getProviderContinueCommand('codex')).toBe('codex resume --last');
    expect(getProviderContinueCommand('qoder')).toBe('qodercli --continue');
    expect(getProviderContinueCommand('opencode')).toBeNull();
    expect(getProviderContinueCommand('generic')).toBeNull();
  });

  test('extractProviderSessionIdFromCommand parses resume and pre-assign forms', () => {
    expect(extractProviderSessionIdFromCommand('kimi', 'kimi --session k-9')).toBe('k-9');
    expect(extractProviderSessionIdFromCommand('codex', 'codex resume cx-9')).toBe('cx-9');
    expect(extractProviderSessionIdFromCommand('qoder', 'qodercli --resume q-9')).toBe('q-9');
    expect(extractProviderSessionIdFromCommand('grok', 'grok --resume g-9')).toBe('g-9');
    expect(extractProviderSessionIdFromCommand('grok', 'grok --session-id g-pre')).toBe('g-pre');
    expect(extractProviderSessionIdFromCommand('qoder', 'qodercli --session-id q-pre')).toBe(
      'q-pre'
    );
    expect(extractProviderSessionIdFromCommand('kimi', 'kimi')).toBeNull();
    expect(extractProviderSessionIdFromCommand(null, 'kimi --session k-9')).toBeNull();
  });

  test('resolveAgentSessionIdForPanel prefers bound agent run fields over the command', () => {
    expect(
      resolveAgentSessionIdForPanel({
        provider: 'kimi',
        initialCommand: 'kimi --session from-cmd',
        agentRun: { kimiSessionId: 'from-run' },
      })
    ).toBe('from-run');
    expect(
      resolveAgentSessionIdForPanel({
        provider: 'grok',
        initialCommand: 'grok',
        agentRun: { agentSessionId: 'g-bound' },
      })
    ).toBe('g-bound');
    expect(
      resolveAgentSessionIdForPanel({
        provider: 'qoder',
        agentRun: { qodercliSessionId: 'q-bound' },
      })
    ).toBe('q-bound');
    expect(
      resolveAgentSessionIdForPanel({ provider: 'grok', initialCommand: 'grok', agentRun: null })
    ).toBeNull();
  });

  test('resolveTerminalInjectCommand emits provider resume forms when the id is known', () => {
    expect(resolveTerminalInjectCommand('kimi', { kimiSessionId: 'k-1' })).toBe(
      'kimi --session k-1'
    );
    expect(resolveTerminalInjectCommand('grok --session-id g-1', null)).toBe('grok --resume g-1');
    expect(resolveTerminalInjectCommand('qodercli --session-id q-1', null)).toBe(
      'qodercli --resume q-1'
    );
    expect(resolveTerminalInjectCommand('codex resume c-1', null)).toBe('codex resume c-1');
  });

  test('resolveTerminalInjectCommand keeps plain commands when no id is known', () => {
    expect(resolveTerminalInjectCommand('kimi', null)).toBe('kimi');
    expect(resolveTerminalInjectCommand('grok', null)).toBe('grok');
  });

  test('resolveTerminalInjectCommand omits cd when the PTY already starts in the session cwd', () => {
    expect(
      resolveTerminalInjectCommand(
        'qodercli --resume q-1',
        { qoderSessionId: 'q-1', agentSessionCwd: 'D:\\devhub' },
        'D:\\devhub'
      )
    ).toBe('qodercli --resume q-1');

    expect(
      resolveTerminalInjectCommand(
        'qodercli --resume q-1',
        { qoderSessionId: 'q-1', agentSessionCwd: 'd:/devhub/' },
        'D:\\devhub'
      )
    ).toBe('qodercli --resume q-1');

    expect(
      resolveTerminalInjectCommand('qodercli --resume q-1', { qoderSessionId: 'q-1' }, 'D:\\devhub')
    ).toBe('qodercli --resume q-1');
  });

  test('resolveTerminalInjectCommand uses shell-portable cd when the cwd differs', () => {
    expect(
      resolveTerminalInjectCommand(
        'qodercli --resume q-1',
        { qoderSessionId: 'q-1', agentSessionCwd: 'D:\\devhub' },
        'C:\\Users\\PC'
      )
    ).toBe('cd "D:\\devhub"; qodercli --resume q-1');

    expect(
      resolveTerminalInjectCommand(
        'kimi',
        { kimiSessionId: 'k-1', agentSessionCwd: '/home/me/app' },
        '/home/me'
      )
    ).toBe('cd "/home/me/app"; kimi --session k-1');
  });

  test('normalizeProviderPanelCommand upgrades provider launch commands to resume form', () => {
    const kimiPanel = normalizeProviderPanelCommand(
      { id: 'p1', initialCommand: 'kimi' },
      { kimiSessionId: 'k-7' }
    );
    expect(kimiPanel.initialCommand).toBe('kimi --session k-7');

    const grokPanel = normalizeProviderPanelCommand({
      id: 'p2',
      initialCommand: 'grok --session-id g-7',
    });
    expect(grokPanel.initialCommand).toBe('grok --resume g-7');

    const codexPanel = normalizeProviderPanelCommand(
      { id: 'p3', initialCommand: 'codex' },
      {
        agentSessionId: 'c-7',
      }
    );
    expect(codexPanel.initialCommand).toBe('codex resume c-7');

    const untouched = normalizeProviderPanelCommand({ id: 'p4', initialCommand: 'bash' }, null);
    expect(untouched.initialCommand).toBe('bash');

    const noId = normalizeProviderPanelCommand({ id: 'p5', initialCommand: 'kimi' }, null);
    expect(noId.initialCommand).toBe('kimi');
  });

  test('normalizeOpenCodePanelCommand alias still upgrades opencode panels', () => {
    const panel = normalizeOpenCodePanelCommand(
      { id: 'p1', initialCommand: 'opencode' },
      { opencodeSessionId: 'oc-alias' }
    );
    expect(panel.initialCommand).toBe('opencode --session oc-alias');
  });
});

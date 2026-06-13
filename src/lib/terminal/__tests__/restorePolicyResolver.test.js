const {
  extractOpenCodeSessionId,
  inferPanelSessionKind,
  isSwarmLaunchWrapperCommand,
  resolveEffectiveRestorePolicy,
  resolveOpenCodeSessionIdForPanel,
  normalizeOpenCodePanelCommand,
  normalizeWorkspacesOpenCodeCommands,
  shouldPersistOpenCodeSessionForPanel,
  resolveTerminalInjectCommand,
  readAgentRunForPanel,
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

  test('shouldPersistOpenCodeSessionForPanel blocks grok/hermes panels', () => {
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p1', initialCommand: 'grok' }, null)).toBe(
      false
    );
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p1b', initialCommand: 'groc' }, null)).toBe(
      false
    );
    expect(shouldPersistOpenCodeSessionForPanel({ id: 'p2', initialCommand: 'hermes' }, null)).toBe(
      false
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

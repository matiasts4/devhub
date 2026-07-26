/**
 * startupRestoreCoordinator.multiprovider.test.js
 *
 * Phase 3 (terminal-multiprovider-session-resume): provider-aware manifest
 * entries (agentType/agentSessionId), RESUME_AGENT_SESSION plan actions, and
 * the swarm tmux-evidence gate.
 */

const {
  RESTORE_ACTION,
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
} = require('../startupRestoreCoordinator');

function emptyRuntime(overrides = {}) {
  return { terminals: [], processes: [], anomalies: {}, tmuxSessions: [], ...overrides };
}

function workspaceWithPanel(panel) {
  return [
    {
      id: 'ws1',
      name: 'Workspace 1',
      columns: [{ id: 'c1', panels: [panel] }],
    },
  ];
}

describe('buildRestoreManifestFromWorkspaceState — provider metadata', () => {
  test('kimi panel with a bound id gains agentType/agentSessionId and a resume command', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({ id: 'p1', initialCommand: 'kimi', cwd: '/tmp' }),
      agentRunsByPanel: { p1: { panelId: 'p1', kimiSessionId: 'k-bound' } },
    });

    const session = manifest.terminalSessions[0];
    expect(session.sessionKind).toBe('kimi');
    expect(session.agentType).toBe('kimi');
    expect(session.agentSessionId).toBe('k-bound');
    expect(session.initialCommand).toBe('kimi --session k-bound');
  });

  test('grok pre-assign launch form is normalized to the resume form', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({ id: 'p1', initialCommand: 'grok --session-id g-pre' }),
    });

    const session = manifest.terminalSessions[0];
    expect(session.sessionKind).toBe('grok');
    expect(session.agentType).toBe('grok');
    expect(session.agentSessionId).toBe('g-pre');
    expect(session.initialCommand).toBe('grok --resume g-pre');
  });

  test('codex resume command keeps its id; qodercli pre-assign normalizes', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          columns: [
            {
              id: 'c1',
              panels: [
                { id: 'p1', initialCommand: 'codex resume cx-1' },
                { id: 'p2', initialCommand: 'qodercli --session-id q-pre' },
              ],
            },
          ],
        },
      ],
    });

    const codex = manifest.terminalSessions.find((s) => s.terminalId === 'p1');
    expect(codex.sessionKind).toBe('codex');
    expect(codex.agentSessionId).toBe('cx-1');
    expect(codex.initialCommand).toBe('codex resume cx-1');

    const qoder = manifest.terminalSessions.find((s) => s.terminalId === 'p2');
    expect(qoder.sessionKind).toBe('qoder');
    expect(qoder.agentType).toBe('qoder');
    expect(qoder.agentSessionId).toBe('q-pre');
    expect(qoder.initialCommand).toBe('qodercli --resume q-pre');
  });

  test('provider panel without a known id keeps initialCommand for the continue fallback', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({ id: 'p1', initialCommand: 'kimi', cwd: '/tmp' }),
    });

    const session = manifest.terminalSessions[0];
    expect(session.agentType).toBe('kimi');
    expect(session.agentSessionId).toBeNull();
    expect(session.initialCommand).toBe('kimi');
  });

  test('generic and swarm panels carry no provider metadata', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({ id: 'p1', initialCommand: 'bash', cwd: '/tmp' }),
    });

    const session = manifest.terminalSessions[0];
    expect(session.sessionKind).toBe('generic');
    expect(session.agentType).toBeNull();
    expect(session.agentSessionId).toBeNull();
  });
});

describe('buildStartupRestorePlan — RESUME_AGENT_SESSION', () => {
  test('kimi panel with bound id emits RESUME_AGENT_SESSION with provider and id', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({
        id: 'p1',
        initialCommand: 'kimi --session k-1',
        cwd: '/tmp',
      }),
    });

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot: emptyRuntime() });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        action: RESTORE_ACTION.RESUME_AGENT_SESSION,
        terminalId: 'p1',
        provider: 'kimi',
        agentSessionId: 'k-1',
        sessionKind: 'kimi',
        reason: 'agent-session-resume-needed',
      })
    );
  });

  test.each([
    ['kimi', 'kimi'],
    ['grok', 'grok'],
    ['codex', 'codex'],
    ['qodercli', 'qoder'],
  ])(
    '%s panel without id emits RESUME_AGENT_SESSION with the continue fallback reason',
    (command, provider) => {
      const manifest = buildRestoreManifestFromWorkspaceState({
        workspaces: workspaceWithPanel({ id: 'p1', initialCommand: command, cwd: '/tmp' }),
      });

      const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot: emptyRuntime() });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0]).toEqual(
        expect.objectContaining({
          action: RESTORE_ACTION.RESUME_AGENT_SESSION,
          provider,
          agentSessionId: null,
          reason: 'agent-session-continue-fallback',
        })
      );
    }
  );

  test('opencode panels keep emitting the legacy RESUME_OPENCODE_SESSION action', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({
        id: 'p1',
        initialCommand: 'opencode --session oc-1',
        cwd: '/tmp',
      }),
    });

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot: emptyRuntime() });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
    expect(RESTORE_ACTION.RESUME_AGENT_SESSION).toBe('resume-agent-session');
    expect(RESTORE_ACTION.RESUME_OPENCODE_SESSION).toBe('resume-opencode-session');
  });

  test('provider panels do not emit RESTORE_SHELL_EMERGENT', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({ id: 'p1', initialCommand: 'codex', cwd: '/tmp' }),
    });

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot: emptyRuntime() });

    expect(
      plan.actions.some((action) => action.action === RESTORE_ACTION.RESTORE_SHELL_EMERGENT)
    ).toBe(false);
  });

  test('policy gating still applies: manual provider panel becomes TERMINATED, off emits nothing', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          columns: [
            {
              id: 'c1',
              panels: [
                { id: 'p1', initialCommand: 'kimi --session k-1', cwd: '/tmp' },
                { id: 'p2', initialCommand: 'grok', cwd: '/tmp' },
              ],
            },
          ],
        },
      ],
      agentRunsByPanel: {
        p1: { panelId: 'p1', restorePolicy: 'manual' },
        p2: { panelId: 'p2', restorePolicy: 'off' },
      },
    });

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot: emptyRuntime() });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        action: RESTORE_ACTION.TERMINATED,
        terminalId: 'p1',
        reason: 'restore-policy-manual',
      })
    );
  });

  test('live runtime terminal still short-circuits provider resume actions', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({
        id: 'p1',
        initialCommand: 'kimi --session k-1',
        cwd: '/tmp',
      }),
    });

    const plan = buildStartupRestorePlan({
      manifest,
      runtimeSnapshot: emptyRuntime({
        terminals: [{ terminalId: 'p1', alive: true, socketCount: 1 }],
      }),
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESTORE_READY);
  });
});

describe('buildStartupRestorePlan — swarm tmux evidence gate', () => {
  function swarmManifest() {
    return buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({
        id: 'p1',
        initialCommand: 'bash /tmp/devhub-launch-launch-abc-coder.sh',
        cwd: '/worktrees/launch-abc/coder',
        swarmContext: { isSwarmRole: true, launchId: 'launch-abc', roleKey: 'coder' },
      }),
      agentRunsByPanel: {
        p1: { panelId: 'p1', launchId: 'launch-abc', swarmRole: 'coder', runId: 'run-1' },
      },
    });
  }

  test('reattaches only when the panel tmux session is present in the snapshot', () => {
    const plan = buildStartupRestorePlan({
      manifest: swarmManifest(),
      runtimeSnapshot: emptyRuntime({ tmuxSessions: ['devhub-swarm-launch-abc-coder'] }),
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL,
        reason: 'swarm-tmux-reattach',
      })
    );
  });

  test('falls through to TERMINATED with swarm-tmux-missing when tmux is gone', () => {
    const plan = buildStartupRestorePlan({
      manifest: swarmManifest(),
      runtimeSnapshot: emptyRuntime({ tmuxSessions: ['devhub-swarm-other-launch-coder'] }),
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        action: RESTORE_ACTION.TERMINATED,
        reason: 'swarm-tmux-missing',
      })
    );
  });

  test('missing tmux evidence still respects off policy (no action emitted)', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: workspaceWithPanel({
        id: 'p1',
        initialCommand: 'bash /tmp/devhub-launch-launch-abc-coder.sh',
        cwd: '/worktrees/launch-abc/coder',
        swarmContext: { isSwarmRole: true, launchId: 'launch-abc', roleKey: 'coder' },
      }),
      agentRunsByPanel: {
        p1: {
          panelId: 'p1',
          launchId: 'launch-abc',
          swarmRole: 'coder',
          runId: 'run-1',
          restorePolicy: 'off',
        },
      },
    });

    const plan = buildStartupRestorePlan({
      manifest,
      runtimeSnapshot: emptyRuntime(),
    });

    expect(plan.actions).toHaveLength(0);
  });
});

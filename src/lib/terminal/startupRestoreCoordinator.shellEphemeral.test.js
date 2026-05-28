/**
 * startupRestoreCoordinator.shellEphemeral.test.js — TDD tests for RESTORE_SHELL_EMERGENT.
 * Tests: buildStartupRestorePlan emits RESTORE_SHELL_EMERGENT for shell-ephemeral entries.
 * Also tests TIC-3: agent runs with panel IDs not in current workspace manifest are excluded.
 */

const {
  RESTORE_ACTION,
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
} = require('./startupRestoreCoordinator');

const { normalizeRestoreManifest } = require('./restoreManifest');

describe('RESTORE_ACTION includes RESTORE_SHELL_EMERGENT', () => {
  it('RESTORE_SHELL_EMERGENT is defined in RESTORE_ACTION enum', () => {
    expect(RESTORE_ACTION.RESTORE_SHELL_EMERGENT).toBe('restore-shell-emergent');
  });
});

describe('buildStartupRestorePlan emits RESTORE_SHELL_EMERGENT for shell-ephemeral', () => {
  it('emits RESTORE_SHELL_EMERGENT when session has cwd but no runtimeTerminal and no opencodeSessionId', () => {
    const manifest = normalizeRestoreManifest({
      workspaces: [{ workspaceId: 'ws1', name: 'Test Workspace', tabs: [], layout: {} }],
      terminalSessions: [
        {
          terminalId: 'p1',
          panelId: 'p1',
          workspaceId: 'ws1',
          cwd: '/home/user/project',
          // sessionType would be shell-ephemeral (no ptyPid, no opencodeSessionId)
          opencodeSessionId: null,
          runId: null,
          launchId: null,
          missionId: null,
        },
      ],
      swarmRuns: [],
    });

    const runtimeSnapshot = {
      terminals: [], // no live terminal for p1
      processes: [],
      anomalies: {},
    };

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

    const shellEmergentActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.RESTORE_SHELL_EMERGENT
    );
    expect(shellEmergentActions).toHaveLength(1);
    expect(shellEmergentActions[0].terminalId).toBe('p1');
    expect(shellEmergentActions[0].reason).toBe('shell-emergent-needs-respawn');
  });

  it('emits RESTORE_READY when runtimeTerminal is alive (not shell-ephemeral)', () => {
    const manifest = normalizeRestoreManifest({
      workspaces: [{ workspaceId: 'ws1', name: 'Test Workspace', tabs: [], layout: {} }],
      terminalSessions: [
        {
          terminalId: 'p1',
          panelId: 'p1',
          workspaceId: 'ws1',
          cwd: '/home/user/project',
          opencodeSessionId: null,
          runId: null,
          launchId: null,
          missionId: null,
        },
      ],
      swarmRuns: [],
    });

    const runtimeSnapshot = {
      terminals: [{ terminalId: 'p1', alive: true, socketCount: 1 }],
      processes: [],
      anomalies: {},
    };

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

    const restoreReadyActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.RESTORE_READY
    );
    expect(restoreReadyActions).toHaveLength(1);
  });

  it('emits RESUME_OPENCODE_SESSION when session has opencodeSessionId (not shell-ephemeral)', () => {
    const manifest = normalizeRestoreManifest({
      workspaces: [{ workspaceId: 'ws1', name: 'Test Workspace', tabs: [], layout: {} }],
      terminalSessions: [
        {
          terminalId: 'p1',
          panelId: 'p1',
          workspaceId: 'ws1',
          cwd: '/home/user/project',
          opencodeSessionId: 'ses_abc123',
          runId: null,
          launchId: null,
          missionId: null,
        },
      ],
      swarmRuns: [],
    });

    const runtimeSnapshot = {
      terminals: [], // no live terminal
      processes: [], // no live process
      anomalies: {},
    };

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

    const opencodeActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.RESUME_OPENCODE_SESSION
    );
    expect(opencodeActions).toHaveLength(1);
    expect(opencodeActions[0].opencodeSessionId).toBe('ses_abc123');
  });

  it('emits REATTACH_LIVE_TERMINAL when session has no cwd and runtimeTerminal is alive with socketCount=0', () => {
    const manifest = normalizeRestoreManifest({
      workspaces: [{ workspaceId: 'ws1', name: 'Test Workspace', tabs: [], layout: {} }],
      terminalSessions: [
        {
          terminalId: 'p1',
          panelId: 'p1',
          workspaceId: 'ws1',
          cwd: null,
          opencodeSessionId: null,
          runId: null,
          launchId: null,
          missionId: null,
        },
      ],
      swarmRuns: [],
    });

    const runtimeSnapshot = {
      terminals: [{ terminalId: 'p1', alive: true, socketCount: 0 }],
      processes: [],
      anomalies: {},
    };

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

    const reattachActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.REATTACH_LIVE_TERMINAL
    );
    expect(reattachActions).toHaveLength(1);
  });

  it('emits RESTORE_SHELL_EMERGENT only for sessions without opencodeSessionId and without live runtimeTerminal', () => {
    // Two sessions: one shell-ephemeral (p1), one with opencodeSessionId (p2)
    const manifest = normalizeRestoreManifest({
      workspaces: [{ workspaceId: 'ws1', name: 'Test Workspace', tabs: [], layout: {} }],
      terminalSessions: [
        {
          terminalId: 'p1',
          panelId: 'p1',
          workspaceId: 'ws1',
          cwd: '/home/user',
          opencodeSessionId: null, // shell-ephemeral
          runId: null,
          launchId: null,
          missionId: null,
        },
        {
          terminalId: 'p2',
          panelId: 'p2',
          workspaceId: 'ws1',
          cwd: '/home/user',
          opencodeSessionId: 'ses_xyz', // opencode-durable
          runId: null,
          launchId: null,
          missionId: null,
        },
      ],
      swarmRuns: [],
    });

    const runtimeSnapshot = {
      terminals: [],
      processes: [],
      anomalies: {},
    };

    const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

    const shellEmergentActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.RESTORE_SHELL_EMERGENT
    );
    const opencodeActions = plan.actions.filter(
      (a) => a.action === RESTORE_ACTION.RESUME_OPENCODE_SESSION
    );

    expect(shellEmergentActions).toHaveLength(1);
    expect(shellEmergentActions[0].terminalId).toBe('p1');

    expect(opencodeActions).toHaveLength(1);
    expect(opencodeActions[0].terminalId).toBe('p2');
  });
});

describe('TIC-3: agent runs with panel IDs not in current workspace manifest are excluded', () => {
  it('excludes agent runs whose panelId is not in current workspace terminalSessions', () => {
    // Note: manifest structure validated by other tests; this test focuses on TIC-3 filtering
    // agentRunsByPanel includes p2 and p3 — which are NOT in the workspace state
    const agentRunsByPanel = {
      p1: { runId: 'run-1', panelId: 'p1', swarmRole: 'director', status: 'active' },
      p2: { runId: 'run-2', panelId: 'p2', swarmRole: 'coder', status: 'active' }, // orphaned
      p3: { runId: 'run-3', panelId: 'p3', swarmRole: 'auditor', status: 'active' }, // orphaned
    };

    // buildRestoreManifestFromWorkspaceState is called — agentRunsByPanel is passed
    const result = buildRestoreManifestFromWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Test Workspace',
          columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: '/home/user' }] }],
        },
      ],
      activeWorkspaceId: 'ws1',
      projectId: 'proj-1',
      appSessionId: 'test-session',
      agentRunsByPanel,
    });

    // The manifest should only include terminalSessions for p1 (which is in the workspace)
    const activePanelIds = new Set(result.terminalSessions.map((s) => s.terminalId));

    expect(activePanelIds.has('p1')).toBe(true);
    expect(activePanelIds.has('p2')).toBe(false);
    expect(activePanelIds.has('p3')).toBe(false);
  });
});

const {
  buildMcpControlCenterSnapshot,
  classifyMcpToolSafety,
} = require('../../src/lib/mcp/control-center');

describe('mcp control center snapshot', () => {
  test('builds a durable-first snapshot with explicit evidence and degraded inventory when live metadata is missing', () => {
    const snapshot = buildMcpControlCenterSnapshot({
      observedAt: '2026-05-19T12:00:00.000Z',
      durable: {
        status: 'healthy',
        freshness: 'current',
        db: { status: 'healthy', reason: 'DevHub runtime tables responded.' },
        workspace: {
          id: 'ws-1',
          status: 'active',
          observed_head: 'abc123',
          evidence_ref: 'workspace://ws-1',
        },
        run: { run_id: 'run-1', status: 'running' },
        artifact: {
          artifact_id: 'artifact-1',
          kind: 'command.exec',
          evidence_ref: 'artifact://run-1/1',
        },
        supervisor: {
          task_id: 'task-1',
          supervisor_state: 'lease_active',
          evidence_ref: 'supervisor://task-1',
        },
      },
      live: {
        reachable: false,
        inventoryAvailable: false,
        runtimeReachable: false,
        reason: 'OpenCode did not expose a live inventory endpoint.',
      },
      attach: {
        available: false,
        reason: 'GTK/VTE attach is not available in this environment.',
      },
      durableTools: [{ name: 'list_projects' }, { name: 'create_task' }],
      configuredServers: [
        {
          name: 'filesystem',
          tools: [{ name: 'read_file', description: 'Read file contents' }],
        },
      ],
    });

    expect(snapshot.observed_at).toBe('2026-05-19T12:00:00.000Z');
    expect(snapshot.authority).toBe('durable');
    expect(snapshot.freshness).toBe('current');

    expect(snapshot.doctor.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'database',
          status: 'healthy',
          authority: 'durable',
          freshness: 'current',
        }),
        expect.objectContaining({
          key: 'inventory',
          status: 'degraded',
          authority: 'configured',
          freshness: 'unknown',
        }),
      ])
    );

    expect(snapshot.list_tools.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'list_projects',
          authority: 'durable',
          control_plane: true,
          safe_action: true,
        }),
        expect.objectContaining({
          name: 'create_task',
          authority: 'durable',
          control_plane: true,
          safe_action: false,
        }),
        expect.objectContaining({
          name: 'read_file',
          authority: 'configured',
          control_plane: false,
          safe_action: false,
        }),
      ])
    );

    expect(snapshot.smoke.status).toBe('degraded');
    expect(snapshot.smoke.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'durable-read-model', status: 'healthy' }),
        expect.objectContaining({ key: 'attach', status: 'unavailable' }),
      ])
    );
  });

  test('marks doctor and smoke unavailable when durable evidence cannot be assembled', () => {
    const snapshot = buildMcpControlCenterSnapshot({
      observedAt: '2026-05-19T12:05:00.000Z',
      durable: {
        status: 'unavailable',
        freshness: 'unknown',
        error: 'better-sqlite3 failed to open the durable database',
      },
      live: {
        reachable: false,
        inventoryAvailable: false,
        runtimeReachable: false,
        reason: 'Live probes skipped because durable reads already failed.',
      },
      attach: {
        available: false,
        reason: 'Attach evidence unavailable.',
      },
      durableTools: [],
      configuredServers: [],
    });

    expect(snapshot.authority).toBe('configured');
    expect(snapshot.freshness).toBe('unknown');
    expect(snapshot.doctor.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'database', status: 'unavailable' }),
        expect.objectContaining({ key: 'permissions', status: 'unavailable' }),
      ])
    );
    expect(snapshot.smoke.status).toBe('fail');
  });

  test('merges durable and live tools while keeping executor-local unsafe verbs outside the control plane', () => {
    const snapshot = buildMcpControlCenterSnapshot({
      observedAt: '2026-05-19T12:10:00.000Z',
      durable: {
        status: 'healthy',
        freshness: 'current',
        db: { status: 'healthy', reason: 'Durable reads available.' },
      },
      live: {
        reachable: true,
        runtimeReachable: true,
        inventoryAvailable: true,
        tools: [
          { server: 'filesystem', name: 'read_file', description: 'Read file contents' },
          { server: 'executor', name: 'custom_observe', description: 'Custom observe tool' },
        ],
      },
      attach: { available: true, reason: 'Attach evidence reachable.' },
      durableTools: [{ name: 'get_project' }, { name: 'update_task' }],
      configuredServers: [],
    });

    expect(snapshot.list_tools.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'get_project', authority: 'durable', safe_action: true }),
        expect.objectContaining({ name: 'update_task', authority: 'durable', safe_action: false }),
        expect.objectContaining({
          name: 'read_file',
          authority: 'live',
          control_plane: false,
          safe_action: false,
        }),
        expect.objectContaining({
          name: 'custom_observe',
          authority: 'live',
          control_plane: false,
          safe_action: false,
        }),
      ])
    );

    const inventoryProbe = snapshot.doctor.probes.find((probe) => probe.key === 'inventory');
    expect(inventoryProbe).toMatchObject({ status: 'healthy', authority: 'live' });
  });

  test('classifies git/worktree/filesystem verbs as non-control-plane actions', () => {
    expect(classifyMcpToolSafety({ server: 'filesystem', name: 'read_file' })).toMatchObject({
      control_plane: false,
      safe_action: false,
    });
    expect(classifyMcpToolSafety({ server: 'devhub', name: 'list_tasks' })).toMatchObject({
      control_plane: true,
      safe_action: true,
    });
    expect(classifyMcpToolSafety({ server: 'devhub', name: 'update_task' })).toMatchObject({
      control_plane: true,
      safe_action: false,
    });
  });
});

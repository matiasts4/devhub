const { gatherOperationalHealth } = require('./route');
const {
  composeControlRoomSnapshot,
  selectControlRoomDiagnostics,
} = require('@/lib/operations/swarmControl');

describe('gatherOperationalHealth runtime diagnostics integration', () => {
  test('propagates orphaned/stale/quota runtime anomalies through control-room diagnostics', async () => {
    const snapshot = await gatherOperationalHealth({
      now: '2026-05-23T20:00:00.000Z',
      projectId: 'project-1',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 101, port: 4154 }),
      getQueueStatus: async () => ({ length: 2, estimatedWaitMs: 1200 }),
      getActiveAgentCount: async () => 1,
      getMcpStatus: async () => ({
        authority: 'inferred',
        note: 'cached snapshot',
        servers: [],
      }),
      getSessionsHealth: async () => ({
        checked_at: '2026-05-23T20:00:00.000Z',
        live_check_available: true,
        active_sessions: [{ id: 's-1' }],
        stale_sessions: [],
        aborted_count: 0,
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        recent_errors: 0,
        active_chats: 2,
        last_activity: '2026-05-23T20:00:00.000Z',
      }),
      getRuntimeDiagnostics: async () => ({
        generatedAt: '2026-05-23T20:00:00.000Z',
        summary: {
          totalTerminals: 2,
          totalProcesses: 2,
          totalRegistryAgents: 2,
        },
        anomalies: {
          reattachableTerminals: ['term-1'],
          orphanedProcesses: [4242],
          staleRegistryAgents: ['auditor'],
          quotaBlocked: true,
          quotaMatches: ['GoUsageLimitError'],
        },
        evidence_refs: [
          'log://terminal-debug.log:data/logs/terminal-debug.log',
          'crashdump://dump-1.json:data/logs/crash-dumps/dump-1.json',
        ],
      }),
      getMissionSnapshot: () => null,
      getExecutionQueue: async () => [],
    });

    const runtimeSource = snapshot.sources.find((source) => source.key === 'runtime-diagnostics');

    expect(runtimeSource).toBeDefined();
    expect(runtimeSource.status).toBe('degraded');
    expect(runtimeSource.metrics).toEqual(
      expect.objectContaining({
        total_terminals: 2,
        total_processes: 2,
        total_registry_agents: 2,
        reattachable_terminals: 1,
        orphaned_processes: 1,
        stale_registry_agents: 1,
        quota_blocked: true,
      })
    );
    expect(runtimeSource.evidence_refs).toEqual(
      expect.arrayContaining([
        'log://terminal-debug.log:data/logs/terminal-debug.log',
        'crashdump://dump-1.json:data/logs/crash-dumps/dump-1.json',
      ])
    );

    const controlRoomSnapshot = composeControlRoomSnapshot(snapshot.control_room_snapshot_input);
    const diagnostics = selectControlRoomDiagnostics(controlRoomSnapshot);

    expect(diagnostics.runtime).toEqual(
      expect.objectContaining({
        status: 'degraded',
        authority: 'authoritative',
        freshness: 'current',
      })
    );
    expect(diagnostics.runtime.evidence_refs).toEqual(
      expect.arrayContaining([
        'log://terminal-debug.log:data/logs/terminal-debug.log',
        'crashdump://dump-1.json:data/logs/crash-dumps/dump-1.json',
      ])
    );
  });
});

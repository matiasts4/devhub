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

  test('includes shared durable director_feed in control-room snapshot input', async () => {
    const snapshot = await gatherOperationalHealth({
      now: '2026-05-26T21:00:00.000Z',
      projectId: 'project-1',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 101, port: 4154 }),
      getQueueStatus: async () => ({ length: 0, estimatedWaitMs: 0 }),
      getActiveAgentCount: async () => 1,
      getMcpStatus: async () => ({ authority: 'inferred', note: 'cached snapshot', servers: [] }),
      getSessionsHealth: async () => ({
        checked_at: '2026-05-26T21:00:00.000Z',
        live_check_available: true,
        active_sessions: [{ id: 's-1' }],
        stale_sessions: [],
        aborted_count: 0,
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        recent_errors: 0,
        active_chats: 1,
        last_activity: '2026-05-26T21:00:00.000Z',
      }),
      getRuntimeDiagnostics: async () => ({
        generatedAt: '2026-05-26T21:00:00.000Z',
        summary: { totalTerminals: 1, totalProcesses: 1, totalRegistryAgents: 1 },
        anomalies: {},
        evidence_refs: [],
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-feed-1',
          task_id: 'task-feed-1',
          workspace_id: 'ws-feed-1',
          run_id: 'run-feed-1',
          title: 'Mission Feed',
          status: 'active',
        },
        recent_messages: [],
        latest_message: null,
        pending_deliveries: [],
        snapshot_at: '2026-05-26T21:00:00.000Z',
        watermark: 'mission-feed-watermark-1',
        director_feed: {
          authority: 'durable',
          freshness: 'current',
          watermark: 'director-feed-watermark-1',
          items: [
            {
              feed_id: 'agent_event:10',
              kind: 'handoff_ready',
              occurred_at: '2026-05-26T20:59:50.000Z',
              mission_id: 'mission-feed-1',
              agent_id: 'agent-executor-1',
              task_id: 'task-feed-1',
              workspace_id: 'ws-feed-1',
              run_id: 'run-feed-1',
              artifact_id: 'artifact-feed-1',
              summary: 'Executor handoff ready',
              next_action: 'director_review',
              evidence_ref: 'evidence://mission-feed/handoff',
              source: 'agent_event',
              delivery_status: 'binding_missing',
            },
          ],
          handoff: {
            status: 'ready',
            recipient_agent_id: 'agent-executor-1',
            message: 'Executor handoff ready',
            task: {
              task_id: 'task-feed-1',
              title: 'Feed Task',
              status: 'in_progress',
              priority: 'high',
            },
            workspace: {
              workspace_id: 'ws-feed-1',
              status: 'active',
              branch_name: 'feat/feed',
              evidence_ref: 'evidence://workspace/feed',
            },
            run: { run_id: 'run-feed-1', status: 'running' },
            artifact: {
              artifact_id: 'artifact-feed-1',
              summary: 'Feed artifact',
              evidence_ref: 'evidence://artifact/feed',
            },
            supervisor: { task_id: 'task-feed-1', supervisor_state: 'awaiting_evidence' },
          },
        },
        presence: { active: [], stale: [], offline: [] },
      }),
      getExecutionQueue: async () => [],
    });

    expect(snapshot.control_room_snapshot_input).toEqual(
      expect.objectContaining({
        mission_control: expect.objectContaining({
          director_feed: expect.objectContaining({
            watermark: 'director-feed-watermark-1',
            items: [
              expect.objectContaining({
                kind: 'handoff_ready',
                delivery_status: 'binding_missing',
              }),
            ],
            handoff: expect.objectContaining({
              status: 'ready',
              recipient_agent_id: 'agent-executor-1',
            }),
          }),
        }),
      })
    );
  });
});

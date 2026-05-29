jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('GET /api/agenthub/operations/health', () => {
  test('aggregates one canonical health snapshot from mixed operational sources', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-04-10T17:25:00.000Z',
      getProcessStatus: async () => ({
        running: true,
        healthy: true,
        pid: 321,
        port: 4154,
        processInfo: { uptime: 30000, memoryMB: 128 },
      }),
      getQueueStatus: () => ({ length: 2, items: [{ estimatedWaitMs: 5000 }] }),
      getActiveAgentCount: () => 2,
      getMcpStatus: async () => ({
        servers: [{ name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }] }],
        note: 'MCP status is cached. OpenCode headless does not expose live MCP server info.',
      }),
      getSessionsHealth: async () => ({
        active_sessions: [{ session_id: 'active-1' }],
        stale_sessions: [{ session_id: 'stale-1' }],
        aborted_count: 1,
        live_check_available: true,
        checked_at: '2026-04-10T17:24:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 3,
        recent_errors: 0,
        last_activity: '2026-04-10T17:24:40.000Z',
      }),
      getRuntimeDiagnostics: async () => ({
        generatedAt: '2026-04-10T17:25:00.000Z',
        summary: {
          totalTerminals: 0,
          totalProcesses: 0,
          totalRegistryAgents: 0,
        },
        anomalies: {},
        evidence_refs: [],
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-1',
          title: 'Misión Director',
          status: 'active',
        },
        participants: [{ agent_id: 'agent-director', role_in_mission: 'director' }],
        recent_messages: [
          {
            message_id: 'message-1',
            body_summary: 'Tomá la ejecución del workspace principal',
            created_at: '2026-04-10T17:24:30.000Z',
            related_task_id: 'task-1',
            related_workspace_id: 'ws-1',
            related_run_id: 'run-1',
            evidence_ref: 'evidence://mission-message/message-1',
          },
        ],
        latest_message: {
          message_id: 'message-1',
          body_summary: 'Tomá la ejecución del workspace principal',
          created_at: '2026-04-10T17:24:30.000Z',
          related_task_id: 'task-1',
          related_workspace_id: 'ws-1',
          related_run_id: 'run-1',
          evidence_ref: 'evidence://mission-message/message-1',
        },
        pending_deliveries: [
          {
            delivery_id: 'delivery-1',
            status: 'retry_pending',
            recipient_agent_id: 'agent-director',
            channel: 'local_snapshot',
            last_attempt_at: '2026-04-10T17:24:40.000Z',
            evidence_ref: 'evidence://delivery/delivery-1',
          },
        ],
        snapshot_at: '2026-04-10T17:25:00.000Z',
        watermark: 'mission-control-watermark-1',
        presence: {
          active: [
            {
              presence_id: 'presence-1',
              agent_id: 'agent-director',
              last_seen_at: '2026-04-10T17:24:50.000Z',
              effective_state: 'online',
              evidence_ref: 'evidence://presence/presence-1',
            },
          ],
          stale: [],
          offline: [],
        },
      }),
    });

    expect(snapshot.summary).toMatchObject({
      total: 6,
      healthy: 4,
      degraded: 1,
      stale: 1,
      worst_status: 'stale',
    });

    expect(snapshot.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'opencode-process', authority: 'authoritative' }),
        expect.objectContaining({ key: 'queue', metrics: expect.objectContaining({ length: 2 }) }),
        expect.objectContaining({ key: 'mcp', authority: 'inferred', status: 'stale' }),
      ])
    );

    expect(snapshot.control_room_snapshot_input).toEqual({
      diagnostics: {
        process: expect.objectContaining({ key: 'opencode-process', status: 'healthy' }),
        mcp: expect.objectContaining({ key: 'mcp', status: 'stale' }),
        telegram: expect.objectContaining({ key: 'telegram', status: 'healthy' }),
        session_stream: expect.objectContaining({ key: 'session-stream', status: 'degraded' }),
        runtime: expect.objectContaining({ key: 'runtime-diagnostics', status: 'healthy' }),
      },
      evidence_timeline: [
        expect.objectContaining({
          item_id: 'presence-1',
          kind: 'presence',
          linked_ids: expect.objectContaining({ mission_id: 'mission-1' }),
        }),
        expect.objectContaining({
          item_id: 'delivery-1',
          kind: 'delivery',
          linked_ids: expect.objectContaining({ mission_id: 'mission-1' }),
        }),
        expect.objectContaining({
          item_id: 'message-1',
          kind: 'mission_message',
          linked_ids: expect.objectContaining({ mission_id: 'mission-1' }),
        }),
      ],
      mission_control: expect.objectContaining({
        mission: expect.objectContaining({ mission_id: 'mission-1', title: 'Misión Director' }),
        recent_messages: [
          expect.objectContaining({
            message_id: 'message-1',
            body_summary: 'Tomá la ejecución del workspace principal',
          }),
        ],
        latest_message: expect.objectContaining({ message_id: 'message-1' }),
        pending_deliveries: [expect.objectContaining({ status: 'retry_pending' })],
        snapshot_at: '2026-04-10T17:25:00.000Z',
        watermark: 'mission-control-watermark-1',
      }),
    });
  });

  test('explicitly degrades missing process health instead of defaulting to healthy', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-04-10T17:25:00.000Z',
      getProcessStatus: async () => ({ running: false, healthy: false, pid: null, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 0,
      getMcpStatus: async () => ({ servers: [], note: 'MCP status is cached.' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: false,
        checked_at: '2026-04-10T17:10:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: false,
        active_chats: 0,
        recent_errors: 2,
        last_activity: null,
      }),
      getRuntimeDiagnostics: async () => null,
    });

    const processSource = snapshot.sources.find((source) => source.key === 'opencode-process');
    const sessionSource = snapshot.sources.find((source) => source.key === 'session-stream');

    expect(processSource).toMatchObject({ status: 'offline', authority: 'authoritative' });
    expect(sessionSource).toMatchObject({ status: 'stale', authority: 'cached' });
    expect(snapshot.summary.worst_status).toBe('offline');
    expect(snapshot.control_room_snapshot_input).toEqual({
      diagnostics: {
        process: expect.objectContaining({ key: 'opencode-process', status: 'offline' }),
        mcp: expect.objectContaining({ key: 'mcp', status: 'stale' }),
        telegram: expect.objectContaining({ key: 'telegram', status: 'degraded' }),
        session_stream: expect.objectContaining({ key: 'session-stream', status: 'stale' }),
        runtime: expect.objectContaining({ key: 'runtime-diagnostics', status: 'stale' }),
      },
    });
  });

  test('projects director_queue from durable execution queue truth without claim side effects', async () => {
    const getExecutionQueue = jest.fn().mockResolvedValue({
      total: 2,
      queue: [
        {
          id: 'task-blocked',
          title: 'Blocked first from durable queue',
          status: 'pending',
          priority: 'high',
          blocked: true,
          blocking_dependencies: ['dep-1'],
          priority_score: 0,
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
        {
          id: 'task-ready',
          title: 'Claimable second from durable queue',
          status: 'pending',
          priority: 'medium',
          blocked: false,
          blocking_dependencies: [],
          priority_score: 98.5,
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
          },
        },
      ],
    });
    const getNextTask = jest.fn();
    const claimNextTask = jest.fn();
    const { GET } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await GET(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000'
      ),
      undefined,
      {
        now: '2026-05-20T18:00:00.000Z',
        getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
        getQueueStatus: () => ({ length: 0, items: [] }),
        getActiveAgentCount: () => 0,
        getMcpStatus: async () => ({ servers: [], note: 'cached' }),
        getSessionsHealth: async () => ({
          active_sessions: [],
          stale_sessions: [],
          aborted_count: 0,
          live_check_available: true,
          checked_at: '2026-05-20T18:00:00.000Z',
        }),
        getTelegramStatus: async () => ({
          bot_connected: true,
          active_chats: 0,
          recent_errors: 0,
          last_activity: '2026-05-20T18:00:00.000Z',
        }),
        getExecutionQueue,
        getNextTask,
        claimNextTask,
      }
    );
    const snapshot = await response.json();

    expect(response.status).toBe(200);
    expect(getExecutionQueue).toHaveBeenCalledWith({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      includeBlocked: true,
    });
    expect(getNextTask).not.toHaveBeenCalled();
    expect(claimNextTask).not.toHaveBeenCalled();
    expect(snapshot.control_room_snapshot_input.director_queue).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-blocked',
          title: 'Blocked first from durable queue',
          status: 'blocked',
          position: 1,
          priority: 'high',
          blocked_reason: 'dep-1',
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
        {
          id: 'task-ready',
          title: 'Claimable second from durable queue',
          status: 'pending',
          position: 2,
          priority: 'medium',
          blocked_reason: null,
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
          },
        },
      ],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('returns a stable empty director_queue shape from durable queue truth', async () => {
    const getExecutionQueue = jest.fn().mockResolvedValue({ total: 0, queue: [] });
    const { GET } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await GET(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000'
      ),
      undefined,
      {
        now: '2026-05-20T18:05:00.000Z',
        getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
        getQueueStatus: () => ({ length: 0, items: [] }),
        getActiveAgentCount: () => 0,
        getMcpStatus: async () => ({ servers: [], note: 'cached' }),
        getSessionsHealth: async () => ({
          active_sessions: [],
          stale_sessions: [],
          aborted_count: 0,
          live_check_available: true,
          checked_at: '2026-05-20T18:05:00.000Z',
        }),
        getTelegramStatus: async () => ({
          bot_connected: true,
          active_chats: 0,
          recent_errors: 0,
          last_activity: '2026-05-20T18:05:00.000Z',
        }),
        getExecutionQueue,
      }
    );
    const snapshot = await response.json();

    expect(response.status).toBe(200);
    expect(snapshot.control_room_snapshot_input.director_queue).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('projects pending approvals only while checkpoint status remains pending', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-05-21T10:00:00.000Z',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 1,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-21T10:00:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-21T10:00:00.000Z',
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-approval-1',
          task_id: 'task-approval-1',
          workspace_id: 'ws-approval-1',
          run_id: 'run-approval-1',
          status: 'active',
        },
        participants: [],
        recent_messages: [],
        pending_deliveries: [],
        presence: { active: [], stale: [], offline: [] },
        supervisor_snapshots: [
          {
            task_id: 'task-approval-1',
            workspace_id: 'ws-approval-1',
            run_id: 'run-approval-1',
            supervisor_state: 'awaiting_approval',
            outcome: 'wait',
            approval_checkpoint_key: 'checkpoint-approval-1',
            evidence_ref: 'evidence://supervisor/task-approval-1',
            updated_at: '2026-05-21T10:00:00.000Z',
          },
        ],
        approval_checkpoints: [
          {
            checkpoint_key: 'checkpoint-approval-1',
            task_id: 'task-approval-1',
            workspace_id: 'ws-approval-1',
            run_id: 'run-approval-1',
            reason_class: 'approval_required',
            status: 'pending',
            requested_at: '2026-05-21T09:59:00.000Z',
            evidence_ref: 'evidence://approval/checkpoint-approval-1',
          },
        ],
      }),
    });

    expect(snapshot.control_room_snapshot_input.supervisor.approvals).toEqual([
      expect.objectContaining({
        checkpoint_key: 'checkpoint-approval-1',
        task_id: 'task-approval-1',
        status: 'pending',
        linked_supervisor_state: 'awaiting_approval',
        linked_supervisor_outcome: 'wait',
      }),
    ]);
  });

  test('drops approvals from projected pending list after checkpoint closes', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-05-21T10:05:00.000Z',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 1,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-21T10:05:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-21T10:05:00.000Z',
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-approval-1',
          task_id: 'task-approval-1',
          workspace_id: 'ws-approval-1',
          run_id: 'run-approval-1',
          status: 'active',
        },
        participants: [],
        recent_messages: [],
        pending_deliveries: [],
        presence: { active: [], stale: [], offline: [] },
        supervisor_snapshots: [
          {
            task_id: 'task-approval-1',
            workspace_id: 'ws-approval-1',
            run_id: 'run-approval-1',
            supervisor_state: 'dispatch_pending',
            outcome: 'dispatch',
            approval_checkpoint_key: 'checkpoint-approval-1',
            evidence_ref: 'evidence://supervisor/task-approval-1',
            updated_at: '2026-05-21T10:05:00.000Z',
          },
        ],
        approval_checkpoints: [
          {
            checkpoint_key: 'checkpoint-approval-1',
            task_id: 'task-approval-1',
            workspace_id: 'ws-approval-1',
            run_id: 'run-approval-1',
            reason_class: 'approval_required',
            status: 'approved',
            requested_at: '2026-05-21T09:59:00.000Z',
            decided_at: '2026-05-21T10:04:30.000Z',
            evidence_ref: 'evidence://approval/checkpoint-approval-1',
          },
        ],
      }),
    });

    expect(snapshot.control_room_snapshot_input.supervisor.approvals).toEqual([]);
  });

  test('projects blocked checkpoint gate remediation into snapshot errors and director queue items', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-05-21T10:10:00.000Z',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 1,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-21T10:10:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-21T10:10:00.000Z',
      }),
      getExecutionQueue: async () => ({
        total: 1,
        queue: [
          {
            id: 'task-gate-1',
            title: 'Cerrar task sin checkpoint',
            status: 'pending',
            priority: 'high',
            blocked: true,
            blocked_reason: 'missing-git-checkpoint',
            checkpoint_gate: {
              status: 'blocked',
              code: 'missing-git-checkpoint',
              message: 'Falta comentario [git:checkpoint] para este handoff.',
              remediation:
                'Agregá [git:checkpoint] con commit=<sha|none>, docs=[...], checks=[...] y worktree=<clean|dirty-excluded>.',
            },
          },
        ],
      }),
    });

    expect(snapshot.control_room_snapshot_input.director_queue.items).toEqual([
      expect.objectContaining({
        id: 'task-gate-1',
        status: 'blocked',
        blocked_reason: 'missing-git-checkpoint',
        checkpoint_gate: expect.objectContaining({
          code: 'missing-git-checkpoint',
          status: 'blocked',
        }),
      }),
    ]);
    expect(snapshot.control_room_snapshot_input.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-git-checkpoint',
          source: 'checkpoint_gate',
        }),
      ])
    );
  });

  test('projects accepted checkpoint summaries into the snapshot read model', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-05-21T10:12:00.000Z',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 1,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-21T10:12:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-21T10:12:00.000Z',
      }),
      getExecutionQueue: async () => ({
        total: 1,
        queue: [
          {
            id: 'task-gate-2',
            title: 'Cerrar task con checkpoint',
            status: 'pending',
            priority: 'high',
            blocked: false,
            checkpoint_gate: {
              status: 'accepted',
              code: 'checkpoint-accepted',
              message: 'Checkpoint válido para completed.',
              checkpoint: {
                commit: 'abc1234',
                worktree: 'clean',
                docs: ['docs/24_Politica_Git_y_Versionado_Agentes.md'],
                checks: ['npm test -- tests/integration/tasks.test.js'],
              },
            },
          },
        ],
      }),
    });

    expect(snapshot.control_room_snapshot_input.director_queue.items).toEqual([
      expect.objectContaining({
        id: 'task-gate-2',
        status: 'pending',
        checkpoint_gate: expect.objectContaining({
          code: 'checkpoint-accepted',
          checkpoint: expect.objectContaining({ commit: 'abc1234', worktree: 'clean' }),
        }),
      }),
    ]);
  });

  test('projects evidence_timeline from durable mission snapshot truth only', async () => {
    const { GET } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await GET(
      new Request('http://localhost/api/agenthub/operations/health'),
      undefined,
      {
        now: '2026-05-20T18:10:00.000Z',
        getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
        getQueueStatus: () => ({ length: 0, items: [] }),
        getActiveAgentCount: () => 0,
        getMcpStatus: async () => ({ servers: [], note: 'cached' }),
        getSessionsHealth: async () => ({
          active_sessions: [],
          stale_sessions: [],
          aborted_count: 0,
          live_check_available: true,
          checked_at: '2026-05-20T18:10:00.000Z',
        }),
        getTelegramStatus: async () => ({
          bot_connected: true,
          active_chats: 0,
          recent_errors: 0,
          last_activity: '2026-05-20T18:10:00.000Z',
        }),
        getMissionSnapshot: async () => ({
          mission: {
            mission_id: 'mission-ops-1',
            task_id: 'task-ops-1',
            workspace_id: 'ws-ops-1',
            run_id: 'run-ops-1',
            title: 'Mission Ops',
            status: 'active',
          },
          recent_messages: [
            {
              message_id: 'message-ops-1',
              body_summary: 'Director directive',
              created_at: '2026-05-20T18:09:00.000Z',
              evidence_ref: 'evidence://mission-message/message-ops-1',
              related_task_id: 'task-ops-1',
              related_workspace_id: 'ws-ops-1',
              related_run_id: 'run-ops-1',
            },
          ],
          pending_deliveries: [
            {
              delivery_id: 'delivery-ops-1',
              status: 'retry_pending',
              recipient_agent_id: 'agent-executor-1',
              channel: 'telegram',
              last_attempt_at: '2026-05-20T18:09:40.000Z',
              evidence_ref: 'evidence://delivery/delivery-ops-1',
            },
          ],
          presence: {
            active: [
              {
                presence_id: 'presence-ops-1',
                agent_id: 'agent-executor-1',
                workspace_id: 'ws-ops-1',
                run_id: 'run-ops-1',
                effective_state: 'online',
                status_summary: 'Executor online',
                last_seen_at: '2026-05-20T18:09:20.000Z',
                evidence_ref: 'evidence://presence/presence-ops-1',
              },
            ],
            stale: [],
            offline: [],
          },
          runs: [
            {
              run_id: 'run-ops-1',
              task_id: 'task-ops-1',
              workspace_id: 'ws-ops-1',
              status: 'running',
              summary: 'Run still active',
              started_at: '2026-05-20T18:09:40.000Z',
              evidence_ref: 'evidence://run/run-ops-1',
            },
          ],
          artifacts: [
            {
              artifact_id: 'artifact-ops-1',
              run_id: 'run-ops-1',
              task_id: 'task-ops-1',
              workspace_id: 'ws-ops-1',
              kind: 'decision.note',
              summary: 'Artifact captured',
              observed_at: '2026-05-20T18:09:40.000Z',
              evidence_ref: 'evidence://artifact/artifact-ops-1',
              secondary_session_evidence: [
                {
                  source: 'agent_trace',
                  observed_at: '2026-05-20T18:09:42.000Z',
                  summary: 'TTY trace linked to artifact',
                },
              ],
            },
          ],
          supervisor_snapshots: [
            {
              task_id: 'task-ops-1',
              workspace_id: 'ws-ops-1',
              run_id: 'run-ops-1',
              supervisor_state: 'awaiting_evidence',
              updated_at: '2026-05-20T18:09:40.000Z',
              evidence_ref: 'evidence://supervisor/task-ops-1',
            },
          ],
          approval_checkpoints: [
            {
              checkpoint_key: 'approval-ops-1',
              task_id: 'task-ops-1',
              workspace_id: 'ws-ops-1',
              run_id: 'run-ops-1',
              reason_class: 'approval_required',
              requested_at: '2026-05-20T18:09:40.000Z',
              evidence_ref: 'evidence://approval/approval-ops-1',
            },
          ],
          agent_traces: [
            {
              id: 'trace-ops-1',
              created_at: '2026-05-20T18:09:50.000Z',
              summary: 'Runtime-only trace must not become primary truth',
            },
          ],
        }),
      }
    );
    const snapshot = await response.json();

    expect(response.status).toBe(200);
    expect(snapshot.control_room_snapshot_input.evidence_timeline).toEqual([
      {
        item_id: 'approval-ops-1',
        kind: 'approval_checkpoint',
        occurred_at: '2026-05-20T18:09:40.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'approval_required',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: 'approval-ops-1',
        },
        evidence_ref: 'evidence://approval/approval-ops-1',
      },
      {
        item_id: 'task-ops-1',
        kind: 'supervisor_snapshot',
        occurred_at: '2026-05-20T18:09:40.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'awaiting_evidence',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://supervisor/task-ops-1',
      },
      {
        item_id: 'artifact-ops-1',
        kind: 'artifact',
        occurred_at: '2026-05-20T18:09:40.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'Artifact captured',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: 'artifact-ops-1',
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://artifact/artifact-ops-1',
        secondary_session_evidence: [
          {
            source: 'agent_trace',
            observed_at: '2026-05-20T18:09:42.000Z',
            summary: 'TTY trace linked to artifact',
          },
        ],
      },
      {
        item_id: 'run-ops-1',
        kind: 'run',
        occurred_at: '2026-05-20T18:09:40.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'Run still active',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://run/run-ops-1',
      },
      {
        item_id: 'delivery-ops-1',
        kind: 'delivery',
        occurred_at: '2026-05-20T18:09:40.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'retry_pending · agent-executor-1 · telegram',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://delivery/delivery-ops-1',
      },
      {
        item_id: 'presence-ops-1',
        kind: 'presence',
        occurred_at: '2026-05-20T18:09:20.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'Executor online',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://presence/presence-ops-1',
      },
      {
        item_id: 'message-ops-1',
        kind: 'mission_message',
        occurred_at: '2026-05-20T18:09:00.000Z',
        authority: 'authoritative',
        freshness: 'current',
        summary: 'Director directive',
        linked_ids: {
          mission_id: 'mission-ops-1',
          task_id: 'task-ops-1',
          workspace_id: 'ws-ops-1',
          run_id: 'run-ops-1',
          artifact_id: null,
          approval_checkpoint_key: null,
        },
        evidence_ref: 'evidence://mission-message/message-ops-1',
      },
    ]);
  });

  test('reads evidence_timeline without claim or workspace mutation side effects', async () => {
    const getExecutionQueue = jest.fn().mockResolvedValue({ total: 0, queue: [] });
    const getNextTask = jest.fn();
    const getWorkspaceEvidence = jest.fn();
    const claimNextTask = jest.fn();
    const { GET } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await GET(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000'
      ),
      undefined,
      {
        now: '2026-05-20T18:15:00.000Z',
        getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
        getQueueStatus: () => ({ length: 0, items: [] }),
        getActiveAgentCount: () => 0,
        getMcpStatus: async () => ({ servers: [], note: 'cached' }),
        getSessionsHealth: async () => ({
          active_sessions: [],
          stale_sessions: [],
          aborted_count: 0,
          live_check_available: true,
          checked_at: '2026-05-20T18:15:00.000Z',
        }),
        getTelegramStatus: async () => ({
          bot_connected: true,
          active_chats: 0,
          recent_errors: 0,
          last_activity: '2026-05-20T18:15:00.000Z',
        }),
        getMissionSnapshot: async () => ({
          mission: { mission_id: 'mission-readonly-1', status: 'active' },
          recent_messages: [
            {
              message_id: 'message-readonly-1',
              body_summary: 'Read-only timeline item',
              created_at: '2026-05-20T18:14:00.000Z',
              evidence_ref: 'evidence://mission-message/message-readonly-1',
            },
          ],
          pending_deliveries: [],
          presence: { active: [], stale: [], offline: [] },
        }),
        getExecutionQueue,
        getNextTask,
        getWorkspaceEvidence,
        claimNextTask,
      }
    );
    const snapshot = await response.json();

    expect(response.status).toBe(200);
    expect(snapshot.control_room_snapshot_input.evidence_timeline).toEqual([
      expect.objectContaining({ item_id: 'message-readonly-1', kind: 'mission_message' }),
    ]);
    expect(getExecutionQueue).toHaveBeenCalledWith({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      includeBlocked: true,
    });
    expect(getNextTask).not.toHaveBeenCalled();
    expect(getWorkspaceEvidence).not.toHaveBeenCalled();
    expect(claimNextTask).not.toHaveBeenCalled();
  });

  test('projects workspace and recovery durable refs as link-only QA evidence classes', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-05-21T11:00:00.000Z',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 1,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-21T11:00:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-21T11:00:00.000Z',
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-qa-1',
          task_id: 'task-qa-1',
          workspace_id: 'ws-qa-1',
          run_id: 'run-qa-1',
          status: 'active',
        },
        participants: [],
        recent_messages: [],
        pending_deliveries: [],
        presence: { active: [], stale: [], offline: [] },
        approval_checkpoints: [
          {
            checkpoint_key: 'checkpoint-qa-1',
            task_id: 'task-qa-1',
            workspace_id: 'ws-qa-1',
            run_id: 'run-qa-1',
            status: 'pending',
            reason_class: 'approval_required',
            requested_at: '2026-05-21T10:59:00.000Z',
            evidence_ref: 'evidence://approval/checkpoint-qa-1',
          },
        ],
        supervisor_snapshots: [
          {
            task_id: 'task-qa-1',
            workspace_id: 'ws-qa-1',
            run_id: 'run-qa-1',
            supervisor_state: 'recovering_orphan',
            outcome: 'recover_orphan',
            updated_at: '2026-05-21T10:59:30.000Z',
            evidence_ref: 'evidence://supervisor/task-qa-1',
          },
        ],
        runs: [
          {
            run_id: 'run-qa-1',
            task_id: 'task-qa-1',
            workspace_id: 'ws-qa-1',
            status: 'running',
            summary: 'Run active for QA matrix',
            started_at: '2026-05-21T10:58:30.000Z',
            evidence_ref: 'evidence://run/run-qa-1',
          },
        ],
        artifacts: [
          {
            artifact_id: 'artifact-qa-workspace',
            task_id: 'task-qa-1',
            workspace_id: 'ws-qa-1',
            run_id: 'run-qa-1',
            kind: 'workspace.prepared',
            summary: 'Workspace ready for QA',
            observed_at: '2026-05-21T10:59:20.000Z',
            evidence_ref: 'evidence://workspace/ws-qa-1',
          },
          {
            artifact_id: 'artifact-qa-recovery',
            task_id: 'task-qa-1',
            workspace_id: 'ws-qa-1',
            run_id: 'run-qa-1',
            kind: 'workspace.cleanup',
            summary: 'Recovery checkpoint available',
            observed_at: '2026-05-21T10:59:40.000Z',
            evidence_ref: 'evidence://recovery/ws-qa-1',
          },
        ],
      }),
    });

    expect(snapshot.control_room_snapshot_input.evidence_timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'artifact',
          item_id: 'artifact-qa-workspace',
          summary: 'Workspace ready for QA',
          evidence_ref: 'evidence://workspace/ws-qa-1',
          linked_ids: expect.objectContaining({ workspace_id: 'ws-qa-1', run_id: 'run-qa-1' }),
        }),
        expect.objectContaining({
          kind: 'artifact',
          item_id: 'artifact-qa-recovery',
          summary: 'Recovery checkpoint available',
          evidence_ref: 'evidence://recovery/ws-qa-1',
          linked_ids: expect.objectContaining({ workspace_id: 'ws-qa-1', run_id: 'run-qa-1' }),
        }),
      ])
    );
    expect(
      snapshot.control_room_snapshot_input.evidence_timeline.find(
        (item) => item.item_id === 'artifact-qa-workspace'
      )?.secondary_session_evidence
    ).toEqual([]);
  });

  test('creates a local mission message with pending local deliveries only', async () => {
    const Database = require('better-sqlite3');
    const {
      ensureRuntimeSchema,
      createSwarmMission,
      registerMissionParticipant,
    } = require('../../../src/lib/db/localDb.js');
    const {
      createLocalMissionMessage,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const db = new Database(':memory:');
    ensureRuntimeSchema(db);
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
      'project-local',
      'Project Local'
    );

    const mission = createSwarmMission(db, {
      project_id: 'project-local',
      owner_agent_id: 'agent-director',
      kind: 'coordination',
      title: 'Misión local',
      status: 'active',
      started_at: '2026-05-19T12:00:00.000Z',
      updated_at: '2026-05-19T12:00:00.000Z',
    });
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'agent-director',
      role_in_mission: 'director',
      status: 'active',
      joined_at: '2026-05-19T12:00:00.000Z',
    });
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'agent-worker-1',
      role_in_mission: 'executor',
      status: 'active',
      joined_at: '2026-05-19T12:00:05.000Z',
    });
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'agent-reviewer-1',
      role_in_mission: 'reviewer',
      status: 'active',
      joined_at: '2026-05-19T12:00:10.000Z',
    });

    const snapshot = createLocalMissionMessage({
      db,
      recipient_agent_ids: ['agent-worker-1', 'agent-reviewer-1'],
      body_summary: 'Necesito update del workspace principal.',
      now: '2026-05-19T12:01:00.000Z',
    });

    expect(snapshot.latest_message).toMatchObject({
      message_kind: 'directive',
      body_summary: 'Necesito update del workspace principal.',
      sender_agent_id: 'agent-director',
    });
    expect(snapshot.pending_deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_agent_id: 'agent-worker-1',
          channel: 'local_snapshot',
          status: 'pending',
        }),
        expect.objectContaining({
          recipient_agent_id: 'agent-reviewer-1',
          channel: 'local_snapshot',
          status: 'pending',
        }),
      ])
    );

    const rows = db
      .prepare('SELECT channel, status FROM message_deliveries ORDER BY recipient_agent_id ASC')
      .all();
    expect(rows).toEqual([
      { channel: 'local_snapshot', status: 'pending' },
      { channel: 'local_snapshot', status: 'pending' },
    ]);
    db.close();
  });

  test('reuses one mission_control helper for GET parity and successful local composer POST', async () => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T12:01:00.000Z'));

    const Database = require('better-sqlite3');
    const actualLocalDb = jest.requireActual('../../../src/lib/db/localDb.js');
    const db = new Database(':memory:');
    actualLocalDb.ensureAllSchema(db);
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
      'project-parity',
      'Project Parity'
    );

    const mission = actualLocalDb.createSwarmMission(db, {
      project_id: 'project-parity',
      owner_agent_id: 'agent-director',
      kind: 'coordination',
      title: 'Misión parity',
      status: 'active',
      started_at: '2026-05-19T12:00:00.000Z',
      updated_at: '2026-05-19T12:00:00.000Z',
    });
    actualLocalDb.registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'agent-director',
      role_in_mission: 'director',
      status: 'active',
      joined_at: '2026-05-19T12:00:00.000Z',
    });
    actualLocalDb.registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'agent-worker-1',
      role_in_mission: 'executor',
      status: 'active',
      joined_at: '2026-05-19T12:00:05.000Z',
    });

    jest.doMock('@/lib/db/localDb.js', () => ({
      ...jest.requireActual('@/lib/db/localDb.js'),
      getDb: () => db,
      getActiveAgentCount: () => 0,
    }));

    const {
      POST,
      gatherOperationalHealth,
      buildMissionControlSnapshotInput,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const postResponse = await POST({
      json: async () => ({
        action: 'create_local_mission_message',
        recipient_agent_ids: ['agent-worker-1'],
        body_summary: 'Parity update para la misión.',
      }),
    });
    const postPayload = await postResponse.json();

    expect(typeof buildMissionControlSnapshotInput).toBe('function');
    expect(postPayload.control_room_snapshot_input).toEqual(
      buildMissionControlSnapshotInput(postPayload.control_room_snapshot_input.mission_control)
    );
    expect(postPayload.control_room_snapshot_input.mission_control).toEqual(
      expect.objectContaining({
        recent_messages: [
          expect.objectContaining({ body_summary: 'Parity update para la misión.' }),
        ],
        latest_message: expect.objectContaining({ body_summary: 'Parity update para la misión.' }),
        pending_deliveries: [expect.objectContaining({ recipient_agent_id: 'agent-worker-1' })],
        snapshot_at: '2026-05-19T12:01:00.000Z',
        watermark: expect.any(String),
      })
    );

    const getPayload = await gatherOperationalHealth({
      now: '2026-05-19T12:01:00.000Z',
      getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 0,
      getMcpStatus: async () => ({ servers: [], note: 'cached' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: true,
        checked_at: '2026-05-19T12:01:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 0,
        recent_errors: 0,
        last_activity: '2026-05-19T12:01:00.000Z',
      }),
      getMissionSnapshot: async () =>
        actualLocalDb.getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
          now: '2026-05-19T12:01:00.000Z',
        }),
    });

    expect(getPayload.control_room_snapshot_input.mission_control).toEqual(
      postPayload.control_room_snapshot_input.mission_control
    );

    db.close();
    jest.useRealTimers();
    jest.resetModules();
  });

  test('claims next safe task, refreshes queue, and returns durable workspace evidence only', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-executor-1', role_in_mission: 'executor', status: 'active' },
      ],
    });
    const getNextTask = jest.fn().mockResolvedValue({
      task: {
        id: 'task-claimed-1',
        title: 'Claimed durable task',
        status: 'in_progress',
        priority: 'high',
        supervisor: {
          supervisor_state: 'dispatch_pending',
          reason_class: null,
          workspace_id: 'ws-claimed-1',
        },
      },
      message: 'Tarea asignada al agente.',
    });
    const getWorkspaceEvidence = jest.fn().mockResolvedValue({
      workspace: {
        workspace_id: 'ws-claimed-1',
        status: 'active',
        branch_name: 'feat/claimed-task',
      },
      latest_run: {
        run_id: 'run-claimed-1',
        status: 'running',
      },
      latest_artifact: {
        artifact_id: 'artifact-claimed-1',
        kind: 'decision.note',
      },
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({
      total: 1,
      queue: [
        {
          id: 'task-follow-up',
          title: 'Follow-up durable task',
          status: 'pending',
          priority: 'medium',
          blocked: false,
          blocking_dependencies: [],
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
          },
        },
      ],
    });
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getNextTask,
        getWorkspaceEvidence,
        getExecutionQueue,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getNextTask).toHaveBeenCalledWith({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      agentId: 'agent-executor-1',
    });
    expect(getWorkspaceEvidence).toHaveBeenCalledWith({ workspaceId: 'ws-claimed-1' });
    expect(getExecutionQueue).toHaveBeenCalledWith({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      includeBlocked: true,
    });
    expect(payload.control_room_snapshot_input.director_queue).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-follow-up',
          title: 'Follow-up durable task',
          status: 'pending',
          position: 1,
          priority: 'medium',
          blocked_reason: null,
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
          },
        },
      ],
      handoff: {
        status: 'claimed',
        recipient_agent_id: 'agent-executor-1',
        message: 'Tarea asignada al agente.',
        task: {
          id: 'task-claimed-1',
          title: 'Claimed durable task',
          status: 'in_progress',
          priority: 'high',
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
            workspace_id: 'ws-claimed-1',
          },
        },
        workspace: {
          workspace_id: 'ws-claimed-1',
          status: 'active',
          branch_name: 'feat/claimed-task',
        },
        run: {
          run_id: 'run-claimed-1',
          status: 'running',
        },
        artifact: {
          artifact_id: 'artifact-claimed-1',
          kind: 'decision.note',
        },
        supervisor: {
          supervisor_state: 'dispatch_pending',
          reason_class: null,
          workspace_id: 'ws-claimed-1',
        },
      },
    });
  });

  test('returns disabled handoff when there is no active non-director executor', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [{ agent_id: 'agent-director', role_in_mission: 'director', status: 'active' }],
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({ total: 0, queue: [] });
    const getNextTask = jest.fn();
    const getWorkspaceEvidence = jest.fn();
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getExecutionQueue,
        getNextTask,
        getWorkspaceEvidence,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getNextTask).not.toHaveBeenCalled();
    expect(getWorkspaceEvidence).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue.handoff).toEqual({
      status: 'disabled',
      recipient_agent_id: null,
      message: 'No hay executor activo para handoff.',
      task: null,
      workspace: null,
      run: null,
      artifact: null,
      supervisor: null,
    });
  });

  test('terminates one swarm launch locally and returns refreshed control-room input', async () => {
    const terminateSwarmLaunch = jest.fn().mockResolvedValue({
      launchId: 'launch-abc',
      terminated: true,
    });
    const response = await require('../../../src/app/api/agenthub/operations/health/route').POST(
      new Request('http://localhost/api/agenthub/operations/health?project_id=proj-1', {
        method: 'POST',
        body: JSON.stringify({
          action: 'terminate_swarm_local',
          project_id: 'proj-1',
          launch_id: 'launch-abc',
        }),
      }),
      undefined,
      {
        terminateSwarmLaunch,
        getProcessStatus: async () => ({ running: true, healthy: true, pid: 1, port: 4154 }),
        getQueueStatus: () => ({ length: 0, items: [] }),
        getActiveAgentCount: () => 0,
        getMcpStatus: async () => ({ servers: [], note: 'cached' }),
        getSessionsHealth: async () => ({
          active_sessions: [],
          stale_sessions: [],
          aborted_count: 0,
          live_check_available: true,
          checked_at: '2026-05-22T10:00:00.000Z',
        }),
        getTelegramStatus: async () => ({
          bot_connected: true,
          active_chats: 0,
          recent_errors: 0,
          last_activity: '2026-05-22T10:00:00.000Z',
        }),
        getRuntimeDiagnostics: async () => null,
        getExecutionQueue: async () => ({ total: 0, queue: [] }),
        getMissionSnapshot: async () => null,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(terminateSwarmLaunch).toHaveBeenCalledWith('launch-abc', expect.any(Object));
    expect(payload.terminate_result).toEqual({ launchId: 'launch-abc', terminated: true });
    expect(payload.control_room_snapshot_input).toEqual(
      expect.objectContaining({ director_queue: expect.any(Object) })
    );
  });

  test('treats active reviewers as ineligible and keeps handoff disabled without claiming', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-reviewer-1', role_in_mission: 'reviewer', status: 'active' },
      ],
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({ total: 0, queue: [] });
    const getNextTask = jest.fn();
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getExecutionQueue,
        getNextTask,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getNextTask).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue.handoff).toEqual({
      status: 'disabled',
      recipient_agent_id: null,
      message: 'No hay executor activo para handoff.',
      task: null,
      workspace: null,
      run: null,
      artifact: null,
      supervisor: null,
    });
  });

  test('returns disabled handoff when multiple active non-director executors exist', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-executor-1', role_in_mission: 'executor', status: 'active' },
        { agent_id: 'agent-executor-2', role_in_mission: 'executor', status: 'active' },
      ],
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({
      total: 1,
      queue: [
        {
          id: 'task-blocked',
          title: 'Blocked durable task',
          status: 'pending',
          priority: 'high',
          blocked: true,
          blocking_dependencies: ['dep-1'],
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
      ],
    });
    const getNextTask = jest.fn();
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getExecutionQueue,
        getNextTask,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getNextTask).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-blocked',
          title: 'Blocked durable task',
          status: 'blocked',
          position: 1,
          priority: 'high',
          blocked_reason: 'dep-1',
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
      ],
      handoff: {
        status: 'disabled',
        recipient_agent_id: null,
        message: 'Hay más de un executor activo; el handoff seguro sigue deshabilitado.',
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('returns bounded blocked handoff when durable claim reports no safe task', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-executor-1', role_in_mission: 'executor', status: 'active' },
      ],
    });
    const getNextTask = jest.fn().mockResolvedValue({
      task: null,
      message: 'Todas las tareas pendientes están bloqueadas.',
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({
      total: 1,
      queue: [
        {
          id: 'task-blocked',
          title: 'Blocked durable task',
          status: 'pending',
          priority: 'high',
          blocked: true,
          blocking_dependencies: ['dep-2'],
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
      ],
    });
    const getWorkspaceEvidence = jest.fn();
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getNextTask,
        getExecutionQueue,
        getWorkspaceEvidence,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getWorkspaceEvidence).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue.handoff).toEqual({
      status: 'blocked',
      recipient_agent_id: 'agent-executor-1',
      message: 'Todas las tareas pendientes están bloqueadas.',
      task: null,
      workspace: null,
      run: null,
      artifact: null,
      supervisor: null,
    });
  });

  test('returns bounded empty handoff when durable claim reports no pending task', async () => {
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-executor-1', role_in_mission: 'executor', status: 'active' },
      ],
    });
    const getNextTask = jest.fn().mockResolvedValue({
      task: null,
      message: 'Sin tareas pendientes',
    });
    const getExecutionQueue = jest.fn().mockResolvedValue({ total: 0, queue: [] });
    const getWorkspaceEvidence = jest.fn();
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=550e8400-e29b-41d4-a716-446655440000',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        getNextTask,
        getExecutionQueue,
        getWorkspaceEvidence,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getWorkspaceEvidence).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue.handoff).toEqual({
      status: 'empty',
      recipient_agent_id: 'agent-executor-1',
      message: 'Sin tareas pendientes',
      task: null,
      workspace: null,
      run: null,
      artifact: null,
      supervisor: null,
    });
  });

  test('uses durable local fallback for director claim and evidence without MCP bounce', async () => {
    jest.resetModules();

    const Database = require('better-sqlite3');
    const localDbPath = '../../../src/lib/db/localDb.js';
    const actualLocalDb = jest.requireActual(localDbPath);
    const db = new Database(':memory:');
    actualLocalDb.ensureAllSchema(db);

    db.prepare('INSERT INTO projects (id, name, local_path) VALUES (?, ?, ?)').run(
      'project-local-claim',
      'Project Local Claim',
      '/workspace/devhub'
    );
    db.prepare(
      'INSERT INTO tasks (id, project_id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'task-local-1',
      'project-local-claim',
      'Local durable task',
      'pending',
      'high',
      '2026-05-26T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z'
    );
    db.prepare(
      'INSERT INTO agent_registry (agent_id, project_id, nombre, modelo_llm, status) VALUES (?, ?, ?, ?, ?)'
    ).run('agent-executor-1', 'project-local-claim', 'Executor 1', 'opencode', 'idle');
    db.prepare(
      `INSERT INTO agent_workspaces (
        id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root, workspace_path,
        worktree_path, base_branch, base_commit, branch_name, status, observed_branch, observed_head,
        observed_dirty, updated_at, claimed_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'ws-local-1',
      'project-local-claim',
      'agent-executor-1',
      'task-local-1',
      'launch-local-coder-session',
      '/workspace/devhub',
      '/workspace/devhub/.devhub/worktrees/launch-local/coder',
      '/workspace/devhub/.devhub/worktrees/launch-local/coder',
      'main',
      'HEAD',
      'devhub/swarm/launch-local/coder',
      'active',
      'devhub/swarm/launch-local/coder',
      'head-local-1',
      'clean',
      '2026-05-26T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO agent_runs (
        run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit,
        observed_start_branch, observed_start_head, observed_start_dirty, observed_start_path,
        status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'run-local-1',
      'ws-local-1',
      'task-local-1',
      'agent-executor-1',
      'HEAD',
      'HEAD',
      'devhub/swarm/launch-local/coder',
      'head-local-1',
      'clean',
      '/workspace/devhub/.devhub/worktrees/launch-local/coder',
      'running',
      '2026-05-26T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO agent_artifacts (
        artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'artifact-local-1',
      'run-local-1',
      1,
      'execute',
      'decision.note',
      'devhub',
      'Local durable evidence',
      'evidence://artifact/artifact-local-1',
      '2026-05-26T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO supervisor_snapshots (
        task_id, supervisor_state, outcome, workspace_id, run_id, evidence_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-local-1',
      'dispatch_pending',
      'dispatch',
      'ws-local-1',
      'run-local-1',
      'evidence://supervisor/task-local-1',
      '2026-05-26T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z'
    );

    jest.doMock('@/lib/db/localDb.js', () => ({
      ...jest.requireActual(localDbPath),
      getDb: () => db,
      getActiveAgentCount: () => 0,
    }));
    jest.doMock(localDbPath, () => ({
      ...jest.requireActual(localDbPath),
      getDb: () => db,
      getActiveAgentCount: () => 0,
    }));

    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');
    const getMissionSnapshot = jest.fn().mockResolvedValue({
      participants: [
        { agent_id: 'agent-director', role_in_mission: 'director', status: 'active' },
        { agent_id: 'agent-executor-1', role_in_mission: 'executor', status: 'active' },
      ],
    });
    const fetchImpl = jest.fn();

    const response = await POST(
      new Request(
        'http://localhost/api/agenthub/operations/health?project_id=project-local-claim',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'claim_director_next_task' }),
        }
      ),
      undefined,
      {
        getMissionSnapshot,
        fetchImpl,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(payload.control_room_snapshot_input.director_queue.handoff).toEqual(
      expect.objectContaining({
        status: 'claimed',
        recipient_agent_id: 'agent-executor-1',
        message: 'Tarea reclamada.',
        task: expect.objectContaining({
          id: 'task-local-1',
          status: 'in_progress',
          workspace_id: 'ws-local-1',
          run_id: 'run-local-1',
          runtime_binding: expect.objectContaining({
            classification: 'bound',
            workspace_id: 'ws-local-1',
            run_id: 'run-local-1',
          }),
        }),
        workspace: expect.objectContaining({
          workspace_id: 'ws-local-1',
          branch_name: 'devhub/swarm/launch-local/coder',
        }),
        run: expect.objectContaining({ run_id: 'run-local-1', status: 'running' }),
        artifact: expect.objectContaining({
          artifact_id: 'artifact-local-1',
          kind: 'decision.note',
        }),
        supervisor: expect.objectContaining({
          supervisor_state: 'dispatch_pending',
          workspace_id: 'ws-local-1',
        }),
      })
    );
    expect(payload.control_room_snapshot_input.director_queue.items).toEqual([]);

    const claimedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-local-1');
    expect(claimedTask.assigned_to).toBe('agent-executor-1');
    expect(claimedTask.claim_token).toBeTruthy();
    expect(claimedTask.lease_expires_at).toBeTruthy();

    db.close();
    jest.resetModules();
  });

  test('launches a local swarm into durable mission, workspace, run, and session records', async () => {
    jest.resetModules();

    const Database = require('better-sqlite3');
    const localDbPath = '../../../src/lib/db/localDb.js';
    const actualLocalDb = jest.requireActual(localDbPath);
    const db = new Database(':memory:');
    actualLocalDb.ensureRuntimeSchema(db);
    db.prepare('INSERT INTO projects (id, name, local_path) VALUES (?, ?, ?)').run(
      'project-launch',
      'Project Launch',
      '/workspace/devhub'
    );

    const mockLocalDb = {
      ...actualLocalDb,
      getDb: () => db,
    };

    jest.doMock('@/lib/db/localDb.js', () => mockLocalDb);
    jest.doMock(localDbPath, () => mockLocalDb);

    const mockWorkspaceManager = {
      prepareAgentWorktree: jest.fn(({ repoRoot, launchId, roleKey }) => ({
        branchName: `devhub/swarm/${launchId}/${roleKey}`,
        worktreePath: `${repoRoot}/.devhub/worktrees/${launchId}/${roleKey}`,
        observedHead: `head-${launchId}-${roleKey}`,
        created: true,
      })),
      computeBranchName: jest.fn((launchId, roleKey) => `devhub/swarm/${launchId}/${roleKey}`),
      computeWorktreePath: jest.fn(
        (repoRoot, launchId, roleKey) => `${repoRoot}/.devhub/worktrees/${launchId}/${roleKey}`
      ),
    };

    jest.doMock('@/lib/swarm/agentWorkspaceManager', () => mockWorkspaceManager);
    jest.doMock('../../../src/lib/swarm/agentWorkspaceManager', () => mockWorkspaceManager);

    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    const response = await POST({
      json: async () => ({
        action: 'launch_swarm_local',
        project_id: 'project-launch',
        draft: {
          mode: 'template',
          category: 'delivery',
          templateId: 'clean-slate',
          swarmTypeId: 'delivery-swarm',
          teamId: 'feature-delivery-team',
          providerId: 'github-copilot/gpt-4o-mini',
          launchStrategy: 'director_first',
          bootstrapMode: 'engram_first',
          workspacePath: '/workspace/devhub',
          rolePrograms: {
            director: 'codex',
            coder: 'hermes',
            auditor: 'opencode',
            devops: 'opencode',
            architect: 'opencode',
          },
          mission:
            'Lanzar un swarm de feature delivery con Director, Coder, Auditor, DevOps y Architect.',
        },
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.launch_result).toEqual(
      expect.objectContaining({
        launchLabel: 'Lanzar Arranque limpio guiado',
        launch_trace: expect.objectContaining({
          traceType: 'swarm_launch',
          traceSessionId: expect.stringContaining('director-session'),
          launchStrategy: 'director_first',
          bootstrapMode: 'engram_first',
          runtimeRequestCount: 5,
          failedRoleCount: 0,
          phaseCount: 4,
          memorySnapshotCount: 4,
          durationMs: expect.any(Number),
        }),
        runtime_requests: expect.arrayContaining([
          expect.objectContaining({
            selectedAgent: 'codex',
            taskId: expect.stringContaining('director'),
            launchPhase: 'bootstrap',
            startAfterMs: 0,
            command: expect.stringContaining(
              '/home/matias/.nvm/versions/node/v24.14.0/bin/codex exec --sandbox workspace-write'
            ),
            commandPreview: expect.any(String),
            sessionId: expect.stringContaining('director-session'),
            workspaceId: expect.any(String),
            runId: expect.any(String),
            missionId: expect.any(String),
            promptReference: expect.stringMatching(/^evidence:\/\/launch\//),
          }),
          expect.objectContaining({
            selectedAgent: 'hermes',
            taskId: expect.stringContaining('coder'),
            launchPhase: 'fanout',
            startAfterMs: 4000,
            command: expect.stringContaining('/home/matias/.local/bin/hermes chat -q'),
          }),
          expect.objectContaining({
            selectedAgent: 'opencode',
            taskId: expect.stringContaining('auditor'),
            launchPhase: 'fanout',
            startAfterMs: 4000,
            command: expect.stringContaining('/home/matias/.opencode/bin/opencode --agent'),
          }),
          expect.objectContaining({
            selectedAgent: 'opencode',
            taskId: expect.stringContaining('devops'),
            launchPhase: 'fanout',
            startAfterMs: 4000,
            command: expect.stringContaining('/home/matias/.opencode/bin/opencode --agent'),
          }),
          expect.objectContaining({
            selectedAgent: 'opencode',
            taskId: expect.stringContaining('architect'),
            launchPhase: 'fanout',
            startAfterMs: 4000,
            command: expect.stringContaining('/home/matias/.opencode/bin/opencode --agent'),
          }),
        ]),
      })
    );
    expect(payload.control_room_snapshot_input).toEqual(
      expect.objectContaining({
        supervisor: expect.objectContaining({
          supervisor_state: 'dispatch_pending',
          active_agents: 0,
          authority: 'authoritative',
          freshness: 'current',
        }),
        workspaces: expect.arrayContaining([expect.objectContaining({ status: 'provisioning' })]),
        runs: expect.arrayContaining([expect.objectContaining({ status: 'planned' })]),
        artifacts: [],
        evidence_timeline: expect.arrayContaining([
          expect.objectContaining({ kind: 'mission_message' }),
          expect.objectContaining({ kind: 'presence' }),
          expect.objectContaining({ kind: 'delivery' }),
        ]),
        mission_control: expect.objectContaining({
          mission: expect.objectContaining({
            status: 'active',
            title: 'Lanzar Arranque limpio guiado',
          }),
        }),
      })
    );

    expect(db.prepare('SELECT COUNT(*) as count FROM swarm_missions').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as count FROM mission_participants').get().count).toBe(5);
    expect(db.prepare('SELECT COUNT(*) as count FROM agent_workspaces').get().count).toBe(5);
    expect(db.prepare('SELECT COUNT(*) as count FROM agent_runs').get().count).toBe(5);
    expect(db.prepare('SELECT COUNT(*) as count FROM agent_hub_sessions').get().count).toBe(5);
    expect(
      db
        .prepare("SELECT COUNT(*) as count FROM agent_traces WHERE trace_type = 'swarm_launch'")
        .get().count
    ).toBe(1);

    const directorSession = db
      .prepare("SELECT * FROM agent_hub_sessions WHERE agent_model = 'codex' LIMIT 1")
      .get();
    const builderSession = db
      .prepare(
        "SELECT * FROM agent_hub_sessions WHERE agent_model = 'opencode' ORDER BY title ASC LIMIT 1"
      )
      .get();
    const directorPresence = db
      .prepare("SELECT * FROM agent_presence WHERE agent_id LIKE '%director' LIMIT 1")
      .get();

    expect(directorSession).toEqual(
      expect.objectContaining({
        project_id: 'project-launch',
        status: 'active',
        directory: expect.stringContaining('/workspace/devhub/.devhub/worktrees/'),
      })
    );
    expect(builderSession?.opencode_session_id).toBeNull();
    expect(directorPresence).toEqual(
      expect.objectContaining({
        presence_state: 'waiting',
        runtime_surface: 'swarm-control-launch',
        status_summary: expect.stringContaining('esperando primer heartbeat'),
      })
    );

    const launchTrace = db
      .prepare("SELECT * FROM agent_traces WHERE trace_type = 'swarm_launch' LIMIT 1")
      .get();
    expect(launchTrace).toEqual(
      expect.objectContaining({
        session_id: directorSession.id,
        tool_name: 'launch_swarm_local',
        tool_status: 'success',
      })
    );
    const traceMetadata = JSON.parse(launchTrace.metadata);
    expect(traceMetadata).toEqual(
      expect.objectContaining({
        launchId: payload.launch_result.launchId,
        missionId: payload.launch_result.mission_id,
        directorSessionId: directorSession.id,
        launchStrategy: 'director_first',
        bootstrapMode: 'engram_first',
        runtimeRequestCount: 5,
        phaseCount: 4,
        memorySnapshotCount: 4,
      })
    );
    expect(traceMetadata.phaseEvents).toEqual([
      expect.objectContaining({ phase: 'bootstrap_start' }),
      expect.objectContaining({ phase: 'bootstrap_complete' }),
      expect.objectContaining({ phase: 'fanout_start' }),
      expect.objectContaining({ phase: 'fanout_complete' }),
    ]);
    expect(traceMetadata.memorySnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'bootstrap_start', pid: expect.any(Number) }),
        expect.objectContaining({ phase: 'bootstrap_complete', pid: expect.any(Number) }),
        expect.objectContaining({ phase: 'fanout_start', pid: expect.any(Number) }),
        expect.objectContaining({ phase: 'fanout_complete', pid: expect.any(Number) }),
      ])
    );
    expect(traceMetadata.runtimeRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleKey: 'director',
          launchPhase: 'bootstrap',
          startAfterMs: 0,
          sessionId: directorSession.id,
          commandPreview: expect.any(String),
        }),
        expect.objectContaining({ roleKey: 'coder', launchPhase: 'fanout', startAfterMs: 4000 }),
      ])
    );
    expect(traceMetadata.runtimeRequests[0].commandPreview).not.toContain('DEVHUB_AGENT_TOKEN');

    db.close();
    jest.resetModules();
  });
});

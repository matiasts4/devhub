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
          },
        ],
        latest_message: {
          message_id: 'message-1',
          body_summary: 'Tomá la ejecución del workspace principal',
        },
        pending_deliveries: [{ delivery_id: 'delivery-1', status: 'retry_pending' }],
        snapshot_at: '2026-04-10T17:25:00.000Z',
        watermark: 'mission-control-watermark-1',
        presence: {
          active: [{ agent_id: 'agent-director' }],
          stale: [],
          offline: [],
        },
      }),
    });

    expect(snapshot.summary).toMatchObject({
      total: 5,
      healthy: 3,
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
      },
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
    actualLocalDb.ensureRuntimeSchema(db);
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
});

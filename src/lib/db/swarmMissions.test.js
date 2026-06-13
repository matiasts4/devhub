'use strict';
/**
 * @module swarmMissions.test
 * TDD tests for src/lib/db/swarmMissions.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  createSwarmMission,
  getSwarmMissionById,
  registerMissionParticipant,
  listMissionParticipants,
  createMissionMessage,
  listMissionMessages,
  listMissionDirectorFeedItems,
  upsertMessageDelivery,
  listMessageDeliveriesForMission,
  markDeliveryConsumed,
  upsertAgentPresence,
  listAgentPresenceForMission,
  getAgentPresenceStatus,
  getSwarmMissionDirectorSnapshot,
  readMissionDiagnosticSummary,
} = require('./swarmMissions');

function seedWorkspace(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_workspaces (
      id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root,
      workspace_path, worktree_path, base_branch, base_commit, branch_name, status,
      observed_branch, observed_head, observed_dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id || 'ws-1',
    overrides.project_id || 'proj-1',
    overrides.agent_id || 'agent-1',
    overrides.current_task_id || 'task-1',
    overrides.run_id_or_session_id || 'session-1',
    overrides.repo_root || '/repo/devhub',
    overrides.workspace_path || 'workspace://proj-1/ws-1',
    overrides.worktree_path || '/repo/devhub/.devhub/worktrees/ws-1',
    overrides.base_branch || 'main',
    overrides.base_commit || 'HEAD',
    overrides.branch_name || 'feat/ws-1',
    overrides.status || 'active',
    overrides.observed_branch || 'feat/ws-1',
    overrides.observed_head || 'abc123',
    overrides.observed_dirty || 'clean'
  );
}

function seedRun(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.run_id || 'run-1',
    overrides.workspace_id || 'ws-1',
    overrides.task_id || 'task-1',
    overrides.agent_id || 'agent-1',
    overrides.requested_base_ref || 'HEAD',
    overrides.baseline_commit || 'HEAD',
    overrides.status || 'running'
  );
}

function seedSession(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_hub_sessions (
      id, project_id, title, agent_model, status, visibility, opencode_session_id, directory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id || 'session-1',
    overrides.project_id || 'proj-1',
    overrides.title || 'Agent Session',
    overrides.agent_model || 'opencode',
    overrides.status || 'active',
    overrides.visibility || 'visible',
    Object.prototype.hasOwnProperty.call(overrides, 'opencode_session_id')
      ? overrides.opencode_session_id
      : null,
    overrides.directory || '/repo/devhub/.devhub/worktrees/ws-1'
  );
}

function seedDirectorFeedEvent(overrides = {}) {
  const row = {
    agent_id: overrides.agent_id || 'agent-worker-1',
    workspace_id: Object.prototype.hasOwnProperty.call(overrides, 'workspace_id')
      ? overrides.workspace_id
      : null,
    event_type: overrides.event_type || 'task_completed',
    payload_json: JSON.stringify(
      overrides.payload || {
        related_task_id: 'task-1',
        summary: 'Director feed event',
      }
    ),
    mission_id: overrides.mission_id || 'mission-1',
    client_event_id: overrides.client_event_id || null,
    created_at: overrides.created_at || '2026-05-22T10:00:00.000Z',
  };

  db.prepare(
    `INSERT INTO agent_events (
      agent_id, workspace_id, event_type, payload_json, mission_id, client_event_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.agent_id,
    row.workspace_id,
    row.event_type,
    row.payload_json,
    row.mission_id,
    row.client_event_id,
    row.created_at
  );

  return row;
}

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  // Seed a project (FK required by swarm_missions)
  db.prepare('INSERT INTO projects (id, name, description, status) VALUES (?, ?, ?, ?)').run(
    'proj-1',
    'Test Project',
    'A test project',
    'active'
  );
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// createSwarmMission / getSwarmMissionById
// ---------------------------------------------------------------------------

describe('createSwarmMission', () => {
  const validInput = {
    project_id: 'proj-1',
    owner_agent_id: 'agent-1',
    title: 'Test Mission',
    kind: 'task_execution',
  };

  it('creates a mission and returns it', () => {
    const result = createSwarmMission(db, validInput);
    expect(result).not.toBeNull();
    expect(result.mission_id).toBeDefined();
    expect(result.title).toBe('Test Mission');
    expect(result.kind).toBe('task_execution');
    expect(result.status).toBe('planned');
  });

  it('throws if project_id is missing', () => {
    expect(() =>
      createSwarmMission(db, { owner_agent_id: 'a', title: 'T', kind: 'review' })
    ).toThrow();
  });

  it('throws if owner_agent_id is missing', () => {
    expect(() => createSwarmMission(db, { project_id: 'p', title: 'T', kind: 'review' })).toThrow();
  });

  it('throws if title is missing', () => {
    expect(() =>
      createSwarmMission(db, { project_id: 'p', owner_agent_id: 'a', kind: 'review' })
    ).toThrow();
  });

  it('throws on invalid kind', () => {
    expect(() => createSwarmMission(db, { ...validInput, kind: 'invalid' })).toThrow();
  });

  it('accepts db-first calling convention', () => {
    const result = createSwarmMission(db, validInput);
    expect(result.mission_id).toBeDefined();
  });
});

describe('getSwarmMissionById', () => {
  it('returns null for unknown mission', () => {
    expect(getSwarmMissionById(db, 'nonexistent')).toBeNull();
  });

  it('returns mission by id', () => {
    const created = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'Find Me',
      kind: 'task_execution',
    });
    const found = getSwarmMissionById(db, created.mission_id);
    expect(found).not.toBeNull();
    expect(found.title).toBe('Find Me');
  });
});

// ---------------------------------------------------------------------------
// registerMissionParticipant / listMissionParticipants
// ---------------------------------------------------------------------------

describe('registerMissionParticipant', () => {
  let missionId;

  beforeEach(() => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'Mission',
      kind: 'task_execution',
    });
    missionId = m.mission_id;
  });

  it('registers a participant', () => {
    const p = registerMissionParticipant(db, {
      mission_id: missionId,
      agent_id: 'agent-2',
      role_in_mission: 'executor',
    });
    expect(p).not.toBeNull();
    expect(p.agent_id).toBe('agent-2');
    expect(p.role_in_mission).toBe('executor');
  });

  it('throws if mission_id is missing', () => {
    expect(() =>
      registerMissionParticipant(db, { agent_id: 'a', role_in_mission: 'executor' })
    ).toThrow();
  });

  it('throws on invalid role', () => {
    expect(() =>
      registerMissionParticipant(db, {
        mission_id: missionId,
        agent_id: 'a',
        role_in_mission: 'invalid',
      })
    ).toThrow();
  });
});

describe('listMissionParticipants', () => {
  it('returns empty array when no participants', () => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'M',
      kind: 'review',
    });
    expect(listMissionParticipants(db, m.mission_id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createMissionMessage / listMissionMessages
// ---------------------------------------------------------------------------

describe('createMissionMessage', () => {
  let missionId;

  beforeEach(() => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'M',
      kind: 'coordination',
    });
    missionId = m.mission_id;
  });

  it('creates a message', () => {
    const msg = createMissionMessage(db, {
      mission_id: missionId,
      message_kind: 'status',
      body_summary: 'All good',
    });
    expect(msg).not.toBeNull();
    expect(msg.body_summary).toBe('All good');
    expect(msg.message_kind).toBe('status');
  });

  it('throws if mission_id is missing', () => {
    expect(() => createMissionMessage(db, { message_kind: 'status', body_summary: 'x' })).toThrow();
  });

  it('throws on invalid message_kind', () => {
    expect(() =>
      createMissionMessage(db, {
        mission_id: missionId,
        message_kind: 'invalid',
        body_summary: 'x',
      })
    ).toThrow();
  });

  it('throws if body_summary is empty', () => {
    expect(() =>
      createMissionMessage(db, { mission_id: missionId, message_kind: 'status', body_summary: '' })
    ).toThrow();
  });
});

describe('listMissionMessages', () => {
  it('returns empty array when no messages', () => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'M',
      kind: 'review',
    });
    expect(listMissionMessages(db, m.mission_id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertMessageDelivery / listMessageDeliveriesForMission
// ---------------------------------------------------------------------------

describe('upsertMessageDelivery', () => {
  let messageId;

  beforeEach(() => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'M',
      kind: 'coordination',
    });
    const msg = createMissionMessage(db, {
      mission_id: m.mission_id,
      message_kind: 'status',
      body_summary: 'Test message',
    });
    messageId = msg.message_id;
  });

  it('creates a delivery', () => {
    const d = upsertMessageDelivery(db, {
      message_id: messageId,
      recipient_agent_id: 'agent-1',
      channel: 'telegram',
      status: 'pending',
    });
    expect(d).not.toBeNull();
    expect(d.message_id).toBe(messageId);
    expect(d.status).toBe('pending');
  });

  it('throws on invalid status', () => {
    expect(() =>
      upsertMessageDelivery(db, {
        message_id: messageId,
        recipient_agent_id: 'agent-1',
        channel: 'telegram',
        status: 'invalid',
      })
    ).toThrow();
  });
});

describe('listMessageDeliveriesForMission', () => {
  it('returns empty array when no deliveries', () => {
    expect(listMessageDeliveriesForMission(db, 'nonexistent-mission')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertAgentPresence / listAgentPresenceForMission
// ---------------------------------------------------------------------------

describe('upsertAgentPresence', () => {
  it('creates presence record', () => {
    const p = upsertAgentPresence(db, {
      agent_id: 'agent-1',
      runtime_surface: 'opencode',
      presence_state: 'online',
    });
    expect(p).not.toBeNull();
    expect(p.agent_id).toBe('agent-1');
    expect(p.presence_state).toBe('online');
  });

  it('throws on invalid presence_state', () => {
    expect(() =>
      upsertAgentPresence(db, {
        agent_id: 'agent-1',
        runtime_surface: 'opencode',
        presence_state: 'invalid',
      })
    ).toThrow();
  });
});

describe('listAgentPresenceForMission', () => {
  it('returns empty array when no presence', () => {
    expect(listAgentPresenceForMission(db, 'nonexistent')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAgentPresenceStatus
// ---------------------------------------------------------------------------

describe('getAgentPresenceStatus', () => {
  it('returns offline for offline state', () => {
    const result = getAgentPresenceStatus({ presence_state: 'offline' });
    expect(result.effective_state).toBe('offline');
    expect(result.stale).toBe(false);
  });

  it('returns stale when expired', () => {
    const result = getAgentPresenceStatus(
      {
        presence_state: 'online',
        last_seen_at: '2020-01-01T00:00:00.000Z',
        expires_at: '2020-01-01T00:02:00.000Z',
      },
      { now: '2026-01-01T00:00:00.000Z' }
    );
    expect(result.effective_state).toBe('stale');
    expect(result.stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSwarmMissionDirectorSnapshot
// ---------------------------------------------------------------------------

describe('getSwarmMissionDirectorSnapshot', () => {
  it('returns null for unknown mission', () => {
    expect(getSwarmMissionDirectorSnapshot(db, 'nonexistent')).toBeNull();
  });

  it('returns snapshot with mission data', () => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'Snapshot Test',
      kind: 'task_execution',
    });
    const snapshot = getSwarmMissionDirectorSnapshot(db, m.mission_id);
    expect(snapshot).not.toBeNull();
    expect(snapshot.mission.title).toBe('Snapshot Test');
    expect(snapshot.watermark).toBeDefined();
  });

  it('returns empty durable director_feed with idle handoff when no completion facts exist', () => {
    const mission = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'director-1',
      title: 'Empty durable feed',
      kind: 'coordination',
      status: 'active',
    });

    const snapshot = getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
      now: '2026-05-26T20:20:00.000Z',
    });

    expect(snapshot.director_feed).toEqual({
      authority: 'durable',
      freshness: 'current',
      watermark: expect.any(String),
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

  it('projects director_feed newest-first with delivery status as metadata only', () => {
    const mission = createSwarmMission(db, {
      mission_id: 'mission-director-feed',
      project_id: 'proj-1',
      owner_agent_id: 'director-1',
      task_id: 'task-1',
      title: 'Director feed mission',
      kind: 'coordination',
      status: 'active',
    });
    seedWorkspace({ id: 'ws-1', project_id: 'proj-1', agent_id: 'agent-worker-1' });
    seedRun({
      run_id: 'run-1',
      workspace_id: 'ws-1',
      task_id: 'task-1',
      agent_id: 'agent-worker-1',
    });

    seedDirectorFeedEvent({
      mission_id: mission.mission_id,
      workspace_id: 'ws-1',
      event_type: 'task_completed',
      created_at: '2026-05-26T20:21:00.000Z',
      payload: {
        related_task_id: 'task-1',
        related_workspace_id: 'ws-1',
        related_run_id: 'run-1',
        summary: 'Worker finished implementation.',
        delivery_status: 'binding_missing',
      },
    });
    seedDirectorFeedEvent({
      mission_id: mission.mission_id,
      workspace_id: 'ws-1',
      event_type: 'handoff_ready',
      created_at: '2026-05-26T20:22:00.000Z',
      payload: {
        related_task_id: 'task-1',
        related_workspace_id: 'ws-1',
        related_run_id: 'run-1',
        summary: 'Handoff package ready.',
        next_action: 'director_review',
      },
    });
    const handoffMessage = createMissionMessage(db, {
      message_id: 'handoff-message-1',
      mission_id: mission.mission_id,
      sender_agent_id: 'agent-worker-1',
      message_kind: 'handoff',
      body_summary: 'Handoff package ready.',
      related_task_id: 'task-1',
      related_workspace_id: 'ws-1',
      related_run_id: 'run-1',
      created_at: '2026-05-26T20:22:00.000Z',
      updated_at: '2026-05-26T20:22:00.000Z',
    });
    upsertMessageDelivery(db, {
      message_id: handoffMessage.message_id,
      recipient_agent_id: 'director-1',
      channel: 'runtime_bus',
      status: 'pending',
      last_attempt_at: '2026-05-26T20:22:10.000Z',
      updated_at: '2026-05-26T20:22:10.000Z',
    });

    const items = listMissionDirectorFeedItems(db, mission.mission_id);
    const snapshot = getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
      now: '2026-05-26T20:22:30.000Z',
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: 'handoff_ready',
        source: 'agent_event',
        summary: 'Handoff package ready.',
        next_action: 'director_review',
        delivery_status: 'pending',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        kind: 'task_completed',
        source: 'agent_event',
        summary: 'Worker finished implementation.',
        delivery_status: 'binding_missing',
      })
    );
    expect(snapshot.director_feed.items).toEqual(items);
    expect(snapshot.director_feed.handoff).toEqual(
      expect.objectContaining({
        status: 'ready',
        recipient_agent_id: 'agent-worker-1',
        message: 'Handoff package ready.',
        task: expect.objectContaining({ task_id: 'task-1' }),
        workspace: expect.objectContaining({ workspace_id: 'ws-1' }),
        run: expect.objectContaining({ run_id: 'run-1' }),
      })
    );
  });

  it('keeps director_feed watermark stable when only read time changes', () => {
    const mission = createSwarmMission(db, {
      mission_id: 'mission-director-feed-stable',
      project_id: 'proj-1',
      owner_agent_id: 'director-1',
      task_id: 'task-1',
      title: 'Stable director feed watermark',
      kind: 'coordination',
      status: 'active',
    });
    seedDirectorFeedEvent({
      mission_id: mission.mission_id,
      event_type: 'task_completed',
      created_at: '2026-05-26T20:23:00.000Z',
      payload: {
        related_task_id: 'task-1',
        summary: 'Stable director feed item.',
        delivery_status: 'binding_missing',
      },
    });

    const firstSnapshot = getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
      now: '2026-05-26T20:23:10.000Z',
    });
    const secondSnapshot = getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
      now: '2026-05-26T20:25:10.000Z',
    });

    expect(firstSnapshot.director_feed.items).toHaveLength(1);
    expect(secondSnapshot.director_feed.items).toHaveLength(1);
    expect(firstSnapshot.director_feed.watermark).toBe(secondSnapshot.director_feed.watermark);
  });
});

describe('markDeliveryConsumed', () => {
  let missionId;
  let messageId;

  beforeEach(() => {
    const m = createSwarmMission(db, {
      project_id: 'proj-1',
      owner_agent_id: 'agent-1',
      title: 'M',
      kind: 'coordination',
    });
    missionId = m.mission_id;
    const msg = createMissionMessage(db, {
      mission_id: missionId,
      message_kind: 'status',
      body_summary: 'Test',
    });
    messageId = msg.message_id;
  });

  it('transitions pending delivery to consumed', () => {
    const d = upsertMessageDelivery(db, {
      message_id: messageId,
      recipient_agent_id: 'agent-1',
      channel: 'telegram',
      status: 'pending',
    });
    const result = markDeliveryConsumed(db, d.delivery_id);
    expect(result.changes).toBe(1);
    const deliveries = listMessageDeliveriesForMission(db, missionId);
    const updated = deliveries.find((del) => del.delivery_id === d.delivery_id);
    expect(updated.status).toBe('consumed');
  });

  it('is idempotent — second call does not error', () => {
    const d = upsertMessageDelivery(db, {
      message_id: messageId,
      recipient_agent_id: 'agent-1',
      channel: 'telegram',
      status: 'pending',
    });
    markDeliveryConsumed(db, d.delivery_id);
    const result = markDeliveryConsumed(db, d.delivery_id);
    expect(result.changes).toBe(0);
  });
});

describe('readMissionDiagnosticSummary', () => {
  it('reports stale participant bindings from the canonical durable session row', () => {
    const mission = createSwarmMission(db, {
      mission_id: 'mission-stale-summary',
      project_id: 'proj-1',
      owner_agent_id: 'director-1',
      task_id: 'task-stale',
      title: 'Mission stale summary',
      kind: 'coordination',
      status: 'active',
    });
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'worker-stale',
      role_in_mission: 'executor',
      status: 'active',
    });
    seedWorkspace({
      id: 'ws-stale',
      project_id: 'proj-1',
      agent_id: 'worker-stale',
      current_task_id: 'task-stale',
      run_id_or_session_id: 'session-stale',
      status: 'active',
    });
    seedRun({
      run_id: 'run-stale',
      workspace_id: 'ws-stale',
      task_id: 'task-stale',
      agent_id: 'worker-stale',
    });
    seedSession({ id: 'session-stale', opencode_session_id: null });

    const summary = readMissionDiagnosticSummary(db, { missionId: mission.mission_id });

    expect(summary).toEqual(
      expect.objectContaining({
        mission: expect.objectContaining({ mission_id: 'mission-stale-summary' }),
        participants: expect.arrayContaining([
          expect.objectContaining({
            agent_id: 'worker-stale',
            binding: expect.objectContaining({ classification: 'stale', reason: 'binding_stale' }),
          }),
        ]),
      })
    );
  });

  it('preserves orphaned participant diagnosis instead of downgrading it to missing', () => {
    const mission = createSwarmMission(db, {
      mission_id: 'mission-orphaned-summary',
      project_id: 'proj-1',
      owner_agent_id: 'director-1',
      task_id: 'task-orphaned',
      title: 'Mission orphaned summary',
      kind: 'coordination',
      status: 'active',
    });
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: 'worker-orphaned',
      role_in_mission: 'executor',
      status: 'active',
    });
    seedWorkspace({
      id: 'ws-orphaned',
      project_id: 'proj-1',
      agent_id: 'worker-orphaned',
      current_task_id: 'task-orphaned',
      run_id_or_session_id: 'session-orphaned',
      status: 'orphaned',
    });
    seedRun({
      run_id: 'run-orphaned',
      workspace_id: 'ws-orphaned',
      task_id: 'task-orphaned',
      agent_id: 'worker-orphaned',
    });

    const summary = readMissionDiagnosticSummary(db, { missionId: mission.mission_id });

    expect(summary?.participants?.[0]).toEqual(
      expect.objectContaining({
        agent_id: 'worker-orphaned',
        binding: expect.objectContaining({
          classification: 'orphaned',
          reason: 'binding_orphaned',
        }),
      })
    );
  });
});

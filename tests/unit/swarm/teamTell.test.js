const Database = require('better-sqlite3');
const {
  ensureRuntimeSchema,
  createSwarmMission,
  registerMissionParticipant,
  listMissionMessages,
  listMessageDeliveriesForMission,
} = require('../../../src/lib/db/localDb');
const { createTeamTell } = require('../../../src/lib/swarm/teamTell');

function insertProject(db, id = 'project-team-tell') {
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, 'Team Tell Project');
}

function createMissionFixture(db, overrides = {}) {
  const projectId = overrides.project_id || 'project-team-tell';
  insertProject(db, projectId);

  const mission = createSwarmMission(db, {
    mission_id: overrides.mission_id || 'mission-team-tell-1',
    project_id: projectId,
    task_id: overrides.task_id || 'task-team-tell-1',
    owner_agent_id: overrides.owner_agent_id || 'director-1',
    kind: 'coordination',
    status: 'active',
    title: overrides.title || 'Team tell mission',
    started_at: '2026-05-20T16:00:00.000Z',
    updated_at: '2026-05-20T16:00:00.000Z',
  });

  for (const agentId of overrides.participants || [
    'director-1',
    'worker-1',
    'worker-2',
    'worker-3',
  ]) {
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: agentId,
      role_in_mission: agentId === 'director-1' ? 'director' : 'executor',
      status: 'active',
      joined_at: '2026-05-20T16:00:00.000Z',
      updated_at: '2026-05-20T16:00:00.000Z',
    });
  }

  return mission;
}

describe('teamTell use case', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureRuntimeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test('creates one mission_message and one message_delivery per recipient', async () => {
    const mission = createMissionFixture(db, {
      participants: ['director-1', 'worker-1', 'worker-2'],
    });
    const resolveTargetBinding = jest.fn(({ recipient_agent_id }) => ({
      status: 'bound',
      agent_id: recipient_agent_id,
      session_id: `session-${recipient_agent_id}`,
      opencode_session_id: `oc-${recipient_agent_id}`,
      workspace_id: `ws-${recipient_agent_id}`,
      run_id_or_session_id: `session-${recipient_agent_id}`,
      reason: 'binding_found',
      agent_model: 'gpt-5.4',
      cwd: '/repo/devhub',
    }));
    const sendToVerifiedSession = jest.fn(async ({ opencode_session_id }) => ({
      accepted: true,
      delivery_ref: `delivery-ref:${opencode_session_id}`,
      evidence_ref: `evidence-ref:${opencode_session_id}`,
    }));

    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:05:00.000Z',
      resolveTargetBinding,
      sendToVerifiedSession,
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Ship Batch 1',
      recipients: ['worker-1', 'worker-2'],
    });

    const messages = listMissionMessages(db, mission.mission_id);
    const deliveries = listMessageDeliveriesForMission(db, mission.mission_id);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      message_kind: 'directive',
      body_summary: 'Ship Batch 1',
    });
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((row) => row.recipient_agent_id).sort()).toEqual([
      'worker-1',
      'worker-2',
    ]);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.map((row) => row.status)).toEqual(['sent', 'sent']);
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({
        delivery_ref: 'delivery-ref:oc-worker-1',
        evidence_ref: 'evidence-ref:oc-worker-1',
      })
    );
    expect(deliveries.find((row) => row.recipient_agent_id === 'worker-1')).toEqual(
      expect.objectContaining({
        status: 'sent',
        delivery_ref: 'delivery-ref:oc-worker-1',
        evidence_ref: 'evidence-ref:oc-worker-1',
      })
    );
    expect(resolveTargetBinding).toHaveBeenCalledTimes(2);
    expect(sendToVerifiedSession).toHaveBeenCalledTimes(2);
  });

  test('keeps unbound recipients pending with binding_missing and never calls adapter', async () => {
    const mission = createMissionFixture(db, { participants: ['director-1', 'worker-1'] });
    const sendToVerifiedSession = jest.fn();
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:10:00.000Z',
      resolveTargetBinding: jest.fn(() => ({
        status: 'unbound',
        agent_id: 'worker-1',
        session_id: null,
        opencode_session_id: null,
        workspace_id: null,
        run_id_or_session_id: null,
        reason: 'binding_missing',
      })),
      sendToVerifiedSession,
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Wait for binding',
      recipients: ['worker-1'],
    });

    const deliveries = listMessageDeliveriesForMission(db, mission.mission_id);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      recipient_agent_id: 'worker-1',
      channel: 'opencode',
      status: 'pending',
      last_error: 'binding_missing',
    });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        recipient_agent_id: 'worker-1',
        status: 'pending',
        reason: 'binding_missing',
      }),
    ]);
    expect(sendToVerifiedSession).not.toHaveBeenCalled();
  });

  test('handles mixed recipients with independent outcomes', async () => {
    const mission = createMissionFixture(db, {
      participants: ['director-1', 'worker-1', 'worker-2', 'worker-3'],
    });
    const resolveTargetBinding = jest.fn(({ recipient_agent_id }) => {
      if (recipient_agent_id === 'worker-2') {
        return {
          status: 'unbound',
          agent_id: recipient_agent_id,
          session_id: null,
          opencode_session_id: null,
          workspace_id: null,
          run_id_or_session_id: null,
          reason: 'binding_missing',
        };
      }

      return {
        status: 'bound',
        agent_id: recipient_agent_id,
        session_id: `session-${recipient_agent_id}`,
        opencode_session_id: `oc-${recipient_agent_id}`,
        workspace_id: `ws-${recipient_agent_id}`,
        run_id_or_session_id: `session-${recipient_agent_id}`,
        reason: 'binding_found',
        agent_model: 'gpt-5.4',
        cwd: '/repo/devhub',
      };
    });
    const sendToVerifiedSession = jest.fn(async ({ opencode_session_id }) => {
      if (opencode_session_id === 'oc-worker-3') {
        return {
          accepted: false,
          failure_class: 'binding_stale',
          status: 'running',
        };
      }

      return {
        accepted: true,
        delivery_ref: `delivery-ref:${opencode_session_id}`,
      };
    });
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:15:00.000Z',
      resolveTargetBinding,
      sendToVerifiedSession,
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Mixed batch',
      recipients: ['worker-1', 'worker-2', 'worker-3'],
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        recipient_agent_id: 'worker-1',
        status: 'sent',
        reason: 'binding_found',
      }),
      expect.objectContaining({
        recipient_agent_id: 'worker-2',
        status: 'pending',
        reason: 'binding_missing',
      }),
      expect.objectContaining({
        recipient_agent_id: 'worker-3',
        status: 'failed',
        reason: 'binding_stale',
      }),
    ]);
    expect(sendToVerifiedSession).toHaveBeenCalledTimes(2);

    const deliveriesByRecipient = Object.fromEntries(
      listMessageDeliveriesForMission(db, mission.mission_id).map((row) => [
        row.recipient_agent_id,
        row,
      ])
    );

    expect(deliveriesByRecipient['worker-1'].status).toBe('sent');
    expect(deliveriesByRecipient['worker-2'].status).toBe('pending');
    expect(deliveriesByRecipient['worker-2'].last_error).toBe('binding_missing');
    expect(deliveriesByRecipient['worker-3'].status).toBe('failed');
    expect(deliveriesByRecipient['worker-3'].last_error).toBe('binding_stale');
  });

  test('maps stale and failed adapter outcomes back into canonical durable states only', async () => {
    const mission = createMissionFixture(db, {
      participants: ['director-1', 'worker-1', 'worker-2'],
    });
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:20:00.000Z',
      resolveTargetBinding: jest.fn(({ recipient_agent_id }) => ({
        status: 'bound',
        agent_id: recipient_agent_id,
        session_id: `session-${recipient_agent_id}`,
        opencode_session_id: `oc-${recipient_agent_id}`,
        workspace_id: `ws-${recipient_agent_id}`,
        run_id_or_session_id: `session-${recipient_agent_id}`,
        reason: 'binding_found',
      })),
      sendToVerifiedSession: jest.fn(async ({ opencode_session_id }) => {
        if (opencode_session_id === 'oc-worker-1') {
          return { accepted: false, failure_class: 'binding_stale', status: 'completed' };
        }
        return {
          accepted: false,
          failure_class: 'transport_failed',
          retry_requested: true,
          status: 'error',
        };
      }),
    });

    await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Canonical outcomes only',
      recipients: ['worker-1', 'worker-2'],
    });

    const statuses = listMessageDeliveriesForMission(db, mission.mission_id)
      .map((row) => row.status)
      .sort();

    expect(statuses).toEqual(['failed', 'retry_pending']);
    expect(statuses.includes('running')).toBe(false);
    expect(statuses.includes('completed')).toBe(false);
    expect(statuses.includes('error')).toBe(false);
  });

  test('uses adapter-provided durable failed and retry_pending statuses without leaking runtime states', async () => {
    const mission = createMissionFixture(db, {
      participants: ['director-1', 'worker-1', 'worker-2'],
    });
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:25:00.000Z',
      resolveTargetBinding: jest.fn(({ recipient_agent_id }) => ({
        status: 'bound',
        agent_id: recipient_agent_id,
        session_id: `session-${recipient_agent_id}`,
        opencode_session_id: `oc-${recipient_agent_id}`,
        workspace_id: `ws-${recipient_agent_id}`,
        run_id_or_session_id: `session-${recipient_agent_id}`,
        reason: 'binding_found',
      })),
      sendToVerifiedSession: jest.fn(async ({ opencode_session_id }) => {
        if (opencode_session_id === 'oc-worker-1') {
          return {
            accepted: false,
            status: 'failed',
            failure_class: 'binding_stale',
            delivery_ref: null,
            evidence_ref: null,
          };
        }

        return {
          accepted: false,
          status: 'retry_pending',
          failure_class: 'transport_failed',
          retry_requested: true,
          delivery_ref: null,
          evidence_ref: null,
        };
      }),
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Batch 2 adapter contract',
      recipients: ['worker-1', 'worker-2'],
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        recipient_agent_id: 'worker-1',
        status: 'failed',
        reason: 'binding_stale',
      }),
      expect.objectContaining({
        recipient_agent_id: 'worker-2',
        status: 'retry_pending',
        reason: 'transport_failed',
      }),
    ]);
  });

  test('returns compact durable outcomes without runtime binding metadata for unbound recipients', async () => {
    const mission = createMissionFixture(db, { participants: ['director-1', 'worker-1'] });
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:30:00.000Z',
      resolveTargetBinding: jest.fn(() => ({
        status: 'unbound',
        agent_id: 'worker-1',
        session_id: 'runtime-session-1',
        opencode_session_id: 'runtime-opencode-1',
        workspace_id: 'workspace-runtime-1',
        run_id_or_session_id: 'runtime-session-1',
        reason: 'binding_missing',
      })),
      sendToVerifiedSession: jest.fn(),
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Keep runtime binding private',
      recipients: ['worker-1'],
    });

    expect(result.outcomes).toEqual([
      {
        recipient_agent_id: 'worker-1',
        status: 'pending',
        reason: 'binding_missing',
        delivery_id: expect.any(String),
        delivery_ref: null,
        evidence_ref: null,
      },
    ]);
    expect(result.outcomes[0].session_id).toBeUndefined();
    expect(result.outcomes[0].opencode_session_id).toBeUndefined();
    expect(result.outcomes[0].workspace_id).toBeUndefined();
  });

  test('returns compact durable outcomes without runtime binding metadata for bound recipients', async () => {
    const mission = createMissionFixture(db, { participants: ['director-1', 'worker-1'] });
    const teamTell = createTeamTell({
      db,
      now: () => '2026-05-20T16:35:00.000Z',
      resolveTargetBinding: jest.fn(() => ({
        status: 'bound',
        agent_id: 'worker-1',
        session_id: 'session-worker-1',
        opencode_session_id: 'oc-worker-1',
        workspace_id: 'ws-worker-1',
        run_id_or_session_id: 'session-worker-1',
        reason: 'binding_found',
        agent_model: 'gpt-5.4',
        cwd: '/repo/devhub',
      })),
      sendToVerifiedSession: jest.fn(async () => ({
        accepted: true,
        delivery_ref: 'delivery-ref:oc-worker-1',
        evidence_ref: 'evidence-ref:oc-worker-1',
      })),
    });

    const result = await teamTell({
      mission_id: mission.mission_id,
      sender_agent_id: 'director-1',
      body_summary: 'Keep runtime binding private on success',
      recipients: ['worker-1'],
    });

    expect(result.outcomes).toEqual([
      {
        recipient_agent_id: 'worker-1',
        status: 'sent',
        reason: 'binding_found',
        delivery_id: expect.any(String),
        delivery_ref: 'delivery-ref:oc-worker-1',
        evidence_ref: 'evidence-ref:oc-worker-1',
      },
    ]);
    expect(result.outcomes[0].session_id).toBeUndefined();
    expect(result.outcomes[0].opencode_session_id).toBeUndefined();
    expect(result.outcomes[0].workspace_id).toBeUndefined();
  });
});

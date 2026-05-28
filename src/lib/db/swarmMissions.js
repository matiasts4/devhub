/**
 * @module swarmMissions
 * Swarm mission management: CRUD, participants, messages, delivery, presence, director snapshot.
 */

'use strict';

const crypto = require('crypto');
const { getDb, resolveDbArgs, tableExists } = require('./shared');
const { resolveAgentRuntimeBinding, getPreferredBindingWorkspace } = require('./workspaces');
const { buildMissionBindingResult } = require('./agentRuns');
const { getSupervisorSnapshot } = require('./supervisor');

// ---------------------------------------------------------------------------
// Constants (swarm mission domain)
// ---------------------------------------------------------------------------

const SWARM_MISSION_STATUSES = ['planned', 'active', 'paused', 'completed', 'failed', 'aborted'];
const SWARM_MISSION_KINDS = ['task_execution', 'sdd_phase', 'review', 'recovery', 'coordination'];
const MISSION_PARTICIPANT_ROLES = ['director', 'executor', 'reviewer', 'observer'];
const MISSION_PARTICIPANT_STATUSES = ['invited', 'active', 'paused', 'completed', 'removed'];
const MISSION_MESSAGE_KINDS = [
  'directive',
  'status',
  'handoff',
  'decision',
  'risk',
  'approval_request',
  'approval_result',
];
const MISSION_DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'retry_pending', 'expired'];
const AGENT_PRESENCE_STATES = ['online', 'busy', 'idle', 'waiting', 'offline'];
const AGENT_PRESENCE_TTL_MS = 120_000;
const DIRECTOR_FEED_EVENT_TYPES = ['task_completed', 'handoff_ready'];
const EMPTY_DIRECTOR_FEED_HANDOFF = {
  status: 'idle',
  recipient_agent_id: null,
  message: null,
  task: null,
  workspace: null,
  run: null,
  artifact: null,
  supervisor: null,
};
const MISSION_IDENTITY_METADATA_FIELDS = [
  'profile_key',
  'runtime_role',
  'workflow_phase',
  'provider',
  'runtime_package',
];
const RUNTIME_ONLY_FIELDS = [
  'terminal_log',
  'terminal_logs',
  'log',
  'logs',
  'transcript',
  'transcripts',
  'session_id',
  'session_state',
  'sse_event',
  'sse_payload',
  'stdout',
  'stderr',
  'tool_output',
  'raw_output',
];
const DIRECTOR_SNAPSHOT_MISSION_FIELDS = [
  'mission_id',
  'project_id',
  'task_id',
  'workspace_id',
  'run_id',
  'approval_checkpoint_key',
  'owner_agent_id',
  'kind',
  'status',
  'title',
  'summary',
  'evidence_ref',
  'started_at',
  'updated_at',
  'completed_at',
  'created_at',
];
const DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS = [
  'participant_id',
  'mission_id',
  'agent_id',
  'role_in_mission',
  'status',
  'joined_at',
  'left_at',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_MESSAGE_FIELDS = [
  'message_id',
  'mission_id',
  'sender_agent_id',
  'message_kind',
  'body_summary',
  'evidence_ref',
  'related_task_id',
  'related_workspace_id',
  'related_run_id',
  'related_artifact_id',
  'related_approval_checkpoint_key',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_DELIVERY_FIELDS = [
  'delivery_id',
  'message_id',
  'recipient_agent_id',
  'channel',
  'status',
  'delivery_ref',
  'evidence_ref',
  'last_error',
  'attempt_count',
  'last_attempt_at',
  'acked_at',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_PRESENCE_FIELDS = [
  'presence_id',
  'mission_id',
  'agent_id',
  'workspace_id',
  'run_id',
  'runtime_surface',
  'presence_state',
  'status_summary',
  'evidence_ref',
  'last_seen_at',
  'expires_at',
  'created_at',
  'updated_at',
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertNoRuntimeOnlyFields(input, contextLabel) {
  const invalidField = RUNTIME_ONLY_FIELDS.find((key) =>
    Object.prototype.hasOwnProperty.call(input || {}, key)
  );
  if (invalidField) {
    throw new Error(`${contextLabel} no puede persistir runtime-only payload: ${invalidField}`);
  }
}

function assertNoCanonicalIdentityMetadata(input) {
  const invalidField = MISSION_IDENTITY_METADATA_FIELDS.find((key) =>
    Object.prototype.hasOwnProperty.call(input || {}, key)
  );
  if (invalidField) {
    throw new Error(
      `mission-participants no puede mezclar identity metadata canónica: ${invalidField}`
    );
  }
}

function isSwarmMissionStatus(value) {
  return SWARM_MISSION_STATUSES.includes(value);
}

function isSwarmMissionKind(value) {
  return SWARM_MISSION_KINDS.includes(value);
}

function isMissionParticipantRole(value) {
  return MISSION_PARTICIPANT_ROLES.includes(value);
}

function isMissionParticipantStatus(value) {
  return MISSION_PARTICIPANT_STATUSES.includes(value);
}

function isMissionMessageKind(value) {
  return MISSION_MESSAGE_KINDS.includes(value);
}

function isMissionDeliveryStatus(value) {
  return MISSION_DELIVERY_STATUSES.includes(value);
}

function isAgentPresenceState(value) {
  return AGENT_PRESENCE_STATES.includes(value);
}

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

function buildMissionDeliveryKey({ message_id, recipient_agent_id, channel }) {
  return ['delivery', message_id || '-', recipient_agent_id || '-', channel || '-'].join('|');
}

function buildAgentPresenceKey({ mission_id = null, agent_id, runtime_surface }) {
  return ['presence', mission_id || '-', agent_id || '-', runtime_surface || '-'].join('|');
}

// ---------------------------------------------------------------------------
// Presence helpers
// ---------------------------------------------------------------------------

function addPresenceTtl(lastSeenAt, ttlMs = AGENT_PRESENCE_TTL_MS) {
  const baseMs = Date.parse(lastSeenAt);
  if (Number.isNaN(baseMs)) throw new Error(`last_seen_at inválido: ${lastSeenAt}`);
  return new Date(baseMs + ttlMs).toISOString();
}

function getAgentPresenceStatus(presence = {}, options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const expiresAt =
    presence.expires_at || addPresenceTtl(presence.last_seen_at || new Date().toISOString());
  const expiresMs = Date.parse(expiresAt);
  if (presence.presence_state === 'offline') {
    return { effective_state: 'offline', stale: false, expires_at: presence.expires_at || null };
  }
  if (!Number.isNaN(nowMs) && !Number.isNaN(expiresMs) && nowMs > expiresMs) {
    return { effective_state: 'stale', stale: true, expires_at: new Date(expiresMs).toISOString() };
  }
  return {
    effective_state: presence.presence_state || 'offline',
    stale: false,
    expires_at: presence.expires_at || null,
  };
}

// ---------------------------------------------------------------------------
// Swarm Mission CRUD
// ---------------------------------------------------------------------------

function getSwarmMissionById(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  if (!missionId) return null;
  return (
    db.prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1').get(missionId) || null
  );
}

function createSwarmMission(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.project_id) throw new Error('project_id es requerido para swarm_missions.');
  if (!input.owner_agent_id) throw new Error('owner_agent_id es requerido para swarm_missions.');
  if (!input.title) throw new Error('title es requerido para swarm_missions.');
  if (!isSwarmMissionKind(input.kind))
    throw new Error(`kind inválido para swarm_missions: ${input.kind}`);
  const status = input.status || 'planned';
  if (!isSwarmMissionStatus(status)) {
    throw new Error(`status inválido para swarm_missions: ${status}`);
  }
  assertNoRuntimeOnlyFields(input, 'swarm_missions');

  const timestamp = input.updated_at || input.started_at || new Date().toISOString();
  const row = {
    mission_id: input.mission_id || crypto.randomUUID(),
    project_id: input.project_id,
    task_id: input.task_id || null,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    approval_checkpoint_key: input.approval_checkpoint_key || null,
    owner_agent_id: input.owner_agent_id,
    kind: input.kind,
    status,
    title: String(input.title).trim(),
    summary: input.summary ?? null,
    evidence_ref: input.evidence_ref || null,
    started_at: input.started_at || timestamp,
    updated_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: input.created_at || timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO swarm_missions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return getSwarmMissionById(db, row.mission_id);
}

// ---------------------------------------------------------------------------
// Mission Participants
// ---------------------------------------------------------------------------

function listMissionParticipants(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM mission_participants WHERE mission_id = ? ORDER BY joined_at ASC, rowid ASC'
    )
    .all(missionId);
}

function registerMissionParticipant(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.mission_id) throw new Error('mission_id es requerido para mission_participants.');
  if (!input.agent_id) throw new Error('agent_id es requerido para mission_participants.');
  if (!isMissionParticipantRole(input.role_in_mission)) {
    throw new Error(`role_in_mission inválido: ${input.role_in_mission}`);
  }
  const status = input.status || 'active';
  if (!isMissionParticipantStatus(status)) {
    throw new Error(`status inválido para mission_participants: ${status}`);
  }
  assertNoCanonicalIdentityMetadata(input);
  assertNoRuntimeOnlyFields(input, 'mission_participants');

  const timestamp = input.updated_at || input.joined_at || new Date().toISOString();
  const row = {
    participant_id: input.participant_id || crypto.randomUUID(),
    mission_id: input.mission_id,
    agent_id: input.agent_id,
    role_in_mission: input.role_in_mission,
    status,
    joined_at: input.joined_at || timestamp,
    left_at: input.left_at || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO mission_participants (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return (
    db
      .prepare('SELECT * FROM mission_participants WHERE participant_id = ? LIMIT 1')
      .get(row.participant_id) || null
  );
}

function getVerifiedMissionRecipientBinding(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const missionId = input.mission_id;
  const recipientAgentId = input.recipient_agent_id;

  if (!missionId) throw new Error('mission_id es requerido para binding lookup.');
  if (!recipientAgentId) throw new Error('recipient_agent_id es requerido para binding lookup.');

  const mission = getSwarmMissionById(db, missionId);
  if (!mission) {
    return buildMissionBindingResult(null, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
      session_id: null,
      opencode_session_id: null,
      workspace_id: null,
      run_id: null,
      run_id_or_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: null,
    });
  }

  const participant = db
    .prepare(
      `SELECT *
       FROM mission_participants
       WHERE mission_id = ? AND agent_id = ? AND status IN ('invited', 'active', 'paused')
       ORDER BY updated_at DESC, rowid DESC
       LIMIT 1`
    )
    .get(missionId, recipientAgentId);

  if (!participant) {
    return buildMissionBindingResult(null, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
      session_id: null,
      opencode_session_id: null,
      workspace_id: null,
      run_id: null,
      run_id_or_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: null,
    });
  }
  const binding = resolveAgentRuntimeBinding(db, {
    project_id: mission.project_id,
    agent_id: recipientAgentId,
    preferred_task_id: mission.task_id || null,
  });

  if (binding.classification === 'missing') {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
    });
  }

  const workspace = binding.workspace_id
    ? getPreferredBindingWorkspace(db, {
        project_id: mission.project_id,
        agent_id: recipientAgentId,
        preferred_task_id: mission.task_id || null,
      })
    : null;
  const supervisor = mission.task_id ? getSupervisorSnapshot(db, mission.task_id) : null;
  const orphanedByDurableState =
    workspace?.status === 'orphaned' ||
    supervisor?.reason_class === 'orphaned_workspace' ||
    supervisor?.reason_class === 'orphaned_run';

  if (orphanedByDurableState) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'orphaned',
      session_id: binding.run_id_or_session_id || null,
      opencode_session_id: null,
      reason: 'binding_orphaned',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  const sessionId = binding.run_id_or_session_id || null;
  if (!sessionId) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'missing',
      session_id: null,
      opencode_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  const session =
    db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ? LIMIT 1').get(sessionId) || null;
  const opencodeSessionId = session?.opencode_session_id?.trim() || null;
  const isVerified = session && session.status === 'active' && opencodeSessionId;

  if (!isVerified) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'stale',
      session_id: sessionId,
      opencode_session_id: null,
      reason: 'binding_stale',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  return buildMissionBindingResult(binding, {
    status: 'bound',
    classification: 'bound',
    session_id: session.id,
    opencode_session_id: opencodeSessionId,
    reason: 'binding_found',
    agent_model: session.agent_model || null,
    cwd: session.directory || binding.cwd,
  });
}

function readMissionDiagnosticSummary(dbOrInput, maybeInput = {}) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const missionId = input.missionId || input.mission_id;
  if (!missionId) throw new Error('missionId is required for readMissionDiagnosticSummary.');

  const mission = getSwarmMissionById(db, missionId);
  if (!mission) return null;

  const participants = listMissionParticipants(db, missionId).map((participant) => {
    const binding = getVerifiedMissionRecipientBinding(db, {
      mission_id: missionId,
      recipient_agent_id: participant.agent_id,
    });
    const presenceRows = listAgentPresenceForMission(db, missionId).filter(
      (presence) => presence.agent_id === participant.agent_id
    );
    const latestPresence = presenceRows[0] || null;
    return {
      ...participant,
      binding,
      presence: latestPresence
        ? { ...latestPresence, ...getAgentPresenceStatus(latestPresence) }
        : null,
    };
  });

  return {
    mission,
    participants,
  };
}

// ---------------------------------------------------------------------------
// Mission Messages
// ---------------------------------------------------------------------------

function listMissionMessages(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC'
    )
    .all(missionId);
}

function listRecentMissionMessages(dbOrMissionId, maybeMissionId, maybeLimit = 20) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const limit = hasDb ? maybeLimit : maybeMissionId || 20;
  return db
    .prepare(
      'SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
    )
    .all(missionId, limit);
}

function createMissionMessage(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.mission_id) throw new Error('mission_id es requerido para mission_messages.');
  if (!isMissionMessageKind(input.message_kind)) {
    throw new Error(`message_kind inválido para mission_messages: ${input.message_kind}`);
  }
  if (!input.body_summary || !String(input.body_summary).trim()) {
    throw new Error('body_summary es requerido para mission_messages.');
  }
  assertNoRuntimeOnlyFields(input, 'mission_messages');

  const timestamp = input.updated_at || input.created_at || new Date().toISOString();
  const row = {
    message_id: input.message_id || crypto.randomUUID(),
    mission_id: input.mission_id,
    sender_agent_id: input.sender_agent_id || null,
    message_kind: input.message_kind,
    body_summary: String(input.body_summary).trim(),
    evidence_ref: input.evidence_ref || null,
    related_task_id: input.related_task_id || null,
    related_workspace_id: input.related_workspace_id || null,
    related_run_id: input.related_run_id || null,
    related_artifact_id: input.related_artifact_id || null,
    related_approval_checkpoint_key: input.related_approval_checkpoint_key || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO mission_messages (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return db
    .prepare('SELECT * FROM mission_messages WHERE message_id = ? LIMIT 1')
    .get(row.message_id);
}

// ---------------------------------------------------------------------------
// Message Delivery
// ---------------------------------------------------------------------------

function listPendingMessageDeliveriesForMission(dbOrMissionId, maybeMissionId, maybeLimit = 20) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const limit = hasDb ? maybeLimit : maybeMissionId || 20;
  return db
    .prepare(
      `SELECT d.*
       FROM message_deliveries d
       JOIN mission_messages m ON m.message_id = d.message_id
       WHERE m.mission_id = ?
         AND d.status IN ('pending', 'retry_pending')
       ORDER BY CASE
         WHEN COALESCE(d.updated_at, '') >= COALESCE(d.last_attempt_at, '') THEN d.updated_at
         ELSE d.last_attempt_at
       END DESC,
       d.rowid DESC
       LIMIT ?`
    )
    .all(missionId, limit);
}

function listMessageDeliveriesForMission(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      `SELECT d.*
       FROM message_deliveries d
       JOIN mission_messages m ON m.message_id = d.message_id
       WHERE m.mission_id = ?
       ORDER BY d.updated_at DESC, d.rowid DESC`
    )
    .all(missionId);
}

function upsertMessageDelivery(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.message_id) throw new Error('message_id es requerido para message_deliveries.');
  if (!input.recipient_agent_id) {
    throw new Error('recipient_agent_id es requerido para message_deliveries.');
  }
  if (!input.channel) throw new Error('channel es requerido para message_deliveries.');
  if (!isMissionDeliveryStatus(input.status)) {
    throw new Error(`status inválido para message_deliveries: ${input.status}`);
  }
  assertNoRuntimeOnlyFields(input, 'message_deliveries');

  const deliveryId =
    input.delivery_id ||
    buildMissionDeliveryKey({
      message_id: input.message_id,
      recipient_agent_id: input.recipient_agent_id,
      channel: input.channel,
    });
  const existing =
    db.prepare('SELECT * FROM message_deliveries WHERE delivery_id = ? LIMIT 1').get(deliveryId) ||
    null;
  const timestamp = input.updated_at || input.last_attempt_at || new Date().toISOString();
  const row = {
    delivery_id: deliveryId,
    message_id: input.message_id,
    recipient_agent_id: input.recipient_agent_id,
    channel: input.channel,
    status: input.status,
    delivery_ref: input.delivery_ref ?? existing?.delivery_ref ?? null,
    evidence_ref: input.evidence_ref ?? existing?.evidence_ref ?? null,
    last_error: input.last_error ?? existing?.last_error ?? null,
    attempt_count: Number(input.attempt_count || existing?.attempt_count || 1),
    last_attempt_at: input.last_attempt_at || timestamp,
    acked_at: input.acked_at ?? existing?.acked_at ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO message_deliveries (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(delivery_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'delivery_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return db
    .prepare('SELECT * FROM message_deliveries WHERE delivery_id = ? LIMIT 1')
    .get(deliveryId);
}

// ---------------------------------------------------------------------------
// Agent Presence
// ---------------------------------------------------------------------------

function listAgentPresenceForMission(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM agent_presence WHERE mission_id = ? ORDER BY updated_at DESC, rowid DESC'
    )
    .all(missionId);
}

function upsertAgentPresence(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.agent_id) throw new Error('agent_id es requerido para agent_presence.');
  if (!input.runtime_surface) throw new Error('runtime_surface es requerido para agent_presence.');
  if (!isAgentPresenceState(input.presence_state)) {
    throw new Error(`presence_state inválido para agent_presence: ${input.presence_state}`);
  }
  assertNoRuntimeOnlyFields(input, 'agent_presence');

  const lastSeenAt = input.last_seen_at || new Date().toISOString();
  const presenceId =
    input.presence_id ||
    buildAgentPresenceKey({
      mission_id: input.mission_id || null,
      agent_id: input.agent_id,
      runtime_surface: input.runtime_surface,
    });
  const existing =
    db.prepare('SELECT * FROM agent_presence WHERE presence_id = ? LIMIT 1').get(presenceId) ||
    null;
  const timestamp = input.updated_at || lastSeenAt;
  const row = {
    presence_id: presenceId,
    mission_id: input.mission_id ?? existing?.mission_id ?? null,
    agent_id: input.agent_id,
    workspace_id: input.workspace_id ?? existing?.workspace_id ?? null,
    run_id: input.run_id ?? existing?.run_id ?? null,
    runtime_surface: input.runtime_surface,
    presence_state: input.presence_state,
    status_summary: input.status_summary ?? existing?.status_summary ?? null,
    evidence_ref: input.evidence_ref ?? existing?.evidence_ref ?? null,
    last_seen_at: lastSeenAt,
    expires_at: input.expires_at || addPresenceTtl(lastSeenAt),
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_presence (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(presence_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'presence_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return db.prepare('SELECT * FROM agent_presence WHERE presence_id = ? LIMIT 1').get(presenceId);
}

// ---------------------------------------------------------------------------
// Director Snapshot
// ---------------------------------------------------------------------------

function pickSnapshotFields(row, allowedFields) {
  return allowedFields.reduce((acc, fieldName) => {
    acc[fieldName] = row?.[fieldName] ?? null;
    return acc;
  }, {});
}

function parseEventPayload(payloadJson) {
  if (!payloadJson) return {};
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDirectorFeedDeliveryStatus(status) {
  if (!status) return null;
  if (status === 'pending' || status === 'retry_pending') return 'pending';
  if (status === 'sent') return 'sent';
  if (status === 'failed' || status === 'expired') return 'failed';
  if (status === 'binding_missing') return 'binding_missing';
  return null;
}

function defaultDirectorFeedNextAction(kind) {
  if (kind === 'handoff_ready') return 'director_review';
  if (kind === 'task_completed') return 'claim_next_task';
  return null;
}

function getMostRecentTimestamp(row = {}) {
  return row.updated_at || row.last_attempt_at || row.created_at || null;
}

function compareDirectorFeedItems(left = {}, right = {}) {
  const leftTime = Date.parse(left.occurred_at || 0) || 0;
  const rightTime = Date.parse(right.occurred_at || 0) || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(left.feed_id || '').localeCompare(String(right.feed_id || ''));
}

function matchMissionMessageForDirectorFeed(eventRow, payload, missionMessages = []) {
  const allowedKinds =
    eventRow.event_type === 'handoff_ready' ? new Set(['handoff', 'status']) : new Set(['status']);
  const candidates = missionMessages.filter((message) => {
    if (!allowedKinds.has(message.message_kind)) return false;
    if (message.sender_agent_id && message.sender_agent_id !== eventRow.agent_id) return false;
    if (payload.related_task_id && message.related_task_id !== payload.related_task_id)
      return false;
    if (
      payload.related_workspace_id &&
      message.related_workspace_id !== payload.related_workspace_id
    ) {
      return false;
    }
    if (payload.related_run_id && message.related_run_id !== payload.related_run_id) return false;
    if (
      payload.related_approval_checkpoint_key &&
      message.related_approval_checkpoint_key !== payload.related_approval_checkpoint_key
    ) {
      return false;
    }
    return true;
  });

  const scored = candidates
    .map((message) => {
      let score = 0;
      if (message.created_at === eventRow.created_at) score += 4;
      if (payload.summary && message.body_summary === payload.summary) score += 3;
      if (payload.related_task_id && message.related_task_id === payload.related_task_id)
        score += 2;
      if (
        payload.related_workspace_id &&
        message.related_workspace_id === payload.related_workspace_id
      ) {
        score += 2;
      }
      if (payload.related_run_id && message.related_run_id === payload.related_run_id) score += 2;
      if (message.message_kind === 'handoff' && eventRow.event_type === 'handoff_ready') score += 1;
      if (message.message_kind === 'status') score += 1;
      return { message, score };
    })
    .filter((entry) => entry.score >= 3)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return compareDirectorFeedItems(
        { occurred_at: left.message.created_at, feed_id: left.message.message_id },
        { occurred_at: right.message.created_at, feed_id: right.message.message_id }
      );
    });

  return scored[0]?.message || null;
}

function buildDirectorFeedHandoff(item, db) {
  if (!item || item.kind !== 'handoff_ready') return { ...EMPTY_DIRECTOR_FEED_HANDOFF };

  const hasTasksTable = tableExists(db, 'tasks');
  const task = item.task_id
    ? (hasTasksTable
        ? db
            .prepare('SELECT id, title, status, priority FROM tasks WHERE id = ? LIMIT 1')
            .get(item.task_id)
        : null) || { id: item.task_id, title: null, status: null, priority: null }
    : null;
  const workspace = item.workspace_id
    ? db
        .prepare(
          'SELECT id, status, branch_name, evidence_ref FROM agent_workspaces WHERE id = ? LIMIT 1'
        )
        .get(item.workspace_id) || {
        id: item.workspace_id,
        status: null,
        branch_name: null,
        evidence_ref: null,
      }
    : null;
  const run = item.run_id
    ? db
        .prepare('SELECT run_id, status FROM agent_runs WHERE run_id = ? LIMIT 1')
        .get(item.run_id) || { run_id: item.run_id, status: null }
    : null;
  const artifact = item.artifact_id
    ? db
        .prepare(
          'SELECT artifact_id, summary, evidence_ref FROM agent_artifacts WHERE artifact_id = ? LIMIT 1'
        )
        .get(item.artifact_id) || {
        artifact_id: item.artifact_id,
        summary: null,
        evidence_ref: null,
      }
    : null;
  const supervisor = item.task_id ? getSupervisorSnapshot(db, item.task_id) : null;

  return {
    status: 'ready',
    recipient_agent_id: item.agent_id || null,
    message: item.summary || null,
    task: task
      ? {
          task_id: task.id,
          title: task.title || null,
          status: task.status || null,
          priority: task.priority || null,
        }
      : null,
    workspace: workspace
      ? {
          workspace_id: workspace.id,
          status: workspace.status || null,
          branch_name: workspace.branch_name || null,
          evidence_ref: workspace.evidence_ref || null,
        }
      : null,
    run: run
      ? {
          run_id: run.run_id,
          status: run.status || null,
        }
      : null,
    artifact: artifact
      ? {
          artifact_id: artifact.artifact_id,
          summary: artifact.summary || null,
          evidence_ref: artifact.evidence_ref || null,
        }
      : null,
    supervisor: supervisor || null,
  };
}

function listMissionDirectorFeedItems(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const eventRows = db
    .prepare(
      `SELECT *
       FROM agent_events
       WHERE mission_id = ? AND event_type IN (${DIRECTOR_FEED_EVENT_TYPES.map(() => '?').join(', ')})
       ORDER BY created_at DESC, id DESC`
    )
    .all(missionId, ...DIRECTOR_FEED_EVENT_TYPES);
  const missionMessages = listMissionMessages(db, missionId);
  const deliveries = listMessageDeliveriesForMission(db, missionId);

  return eventRows
    .map((eventRow) => {
      const payload = parseEventPayload(eventRow.payload_json);
      const matchedMessage = matchMissionMessageForDirectorFeed(eventRow, payload, missionMessages);
      const matchedDelivery = matchedMessage
        ? deliveries
            .filter((delivery) => delivery.message_id === matchedMessage.message_id)
            .sort((left, right) =>
              compareDirectorFeedItems(
                { occurred_at: getMostRecentTimestamp(left), feed_id: left.delivery_id },
                { occurred_at: getMostRecentTimestamp(right), feed_id: right.delivery_id }
              )
            )[0] || null
        : null;
      const deliveryStatus =
        normalizeDirectorFeedDeliveryStatus(matchedDelivery?.status) ||
        normalizeDirectorFeedDeliveryStatus(payload.delivery_status) ||
        null;

      return {
        feed_id: `agent_event:${eventRow.id}`,
        kind: eventRow.event_type,
        occurred_at: eventRow.created_at,
        mission_id: eventRow.mission_id || null,
        agent_id: eventRow.agent_id || null,
        task_id: payload.related_task_id || null,
        workspace_id: payload.related_workspace_id || eventRow.workspace_id || null,
        run_id: payload.related_run_id || null,
        artifact_id: payload.related_artifact_id || null,
        approval_checkpoint_key: payload.related_approval_checkpoint_key || null,
        summary: payload.summary || matchedMessage?.body_summary || eventRow.event_type,
        next_action: payload.next_action || defaultDirectorFeedNextAction(eventRow.event_type),
        evidence_ref: matchedMessage?.evidence_ref || null,
        source: 'agent_event',
        delivery_status: deliveryStatus,
        message_id: matchedMessage?.message_id || null,
      };
    })
    .sort(compareDirectorFeedItems);
}

function buildDirectorSnapshotWatermark({
  mission,
  participants,
  recentMessages,
  pendingDeliveries,
  presenceRows,
  directorFeed,
}) {
  const material = {
    mission: pickSnapshotFields(mission, DIRECTOR_SNAPSHOT_MISSION_FIELDS),
    participants: participants.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS)
    ),
    recent_messages: recentMessages.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_MESSAGE_FIELDS)
    ),
    pending_deliveries: pendingDeliveries.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_DELIVERY_FIELDS)
    ),
    presence: [...presenceRows]
      .sort((left, right) => {
        const leftKey = `${left.presence_id || ''}|${left.agent_id || ''}|${left.runtime_surface || ''}`;
        const rightKey = `${right.presence_id || ''}|${right.agent_id || ''}|${right.runtime_surface || ''}`;
        return leftKey.localeCompare(rightKey);
      })
      .map((row) => pickSnapshotFields(row, DIRECTOR_SNAPSHOT_PRESENCE_FIELDS)),
    director_feed: (Array.isArray(directorFeed) ? directorFeed : []).map((item) => ({
      feed_id: item.feed_id || null,
      kind: item.kind || null,
      occurred_at: item.occurred_at || null,
      mission_id: item.mission_id || null,
      agent_id: item.agent_id || null,
      task_id: item.task_id || null,
      workspace_id: item.workspace_id || null,
      run_id: item.run_id || null,
      artifact_id: item.artifact_id || null,
      summary: item.summary || null,
      next_action: item.next_action || null,
      evidence_ref: item.evidence_ref || null,
      source: item.source || null,
      delivery_status: item.delivery_status || null,
    })),
  };

  return crypto.createHash('sha1').update(JSON.stringify(material)).digest('hex');
}

function getSwarmMissionDirectorSnapshot(dbOrMissionId, maybeMissionId, maybeOptions) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const options = hasDb ? maybeOptions || {} : maybeMissionId || {};
  const snapshotAt = options.now || new Date().toISOString();
  const mission = getSwarmMissionById(db, missionId);
  if (!mission) return null;

  const participants = listMissionParticipants(db, missionId);
  const recentMessages = listRecentMissionMessages(db, missionId, 20);
  const latestMessage = recentMessages[0] || null;
  const pendingDeliveries = listPendingMessageDeliveriesForMission(db, missionId, 20);
  const supervisorSnapshots = mission.task_id
    ? require('./supervisor').listSupervisorSnapshots(db, { task_id: mission.task_id, limit: 20 })
    : [];
  const approvalCheckpoints = mission.task_id
    ? require('./supervisor').listSupervisorApprovalCheckpoints(db, {
        task_id: mission.task_id,
        limit: 20,
      })
    : [];
  const presenceRows = listAgentPresenceForMission(db, missionId).map((presence) => ({
    ...presence,
    ...getAgentPresenceStatus(presence, { ...options, now: snapshotAt }),
  }));
  const directorFeedItems = listMissionDirectorFeedItems(db, missionId);
  const watermark = buildDirectorSnapshotWatermark({
    mission,
    participants,
    recentMessages,
    pendingDeliveries,
    presenceRows,
    directorFeed: directorFeedItems,
  });
  const directorFeedHandoff = buildDirectorFeedHandoff(
    directorFeedItems.find((item) => item.kind === 'handoff_ready') || null,
    db
  );

  return {
    mission,
    participants,
    recent_messages: recentMessages,
    latest_message: latestMessage,
    pending_deliveries: pendingDeliveries,
    supervisor_snapshots: supervisorSnapshots,
    approval_checkpoints: approvalCheckpoints,
    snapshot_at: snapshotAt,
    watermark,
    director_feed: {
      authority: 'durable',
      freshness: 'current',
      watermark,
      items: directorFeedItems,
      handoff: directorFeedHandoff,
    },
    presence: {
      active: presenceRows.filter(
        (presence) => !presence.stale && presence.effective_state !== 'offline'
      ),
      stale: presenceRows.filter((presence) => presence.effective_state === 'stale'),
      offline: presenceRows.filter((presence) => presence.effective_state === 'offline'),
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  SWARM_MISSION_STATUSES,
  SWARM_MISSION_KINDS,
  MISSION_PARTICIPANT_ROLES,
  MISSION_PARTICIPANT_STATUSES,
  MISSION_MESSAGE_KINDS,
  MISSION_DELIVERY_STATUSES,
  AGENT_PRESENCE_STATES,
  AGENT_PRESENCE_TTL_MS,
  MISSION_IDENTITY_METADATA_FIELDS,
  RUNTIME_ONLY_FIELDS,
  DIRECTOR_SNAPSHOT_MISSION_FIELDS,
  DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS,
  DIRECTOR_SNAPSHOT_MESSAGE_FIELDS,
  DIRECTOR_SNAPSHOT_DELIVERY_FIELDS,
  DIRECTOR_SNAPSHOT_PRESENCE_FIELDS,
  // Validators
  isSwarmMissionStatus,
  isSwarmMissionKind,
  isMissionParticipantRole,
  isMissionParticipantStatus,
  isMissionMessageKind,
  isMissionDeliveryStatus,
  isAgentPresenceState,
  // Key builders
  buildMissionDeliveryKey,
  buildAgentPresenceKey,
  // Presence
  addPresenceTtl,
  getAgentPresenceStatus,
  // Swarm Mission CRUD
  createSwarmMission,
  getSwarmMissionById,
  // Participants
  registerMissionParticipant,
  listMissionParticipants,
  getVerifiedMissionRecipientBinding,
  readMissionDiagnosticSummary,
  // Messages
  createMissionMessage,
  listMissionMessages,
  listRecentMissionMessages,
  listMissionDirectorFeedItems,
  // Delivery
  listPendingMessageDeliveriesForMission,
  listMessageDeliveriesForMission,
  upsertMessageDelivery,
  // Presence
  listAgentPresenceForMission,
  upsertAgentPresence,
  // Director snapshot
  pickSnapshotFields,
  buildDirectorSnapshotWatermark,
  getSwarmMissionDirectorSnapshot,
  // Re-exported from agentRuns (needed by tests and callers)
  resolveAgentRuntimeBinding,
  getPreferredBindingWorkspace,
  buildMissionBindingResult,
};

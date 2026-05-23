'use strict';
/**
 * @module supervisor
 * Supervisor snapshot and approval checkpoint management.
 */
const {
  resolveDbArgs,
  tableExists,
  SUPERVISOR_STATES,
  SUPERVISOR_OUTCOMES,
  SUPERVISOR_REASON_CLASSES,
  SUPERVISOR_APPROVAL_STATUSES,
} = require('./core');

function isSupervisorState(value) {
  return SUPERVISOR_STATES.includes(value);
}

function isSupervisorOutcome(value) {
  return value == null || SUPERVISOR_OUTCOMES.includes(value);
}

function isSupervisorReasonClass(value) {
  return value == null || SUPERVISOR_REASON_CLASSES.includes(value);
}

function isSupervisorApprovalStatus(value) {
  return SUPERVISOR_APPROVAL_STATUSES.includes(value);
}

function buildSupervisorApprovalCheckpointKey({
  task_id,
  workspace_id = null,
  run_id = null,
  reason_class,
  evidence_ref = null,
}) {
  if (!task_id) throw new Error('task_id es requerido para approval checkpoint.');
  if (!reason_class) throw new Error('reason_class es requerido para approval checkpoint.');
  return [task_id, workspace_id || '-', run_id || '-', reason_class, evidence_ref || '-'].join('|');
}

function getSupervisorSnapshot(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : require('./core').getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  return (
    db.prepare('SELECT * FROM supervisor_snapshots WHERE task_id = ? LIMIT 1').get(taskId) || null
  );
}

function listSupervisorSnapshots(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.run_id) {
    clauses.push('run_id = ?');
    params.push(filters.run_id);
  }
  if (filters.supervisor_state) {
    clauses.push('supervisor_state = ?');
    params.push(filters.supervisor_state);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM supervisor_snapshots ${whereSql} ORDER BY updated_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function upsertSupervisorSnapshot(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.task_id) throw new Error('task_id es requerido para supervisor_snapshots.');
  if (!isSupervisorState(input.supervisor_state)) {
    throw new Error(`supervisor_state inválido: ${input.supervisor_state}`);
  }
  if (!isSupervisorOutcome(input.outcome)) {
    throw new Error(`outcome inválido: ${input.outcome}`);
  }
  if (!isSupervisorReasonClass(input.reason_class)) {
    throw new Error(`reason_class inválido: ${input.reason_class}`);
  }

  const existing = getSupervisorSnapshot(db, input.task_id);
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    task_id: input.task_id,
    supervisor_state: input.supervisor_state,
    outcome: input.outcome || null,
    reason_class: input.reason_class || null,
    task_retry_count: Number(input.task_retry_count || 0),
    attempt_count: Number(input.attempt_count || 0),
    unchanged_failure_count: Number(input.unchanged_failure_count || 0),
    approval_request_count: Number(input.approval_request_count || 0),
    orphan_recovery_count: Number(input.orphan_recovery_count || 0),
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    evidence_ref: input.evidence_ref || null,
    approval_checkpoint_key: input.approval_checkpoint_key || null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO supervisor_snapshots (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(task_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'task_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return getSupervisorSnapshot(db, input.task_id);
}

function getSupervisorApprovalCheckpoint(dbOrKey, maybeKey) {
  const hasDb = dbOrKey && typeof dbOrKey.prepare === 'function';
  const db = hasDb ? dbOrKey : require('./core').getDb();
  const checkpointKey = hasDb ? maybeKey : dbOrKey;
  if (!checkpointKey) return null;
  return (
    db
      .prepare('SELECT * FROM supervisor_approval_checkpoints WHERE checkpoint_key = ? LIMIT 1')
      .get(checkpointKey) || null
  );
}

function listSupervisorApprovalCheckpoints(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.run_id) {
    clauses.push('run_id = ?');
    params.push(filters.run_id);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM supervisor_approval_checkpoints ${whereSql} ORDER BY updated_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function upsertSupervisorApprovalCheckpoint(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.task_id) throw new Error('task_id es requerido para supervisor_approval_checkpoints.');
  if (!isSupervisorReasonClass(input.reason_class) || !input.reason_class) {
    throw new Error(`reason_class inválido: ${input.reason_class}`);
  }
  const status = input.status || 'pending';
  if (!isSupervisorApprovalStatus(status)) {
    throw new Error(`approval status inválido: ${status}`);
  }

  const checkpointKey =
    input.checkpoint_key ||
    buildSupervisorApprovalCheckpointKey({
      task_id: input.task_id,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
      reason_class: input.reason_class,
      evidence_ref: input.evidence_ref || null,
    });
  const existing = getSupervisorApprovalCheckpoint(db, checkpointKey);
  const timestamp = input.updated_at || new Date().toISOString();
  const decidedAt =
    status === 'pending' ? null : (input.decided_at ?? existing?.decided_at ?? timestamp);
  const row = {
    checkpoint_key: checkpointKey,
    task_id: input.task_id,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    reason_class: input.reason_class,
    evidence_ref: input.evidence_ref || null,
    status,
    requested_at: existing?.requested_at || input.requested_at || timestamp,
    decided_at: decidedAt,
    decision_note: input.decision_note ?? existing?.decision_note ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO supervisor_approval_checkpoints (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(checkpoint_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'checkpoint_key' && key !== 'created_at' && key !== 'requested_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return getSupervisorApprovalCheckpoint(db, checkpointKey);
}

function getLatestTaskComment(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : require('./core').getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  if (!tableExists(db, 'task_comments')) return null;
  return (
    db
      .prepare(
        'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(taskId) || null
  );
}

module.exports = {
  isSupervisorState,
  isSupervisorOutcome,
  isSupervisorReasonClass,
  isSupervisorApprovalStatus,
  buildSupervisorApprovalCheckpointKey,
  getSupervisorSnapshot,
  listSupervisorSnapshots,
  upsertSupervisorSnapshot,
  getSupervisorApprovalCheckpoint,
  listSupervisorApprovalCheckpoints,
  upsertSupervisorApprovalCheckpoint,
  getLatestTaskComment,
};

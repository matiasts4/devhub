'use strict';
/**
 * @module agentRuns
 * Agent run lifecycle management.
 */
const { resolveDbArgs, getAgentRunById, AGENT_RUN_OBSERVED_DIRTY_STATUSES } = require('./core');
const { isAgentRunStatus, isTerminalAgentRunStatus } = require('./agentRunArtifacts');

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function listAgentRuns(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.agent_id) {
    clauses.push('agent_id = ?');
    params.push(filters.agent_id);
  }
  if (filters.recovery_group_id) {
    clauses.push('recovery_group_id = ?');
    params.push(filters.recovery_group_id);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM agent_runs ${whereSql} ORDER BY created_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function getLatestAgentRunForTask(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : require('./core').getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  return (
    db
      .prepare(
        'SELECT * FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(taskId) || null
  );
}

// ---------------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------------

function createAgentRun(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const timestamp = input.started_at || new Date().toISOString();
  const status = input.status || 'planned';
  if (!isAgentRunStatus(status)) {
    throw new Error(`Agent run status inválido: ${status}`);
  }
  if (!input.workspace_id) throw new Error('workspace_id es requerido para agent_runs.');
  if (!input.agent_id) throw new Error('agent_id es requerido para agent_runs.');
  if (!input.requested_base_ref)
    throw new Error('requested_base_ref es requerido para agent_runs.');
  if (!input.baseline_commit) throw new Error('baseline_commit es requerido para agent_runs.');
  if (
    input.observed_start?.dirty &&
    !AGENT_RUN_OBSERVED_DIRTY_STATUSES.includes(input.observed_start.dirty)
  ) {
    throw new Error(`observed_start.dirty inválido: ${input.observed_start.dirty}`);
  }
  if (input.predecessor_run_id && !getAgentRunById(db, input.predecessor_run_id)) {
    throw new Error(`predecessor_run_id no encontrado: ${input.predecessor_run_id}`);
  }

  const row = {
    run_id: input.run_id || crypto.randomUUID(),
    workspace_id: input.workspace_id,
    task_id: input.task_id || null,
    agent_id: input.agent_id,
    requested_base_ref: input.requested_base_ref,
    baseline_commit: input.baseline_commit,
    observed_start_branch: input.observed_start?.branch || null,
    observed_start_head: input.observed_start?.head || null,
    observed_start_dirty: input.observed_start?.dirty || null,
    observed_start_path: input.observed_start?.path || null,
    status,
    predecessor_run_id: input.predecessor_run_id || null,
    recovery_group_id: input.recovery_group_id || null,
    terminal_reason_class: input.terminal_reason_class || null,
    started_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_runs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));

  return getAgentRunById(db, row.run_id);
}

function updateAgentRunTerminal(dbOrRunId, maybeRunId, maybeUpdates) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : require('./core').getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  const updates = hasDb ? maybeUpdates || {} : maybeRunId || {};
  const existing = getAgentRunById(db, runId);
  if (!existing) throw new Error(`agent_run ${runId} no encontrado.`);
  const status = updates.status || existing.status;
  if (!isTerminalAgentRunStatus(status)) {
    throw new Error(`Estado terminal inválido para agent_run: ${status}`);
  }

  const payload = {
    status,
    terminal_reason_class: updates.terminal_reason_class || existing.terminal_reason_class || null,
    completed_at: updates.completed_at || new Date().toISOString(),
    updated_at: updates.updated_at || new Date().toISOString(),
  };
  const keys = Object.keys(payload);
  db.prepare(
    `UPDATE agent_runs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE run_id = ?`
  ).run(...keys.map((key) => payload[key] ?? null), runId);
  return getAgentRunById(db, runId);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildMissionBindingResult(binding = {}, overrides = {}) {
  return {
    status: overrides.status || binding.status || 'unbound',
    classification: overrides.classification || binding.classification || 'missing',
    agent_id: overrides.agent_id || binding.agent_id || null,
    session_id: Object.prototype.hasOwnProperty.call(overrides, 'session_id')
      ? overrides.session_id
      : binding.session_id || null,
    opencode_session_id: Object.prototype.hasOwnProperty.call(overrides, 'opencode_session_id')
      ? overrides.opencode_session_id
      : binding.opencode_session_id || null,
    workspace_id: Object.prototype.hasOwnProperty.call(overrides, 'workspace_id')
      ? overrides.workspace_id
      : binding.workspace_id || null,
    run_id: Object.prototype.hasOwnProperty.call(overrides, 'run_id')
      ? overrides.run_id
      : binding.run_id || null,
    run_id_or_session_id: Object.prototype.hasOwnProperty.call(overrides, 'run_id_or_session_id')
      ? overrides.run_id_or_session_id
      : binding.run_id_or_session_id || null,
    reason: overrides.reason || binding.reason || 'binding_missing',
    agent_model: Object.prototype.hasOwnProperty.call(overrides, 'agent_model')
      ? overrides.agent_model
      : binding.agent_model || null,
    cwd: Object.prototype.hasOwnProperty.call(overrides, 'cwd')
      ? overrides.cwd
      : binding.cwd || null,
  };
}

module.exports = {
  listAgentRuns,
  getLatestAgentRunForTask,
  createAgentRun,
  updateAgentRunTerminal,
  buildMissionBindingResult,
};

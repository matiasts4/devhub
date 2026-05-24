'use strict';
/**
 * @module workspaces
 * Agent workspace lease management and runtime binding resolution.
 */
const {
  resolveDbArgs,
  getAgentRunById,
  tableExists,
  AGENT_WORKSPACE_TERMINAL_STATUSES,
  AGENT_WORKSPACE_BASE_COMMIT,
} = require('./core');

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildWorkspaceIntentId(taskId, agentId) {
  return `workspace-${taskId}-${agentId}`;
}

function buildPrepareAgentWorkspaceAck(workspace) {
  return {
    workspace_id: workspace.id,
    task_id: workspace.current_task_id,
    agent_id: workspace.agent_id,
    requested_base_ref: workspace.base_commit,
    reservation_token: workspace.reservation_token,
    correlation_id: workspace.correlation_id,
    status: workspace.status,
    accepted_at: workspace.accepted_at || workspace.updated_at || workspace.created_at || null,
  };
}

function validatePrepareAgentWorkspaceIdentity({
  workspace_id,
  task_id,
  agent_id,
  correlation_id,
}) {
  const hasWorkspaceId = Boolean(workspace_id);
  const hasTaskIdentity = Boolean(task_id || agent_id);
  const hasCompleteTaskIdentity = Boolean(task_id && agent_id);

  if (!correlation_id) {
    throw new Error('correlation_id es requerido.');
  }

  if (!hasWorkspaceId && hasTaskIdentity && !hasCompleteTaskIdentity) {
    throw new Error('task_id y agent_id deben enviarse juntos.');
  }

  if (!hasWorkspaceId && !hasCompleteTaskIdentity) {
    throw new Error('Se requiere exactamente una identidad: workspace_id o task_id + agent_id.');
  }

  if (hasWorkspaceId && hasTaskIdentity) {
    throw new Error('workspace_id no puede combinarse con task_id o agent_id.');
  }
}

function resolvePreparationProjectId(db, taskId) {
  if (!taskId || !tableExists(db, 'tasks')) return 'control-plane-pending';
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1').get(taskId);
  return task?.project_id || 'control-plane-pending';
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function getLatestAgentRunForWorkspace(dbOrWorkspaceId, maybeWorkspaceId) {
  const hasDb = dbOrWorkspaceId && typeof dbOrWorkspaceId.prepare === 'function';
  const db = hasDb ? dbOrWorkspaceId : require('./core').getDb();
  const workspaceId = hasDb ? maybeWorkspaceId : dbOrWorkspaceId;
  if (!workspaceId) return null;
  return (
    db
      .prepare(
        'SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(workspaceId) || null
  );
}

function getPreferredBindingWorkspace(db, { project_id, agent_id, preferred_task_id } = {}) {
  if (!project_id || !agent_id) return null;
  return (
    db
      .prepare(
        `SELECT *
         FROM agent_workspaces
         WHERE project_id = ?
           AND agent_id = ?
           AND status IN ('planned', 'provisioning', 'ready', 'active', 'paused', 'cleanup_pending', 'orphaned')
         ORDER BY CASE WHEN current_task_id = ? THEN 0 ELSE 1 END, updated_at DESC, rowid DESC
         LIMIT 1`
      )
      .get(project_id, agent_id, preferred_task_id || '') || null
  );
}

function buildMissingRuntimeBinding(agentId, overrides = {}) {
  return {
    classification: 'missing',
    status: 'unbound',
    reason: 'binding_missing',
    agent_id: agentId,
    workspace_id: overrides.workspace_id || null,
    run_id: null,
    run_id_or_session_id: overrides.run_id_or_session_id || null,
    session_id: null,
    opencode_session_id: null,
    agent_model: null,
    cwd: overrides.cwd || null,
  };
}

function resolveAgentRuntimeBinding(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const projectId = input.project_id;
  const agentId = input.agent_id;

  if (!projectId) throw new Error('project_id es requerido para resolveAgentRuntimeBinding.');
  if (!agentId) throw new Error('agent_id es requerido para resolveAgentRuntimeBinding.');

  const workspace = getPreferredBindingWorkspace(db, {
    project_id: projectId,
    agent_id: agentId,
    preferred_task_id: input.preferred_task_id || null,
  });

  if (!workspace) {
    return buildMissingRuntimeBinding(agentId);
  }

  const run = getLatestAgentRunForWorkspace(db, workspace.id);
  if (!run) {
    return buildMissingRuntimeBinding(agentId, {
      workspace_id: workspace.id,
      run_id_or_session_id: workspace.run_id_or_session_id || null,
      cwd: workspace.repo_root || null,
    });
  }

  return {
    classification: 'bound',
    status: 'bound',
    reason: 'binding_found',
    agent_id: agentId,
    workspace_id: workspace.id,
    run_id: run.run_id,
    run_id_or_session_id: workspace.run_id_or_session_id || null,
    session_id: null,
    opencode_session_id: null,
    agent_model: null,
    cwd: workspace.repo_root || null,
  };
}

// ---------------------------------------------------------------------------
// Main: prepareAgentWorkspaceLease
// ---------------------------------------------------------------------------

function prepareAgentWorkspaceLease(db, input = {}, options = {}) {
  if (!db) throw new Error('Database handle requerido para prepareAgentWorkspaceLease.');

  validatePrepareAgentWorkspaceIdentity(input);

  const timestamp = options.acceptedAt || new Date().toISOString();
  const requestedBaseRef = input.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT;
  const repoRoot = options.repoRoot || process.cwd();
  const baseBranch = options.baseBranch || input.base_branch || 'main';

  let workspace = null;
  let workspaceId = input.workspace_id || null;
  let taskId = input.task_id || null;
  let agentId = input.agent_id || null;

  if (workspaceId) {
    workspace = db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} no encontrado.`);
    }
    taskId = workspace.current_task_id;
    agentId = workspace.agent_id;
  } else {
    workspace = db
      .prepare(
        'SELECT * FROM agent_workspaces WHERE current_task_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(taskId, agentId);
    workspaceId = workspace?.id || buildWorkspaceIntentId(taskId, agentId);
  }

  if (workspace && workspace.correlation_id === input.correlation_id) {
    return {
      created: false,
      reused: true,
      workspace,
      ack: buildPrepareAgentWorkspaceAck(workspace),
    };
  }

  const reservationToken =
    input.reservation_token || workspace?.reservation_token || `rsv-${crypto.randomUUID()}`;
  const projectId =
    input.project_id || workspace?.project_id || resolvePreparationProjectId(db, taskId);
  const workspacePath =
    workspace?.workspace_path ||
    input.workspace_path ||
    `workspace://${projectId}/${workspaceId}`;
  const acceptedAt = timestamp;

  if (!workspace) {
    const row = {
      id: workspaceId,
      project_id: projectId,
      agent_id: agentId,
      current_task_id: taskId,
      run_id_or_session_id: null,
      repo_root: input.repo_root || repoRoot,
      workspace_path: workspacePath,
      worktree_path: null,
      base_branch: baseBranch,
      base_commit: requestedBaseRef,
      branch_name: null,
      status: 'provisioning',
      observed_branch: null,
      observed_head: null,
      observed_dirty: null,
      last_error: null,
      last_error_class: null,
      recovery_reason: null,
      evidence_ref: null,
      reservation_token: reservationToken,
      correlation_id: input.correlation_id,
      accepted_at: acceptedAt,
      claimed_at: null,
      started_at: null,
      updated_at: timestamp,
      completed_at: null,
    };

    const keys = Object.keys(row);
    db.prepare(
      `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...keys.map((key) => row[key] ?? null));

    const created = db
      .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
      .get(workspaceId);
    return {
      created: true,
      reused: false,
      workspace: created,
      ack: buildPrepareAgentWorkspaceAck(created),
    };
  }

  const updates = {
    base_commit: requestedBaseRef,
    status: AGENT_WORKSPACE_TERMINAL_STATUSES.includes(workspace.status)
      ? workspace.status
      : 'provisioning',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    reservation_token: reservationToken,
    correlation_id: input.correlation_id,
    accepted_at: acceptedAt,
    updated_at: timestamp,
  };

  const keys = Object.keys(updates);
  db.prepare(
    `UPDATE agent_workspaces SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`
  ).run(...keys.map((key) => updates[key] ?? null), workspaceId);

  const updated = db
    .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
    .get(workspaceId);
  return {
    created: false,
    reused: false,
    workspace: updated,
    ack: buildPrepareAgentWorkspaceAck(updated),
  };
}

module.exports = {
  buildWorkspaceIntentId,
  buildPrepareAgentWorkspaceAck,
  validatePrepareAgentWorkspaceIdentity,
  resolvePreparationProjectId,
  getLatestAgentRunForWorkspace,
  getPreferredBindingWorkspace,
  buildMissingRuntimeBinding,
  resolveAgentRuntimeBinding,
  prepareAgentWorkspaceLease,
};

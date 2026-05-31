'use strict';

const crypto = require('crypto');
const {
  AGENT_WORKSPACE_BASE_COMMIT,
  AGENT_WORKSPACE_TERMINAL_STATUSES,
  resolveDbArgs,
  tableExists,
} = require('./shared');
const agentRuns = require('./agentRuns');
const artifacts = require('./artifacts');
const observability = require('./observability');

function buildWorkspaceIntentId(taskId, agentId) {
  return `workspace-${taskId}-${agentId}`;
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
  if (!input.project_id)
    throw new Error('project_id es requerido para resolveAgentRuntimeBinding.');
  if (!input.agent_id) throw new Error('agent_id es requerido para resolveAgentRuntimeBinding.');

  const workspace = getPreferredBindingWorkspace(db, {
    project_id: input.project_id,
    agent_id: input.agent_id,
    preferred_task_id: input.preferred_task_id || null,
  });

  if (!workspace) {
    return buildMissingRuntimeBinding(input.agent_id);
  }

  const run = agentRuns.getLatestAgentRunForWorkspace(db, workspace.id);
  if (!run) {
    return buildMissingRuntimeBinding(input.agent_id, {
      workspace_id: workspace.id,
      run_id_or_session_id: workspace.run_id_or_session_id || null,
      cwd: workspace.repo_root || null,
    });
  }

  return {
    classification: 'bound',
    status: 'bound',
    reason: 'binding_found',
    agent_id: input.agent_id,
    workspace_id: workspace.id,
    run_id: run.run_id,
    run_id_or_session_id: workspace.run_id_or_session_id || null,
    session_id: null,
    opencode_session_id: null,
    agent_model: null,
    cwd: workspace.repo_root || null,
  };
}

function reconcileAgentRuntimeSessionBinding(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const sessionId = String(input.session_id || '').trim();
  const workspaceId = String(input.workspace_id || '').trim();
  const runId = String(input.run_id || '').trim();
  const opencodeSessionId = String(input.opencode_session_id || '').trim();

  if (!sessionId) {
    throw new Error('session_id es requerido para reconcileAgentRuntimeSessionBinding.');
  }
  if (!workspaceId) {
    throw new Error('workspace_id es requerido para reconcileAgentRuntimeSessionBinding.');
  }
  if (!runId) {
    throw new Error('run_id es requerido para reconcileAgentRuntimeSessionBinding.');
  }
  if (!opencodeSessionId) {
    throw new Error('opencode_session_id es requerido para reconcileAgentRuntimeSessionBinding.');
  }

  const session =
    db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ? LIMIT 1').get(sessionId) || null;
  const workspace =
    db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(workspaceId) || null;
  const run = agentRuns.getAgentRunById(db, runId);
  const latestRun = workspaceId ? agentRuns.getLatestAgentRunForWorkspace(db, workspaceId) : null;

  const noop = (reason) => ({
    status: 'noop',
    reason,
    session_id: sessionId,
    workspace_id: workspaceId,
    run_id: runId,
    opencode_session_id: null,
  });

  if (!session || !workspace || !run) {
    return noop('binding_missing');
  }

  const workspaceOwnsSession = workspace.run_id_or_session_id === sessionId;
  const runOwnsWorkspace = run.workspace_id === workspaceId;
  const latestRunMatches = latestRun?.run_id === runId;

  if (!workspaceOwnsSession || !runOwnsWorkspace || !latestRunMatches) {
    return noop('binding_missing');
  }

  if (workspace.status === 'orphaned' || session.status !== 'active') {
    return noop('binding_stale');
  }

  if ((session.opencode_session_id || '').trim() !== opencodeSessionId) {
    observability.updateSessionOpenCodeId(db, sessionId, opencodeSessionId);
  }

  return {
    status: 'reconciled',
    reason: 'binding_reconciled',
    session_id: sessionId,
    workspace_id: workspaceId,
    run_id: runId,
    opencode_session_id: opencodeSessionId,
  };
}

function prepareAgentWorkspaceLease(db, input = {}, options = {}) {
  if (!db) throw new Error('Database handle requerido para prepareAgentWorkspaceLease.');

  validatePrepareAgentWorkspaceIdentity(input);

  const timestamp = options.acceptedAt || new Date().toISOString();
  const requestedBaseRef = input.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT;
  const repoRoot = options.repoRoot || process.cwd();
  const baseBranch = options.baseBranch || 'main';

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
  const projectId = workspace?.project_id || resolvePreparationProjectId(db, taskId);
  const workspacePath =
    workspace?.workspace_path || input.workspace_path || `workspace://${projectId}/${workspaceId}`;
  const acceptedAt = timestamp;

  if (!workspace) {
    const row = {
      id: workspaceId,
      project_id: projectId,
      agent_id: agentId,
      current_task_id: taskId,
      run_id_or_session_id: null,
      repo_root: repoRoot,
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

function provisionAuthToken(db, { agentId, workspaceId, tokenHash, rawSecret, algorithm } = {}) {
  if (!db) throw new Error('Database handle requerido para provisionAuthToken.');
  if (!agentId) throw new Error('agentId es requerido para provisionAuthToken.');
  if (!tokenHash) throw new Error('tokenHash es requerido para provisionAuthToken.');

  const timestamp = new Date().toISOString();
  const row = {
    agent_id: agentId,
    workspace_id: workspaceId || null,
    token_hash: tokenHash,
    secret: rawSecret || null,
    algorithm: algorithm || 'hmac-sha256',
    status: 'active',
    created_at: timestamp,
    revoked_at: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_auth_tokens (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));

  return db
    .prepare('SELECT * FROM agent_auth_tokens WHERE id = ?')
    .get(db.prepare('SELECT last_insert_rowid() as id').get().id);
}

function revokeAuthToken(db, agentId, _options = {}) {
  if (!db) throw new Error('Database handle requerido para revokeAuthToken.');
  if (!agentId) throw new Error('agentId es requerido para revokeAuthToken.');

  const activeToken = db
    .prepare(
      "SELECT * FROM agent_auth_tokens WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    .get(agentId);
  if (!activeToken) return null;

  const result = db
    .prepare('DELETE FROM agent_auth_tokens WHERE agent_id = ? AND status = ?')
    .run(agentId, 'active');
  if (result.changes === 0) return null;
  return activeToken;
}

function getAgentSecret(db, agentId) {
  if (!db) throw new Error('Database handle requerido para getAgentSecret.');
  if (!agentId) throw new Error('agentId es requerido para getAgentSecret.');

  const row = db
    .prepare(
      "SELECT secret FROM agent_auth_tokens WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    .get(agentId);
  return row?.secret || null;
}

function getActiveAuthToken(db, agentId) {
  if (!db) throw new Error('Database handle requerido para getActiveAuthToken.');
  if (!agentId) throw new Error('agentId es requerido para getActiveAuthToken.');

  return (
    db
      .prepare(
        "SELECT * FROM agent_auth_tokens WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
      )
      .get(agentId) || null
  );
}

function verifyAuthTokenExists(db, agentId) {
  if (!db) throw new Error('Database handle requerido para verifyAuthTokenExists.');
  if (!agentId) throw new Error('agentId es requerido para verifyAuthTokenExists.');

  const row = db
    .prepare("SELECT 1 FROM agent_auth_tokens WHERE agent_id = ? AND status = 'active' LIMIT 1")
    .get(agentId);
  return Boolean(row);
}

function updateWorkspacePtyIdentity(db, { workspaceId, paneId, terminalId, opencodePid }) {
  if (!db) throw new Error('Database handle requerido para updateWorkspacePtyIdentity.');
  if (!workspaceId) throw new Error('workspaceId es requerido para updateWorkspacePtyIdentity.');

  db.prepare(
    `UPDATE agent_workspaces
     SET pane_id = ?, terminal_id = ?, opencode_pid = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(paneId ?? null, terminalId ?? null, opencodePid ?? null, workspaceId);
}

function clearWorkspacePtyIdentity(db, workspaceId) {
  return db
    .prepare(
      'UPDATE agent_workspaces SET pane_id = NULL, terminal_id = NULL, opencode_pid = NULL WHERE id = ?'
    )
    .run(workspaceId);
}

module.exports = {
  buildPrepareAgentWorkspaceAck,
  buildWorkspaceIntentId,
  validatePrepareAgentWorkspaceIdentity,
  getPreferredBindingWorkspace,
  resolveAgentRuntimeBinding,
  reconcileAgentRuntimeSessionBinding,
  prepareAgentWorkspaceLease,
  getAgentRunById: agentRuns.getAgentRunById,
  getLatestAgentRunForWorkspace: agentRuns.getLatestAgentRunForWorkspace,
  getLatestAgentRunForTask: agentRuns.getLatestAgentRunForTask,
  listAgentRuns: agentRuns.listAgentRuns,
  createAgentRun: agentRuns.createAgentRun,
  updateAgentRunTerminal: agentRuns.updateAgentRunTerminal,
  listAgentArtifacts: artifacts.listAgentArtifacts,
  getLatestAgentArtifactForRun: artifacts.getLatestAgentArtifactForRun,
  appendAgentArtifact: artifacts.appendAgentArtifact,
  insertTrace: observability.insertTrace,
  upsertTrace: observability.upsertTrace,
  getTracesBySession: observability.getTracesBySession,
  searchTraces: observability.searchTraces,
  updateTrace: observability.updateTrace,
  insertMessage: observability.insertMessage,
  getMessagesBySession: observability.getMessagesBySession,
  getToolTracesBySession: observability.getToolTracesBySession,
  upsertSessionUsage: observability.upsertSessionUsage,
  getSessionUsage: observability.getSessionUsage,
  getTelegramSession: observability.getTelegramSession,
  createTelegramSession: observability.createTelegramSession,
  getSessionsByProject: observability.getSessionsByProject,
  getRecentSessions: observability.getRecentSessions,
  getSessionsByTelegramChat: observability.getSessionsByTelegramChat,
  updateSessionStatus: observability.updateSessionStatus,
  updateSessionError: observability.updateSessionError,
  updateSessionOpenCodeId: observability.updateSessionOpenCodeId,
  provisionAuthToken,
  revokeAuthToken,
  getActiveAuthToken,
  getAgentSecret,
  verifyAuthTokenExists,
  updateWorkspacePtyIdentity,
  clearWorkspacePtyIdentity,
};

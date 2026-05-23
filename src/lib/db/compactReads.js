/**
 * Durable-public shared core for compact reads.
 *
 * This module is the single source of truth for bounded, deterministic
 * summaries over durable tables (tasks, workspaces, runs, artifacts,
 * supervisor snapshots). It is consumed by:
 *   - public MCP adapters (devhub-mcp/server.js)
 *   - the operations health route
 *   - future CLI commands
 *
 * It MUST NOT depend on runtime-local mirrors, heartbeats, sessions,
 * process state, or observer-only telemetry.
 */

'use strict';

const { getDb } = require('./core');
const { getLatestAgentRunForWorkspace } = require('./workspaces');
const { getLatestAgentArtifactForRun } = require('./artifacts');
const {
  getSupervisorSnapshot,
  getSupervisorApprovalCheckpoint,
  listSupervisorApprovalCheckpoints,
} = require('./supervisor');

const TASK_PRIORITY_SCORE = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const EMPTY_DIRECTOR_QUEUE_HANDOFF = {
  status: 'idle',
  recipient_agent_id: null,
  message: null,
  task: null,
  workspace: null,
  run: null,
  artifact: null,
  supervisor: null,
};

function resolveDb(dbOrNull) {
  return dbOrNull && typeof dbOrNull.prepare === 'function' ? dbOrNull : getDb();
}

function parseIsoMs(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function computePriorityScore(task, depsUnlock = 0, nowMs = Date.now()) {
  const urgency = TASK_PRIORITY_SCORE[task.priority] || 2;
  const businessValue = Number(task.business_value ?? 5);
  const updatedAtMs = task.updated_at ? Date.parse(task.updated_at) : Number.NaN;
  const stalledHours = Number.isNaN(updatedAtMs) ? 0 : Math.max(0, (nowMs - updatedAtMs) / 36e5);
  const staleComponent = Math.min(stalledHours / 48, 10);
  const dueAtMs = task.due_date ? Date.parse(task.due_date) : Number.NaN;
  const dueComponent = Number.isNaN(dueAtMs)
    ? 0
    : Math.max(0, Math.min(5, 5 - (dueAtMs - nowMs) / 864e5));

  return Number(
    (
      urgency * 0.4 +
      businessValue * 0.3 +
      Number(depsUnlock || 0) * 0.2 +
      staleComponent * 0.1 +
      dueComponent * 0.05
    ).toFixed(3)
  );
}

function compareQueueEntries(left, right) {
  if (right.priority_score !== left.priority_score) {
    return right.priority_score - left.priority_score;
  }

  const createdDiff = parseIsoMs(left.created_at) - parseIsoMs(right.created_at);
  if (createdDiff !== 0) return createdDiff;

  return String(left.id || '').localeCompare(String(right.id || ''));
}

function hydrateSupervisorForTask(db, taskId) {
  if (!taskId) return null;

  const snapshot = getSupervisorSnapshot(db, taskId);
  if (!snapshot) return null;

  const approvalCheckpoint = snapshot.approval_checkpoint_key
    ? getSupervisorApprovalCheckpoint(db, snapshot.approval_checkpoint_key)
    : listSupervisorApprovalCheckpoints(db, { task_id: taskId, limit: 1 })[0] || null;

  return {
    ...snapshot,
    ...(approvalCheckpoint ? { approval_checkpoint: approvalCheckpoint } : {}),
  };
}

function withWorkspaceId(workspace) {
  if (!workspace) return null;
  return {
    ...workspace,
    workspace_id: workspace.workspace_id || workspace.id,
  };
}

function withBlockedStatus(entry) {
  return {
    ...entry,
    status: entry.blocked ? 'blocked' : entry.status,
  };
}

function presentExecutionQueue({ queue = [], total = 0 } = {}) {
  return {
    total,
    queue: Array.isArray(queue) ? queue.map(withBlockedStatus) : [],
  };
}

function presentWorkspaceEvidence({
  workspace = null,
  latest_run = null,
  latest_artifact = null,
} = {}) {
  return {
    workspace: withWorkspaceId(workspace),
    latest_run: latest_run || null,
    latest_artifact: latest_artifact || null,
  };
}

function createDirectorQueueContract({ queue = [], handoff = EMPTY_DIRECTOR_QUEUE_HANDOFF } = {}) {
  return {
    authority: 'authoritative',
    freshness: 'current',
    items: (Array.isArray(queue) ? queue : []).map((entry, index) => ({
      id: entry.id || null,
      title: entry.title || null,
      status: entry.blocked ? 'blocked' : entry.status || 'unknown',
      position: Number.isFinite(entry.position) ? entry.position : index + 1,
      priority: entry.priority || null,
      blocked_reason: entry.blocked_reason || entry.blocking_dependencies?.[0] || null,
      supervisor: entry.supervisor || null,
      ...(entry.checkpoint_gate ? { checkpoint_gate: entry.checkpoint_gate } : {}),
    })),
    handoff: {
      ...EMPTY_DIRECTOR_QUEUE_HANDOFF,
      ...(handoff || {}),
    },
  };
}

function readExecutionQueueSummary(dbOrNull, input = {}) {
  const db = resolveDb(dbOrNull);
  const { projectId, limit = 20, includeBlocked = false, nowMs = Date.now() } = input;

  if (!projectId) {
    throw new Error('projectId is required for readExecutionQueueSummary.');
  }

  const tasks = db
    .prepare(
      "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC, rowid ASC"
    )
    .all(projectId);
  const allTasks = db.prepare('SELECT id, status FROM tasks WHERE project_id = ?').all(projectId);
  const deps = db.prepare("SELECT * FROM task_dependencies WHERE tipo = 'blocks'").all();
  const statusMap = Object.fromEntries(allTasks.map((task) => [task.id, task.status]));
  const unlockCounts = deps.reduce((acc, dep) => {
    acc[dep.depends_on] = (acc[dep.depends_on] || 0) + 1;
    return acc;
  }, {});

  const queue = tasks
    .map((task) => {
      const taskDeps = deps.filter((dep) => dep.task_id === task.id);
      const blockingDeps = taskDeps.filter((dep) => statusMap[dep.depends_on] !== 'completed');
      const blocked = blockingDeps.length > 0;

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        retry_count: task.retry_count ?? 0,
        due_date: task.due_date,
        milestone_id: task.milestone_id,
        assigned_to: task.assigned_to,
        claimed_at: task.claimed_at || null,
        lease_expires_at: task.lease_expires_at || null,
        claim_token: task.claim_token || null,
        business_value: task.business_value ?? 5,
        created_at: task.created_at || null,
        updated_at: task.updated_at || null,
        blocked,
        blocking_dependencies: blockingDeps.map((dep) => dep.depends_on),
        blocked_reason: blocked ? blockingDeps[0]?.depends_on || null : null,
        priority_score: blocked ? 0 : computePriorityScore(task, unlockCounts[task.id] || 0, nowMs),
        supervisor: hydrateSupervisorForTask(db, task.id),
      };
    })
    .filter((task) => includeBlocked || !task.blocked)
    .sort(compareQueueEntries)
    .slice(0, limit)
    .map(withBlockedStatus);

  return {
    total: queue.length,
    queue,
  };
}

function readWorkspaceEvidenceSummary(dbOrNull, input = {}) {
  const db = resolveDb(dbOrNull);
  const workspaceId = input.workspaceId || input.workspace_id;

  if (!workspaceId) {
    throw new Error('workspaceId is required for readWorkspaceEvidenceSummary.');
  }

  const workspace = db
    .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
    .get(workspaceId);
  if (!workspace) return null;

  const latestRun = getLatestAgentRunForWorkspace(db, workspaceId);
  const latestArtifact = latestRun ? getLatestAgentArtifactForRun(db, latestRun.run_id) : null;

  return {
    workspace: withWorkspaceId(workspace),
    latest_run: latestRun || null,
    latest_artifact: latestArtifact || null,
  };
}

module.exports = {
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
  createDirectorQueueContract,
};

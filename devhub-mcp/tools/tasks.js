import { z } from 'zod';

import {
  AGENT_ID_SCHEMA,
  LEGACY_ID_REGEX,
  PROJECT_ID_SCHEMA,
  RUN_ID_SCHEMA,
  TASK_ID_SCHEMA,
  UUID_OR_LEGACY_ID_SCHEMA,
  UUID_REGEX,
  WORKSPACE_ID_SCHEMA,
} from './schemas/common.js';

const LEASE_TTL_MS = 120_000;
const LEASE_OUTCOME_STATUS = {
  completed: 'completed',
  paused: 'pending',
  abandoned: 'pending',
  failed: 'blocked',
};
const TASK_PRIORITY_SCORE = { critical: 4, high: 3, medium: 2, low: 1 };
const SUPERVISOR_STATES = [
  'idle',
  'dispatch_pending',
  'lease_active',
  'awaiting_evidence',
  'retry_pending',
  'blocked',
  'awaiting_approval',
  'recovering_orphan',
  'closed',
];
const SUPERVISOR_OUTCOMES = [
  'wait',
  'dispatch',
  'retry',
  'block',
  'recover_orphan',
  'request_approval',
  'close',
];
const SUPERVISOR_REASON_CLASSES = [
  'blocked',
  'approval_required',
  'approval_rejected',
  'stale_lease',
  'orphaned_workspace',
  'orphaned_run',
  'dirty_excluded_observed',
  'recoverable_failure',
  'blocked_dependency',
  'unchanged_failure',
  'completed',
];
const SUPERVISOR_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

function nowIso() {
  return new Date().toISOString();
}

function leaseExpiryIso(baseMs = Date.now()) {
  return new Date(baseMs + LEASE_TTL_MS).toISOString();
}

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function hasExpired(value, nowMs = Date.now()) {
  const expiresAt = parseIsoMs(value);
  return expiresAt === null || expiresAt <= nowMs;
}

function isActiveLease(task, nowMs = Date.now()) {
  return Boolean(
    task?.status === 'in_progress' &&
    task?.assigned_to &&
    task?.claim_token &&
    parseIsoMs(task?.lease_expires_at) !== null &&
    !hasExpired(task.lease_expires_at, nowMs)
  );
}

function needsLeaseCleanup(task, nowMs = Date.now()) {
  if (task?.status !== 'in_progress') return false;
  return !task?.assigned_to || !task?.claim_token || hasExpired(task?.lease_expires_at, nowMs);
}

function buildLeaseFields(
  agentId,
  randomUUID,
  { nowMs = Date.now(), claimToken = randomUUID() } = {}
) {
  const timestamp = new Date(nowMs).toISOString();
  return {
    status: 'in_progress',
    assigned_to: agentId,
    claimed_at: timestamp,
    lease_expires_at: leaseExpiryIso(nowMs),
    claim_token: claimToken,
    updated_at: timestamp,
  };
}

function buildReleaseFields(outcome, nowMs = Date.now()) {
  const status = LEASE_OUTCOME_STATUS[outcome];
  const timestamp = new Date(nowMs).toISOString();
  return {
    status,
    assigned_to: null,
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    completed_at: outcome === 'completed' ? timestamp : null,
    updated_at: timestamp,
  };
}

function claimResponseMessage({ reused = false } = {}) {
  return reused ? 'El agente ya tiene una tarea activa.' : 'Tarea reclamada.';
}

function parseRecordTimeMs(
  record,
  keys = ['updated_at', 'created_at', 'requested_at', 'started_at']
) {
  for (const key of keys) {
    const ms = parseIsoMs(record?.[key]);
    if (ms !== null) return ms;
  }
  return Number.NEGATIVE_INFINITY;
}

function pickLatestRecord(...records) {
  return (
    records
      .filter(Boolean)
      .sort((left, right) => parseRecordTimeMs(right) - parseRecordTimeMs(left))[0] || null
  );
}

function normalizeWorkspaceRecord(row) {
  if (!row) return null;
  return {
    ...row,
    workspace_id: row.workspace_id || row.id,
  };
}

function normalizeAgentRunRecord(row) {
  return row || null;
}

function normalizeAgentArtifactRecord(row) {
  return row || null;
}

function scoreTask(task, depsUnlock = 0) {
  const urgency = TASK_PRIORITY_SCORE[task.priority] || 2;
  const businessValue = Number(task.business_value ?? 5);
  const updatedAt = task.updated_at ? new Date(task.updated_at) : null;
  const stalledHours =
    updatedAt && !Number.isNaN(updatedAt.getTime())
      ? Math.max(0, (Date.now() - updatedAt.getTime()) / 36e5)
      : 0;
  const staleComponent = Math.min(stalledHours / 48, 10);
  const dueComponent =
    task.due_date && !Number.isNaN(new Date(task.due_date).getTime())
      ? Math.max(0, Math.min(5, 5 - (new Date(task.due_date).getTime() - Date.now()) / 864e5))
      : 0;

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

function buildQueue(tasks = [], deps = [], allTasks = [], { includeBlocked = false } = {}) {
  const statusMap = Object.fromEntries((allTasks || []).map((t) => [t.id, t.status]));
  const unlockCounts = deps.reduce((acc, dep) => {
    acc[dep.depends_on] = (acc[dep.depends_on] || 0) + 1;
    return acc;
  }, {});

  return (tasks || [])
    .map((task) => {
      const taskDeps = deps.filter((d) => d.task_id === task.id && d.tipo === 'blocks');
      const blockingDeps = taskDeps.filter((d) => statusMap[d.depends_on] !== 'completed');
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
        business_value: task.business_value ?? 5,
        blocked,
        blocking_dependencies: blockingDeps.map((d) => d.depends_on),
        blocked_reason: blocked ? blockingDeps[0]?.depends_on || null : null,
        priority_score: blocked ? 0 : scoreTask(task, unlockCounts[task.id] || 0),
      };
    })
    .filter((task) => includeBlocked || !task.blocked)
    .sort((a, b) => b.priority_score - a.priority_score);
}

function filterCompatibilityQueue(queue = [], deps = [], pendingTaskIds = []) {
  const pendingIds = new Set(pendingTaskIds);
  return queue.filter(
    (task) =>
      !(deps || []).some(
        (dep) => dep.depends_on === task.id && dep.tipo === 'blocks' && pendingIds.has(dep.task_id)
      )
  );
}

async function listTaskComments(taskId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!taskId) return [];
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return db
      .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(taskId);
  }

  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function getLatestGitCheckpointComment(taskId, deps) {
  const { parseGitCheckpointComment } = deps;
  const comments = await listTaskComments(taskId, deps);
  for (const comment of comments) {
    const checkpoint = parseGitCheckpointComment(comment.content);
    if (checkpoint) {
      return { comment, checkpoint };
    }
  }
  return { comment: null, checkpoint: null };
}

async function enforceTaskCheckpointGate(
  task,
  deps,
  { handoffKind = 'completed', minCreatedAt = null } = {}
) {
  const { validateCheckpointHandoff } = deps;
  const { comment, checkpoint } = await getLatestGitCheckpointComment(task?.id, deps);
  return validateCheckpointHandoff({
    task,
    checkpoint,
    latestComment: comment,
    handoffKind,
    minCreatedAt,
  });
}

async function getAgentWorkspaceById(workspaceId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return normalizeWorkspaceRecord(
      db.prepare('SELECT * FROM agent_workspaces WHERE id = ?').get(workspaceId)
    );
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeWorkspaceRecord(data || null);
}

async function listAgentRuns(
  { workspaceId = null, taskId = null, agentId = null, limit = null } = {},
  deps
) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    return localDb.listAgentRuns({
      workspace_id: workspaceId,
      task_id: taskId,
      agent_id: agentId,
      limit,
    });
  }

  let query = supabase.from('agent_runs').select('*').order('created_at', { ascending: false });
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  if (taskId) query = query.eq('task_id', taskId);
  if (agentId) query = query.eq('agent_id', agentId);
  if (Number.isInteger(limit)) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeAgentRunRecord);
}

async function getLatestAgentRunForWorkspace(workspaceId, deps) {
  const runs = await listAgentRuns({ workspaceId, limit: 1 }, deps);
  return runs[0] || null;
}

async function getLatestAgentRunForTask(taskId, deps) {
  const runs = await listAgentRuns({ taskId, limit: 1 }, deps);
  return runs[0] || null;
}

async function getLatestAgentWorkspaceForTask(taskId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!taskId) return null;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return normalizeWorkspaceRecord(
      db
        .prepare(
          'SELECT * FROM agent_workspaces WHERE current_task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
        )
        .get(taskId)
    );
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .select('*')
    .eq('current_task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeWorkspaceRecord(data || null);
}

async function listAgentArtifacts(runId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    return localDb.listAgentArtifacts(runId);
  }

  const { data, error } = await supabase
    .from('agent_artifacts')
    .select('*')
    .eq('run_id', runId)
    .order('seq', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeAgentArtifactRecord);
}

async function getLatestAgentArtifactForRun(runId, deps) {
  const artifacts = await listAgentArtifacts(runId, deps);
  return artifacts.at(-1) || null;
}

async function getRunFactsForTask(taskId, deps) {
  const runs = await listAgentRuns({ taskId }, deps);
  if (!runs.length) return [];

  const facts = await Promise.all(
    runs.map(async (run) => {
      const latestArtifact = await getLatestAgentArtifactForRun(run.run_id, deps);
      return {
        run_id: run.run_id,
        workspace_id: run.workspace_id,
        status: run.status,
        terminal_reason_class: run.terminal_reason_class || null,
        evidence_ref: latestArtifact?.evidence_ref || null,
      };
    })
  );

  return facts;
}

async function getSupervisorSnapshot(taskId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!taskId) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.getSupervisorSnapshot(taskId);
  }

  const { data, error } = await supabase
    .from('supervisor_snapshots')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function getSupervisorApprovalCheckpoint(checkpointKey, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!checkpointKey) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.getSupervisorApprovalCheckpoint(checkpointKey);
  }

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .select('*')
    .eq('checkpoint_key', checkpointKey)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function getLatestSupervisorApprovalCheckpointForTask(taskId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!taskId) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.listSupervisorApprovalCheckpoints({ task_id: taskId, limit: 1 })[0] || null;
  }

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .select('*')
    .eq('task_id', taskId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function upsertSupervisorSnapshotRow(input = {}, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    return localDb.upsertSupervisorSnapshot(input);
  }

  const existing = await getSupervisorSnapshot(input.task_id, deps);
  const timestamp = input.updated_at || nowIso();
  const payload = {
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

  const { data, error } = await supabase
    .from('supervisor_snapshots')
    .upsert(payload, { onConflict: 'task_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertSupervisorApprovalCheckpointRow(input = {}, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    return localDb.upsertSupervisorApprovalCheckpoint(input);
  }

  const checkpointKey = input.checkpoint_key || localDb.buildSupervisorApprovalCheckpointKey(input);
  const existing = await getSupervisorApprovalCheckpoint(checkpointKey, deps);
  const timestamp = input.updated_at || nowIso();
  const payload = {
    checkpoint_key: checkpointKey,
    task_id: input.task_id,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    reason_class: input.reason_class,
    evidence_ref: input.evidence_ref || null,
    status: input.status || 'pending',
    requested_at: existing?.requested_at || input.requested_at || timestamp,
    decided_at: input.decided_at ?? existing?.decided_at ?? null,
    decision_note: input.decision_note ?? existing?.decision_note ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .upsert(payload, { onConflict: 'checkpoint_key' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function evaluateSupervisorForTask(task, deps, { staleLeaseObserved = false } = {}) {
  const { evaluateSupervisorSnapshot } = deps;

  if (!task?.id) return null;

  const existingSnapshot = await getSupervisorSnapshot(task.id, deps);
  const latestWorkspaceForTask = await getLatestAgentWorkspaceForTask(task.id, deps);
  const snapshotWorkspace = existingSnapshot?.workspace_id
    ? await getAgentWorkspaceById(existingSnapshot.workspace_id, deps)
    : null;
  const workspace = pickLatestRecord(latestWorkspaceForTask, snapshotWorkspace);
  const latestRun = workspace?.id
    ? await getLatestAgentRunForWorkspace(workspace.id, deps)
    : await getLatestAgentRunForTask(task.id, deps);
  const latestArtifact = latestRun
    ? await getLatestAgentArtifactForRun(latestRun.run_id, deps)
    : null;
  const runFacts = await getRunFactsForTask(task.id, deps);
  const snapshotApprovalCheckpoint = existingSnapshot?.approval_checkpoint_key
    ? await getSupervisorApprovalCheckpoint(existingSnapshot.approval_checkpoint_key, deps)
    : null;
  const latestApprovalCheckpoint = await getLatestSupervisorApprovalCheckpointForTask(
    task.id,
    deps
  );
  const approvalCheckpoint = pickLatestRecord(latestApprovalCheckpoint, snapshotApprovalCheckpoint);

  const snapshotInput = evaluateSupervisorSnapshot({
    task,
    workspace,
    latestRun,
    latestArtifact,
    runFacts,
    existingSnapshot,
    approvalCheckpoint,
    staleLeaseObserved,
  });

  const snapshot = await upsertSupervisorSnapshotRow(snapshotInput, deps);
  const hydratedApprovalCheckpoint = snapshot.approval_checkpoint_key
    ? await getSupervisorApprovalCheckpoint(snapshot.approval_checkpoint_key, deps)
    : null;

  return {
    ...snapshot,
    approval_checkpoint: hydratedApprovalCheckpoint,
  };
}

async function attachSupervisorToTask(task, deps, options = {}) {
  if (!task) return task;
  const supervisor = await evaluateSupervisorForTask(task, deps, options);
  return {
    ...task,
    supervisor,
    supervisor_snapshot: supervisor,
  };
}

async function getAgentActiveTask(projectId, agentId, deps, nowMs = Date.now()) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const params = [];
    let sql = "SELECT * FROM tasks WHERE assigned_to = ? AND status = 'in_progress'";
    params.push(agentId);
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    sql += ' ORDER BY claimed_at DESC';
    const tasks = db
      .prepare(sql)
      .all(...params)
      .filter((task) => isActiveLease(task, nowMs));
    return tasks[0] || null;
  }

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', agentId)
    .eq('status', 'in_progress');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const tasks = (data || []).filter((task) => isActiveLease(task, nowMs));
  tasks.sort((a, b) => {
    const aMs = parseIsoMs(a.claimed_at) || 0;
    const bMs = parseIsoMs(b.claimed_at) || 0;
    return bMs - aMs;
  });
  return tasks[0] || null;
}

async function syncAgentRegistryState(
  agentId,
  deps,
  { currentTaskId = null, status, lastHeartbeat } = {}
) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const fields = ['current_task_id = ?', 'updated_at = ?'];
    const values = [currentTaskId, nowIso()];
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }
    if (lastHeartbeat !== undefined) {
      fields.push('last_heartbeat = ?');
      values.push(lastHeartbeat);
    }
    values.push(agentId);
    db.prepare(`UPDATE agent_registry SET ${fields.join(', ')} WHERE agent_id = ?`).run(...values);
    return;
  }

  const updates = {
    current_task_id: currentTaskId,
    updated_at: nowIso(),
  };
  if (status !== undefined) updates.status = status;
  if (lastHeartbeat !== undefined) updates.last_heartbeat = lastHeartbeat;
  const { error } = await supabase.from('agent_registry').update(updates).eq('agent_id', agentId);
  if (error) throw new Error(error.message);
}

async function cleanupExpiredLeases(projectId = null, agentId = null, deps, nowMs = Date.now()) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const params = [];
    let sql = "SELECT * FROM tasks WHERE status = 'in_progress'";
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (agentId) {
      sql += ' AND assigned_to = ?';
      params.push(agentId);
    }
    const staleTasks = db
      .prepare(sql)
      .all(...params)
      .filter((task) => needsLeaseCleanup(task, nowMs));
    if (staleTasks.length === 0) return [];

    const impactedAgents = new Set();
    for (const task of staleTasks) {
      if (task.assigned_to) impactedAgents.add(task.assigned_to);
      const releaseFields = buildReleaseFields('abandoned', nowMs);
      db.prepare(
        `UPDATE tasks
         SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
             claim_token = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'in_progress'`
      ).run(releaseFields.status, releaseFields.updated_at, task.id);
    }

    for (const affectedAgentId of impactedAgents) {
      const activeTask = await getAgentActiveTask(projectId, affectedAgentId, deps, nowMs);
      await syncAgentRegistryState(affectedAgentId, deps, {
        currentTaskId: activeTask?.id || null,
        status: activeTask ? 'working' : 'idle',
      });
    }

    return staleTasks;
  }

  let query = supabase.from('tasks').select('*').eq('status', 'in_progress');
  if (projectId) query = query.eq('project_id', projectId);
  if (agentId) query = query.eq('assigned_to', agentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const staleTasks = (data || []).filter((task) => needsLeaseCleanup(task, nowMs));
  if (staleTasks.length === 0) return [];

  const impactedAgents = new Set();
  for (const task of staleTasks) {
    if (task.assigned_to) impactedAgents.add(task.assigned_to);
    const { error: updateError } = await supabase
      .from('tasks')
      .update(buildReleaseFields('abandoned', nowMs))
      .eq('id', task.id)
      .eq('status', 'in_progress');
    if (updateError) throw new Error(updateError.message);
  }

  for (const affectedAgentId of impactedAgents) {
    const activeTask = await getAgentActiveTask(projectId, affectedAgentId, deps, nowMs);
    await syncAgentRegistryState(affectedAgentId, deps, {
      currentTaskId: activeTask?.id || null,
      status: activeTask ? 'working' : 'idle',
    });
  }

  return staleTasks;
}

async function getExecutionQueueData(projectId, deps, { limit = 20, includeBlocked = false } = {}) {
  const { localDb, supabase, DB_DRIVER, readExecutionQueueSummary, presentExecutionQueue } = deps;

  if (DB_DRIVER !== 'supabase') {
    const staleTasks = await cleanupExpiredLeases(projectId, null, deps);
    const staleTaskIds = new Set((staleTasks || []).map((task) => task.id));
    const db = localDb.getDb();
    const { total, queue } = readExecutionQueueSummary(db, { projectId, limit, includeBlocked });
    return Promise.all(
      presentExecutionQueue({ queue, total }).queue.map((task) =>
        attachSupervisorToTask(task, deps, { staleLeaseObserved: staleTaskIds.has(task.id) })
      )
    );
  }

  const staleTasks = await cleanupExpiredLeases(projectId, null, deps);
  const staleTaskIds = new Set((staleTasks || []).map((task) => task.id));
  const [{ data: tasks, error: tasksErr }, { data: allTasks }, { data: depsRows }] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('tasks').select('id, status').eq('project_id', projectId),
      supabase.from('task_dependencies').select('*'),
    ]);

  if (tasksErr) throw new Error(tasksErr.message);
  const queue = buildQueue(tasks || [], depsRows || [], allTasks || [], { includeBlocked }).slice(
    0,
    limit
  );
  return Promise.all(
    queue.map((task) =>
      attachSupervisorToTask(task, deps, { staleLeaseObserved: staleTaskIds.has(task.id) })
    )
  );
}

async function claimNextTaskSupabase(projectId, agentId, deps, { compatibilityMode = false } = {}) {
  const { supabase, randomUUID } = deps;
  const nowMs = Date.now();
  const timestamp = new Date(nowMs).toISOString();

  await cleanupExpiredLeases(projectId, null, deps, nowMs);

  const activeTask = await getAgentActiveTask(projectId, agentId, deps, nowMs);
  if (activeTask) {
    await syncAgentRegistryState(agentId, deps, {
      currentTaskId: activeTask.id,
      status: 'working',
      lastHeartbeat: timestamp,
    });
    return {
      claimed: true,
      reused: true,
      task: activeTask,
      message: claimResponseMessage({ reused: true }),
    };
  }

  const queue = await getExecutionQueueData(projectId, deps, { limit: 20, includeBlocked: false });
  const { data: depsRows, error: depsError } = await supabase.from('task_dependencies').select('*');
  if (depsError) return { error: depsError.message };
  const { data: pendingTasks, error: pendingError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'pending');
  if (pendingError) return { error: pendingError.message };
  const candidates = compatibilityMode
    ? filterCompatibilityQueue(
        queue,
        depsRows || [],
        (pendingTasks || []).map((task) => task.id)
      )
    : queue;
  for (const candidate of candidates) {
    const leaseFields = buildLeaseFields(agentId, randomUUID, { nowMs, claimToken: randomUUID() });
    const { data, error } = await supabase
      .from('tasks')
      .update(leaseFields)
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) return { error: error.message };
    if (!data) continue;

    await syncAgentRegistryState(agentId, deps, {
      currentTaskId: data.id,
      status: 'working',
      lastHeartbeat: timestamp,
    });

    return {
      claimed: true,
      reused: false,
      task: { ...candidate, ...data },
      message: claimResponseMessage({ reused: false }),
    };
  }

  await syncAgentRegistryState(agentId, deps, {
    currentTaskId: null,
    status: 'idle',
    lastHeartbeat: timestamp,
  }).catch(() => {});
  return { claimed: false, reused: false, task: null, message: 'Sin tareas disponibles' };
}

function getLocalClaimTransaction(deps) {
  const { localDb, randomUUID } = deps;
  const db = localDb.getDb();
  return db.transaction(({ projectId, agentId, compatibilityMode = false }) => {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();

    const staleTasks = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = 'in_progress'")
      .all(projectId)
      .filter((task) => needsLeaseCleanup(task, nowMs));

    for (const staleTask of staleTasks) {
      db.prepare(
        `UPDATE tasks
         SET status = 'pending', assigned_to = NULL, claimed_at = NULL,
             lease_expires_at = NULL, claim_token = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ?`
      ).run(timestamp, staleTask.id);

      if (staleTask.assigned_to) {
        db.prepare(
          `UPDATE agent_registry
           SET current_task_id = NULL,
               status = CASE WHEN status = 'working' THEN 'idle' ELSE status END,
               updated_at = ?
           WHERE agent_id = ?`
        ).run(timestamp, staleTask.assigned_to);
      }
    }

    const activeTask = db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND assigned_to = ? AND status = 'in_progress'"
      )
      .all(projectId, agentId)
      .filter((task) => isActiveLease(task, nowMs))
      .sort((a, b) => (parseIsoMs(b.claimed_at) || 0) - (parseIsoMs(a.claimed_at) || 0))[0];

    if (activeTask) {
      db.prepare(
        `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, updated_at = ?, last_heartbeat = ?
         WHERE agent_id = ?`
      ).run(activeTask.id, timestamp, timestamp, agentId);
      return {
        claimed: true,
        reused: true,
        task: activeTask,
        message: claimResponseMessage({ reused: true }),
      };
    }

    const tasks = db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
      )
      .all(projectId);
    const allTasks = db.prepare('SELECT id, status FROM tasks WHERE project_id = ?').all(projectId);
    const depsRows = db.prepare('SELECT * FROM task_dependencies').all();
    const queue = buildQueue(tasks, depsRows, allTasks, { includeBlocked: false });
    const candidates = compatibilityMode
      ? filterCompatibilityQueue(
          queue,
          depsRows,
          tasks.map((task) => task.id)
        )
      : queue;
    for (const candidate of candidates) {
      const leaseFields = buildLeaseFields(agentId, randomUUID, {
        nowMs,
        claimToken: randomUUID(),
      });
      const result = db
        .prepare(
          `UPDATE tasks
           SET status = ?, assigned_to = ?, claimed_at = ?, lease_expires_at = ?, claim_token = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`
        )
        .run(
          leaseFields.status,
          leaseFields.assigned_to,
          leaseFields.claimed_at,
          leaseFields.lease_expires_at,
          leaseFields.claim_token,
          leaseFields.updated_at,
          candidate.id
        );

      if (result.changes !== 1) continue;

      db.prepare(
        `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, last_heartbeat = ?, updated_at = ?
         WHERE agent_id = ?`
      ).run(candidate.id, timestamp, timestamp, agentId);

      const claimedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(candidate.id);
      return {
        claimed: true,
        reused: false,
        task: { ...candidate, ...claimedTask },
        message: claimResponseMessage({ reused: false }),
      };
    }

    return { claimed: false, reused: false, task: null, message: 'Sin tareas disponibles' };
  });
}

export function registerTaskTools(server, deps) {
  const { localDb, supabase, DB_DRIVER, ok, err, getActor } = deps;

  const getActorUserId = async () => {
    const session = await getActor();
    return session?.user?.id;
  };

  async function getProjectRole(projectId) {
    const session = await getActor();
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();
    if (project?.user_id === userId) return 'owner';

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    return membership?.role || null;
  }

  function requireProjectRole(role, allowed) {
    if (!allowed.includes(role)) {
      return err(
        `Permiso denegado: se requiere uno de los roles [${allowed.join(', ')}] para este proyecto.`
      );
    }
    return null;
  }

  server.tool(
    'list_tasks',
    'Lista las tareas de un proyecto, opcionalmente filtradas por estado o prioridad.',
    {
      project_id: PROJECT_ID_SCHEMA,
      status: z
        .enum(['pending', 'in_progress', 'qa_ready', 'completed', 'blocked', 'all'])
        .optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical', 'all']).optional(),
    },
    async ({ project_id, status, priority }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      let query = supabase
        .from('tasks')
        .select('id, title, status, priority, description')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      if (priority && priority !== 'all') query = query.eq('priority', priority);
      const { data, error } = await query;
      if (error) return err(error.message);
      return ok({ total: data.length, tasks: data });
    }
  );

  server.tool(
    'create_task',
    'Crea una nueva tarea en un proyecto de DevHub.',
    {
      project_id: PROJECT_ID_SCHEMA,
      user_id: z
        .string()
        .uuid()
        .optional()
        .describe('UUID del usuario propietario; default: actor actual'),
      title: z.string().min(1).describe('Título de la tarea'),
      description: z.string().optional(),
      status: z
        .enum(['pending', 'in_progress', 'qa_ready', 'completed', 'blocked'])
        .optional()
        .default('pending'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
      due_date: z.string().optional().describe('Fecha ISO YYYY-MM-DD'),
      milestone_id: UUID_OR_LEGACY_ID_SCHEMA.optional().describe(
        'ID del hito (UUID o legacy) al que pertenece la tarea'
      ),
      assigned_to: z.string().uuid().optional().describe('UUID del usuario o agente asignado'),
    },
    async ({
      project_id,
      user_id,
      title,
      description,
      status,
      priority,
      due_date,
      milestone_id,
      assigned_to,
    }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      const actorUserId = await getActorUserId();
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id,
          user_id: user_id || actorUserId,
          title,
          description: description || null,
          milestone_id: milestone_id || null,
          assigned_to: assigned_to || null,
          status,
          priority,
          due_date: due_date || null,
        })
        .select()
        .single();
      if (error) return err(error.message);
      return ok({ created: true, task: data });
    }
  );

  server.tool(
    'bulk_create_tasks',
    'Crea múltiples tareas de planning de forma idempotente: si ya existe una tarea con el mismo título en el proyecto, la omite.',
    {
      project_id: PROJECT_ID_SCHEMA,
      user_id: z
        .string()
        .uuid()
        .optional()
        .describe('UUID del usuario propietario; default: actor actual'),
      tasks: z
        .array(
          z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            status: z
              .enum(['pending', 'in_progress', 'qa_ready', 'completed', 'blocked'])
              .optional(),
            priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
            due_date: z.string().optional(),
            milestone_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
            business_value: z.number().min(1).max(10).optional(),
          })
        )
        .min(1)
        .max(200),
    },
    async ({ project_id, user_id, tasks }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      const actorUserId = await getActorUserId();
      const { data: existing, error: existingErr } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('project_id', project_id);
      if (existingErr) return err(existingErr.message);

      const existingTitles = new Set(
        (existing || []).map((task) => task.title.trim().toLowerCase())
      );
      const seenTitles = new Set();
      const skipped = [];
      const payload = [];

      for (const task of tasks) {
        const key = task.title.trim().toLowerCase();
        if (existingTitles.has(key) || seenTitles.has(key)) {
          skipped.push({ title: task.title, reason: 'duplicate-title' });
          continue;
        }
        seenTitles.add(key);
        payload.push({
          project_id,
          user_id: user_id || actorUserId,
          title: task.title,
          description: task.description || null,
          status: task.status || 'pending',
          priority: task.priority || 'medium',
          due_date: task.due_date || null,
          milestone_id: task.milestone_id || null,
          business_value: task.business_value || 5,
        });
      }

      if (payload.length === 0) {
        return ok({ created_count: 0, skipped_count: skipped.length, tasks: [], skipped });
      }

      const { data, error } = await supabase.from('tasks').insert(payload).select();
      if (error) return err(error.message);
      return ok({
        created_count: data.length,
        skipped_count: skipped.length,
        tasks: data,
        skipped,
      });
    }
  );

  server.tool(
    'update_task',
    'Actualiza el estado, prioridad u otros campos de una tarea existente.',
    {
      task_id: TASK_ID_SCHEMA,
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in_progress', 'qa_ready', 'completed', 'blocked']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      due_date: z.string().nullable().optional(),
      milestone_id: z
        .string()
        .refine((value) => UUID_REGEX.test(String(value)) || LEGACY_ID_REGEX.test(String(value)), {
          message: 'Debe ser UUID o ID legacy (<tipo>-<timestamp>-<suffix>)',
        })
        .nullable()
        .optional()
        .describe('ID del hito (UUID o legacy). null para desvincular'),
      assigned_to: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe('UUID del usuario o agente asignado'),
    },
    async ({ task_id, status, ...rest }) => {
      let existingTask = null;
      let checkpointGate = null;

      const { data: currentTask, error: currentTaskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .maybeSingle();
      if (currentTaskError) return err(currentTaskError.message);
      if (!currentTask) return err(`Tarea ${task_id} no encontrada.`);

      const role = await getProjectRole(currentTask.project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      if (status === 'completed' || status === 'qa_ready') {
        existingTask = currentTask;

        if (status === 'qa_ready') {
          checkpointGate = await enforceTaskCheckpointGate(existingTask, deps, {
            handoffKind: 'qa-ready',
          });
          if (!checkpointGate.ok)
            return err(`${checkpointGate.message} ${checkpointGate.remediation || ''}`.trim());
        } else if (existingTask.status !== 'qa_ready') {
          checkpointGate = await enforceTaskCheckpointGate(existingTask, deps, {
            handoffKind: 'completed',
          });
          if (!checkpointGate.ok)
            return err(`${checkpointGate.message} ${checkpointGate.remediation || ''}`.trim());
        }
      }

      const updates = {
        ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
      };
      if (status) {
        updates.status = status;
        if (status === 'completed') {
          updates.completed_at = new Date().toISOString();
        }
        if (status === 'qa_ready') {
          updates.claim_token = null;
          updates.lease_expires_at = null;
        }
      }
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', task_id)
        .select()
        .single();
      if (error) return err(error.message);
      if (!data) return err(`Tarea ${task_id} no encontrada.`);

      if (status === 'completed' && !checkpointGate && existingTask?.status !== 'qa_ready') {
        checkpointGate = await enforceTaskCheckpointGate(existingTask || data, deps, {
          handoffKind: 'completed',
        });
      }

      return ok({
        updated: true,
        task: { ...data, ...(checkpointGate ? { checkpoint_gate: checkpointGate } : {}) },
      });
    }
  );

  server.tool(
    'add_task_comment',
    'Añade un comentario a una tarea (útil para que los agentes dejen notas técnicas o log de QA).',
    {
      task_id: TASK_ID_SCHEMA,
      content: z.string(),
      author_type: z.enum(['human', 'agent']).default('agent'),
    },
    async ({ task_id, content, author_type }) => {
      const { data: task } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', task_id)
        .maybeSingle();
      if (!task) return err(`Tarea ${task_id} no encontrada.`);

      const role = await getProjectRole(task.project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      const actorUserId = await getActorUserId();
      const { data, error } = await supabase
        .from('task_comments')
        .insert({ task_id, content, author_type, user_id: actorUserId })
        .select()
        .single();
      if (error) return err(error.message);
      return ok({ created: true, comment: data });
    }
  );

  server.tool(
    'get_execution_queue',
    'Devuelve la cola de tareas pendientes ordenada por score, con explicación de bloqueos por dependencias.',
    {
      project_id: PROJECT_ID_SCHEMA,
      limit: z.number().int().min(1).max(100).optional().default(20),
      include_blocked: z.boolean().optional().default(false),
    },
    async ({ project_id, limit, include_blocked }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      try {
        const queue = await getExecutionQueueData(project_id, deps, {
          limit,
          includeBlocked: include_blocked,
        });
        return ok({ total: queue.length, queue });
      } catch (e) {
        return err(e.message);
      }
    }
  );
}

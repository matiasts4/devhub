import { z } from 'zod';
import { createRequire } from 'module';

import {
  AGENT_ID_SCHEMA,
  PROJECT_ID_SCHEMA,
  RUN_ID_SCHEMA,
  TASK_ID_SCHEMA,
  WORKSPACE_ID_SCHEMA,
  WORKSPACE_ROLE_SCHEMA,
} from './schemas/common.js';

const requireCjs = createRequire(import.meta.url);
const { withWorkspaceContext, findRole } = requireCjs(
  '../../src/lib/tenancy/with-workspace-context.js'
);
const { assertCan } = requireCjs('../../src/lib/tenancy/policy.js');

const AGENT_WORKSPACE_STATUSES = [
  'planned',
  'provisioning',
  'ready',
  'active',
  'paused',
  'conflicted',
  'cleanup_pending',
  'completed',
  'failed',
  'orphaned',
];
const AGENT_WORKSPACE_TERMINAL = new Set(['completed', 'failed']);
const AGENT_WORKSPACE_LOCKED = new Set([
  'planned',
  'provisioning',
  'ready',
  'active',
  'paused',
  'cleanup_pending',
  'orphaned',
]);
const AGENT_WORKSPACE_OBSERVED_DIRTY = new Set(['clean', 'dirty', 'dirty-excluded']);
const AGENT_WORKSPACE_BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';
const SW_2_1_FROZEN_CHECKPOINT = '02d82361449a09e93e5880a08e35e3043617002d';
const SW_3_1_FROZEN_CHECKPOINT = '4b1e344dcd202c911498af17236fcb86a2a2cb1e';
const PREPARE_WORKSPACE_ERROR_CLASS_TO_STATUS = {
  base_drift: 'conflicted',
  ownership_collision: 'conflicted',
  executor_lost: 'orphaned',
  prepare_failed: 'failed',
};

function nowIso() {
  return new Date().toISOString();
}

function isAgentWorkspaceStatus(value) {
  return AGENT_WORKSPACE_STATUSES.includes(value);
}

function isAgentWorkspaceReadyState(value) {
  return value === 'ready' || value === 'active';
}

function isAgentWorkspaceLocked(value) {
  return AGENT_WORKSPACE_LOCKED.has(value);
}

function normalizeWorkspaceRecord(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id || row.workspace_id,
    workspace_id: row.workspace_id || row.id,
  };
}

function normalizeAgentRunRecord(row) {
  return row || null;
}

function normalizeAgentArtifactRecord(row) {
  return row || null;
}

function buildPrepareWorkspaceId(taskId, agentId) {
  return `workspace-${taskId}-${agentId}`;
}

function validatePrepareWorkspaceIdentity({ workspace_id, task_id, agent_id, correlation_id }) {
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

async function listAgentWorkspaces({ projectId = null, status = null } = {}, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const clauses = [];
    const params = [];
    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (status && status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM agent_workspaces ${whereSql} ORDER BY created_at ASC, id ASC`)
      .all(...params);
    return rows.map(normalizeWorkspaceRecord);
  }

  let query = supabase
    .from('agent_workspaces')
    .select('*')
    .order('created_at', { ascending: true });
  if (projectId) query = query.eq('project_id', projectId);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeWorkspaceRecord);
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

async function insertAgentWorkspace(row, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const keys = Object.keys(row);
    const values = keys.map((key) => row[key] ?? null);
    db.prepare(
      `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...values);
    return getAgentWorkspaceById(row.id, deps);
  }

  const { data, error } = await supabase.from('agent_workspaces').insert(row).select().single();
  if (error) throw new Error(error.message);
  return normalizeWorkspaceRecord(data);
}

async function updateAgentWorkspaceRow(workspaceId, updates, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) return getAgentWorkspaceById(workspaceId, deps);
    db.prepare(
      `UPDATE agent_workspaces SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`
    ).run(...keys.map((key) => updates[key] ?? null), workspaceId);
    return getAgentWorkspaceById(workspaceId, deps);
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizeWorkspaceRecord(data);
}

async function resolveWorkspaceProjectId(taskId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (!taskId) return 'control-plane-pending';

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1').get(taskId);
    return task?.project_id || 'control-plane-pending';
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data?.project_id || 'control-plane-pending';
}

async function getAgentWorkspaceCollisions(
  { projectId, workspaceId, branchName, worktreePath, agentId, currentTaskId },
  deps
) {
  const workspaces = await listAgentWorkspaces({ projectId, status: 'all' }, deps);
  return workspaces.filter((workspace) => {
    if (workspace.id === workspaceId) return false;
    if (!isAgentWorkspaceLocked(workspace.status)) return false;
    if (branchName && workspace.branch_name === branchName) return true;
    if (worktreePath && workspace.worktree_path === worktreePath) return true;
    if (
      agentId &&
      currentTaskId &&
      workspace.agent_id === agentId &&
      workspace.current_task_id === currentTaskId
    ) {
      return true;
    }
    return false;
  });
}

function deriveWorkspaceCollisionReason(
  { branchName, worktreePath, agentId, currentTaskId },
  collisions = []
) {
  if (!collisions.length) return null;
  if (branchName && collisions.some((workspace) => workspace.branch_name === branchName)) {
    return 'branch_name';
  }
  if (worktreePath && collisions.some((workspace) => workspace.worktree_path === worktreePath)) {
    return 'worktree_path';
  }
  if (
    agentId &&
    currentTaskId &&
    collisions.some(
      (workspace) => workspace.agent_id === agentId && workspace.current_task_id === currentTaskId
    )
  ) {
    return 'agent_task_owner';
  }
  return 'reservation';
}

function validateAgentWorkspacePayload(payload, existingWorkspace = null) {
  const merged = { ...existingWorkspace, ...payload };
  const status = merged.status;

  if (!isAgentWorkspaceStatus(status)) {
    throw new Error(`Estado de workspace inválido: ${status}`);
  }
  if (!merged.id) throw new Error('workspace_id es requerido.');
  if (!merged.project_id) throw new Error('project_id es requerido.');
  if (!merged.agent_id) throw new Error('agent_id es requerido.');
  if (!merged.repo_root) throw new Error('repo_root es requerido.');
  if (!merged.workspace_path) throw new Error('workspace_path es requerido.');
  if (!merged.base_branch) throw new Error('base_branch es requerido.');
  if (!merged.base_commit) throw new Error('base_commit es requerido.');
  if (payload.observed_dirty && !AGENT_WORKSPACE_OBSERVED_DIRTY.has(payload.observed_dirty)) {
    throw new Error(`observed_dirty inválido: ${payload.observed_dirty}`);
  }
  if (isAgentWorkspaceReadyState(status)) {
    if (
      !merged.branch_name ||
      !merged.worktree_path ||
      !merged.observed_branch ||
      !merged.observed_head
    ) {
      throw new Error(
        'ready|active requieren branch_name, worktree_path, observed_branch y observed_head.'
      );
    }
  }
  if (status === 'orphaned' && !merged.recovery_reason) {
    throw new Error('orphaned requiere recovery_reason.');
  }

  return merged;
}

function deriveWorkspaceTransition(existingWorkspace, updates, { allowTerminal = true } = {}) {
  if (!existingWorkspace) throw new Error('Workspace no encontrado.');
  if (AGENT_WORKSPACE_TERMINAL.has(existingWorkspace.status)) {
    throw new Error('agent_workspaces_terminal_immutable');
  }

  const merged = validateAgentWorkspacePayload(
    {
      ...updates,
      id: existingWorkspace.id,
      project_id: existingWorkspace.project_id,
      agent_id: existingWorkspace.agent_id,
      repo_root: existingWorkspace.repo_root,
      workspace_path: existingWorkspace.workspace_path,
      base_branch: updates.base_branch ?? existingWorkspace.base_branch,
      base_commit: updates.base_commit ?? existingWorkspace.base_commit,
      status: updates.status || existingWorkspace.status,
    },
    existingWorkspace
  );

  if (!allowTerminal && AGENT_WORKSPACE_TERMINAL.has(merged.status)) {
    throw new Error('Esta operación no permite estados terminales.');
  }

  const next = {
    ...updates,
    updated_at: nowIso(),
  };

  if (merged.status === 'active' && !existingWorkspace.started_at) {
    next.started_at = existingWorkspace.started_at || nowIso();
  }
  if (AGENT_WORKSPACE_TERMINAL.has(merged.status)) {
    next.completed_at = updates.completed_at || nowIso();
  }

  return { merged, next };
}

function detectWorkspaceDrift(existingWorkspace, mergedWorkspace) {
  if (!existingWorkspace) return null;
  const mismatches = [];
  if (
    existingWorkspace.branch_name &&
    mergedWorkspace.observed_branch &&
    existingWorkspace.branch_name !== mergedWorkspace.observed_branch
  ) {
    mismatches.push(
      `reserved branch ${existingWorkspace.branch_name} != observed ${mergedWorkspace.observed_branch}`
    );
  }
  if (
    existingWorkspace.worktree_path &&
    mergedWorkspace.worktree_path &&
    existingWorkspace.worktree_path !== mergedWorkspace.worktree_path
  ) {
    mismatches.push(
      `reserved worktree ${existingWorkspace.worktree_path} != observed ${mergedWorkspace.worktree_path}`
    );
  }
  return mismatches.length ? `workspace drift: ${mismatches.join('; ')}` : null;
}

function derivePrepareWorkspaceOutcome(existingWorkspace, report = {}) {
  const { error_class: errorClass = null, ...restReport } = report;
  const status =
    PREPARE_WORKSPACE_ERROR_CLASS_TO_STATUS[errorClass] ||
    report.status ||
    existingWorkspace.status;

  return {
    ...restReport,
    status,
    branch_name:
      restReport.branch_name ?? existingWorkspace.branch_name ?? restReport.observed_branch ?? null,
    last_error_class: errorClass,
  };
}

function isPrepareWorkspaceReportNoOp(existingWorkspace, report = {}, nextStatus) {
  return Boolean(
    report.correlation_id &&
    existingWorkspace.correlation_id === report.correlation_id &&
    existingWorkspace.status === nextStatus &&
    (report.evidence_ref ?? existingWorkspace.evidence_ref ?? null) ===
      (existingWorkspace.evidence_ref ?? null) &&
    (report.last_error ?? existingWorkspace.last_error ?? null) ===
      (existingWorkspace.last_error ?? null) &&
    (report.last_error_class ?? existingWorkspace.last_error_class ?? null) ===
      (existingWorkspace.last_error_class ?? null) &&
    (report.recovery_reason ?? existingWorkspace.recovery_reason ?? null) ===
      (existingWorkspace.recovery_reason ?? null) &&
    (report.worktree_path ?? existingWorkspace.worktree_path ?? null) ===
      (existingWorkspace.worktree_path ?? null) &&
    (report.observed_branch ?? existingWorkspace.observed_branch ?? null) ===
      (existingWorkspace.observed_branch ?? null) &&
    (report.observed_head ?? existingWorkspace.observed_head ?? null) ===
      (existingWorkspace.observed_head ?? null) &&
    (report.observed_dirty ?? existingWorkspace.observed_dirty ?? null) ===
      (existingWorkspace.observed_dirty ?? null)
  );
}

async function prepareAgentWorkspaceLease(input = {}, deps) {
  validatePrepareWorkspaceIdentity(input);

  const timestamp = nowIso();
  const requestedBaseRef = input.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT;
  let workspace = null;
  let workspaceId = input.workspace_id || null;
  let taskId = input.task_id || null;
  let agentId = input.agent_id || null;

  if (workspaceId) {
    workspace = await getAgentWorkspaceById(workspaceId, deps);
    if (!workspace) throw new Error(`Workspace ${workspaceId} no encontrado.`);
    taskId = workspace.current_task_id;
    agentId = workspace.agent_id;
  } else {
    const { localDb, supabase, DB_DRIVER } = deps;
    workspaceId = buildPrepareWorkspaceId(taskId, agentId);
    if (DB_DRIVER !== 'supabase') {
      const db = localDb.getDb();
      workspace = normalizeWorkspaceRecord(
        db
          .prepare(
            'SELECT * FROM agent_workspaces WHERE current_task_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1'
          )
          .get(taskId, agentId)
      );
    } else {
      const { data, error } = await supabase
        .from('agent_workspaces')
        .select('*')
        .eq('current_task_id', taskId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      workspace = normalizeWorkspaceRecord(data || null);
    }
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
    input.reservation_token || workspace?.reservation_token || `rsv-${deps.randomUUID()}`;
  const projectId = workspace?.project_id || (await resolveWorkspaceProjectId(taskId, deps));
  const workspacePath =
    workspace?.workspace_path || input.workspace_path || `workspace://${projectId}/${workspaceId}`;

  if (!workspace) {
    const payload = validateAgentWorkspacePayload({
      id: workspaceId,
      project_id: projectId,
      agent_id: agentId,
      current_task_id: taskId,
      run_id_or_session_id: null,
      repo_root: process.cwd(),
      workspace_path: workspacePath,
      worktree_path: null,
      base_branch: 'main',
      base_commit: requestedBaseRef,
      branch_name: null,
      status: 'provisioning',
      observed_branch: null,
      observed_head: null,
      observed_dirty: null,
      last_error: null,
      recovery_reason: null,
      evidence_ref: null,
      reservation_token: reservationToken,
      correlation_id: input.correlation_id,
      accepted_at: timestamp,
      claimed_at: null,
      started_at: null,
      completed_at: null,
    });

    const created = await insertAgentWorkspace(
      {
        ...payload,
        last_error_class: null,
        updated_at: timestamp,
      },
      deps
    );

    return {
      created: true,
      reused: false,
      workspace: created,
      ack: buildPrepareAgentWorkspaceAck(created),
    };
  }

  const updates = {
    base_commit: requestedBaseRef,
    status: AGENT_WORKSPACE_TERMINAL.has(workspace.status) ? workspace.status : 'provisioning',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    reservation_token: reservationToken,
    correlation_id: input.correlation_id,
    accepted_at: timestamp,
    updated_at: timestamp,
  };
  const updated = await updateAgentWorkspaceRow(workspace.id, updates, deps);
  return {
    created: false,
    reused: false,
    workspace: updated,
    ack: buildPrepareAgentWorkspaceAck(updated),
  };
}

async function getAgentRunById(runId, deps) {
  const { localDb, supabase, DB_DRIVER } = deps;

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.getAgentRunById(runId));
  }

  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeAgentRunRecord(data || null);
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

async function createAgentRunRow(input = {}, deps) {
  const { localDb, supabase, DB_DRIVER, isAgentRunStatus } = deps;

  if (!isAgentRunStatus(input.status || 'planned')) {
    throw new Error(`Agent run status inválido: ${input.status}`);
  }

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.createAgentRun(input));
  }

  const timestamp = input.started_at || nowIso();
  const payload = {
    run_id: input.run_id || deps.randomUUID(),
    workspace_id: input.workspace_id,
    task_id: input.task_id || null,
    agent_id: input.agent_id,
    requested_base_ref: input.requested_base_ref,
    baseline_commit: input.baseline_commit,
    observed_start_branch: input.observed_start?.branch || null,
    observed_start_head: input.observed_start?.head || null,
    observed_start_dirty: input.observed_start?.dirty || null,
    observed_start_path: input.observed_start?.path || null,
    status: input.status || 'planned',
    predecessor_run_id: input.predecessor_run_id || null,
    recovery_group_id: input.recovery_group_id || null,
    terminal_reason_class: input.terminal_reason_class || null,
    started_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await supabase.from('agent_runs').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return normalizeAgentRunRecord(data);
}

async function updateAgentRunTerminalRow(runId, updates = {}, deps) {
  const { localDb, supabase, DB_DRIVER, isTerminalAgentRunStatus } = deps;

  const status = updates.status;
  if (!isTerminalAgentRunStatus(status)) {
    throw new Error(`Estado terminal inválido para agent_run: ${status}`);
  }

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.updateAgentRunTerminal(runId, updates));
  }

  const payload = {
    status,
    terminal_reason_class: updates.terminal_reason_class || null,
    completed_at: updates.completed_at || nowIso(),
    updated_at: updates.updated_at || nowIso(),
  };

  const { data, error } = await supabase
    .from('agent_runs')
    .update(payload)
    .eq('run_id', runId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizeAgentRunRecord(data);
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

async function appendAgentArtifactRow(input = {}, deps) {
  const {
    localDb,
    supabase,
    DB_DRIVER,
    normalizeEvidenceRef,
    parseEvidenceRef,
    validateAgentArtifactInput,
  } = deps;

  validateAgentArtifactInput(input);
  const evidenceRef = normalizeEvidenceRef(input.evidence_ref);
  const parsedEvidenceRef = parseEvidenceRef(evidenceRef);

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentArtifactRecord(
      localDb.appendAgentArtifact({
        ...input,
        evidence_ref: evidenceRef,
      })
    );
  }

  const artifacts = await listAgentArtifacts(input.run_id, deps);
  const nextSeq = input.seq || (artifacts.at(-1)?.seq || 0) + 1;
  const payload = {
    artifact_id: input.artifact_id || deps.randomUUID(),
    run_id: input.run_id,
    seq: nextSeq,
    phase: input.phase,
    kind: input.kind,
    producer: input.producer,
    summary: input.summary,
    evidence_ref: evidenceRef,
    evidence_kind: parsedEvidenceRef.kind,
    evidence_locator: parsedEvidenceRef.locator,
    evidence_version: parsedEvidenceRef.version,
    parent_artifact_id: input.parent_artifact_id || null,
    supersedes_artifact_id: input.supersedes_artifact_id || null,
    content_digest: input.content_digest || input.integrity?.content_digest || null,
    locator_version: input.locator_version || input.integrity?.locator_version || null,
    observed_at: input.observed_at || input.integrity?.observed_at || nowIso(),
  };

  const { data, error } = await supabase.from('agent_artifacts').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return normalizeAgentArtifactRecord(data);
}

async function getWorkspaceEvidence(workspaceId, deps) {
  const { localDb, DB_DRIVER, readWorkspaceEvidenceSummary, presentWorkspaceEvidence } = deps;

  if (DB_DRIVER !== 'supabase') {
    const summary = readWorkspaceEvidenceSummary(localDb.getDb(), { workspaceId });
    return summary ? presentWorkspaceEvidence(summary) : null;
  }

  const workspace = await getAgentWorkspaceById(workspaceId, deps);
  if (!workspace) return null;
  const latestRun = await getLatestAgentRunForWorkspace(workspaceId, deps);
  const latestArtifact = latestRun
    ? await getLatestAgentArtifactForRun(latestRun.run_id, deps)
    : null;
  return presentWorkspaceEvidence({
    workspace,
    latest_run: latestRun,
    latest_artifact: latestArtifact,
  });
}

export function registerWorkspaceTools(server, deps) {
  const {
    AGENT_RUN_STATUSES,
    TERMINAL_AGENT_RUN_STATUSES,
    AGENT_ARTIFACT_PHASES,
    AGENT_ARTIFACT_PRODUCERS,
    AGENT_ARTIFACT_KINDS,
    ok,
    err,
  } = deps;
  const agentWorkspaceStatusSchema = z.enum(AGENT_WORKSPACE_STATUSES);

  server.tool(
    'list_agent_workspaces',
    'Lista workspaces de agentes registrados en el control plane, sin exponer comandos git/worktree.',
    {
      project_id: PROJECT_ID_SCHEMA,
      status: z
        .enum([...AGENT_WORKSPACE_STATUSES, 'all'])
        .optional()
        .default('all'),
    },
    async ({ project_id, status }) => {
      try {
        const workspaces = await listAgentWorkspaces({ projectId: project_id, status }, deps);
        return ok({ total: workspaces.length, workspaces });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'get_agent_workspace',
    'Obtiene un workspace específico del control plane por workspace_id.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
    },
    async ({ workspace_id }) => {
      try {
        const workspace = await getAgentWorkspaceById(workspace_id, deps);
        if (!workspace) return err(`Workspace ${workspace_id} no encontrado.`);
        return ok({ workspace });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'get_agent_run',
    'Obtiene un agent_run durable por run_id.',
    {
      run_id: RUN_ID_SCHEMA,
    },
    async ({ run_id }) => {
      try {
        const run = await getAgentRunById(run_id, deps);
        if (!run) return err(`agent_run ${run_id} no encontrado.`);
        return ok({ run });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'list_agent_runs',
    'Lista runs durables por workspace/task/agent.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA.optional(),
      task_id: z.string().min(1).optional(),
      agent_id: AGENT_ID_SCHEMA.optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ workspace_id, task_id, agent_id, limit }) => {
      try {
        const runs = await listAgentRuns(
          {
            workspaceId: workspace_id || null,
            taskId: task_id || null,
            agentId: agent_id || null,
            limit: limit || null,
          },
          deps
        );
        return ok({ total: runs.length, runs });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'list_agent_artifacts',
    'Lista artifacts append-only ordenados por seq para un run.',
    {
      run_id: RUN_ID_SCHEMA,
    },
    async ({ run_id }) => {
      try {
        const artifacts = await listAgentArtifacts(run_id, deps);
        return ok({ total: artifacts.length, artifacts });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'get_workspace_evidence',
    'Devuelve workspace + latest run + latest artifact para consumers downstream.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
    },
    async ({ workspace_id }) => {
      try {
        const evidence = await getWorkspaceEvidence(workspace_id, deps);
        if (!evidence) return err(`Workspace ${workspace_id} no encontrado.`);
        return ok(evidence);
      } catch (e) {
        return err(e.message);
      }
    }
  );

  // ─── devhub-cloud-foundation (PR 3): 6 new workspace.* tools ───
  // No `workspace.invite` or `workspace.accept_invite` (REQ-MEM-7).
  // These are the programmatic direct-management tools; invitations are
  // web-only (CAP-8).

  // devhub-cloud-foundation: the 6 workspace.* tools now receive actor from
  // AuthProvider (deps.getActor / deps.authProvider). In cloud mode the actor
  // comes from the real session (or bootstrap); in local it is the synthetic.
  // workspace-scoped writes start going through withWorkspaceContext (sqlite)
  // or explicit assertCan (supabase service path, since RLS is bypassed by key).
  server.tool(
    'workspace.list',
    'Lista los workspaces en los que el actor es miembro. Cada entry incluye id, name, slug, role, member_count, project_count.',
    {},
    async () => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        const rows = await listWorkspacesForActor(deps, actor);
        return ok({ workspaces: rows });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'workspace.create',
    'Crea un nuevo workspace y agrega al actor como owner.',
    {
      name: z.string().min(1).describe('Nombre del workspace'),
      slug: z.string().min(1).optional().describe('Slug único. Si se omite, se genera.'),
    },
    async ({ name, slug }) => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        const created = await createWorkspaceForActor(deps, { name, slug }, actor);
        return ok({ workspace: created });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'workspace.members',
    'Lista los miembros del workspace. El actor debe ser miembro.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
    },
    async ({ workspace_id }) => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        const members = await listWorkspaceMembers(deps, workspace_id, actor);
        return ok({ members });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'workspace.add_member',
    'Agrega un usuario existente al workspace. Admin/owner only. Default role: member (locked).',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
      user_id: z.string().min(1).describe('ID del usuario a agregar'),
      role: WORKSPACE_ROLE_SCHEMA.optional().default('member'),
      project_id: z.string().optional().describe('Optional project scope (PR7)'),
    },
    async ({ workspace_id, user_id, role, project_id }) => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        let result;
        if (deps.DB_DRIVER !== 'supabase') {
          // sqlite path: policy enforcement + context via the wrapper (mirrors RLS)
          result = await withWorkspaceContext(actor, workspace_id, async () =>
            addWorkspaceMember(deps, { workspace_id, user_id, role, project_id }, actor)
          );
        } else {
          // supabase service path: RLS bypassed, so explicit policy check here
          const fullActor = await ensureActorWithMemberships(deps, actor);
          const roleInWs = findRoleInActor(fullActor, workspace_id) || 'viewer';
          assertCan({ userId: fullActor.user.id, workspaceRole: roleInWs }, 'admin', {
            workspaceId: workspace_id,
          });
          result = await addWorkspaceMember(
            deps,
            { workspace_id, user_id, role, project_id },
            actor
          );
        }
        return ok({ member: result });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'workspace.update_member_role',
    'Cambia el rol de un miembro. Admin/owner only. Last-owner protection: el último owner no puede ser degradado.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
      user_id: z.string().min(1),
      role: WORKSPACE_ROLE_SCHEMA,
    },
    async ({ workspace_id, user_id, role }) => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        let result;
        if (deps.DB_DRIVER !== 'supabase') {
          result = await withWorkspaceContext(actor, workspace_id, async () =>
            updateWorkspaceMemberRole(deps, { workspace_id, user_id, role }, actor)
          );
        } else {
          const fullActor = await ensureActorWithMemberships(deps, actor);
          const roleInWs = findRoleInActor(fullActor, workspace_id) || 'viewer';
          assertCan({ userId: fullActor.user.id, workspaceRole: roleInWs }, 'admin', {
            workspaceId: workspace_id,
          });
          result = await updateWorkspaceMemberRole(deps, { workspace_id, user_id, role }, actor);
        }
        return ok({ member: result });
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'workspace.remove_member',
    'Elimina un miembro del workspace. Admin/owner only. Last-owner protection: el último owner no puede ser removido.',
    {
      workspace_id: WORKSPACE_ID_SCHEMA,
      user_id: z.string().min(1),
    },
    async ({ workspace_id, user_id }) => {
      try {
        const actor = await (typeof deps.getActor === 'function' ? deps.getActor() : null);
        let result;
        if (deps.DB_DRIVER !== 'supabase') {
          result = await withWorkspaceContext(actor, workspace_id, async () =>
            removeWorkspaceMember(deps, { workspace_id, user_id }, actor)
          );
        } else {
          const fullActor = await ensureActorWithMemberships(deps, actor);
          const roleInWs = findRoleInActor(fullActor, workspace_id) || 'viewer';
          assertCan({ userId: fullActor.user.id, workspaceRole: roleInWs }, 'admin', {
            workspaceId: workspace_id,
          });
          result = await removeWorkspaceMember(deps, { workspace_id, user_id }, actor);
        }
        return ok({ removed: result });
      } catch (e) {
        return err(e.message);
      }
    }
  );
}

// ─── Helpers for the 6 new workspace.* tools ───────────────────────
// Each helper reads/writes the SQLite tenancy tables via the local
// adapter (DEVHUB_DB_DRIVER=sqlite is the default; cloud mode uses
// the postgres-generic driver from PR 4, which exposes the same
// tableOps surface).

async function listWorkspacesForActor(deps, actor = null) {
  const userId = actor?.user?.id || deps.localUserId;
  if (deps.DB_DRIVER === 'supabase') {
    // Cloud path: actor comes from authProvider.getSession() (or bootstrap).
    // Query membership first (service key bypasses RLS, so we filter here).
    const { data: mems, error: memErr } = await deps.supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId);
    if (memErr) throw new Error(memErr.message);
    if (!mems || mems.length === 0) return [];
    const wsIds = mems.map((m) => m.workspace_id);
    const { data: wss, error: wsErr } = await deps.supabase
      .from('workspaces')
      .select('id, name, slug, created_at, owner_id')
      .in('id', wsIds);
    if (wsErr) throw new Error(wsErr.message);
    return (wss || []).map((r) => ({
      workspace_id: r.id,
      id: r.id,
      name: r.name,
      slug: r.slug,
      role: mems.find((m) => m.workspace_id === r.id)?.role || 'member',
      member_count: 1,
      project_count: 0,
      created_at: r.created_at,
    }));
  }
  // Local (sqlite) — count projects per workspace; NULL/empty workspace_id
  // rolls up to local-ws for legacy catalogs.
  const db = deps.localDb.getDb();
  const rows = db
    .prepare('SELECT id, name, slug, created_at, owner_id FROM workspaces ORDER BY created_at ASC')
    .all();
  const countRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(workspace_id), ''), 'local-ws') AS ws_key, COUNT(*) AS c
       FROM projects
       GROUP BY ws_key`
    )
    .all();
  const projectCountByWorkspace = new Map(
    (countRows || []).map((row) => [String(row.ws_key), Number(row.c) || 0])
  );
  return rows.map((r) => ({
    workspace_id: r.id,
    id: r.id,
    name: r.name,
    slug: r.slug,
    role: 'owner',
    member_count: 1,
    project_count: projectCountByWorkspace.get(r.id) || 0,
    created_at: r.created_at,
  }));
}

async function createWorkspaceForActor(deps, { name, slug }, actor = null) {
  const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const finalSlug = slug || `ws-${Date.now().toString(36)}`;
  // Actor from authProvider (cloud) or synthetic (local). The create helper
  // already had the getActor attempt; now properly awaited for async provider.
  let actorUserId = (actor && actor.user && actor.user.id) || null;
  if (!actorUserId && typeof deps.getActor === 'function') {
    try {
      const session = await deps.getActor();
      if (session && session.user && session.user.id) {
        actorUserId = session.user.id;
      }
    } catch {
      /* fall through */
    }
  }
  actorUserId = actorUserId || deps.localUserId || 'local-user';

  if (deps.DB_DRIVER === 'supabase') {
    const payload = {
      id,
      name,
      slug: finalSlug,
      owner_id: actorUserId,
      created_at: nowIso(),
    };
    const { data, error } = await deps.supabase
      .from('workspaces')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // also insert membership (owner)
    await deps.supabase
      .from('workspace_members')
      .insert({ workspace_id: id, user_id: actorUserId, role: 'owner', joined_at: nowIso() });
    return {
      workspace_id: id,
      id,
      name,
      slug: finalSlug,
      actor_role: 'owner',
    };
  }

  // Local sqlite path (exact previous behavior).
  const db = deps.localDb.getDb();
  const stmt = db.prepare('INSERT INTO workspaces (id, name, slug, owner_id) VALUES (?, ?, ?, ?)');
  stmt.run(id, name, finalSlug, actorUserId);
  db.prepare(
    'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  ).run(id, actorUserId, 'owner');
  return {
    workspace_id: id,
    id,
    name,
    slug: finalSlug,
    actor_role: 'owner',
  };
}

async function listWorkspaceMembers(deps, workspaceId, actor = null) {
  if (deps.DB_DRIVER === 'supabase') {
    const { data, error } = await deps.supabase
      .from('workspace_members')
      .select('workspace_id, user_id, role, joined_at')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }
  const db = deps.localDb.getDb();
  const rows = db
    .prepare(
      'SELECT workspace_id, user_id, role, joined_at FROM workspace_members WHERE workspace_id = ? ORDER BY joined_at ASC'
    )
    .all(workspaceId);
  return rows;
}

async function addWorkspaceMember(deps, { workspace_id, user_id, role }, actor = null) {
  // Admin/owner only — now enforced by caller via withWorkspaceContext (local)
  // or explicit assertCan (cloud). Last-owner protection stays in the helper.
  const finalRole = role || 'member';
  if (deps.DB_DRIVER === 'supabase') {
    const payload = {
      workspace_id,
      user_id,
      role: finalRole,
      joined_at: nowIso(),
    };
    const { data, error } = await deps.supabase
      .from('workspace_members')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const db = deps.localDb.getDb();
  db.prepare(
    'INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  ).run(workspace_id, user_id, finalRole);
  return {
    workspace_id,
    user_id,
    role: finalRole,
    joined_at: nowIso(),
  };
}

async function updateWorkspaceMemberRole(deps, { workspace_id, user_id, role }, actor = null) {
  // Last-owner protection (same as before). Cloud path uses supabase update.
  if (deps.DB_DRIVER === 'supabase') {
    const currentQ = await deps.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .single();
    const current = currentQ.data;
    if (current && current.role === 'owner' && role !== 'owner') {
      const ownersQ = await deps.supabase
        .from('workspace_members')
        .select('user_id', { count: 'exact' })
        .eq('workspace_id', workspace_id)
        .eq('role', 'owner');
      if ((ownersQ.count || 0) <= 1) {
        throw new Error('workspace must retain at least one owner');
      }
    }
    const { data, error } = await deps.supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const db = deps.localDb.getDb();
  const current = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspace_id, user_id);
  if (current && current.role === 'owner' && role !== 'owner') {
    const owners = db
      .prepare(
        "SELECT count(*) as c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'"
      )
      .get(workspace_id);
    if (owners.c <= 1) {
      throw new Error('workspace must retain at least one owner');
    }
  }
  db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?').run(
    role,
    workspace_id,
    user_id
  );
  return {
    workspace_id,
    user_id,
    role,
  };
}

async function removeWorkspaceMember(deps, { workspace_id, user_id }, actor = null) {
  // Last-owner protection. Cloud: supabase delete after check.
  if (deps.DB_DRIVER === 'supabase') {
    const targetQ = await deps.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .single();
    const target = targetQ.data;
    if (target && target.role === 'owner') {
      const ownersQ = await deps.supabase
        .from('workspace_members')
        .select('user_id', { count: 'exact' })
        .eq('workspace_id', workspace_id)
        .eq('role', 'owner');
      if ((ownersQ.count || 0) <= 1) {
        throw new Error('workspace must retain at least one owner');
      }
    }
    const { error } = await deps.supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id);
    if (error) throw new Error(error.message);
    return true;
  }
  const db = deps.localDb.getDb();
  const target = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspace_id, user_id);
  if (target && target.role === 'owner') {
    const owners = db
      .prepare(
        "SELECT count(*) as c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'"
      )
      .get(workspace_id);
    if (owners.c <= 1) {
      throw new Error('workspace must retain at least one owner');
    }
  }
  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
    workspace_id,
    user_id
  );
  return true;
}

// ─── Cloud activation helpers (minimal, start of tenancy context) ────────
// ensureActorWithMemberships: for supabase service-key path we must
// populate workspaceMemberships from the table so that findRole / assertCan
// and withWorkspaceContext (when used) see the real roles. Local already
// carries them from the synthetic session.
async function ensureActorWithMemberships(deps, baseActor) {
  if (!baseActor || !baseActor.user || !baseActor.user.id)
    return baseActor || { user: { id: deps.localUserId }, workspaceMemberships: [] };
  if (deps.DB_DRIVER !== 'supabase') return baseActor; // local provider already has them
  if (baseActor.workspaceMemberships && baseActor.workspaceMemberships.length > 0) return baseActor;
  const { data: mems } = await deps.supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', baseActor.user.id);
  return {
    ...baseActor,
    workspaceMemberships: (mems || []).map((m) => ({ workspaceId: m.workspace_id, role: m.role })),
  };
}

function findRoleInActor(actor, workspaceId) {
  if (!actor || !actor.workspaceMemberships) return null;
  const m = actor.workspaceMemberships.find((mm) => mm.workspaceId === workspaceId);
  return m ? m.role : null;
}

// Re-export the helpers for TDD (direct mock tests) and any future internal use.
// Not part of the public MCP surface.
export {
  listWorkspacesForActor,
  createWorkspaceForActor,
  listWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  ensureActorWithMemberships,
  findRoleInActor,
};

import { NextResponse } from 'next/server';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import {
  AGENT_WORKSPACE_BASE_COMMIT,
  createMissionMessage,
  createAgentRun,
  createSwarmMission,
  getActiveAgentCount as getDbActiveAgentCount,
  getDb,
  getSwarmMissionDirectorSnapshot,
  listMissionParticipants,
  prepareAgentWorkspaceLease,
  registerMissionParticipant,
  upsertAgentPresence,
  upsertMessageDelivery,
} from '@/lib/db/localDb.js';
import {
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
  createDirectorQueueContract,
} from '@/lib/db/compactReads.js';
import {
  buildHealthSnapshot,
  buildMcpHealthSource,
  buildProcessHealthSource,
  buildQueueHealthSource,
  buildRuntimeDiagnosticsHealthSource,
  buildSessionStreamHealthSource,
  buildTelegramHealthSource,
} from '@/lib/operations/health';
import {
  buildControlRoomSnapshotInputFromHealth,
  buildRoleAgentProfile,
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  selectSwarmLaunchCatalog,
} from '@/lib/operations/swarmControl';
import { buildAgentLaunchCommand } from '@/lib/agentLaunchCommand';
import { buildAgentLaunchWrapper } from '@/lib/agentLaunchWrapper';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';
import { prepareAgentWorktree } from '@/lib/swarm/agentWorkspaceManager';

export const runtime = 'nodejs';

const LOCAL_MISSION_DELIVERY_CHANNEL = 'local_snapshot';
const LOCAL_MISSION_MESSAGE_KIND = 'directive';
const LOCAL_SWARM_RUNTIME_SURFACE = 'swarm-control-launch';
const EMPTY_DIRECTOR_QUEUE_HANDOFF = Object.freeze({
  status: 'idle',
  recipient_agent_id: null,
  message: null,
  task: null,
  workspace: null,
  run: null,
  artifact: null,
  supervisor: null,
});

const DIRECTOR_HANDOFF_DISABLED_MESSAGES = Object.freeze({
  none: 'No hay executor activo para handoff.',
  multiple: 'Hay más de un executor activo; el handoff seguro sigue deshabilitado.',
});

function mapLaunchRoleToParticipantRole(roleKey = '') {
  if (roleKey === 'director') return 'director';
  if (roleKey === 'qa' || roleKey === 'reviewer' || roleKey === 'evidence') return 'reviewer';
  return 'executor';
}

function describeLaunchRole(roleKey = '') {
  const descriptions = {
    director:
      'Coordina la misión, asigna foco a cada agente, verifica evidencia y decide cuándo cerrar/hacer handoff.',
    coder:
      'Implementa cambios de código pequeños y verificables siguiendo el foco que entregue el Director.',
    auditor:
      'Revisa riesgos, regresiones, errores visibles y criterios de aceptación antes del handoff.',
    devops:
      'Valida entorno, comandos, procesos, consumo de recursos y estado operativo de la ejecución.',
    architect:
      'Cuida estructura, límites técnicos, coherencia del diseño y próximos pasos durables.',
  };

  return (
    descriptions[roleKey] || 'Ejecuta tu parte de la misión y reporta estado/evidencia al Director.'
  );
}

function buildLaunchPrompt({ role, roleKey, mission, workspacePath, hierarchy = [] }) {
  const normalizedRoleKey = String(roleKey || '')
    .trim()
    .toLowerCase();
  const isDirector = normalizedRoleKey === 'director';
  const workerRoles = hierarchy.filter((entry) => entry && entry.toLowerCase() !== 'director');

  return [
    `Rol: ${role}`,
    `Workspace: ${workspacePath}`,
    `Misión: ${mission}`,
    '',
    'Jerarquía operativa:',
    `- Director: autoridad de coordinación y handoff final.`,
    workerRoles.length
      ? `- Agentes trabajadores: ${workerRoles.join(', ')} reportan avances, bloqueos y evidencia al Director.`
      : '- Agentes trabajadores: reportan avances, bloqueos y evidencia al Director.',
    '',
    'Tu responsabilidad:',
    `- ${describeLaunchRole(normalizedRoleKey)}`,
    '',
    'Reglas de ejecución:',
    '- No asumas que otro agente completó tu parte: deja evidencia concreta.',
    '- Mantén cambios acotados y evita pisar trabajo de otros roles.',
    isDirector
      ? '- Como Director, primero confirma roster, reparte foco y pide reportes; no ejecutes como worker salvo desbloqueo puntual.'
      : '- Como worker, no cierres la misión: entrega resultado, pruebas/observaciones y próximos pasos al Director.',
  ].join('\n');
}

function buildLaunchCommand(programId, prompt, roleKey = '', modelId = null, launchId = null, workspacePath = '') {
  const agentProfile = roleKey ? buildRoleAgentProfile(roleKey) : 'sdd-orchestrator';
  const tmuxSessionName = launchId && roleKey ? `devhub-swarm-${launchId}-${roleKey}` : null;
  const innerCommand = buildAgentLaunchCommand(programId, prompt, { 
    opencodeAgent: agentProfile, 
    modelId,
    tmuxSessionName,
  });
  return buildAgentLaunchWrapper({
    agentId: `${launchId}-${roleKey}`,
    missionId: launchId,
    role: roleKey,
    workspacePath,
    innerCommand,
  });
}

function uniqueBy(items = [], getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildInClause(values = []) {
  return values.map(() => '?').join(', ');
}

function listMissionWorkspaces(db, missionControl = {}) {
  const participantAgentIds = uniqueBy(
    missionControl.participants || [],
    (participant) => participant?.agent_id
  )
    .map((participant) => participant.agent_id)
    .filter(Boolean);

  if (participantAgentIds.length === 0) {
    return Array.isArray(missionControl.workspaces) ? missionControl.workspaces : [];
  }

  return db
    .prepare(
      `SELECT *
       FROM agent_workspaces
       WHERE agent_id IN (${buildInClause(participantAgentIds)})
       ORDER BY updated_at DESC, rowid DESC`
    )
    .all(...participantAgentIds);
}

function listMissionRuns(db, missionControl = {}, workspaces = []) {
  const workspaceIds = uniqueBy(workspaces, (workspace) => workspace?.id)
    .map((workspace) => workspace.id)
    .filter(Boolean);

  if (workspaceIds.length === 0) {
    return Array.isArray(missionControl.runs) ? missionControl.runs : [];
  }

  return db
    .prepare(
      `SELECT *
       FROM agent_runs
       WHERE workspace_id IN (${buildInClause(workspaceIds)})
       ORDER BY created_at DESC, rowid DESC`
    )
    .all(...workspaceIds);
}

function listMissionArtifacts(db, missionControl = {}, runs = []) {
  const runIds = uniqueBy(runs, (run) => run?.run_id)
    .map((run) => run.run_id)
    .filter(Boolean);

  if (runIds.length === 0) {
    return Array.isArray(missionControl.artifacts) ? missionControl.artifacts : [];
  }

  return db
    .prepare(
      `SELECT *
       FROM agent_artifacts
       WHERE run_id IN (${buildInClause(runIds)})
       ORDER BY seq DESC, created_at DESC, rowid DESC`
    )
    .all(...runIds);
}

function deriveMissionAgentSupervisorState({
  participant,
  workspace,
  run,
  presence,
  latestSupervisorSnapshot,
  now = null,
}) {
  const currentTime = now ? new Date(now).getTime() : Date.now();

  // 1. Check presence TTL and stale/offline status first — these are source of truth for agent liveness
  if (presence) {
    const expiresAt = presence.expires_at ? new Date(presence.expires_at).getTime() : null;
    const lastSeen = presence.last_seen_at ? new Date(presence.last_seen_at).getTime() : null;

    // Hard expiration: if expires_at is set and passed, agent is stale
    if (expiresAt && !Number.isNaN(expiresAt) && expiresAt < currentTime) {
      return 'stale';
    }

    // Soft expiration: if no expires_at but last_seen is older than 5 minutes, stale
    const STALENESS_THRESHOLD_MS = 5 * 60 * 1000;
    if (!expiresAt && lastSeen && !Number.isNaN(lastSeen) && (currentTime - lastSeen) > STALENESS_THRESHOLD_MS) {
      return 'stale';
    }

    if (presence.effective_state === 'stale') return 'stale';
    if (presence.effective_state === 'offline') return 'offline';
  } else {
    // If there is NO presence record at all, but the workspace is marked active/ready or run is running,
    // the agent is actually offline/dead.
    if (workspace?.status === 'active' || workspace?.status === 'ready' || run?.status === 'running') {
      return 'offline';
    }
  }

  // 2. Fallback to supervisor/running state only if agent is alive (has presence and not stale/offline)
  if (latestSupervisorSnapshot?.supervisor_state) return latestSupervisorSnapshot.supervisor_state;
  if (run?.status === 'running') return 'lease_active';
  if (workspace?.status === 'active' || workspace?.status === 'ready') return 'lease_active';
  if (participant?.status === 'active') return 'lease_active';
  return 'idle';
}

function buildMissionSupervisorSlice({
  missionControl = {},
  workspaces = [],
  runs = [],
  directorQueue = null,
}) {
  const latestSupervisorSnapshot = Array.isArray(missionControl.supervisor_snapshots)
    ? missionControl.supervisor_snapshots[0] || null
    : null;
  const approvals = buildSupervisorApprovalProjection(missionControl)?.approvals || [];
  const presenceRows = [
    ...(Array.isArray(missionControl.presence?.active) ? missionControl.presence.active : []),
    ...(Array.isArray(missionControl.presence?.stale) ? missionControl.presence.stale : []),
    ...(Array.isArray(missionControl.presence?.offline) ? missionControl.presence.offline : []),
  ];
  const presenceByAgentId = new Map(
    presenceRows.filter((row) => row?.agent_id).map((row) => [row.agent_id, row])
  );
  const workspacesByAgentId = new Map(
    uniqueBy(workspaces, (workspace) => workspace?.agent_id)
      .filter((workspace) => workspace?.agent_id)
      .map((workspace) => [workspace.agent_id, workspace])
  );
  const runsByWorkspaceId = new Map(
    uniqueBy(runs, (run) => run?.workspace_id)
      .filter((run) => run?.workspace_id)
      .map((run) => [run.workspace_id, run])
  );
  const agentRows = (missionControl.participants || []).map((participant) => {
    const workspace = workspacesByAgentId.get(participant.agent_id) || null;
    const run = workspace ? runsByWorkspaceId.get(workspace.id) || null : null;
    const presence = presenceByAgentId.get(participant.agent_id) || null;
    const evidenceRef =
      presence?.evidence_ref || run?.evidence_ref || workspace?.evidence_ref || null;

    return {
      agent_id: participant.agent_id || null,
      task_id: workspace?.current_task_id || run?.task_id || null,
      lease_expires_at: presence?.expires_at || null,
      workspace_id: workspace?.id || null,
      run_id: run?.run_id || null,
      supervisor_state: deriveMissionAgentSupervisorState({
        participant,
        workspace,
        run,
        presence,
        latestSupervisorSnapshot,
      }),
      authority: 'authoritative',
      freshness: 'current',
      evidence_ref: evidenceRef,
    };
  });
  const activeAgents = agentRows.filter(
    (agent) => agent.supervisor_state !== 'offline' && agent.supervisor_state !== 'stale'
  ).length;
  const supervisorEvidenceRef =
    latestSupervisorSnapshot?.evidence_ref ||
    agentRows.find((agent) => agent.evidence_ref)?.evidence_ref ||
    workspaces.find((workspace) => workspace?.evidence_ref)?.evidence_ref ||
    runs.find((run) => run?.evidence_ref)?.evidence_ref ||
    null;

  return {
    supervisor_state:
      latestSupervisorSnapshot?.supervisor_state ||
      (missionControl.mission?.status === 'active' ? 'lease_active' : 'idle'),
    active_agents: activeAgents,
    max_agents: Math.max(activeAgents, agentRows.length),
    queue_depth: Array.isArray(directorQueue?.items) ? directorQueue.items.length : 0,
    authority: 'authoritative',
    freshness: 'current',
    evidence_ref: supervisorEvidenceRef,
    agents: agentRows,
    approvals,
  };
}

function buildMissionControlRoomSnapshotInput({
  db = null,
  missionControl = null,
  directorQueue = null,
}) {
  if (!missionControl) return {};

  const workspaces = db
    ? listMissionWorkspaces(db, missionControl)
    : missionControl.workspaces || [];
  const runs = db ? listMissionRuns(db, missionControl, workspaces) : missionControl.runs || [];
  const artifacts = db
    ? listMissionArtifacts(db, missionControl, runs)
    : missionControl.artifacts || [];

  return {
    mission_control: missionControl,
    supervisor: buildMissionSupervisorSlice({ missionControl, workspaces, runs, directorQueue }),
    workspaces,
    runs,
    artifacts,
    evidence_timeline: buildMissionEvidenceTimeline(missionControl),
  };
}

function insertAgentHubSession(
  db,
  {
    id,
    project_id,
    title,
    agent_model,
    parent_id = null,
    directory = null,
    status = 'active',
    opencode_session_id = null,
    now,
  }
) {
  db.prepare(
    `INSERT INTO agent_hub_sessions (
      id, project_id, title, agent_model, parent_id, created_at, updated_at, directory, status, opencode_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    project_id,
    title,
    agent_model,
    parent_id,
    now,
    now,
    directory,
    status,
    opencode_session_id
  );

  return db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ? LIMIT 1').get(id);
}

function activatePreparedWorkspace(
  db,
  { workspaceId, sessionId, branchName, workspacePath, observedHead, now }
) {
  db.prepare(
    `UPDATE agent_workspaces
     SET run_id_or_session_id = ?,
         status = 'ready',
         branch_name = ?,
         worktree_path = ?,
         observed_branch = ?,
         observed_head = ?,
         observed_dirty = 'clean',
         claimed_at = ?,
         started_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    sessionId,
    branchName,
    workspacePath.includes('.devhub/worktrees') ? workspacePath : `${workspacePath}/.worktrees/${branchName}`,
    branchName,
    observedHead,
    now,
    now,
    now,
    workspaceId
  );

  return db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(workspaceId);
}

async function launchSwarmLocal({ projectId, draft, now = new Date().toISOString() } = {}) {
  // Reads: use localDb directly
  const readDb = getDb();
  
  // LOG: Inicio de lanzamiento
  console.log(`[SWARM_LAUNCH] Starting swarm launch for project ${projectId}`);
  
  const project = readDb.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(projectId);

  if (!project) {
    console.error(`[SWARM_LAUNCH] ERROR: Invalid project_id ${projectId}`);
    throw new Error('project_id inválido para launch local.');
  }

  // PREVENCIÓN DE DUPLICADOS: Verificar si ya hay un swarm activo para este proyecto
  const activeMissions = readDb.prepare(
    'SELECT count(*) as count FROM swarm_missions WHERE project_id = ? AND status = ?'
  ).get(projectId, 'active');
  
  if (activeMissions.count > 0) {
    console.error(`[SWARM_LAUNCH] ERROR: Project ${projectId} already has ${activeMissions.count} active swarm(s)`);
    throw new Error(`Ya existe un swarm activo para este proyecto. Esperá a que termine o cancelalo antes de lanzar otro.`);
  }
  
  console.log(`[SWARM_LAUNCH] No active swarms found for project ${projectId}. Proceeding.`);

  const catalog = selectSwarmLaunchCatalog();
  const resolvedDraft = createSwarmLaunchDraft({ catalog, project, draft });
  const preview = deriveSwarmLaunchPreview({ catalog, draft: resolvedDraft });

  if (!preview.isReady) {
    console.error(`[SWARM_LAUNCH] ERROR: Launch not ready. Missing required fields.`);
    throw new Error('Launch incompleto: faltan defaults obligatorios.');
  }

  const launchId = `launch-${crypto.randomUUID().slice(0, 8)}`;
  const missionTitle = preview.launchLabel;
  const directorAgentId = `${launchId}-director`;
  
  console.log(`[SWARM_LAUNCH] Creating mission ${launchId}: ${missionTitle}`);
  console.log(`[SWARM_LAUNCH] Roles: ${preview.rolePrograms?.map(r => r.role).join(', ') || 'none'}`);

  // Writes: use write queue to serialize all critical DB mutations
  const result = await withDbWriteQueue((writeDb) => {
    const mission = createSwarmMission(writeDb, {
      mission_id: launchId,
      project_id: projectId,
      owner_agent_id: directorAgentId,
      kind: 'coordination',
      status: 'active',
      title: missionTitle,
      summary: resolvedDraft.mission,
      started_at: now,
      updated_at: now,
    });

    let parentSessionId = null;
    const runtimeRequests = [];
  const failedRoles = [];

    for (const roleEntry of preview.rolePrograms || []) {
      const roleKey = roleEntry.role_key;
      const agentId = `${launchId}-${roleKey}`;
      const taskId = `${launchId}:${roleKey}`;
      const sessionId = `${launchId}-${roleKey}-session`;

      console.log(`[SWARM_LAUNCH] Setting up role: ${roleEntry.role} (${roleKey})`);

      // T1.2: Prepare real git worktree for this role
      let worktreeResult;
      try {
        worktreeResult = prepareAgentWorktree({
          repoRoot: resolvedDraft.workspacePath,
          launchId,
          roleKey,
          baseRef: 'HEAD',
        });
      } catch (err) {
        console.error(`[SWARM_LAUNCH] FAILED to prepare worktree for ${roleKey}: ${err.message}`);
        failedRoles.push({
          roleKey,
          roleLabel: roleEntry.role,
          error: err?.message || 'No se pudo preparar worktree.',
        });
        // Skip this role — don't create runtime request
        continue;
      }

      const { worktreePath, branchName, observedHead } = worktreeResult;

      const prompt = buildLaunchPrompt({
        role: roleEntry.role,
        roleKey,
        mission: resolvedDraft.mission,
        workspacePath: worktreePath,
        hierarchy: preview.topology?.roles || [],
      });
      const workspaceLease = prepareAgentWorkspaceLease(
        writeDb,
        {
          task_id: taskId,
          agent_id: agentId,
          correlation_id: `${launchId}:${roleKey}`,
          requested_base_ref: AGENT_WORKSPACE_BASE_COMMIT,
          workspace_path: worktreePath,
        },
        {
          repoRoot: resolvedDraft.workspacePath,
          baseBranch: 'main',
          acceptedAt: now,
        }
      );

      registerMissionParticipant(writeDb, {
        mission_id: mission.mission_id,
        agent_id: agentId,
        role_in_mission: mapLaunchRoleToParticipantRole(roleKey),
        status: 'active',
        joined_at: now,
        updated_at: now,
      });

      const session = insertAgentHubSession(writeDb, {
        id: sessionId,
        project_id: projectId,
        title: `${missionTitle} · ${roleEntry.role}`,
        agent_model: roleEntry.program_id,
        parent_id: parentSessionId,
        directory: worktreePath,
        status: 'active',
        opencode_session_id: roleEntry.program_id === 'opencode' ? sessionId : null,
        now,
      });

      if (roleKey === 'director') {
        parentSessionId = session.id;
      }

      const workspace = activatePreparedWorkspace(writeDb, {
        workspaceId: workspaceLease.workspace.id,
        sessionId: session.id,
        branchName,
        workspacePath: worktreePath,
        observedHead,
        now,
      });

      const run = createAgentRun(writeDb, {
        workspace_id: workspace.id,
        task_id: taskId,
        agent_id: agentId,
        requested_base_ref: workspace.base_commit,
        baseline_commit: workspace.base_commit,
        status: 'running',
        observed_start: {
          branch: branchName,
          head: observedHead,
          dirty: 'clean',
          path: worktreePath,
        },
        started_at: now,
      });

      upsertAgentPresence(writeDb, {
        mission_id: mission.mission_id,
        agent_id: agentId,
        workspace_id: workspace.id,
        run_id: run.run_id,
        runtime_surface: LOCAL_SWARM_RUNTIME_SURFACE,
        presence_state: 'busy',
        status_summary: `${roleEntry.role} listo para launch`,
        evidence_ref: `evidence://launch/${launchId}/${roleKey}`,
        last_seen_at: now,
        updated_at: now,
      });

      console.log(`[SWARM_LAUNCH] Role ${roleEntry.role} configured. Workspace: ${workspace.id}, Run: ${run.run_id}`);

      const roleModel = resolvedDraft.roleModels?.[roleKey] || null;

      runtimeRequests.push({
        taskId,
        selectedAgent: roleEntry.program_id,
        command: buildLaunchCommand(roleEntry.program_id, prompt, roleKey, roleModel, launchId, worktreePath),
        launchOrigin: 'swarm-control-launch',
        roleKey,
        roleLabel: roleEntry.role,
        roleAbbrev: roleEntry.role_abbrev || null,
        promptSummary: `${roleEntry.role} · ${preview.template?.label || missionTitle}`,
        taskTitle: `${missionTitle} · ${roleEntry.role}`,
        modelId: roleModel,
        tmuxSessionName: `devhub-swarm-${launchId}-${roleKey}`,
        launchId,
        isSwarmRole: true,
        workspacePath: worktreePath,
      });
    }

    console.log(`[SWARM_LAUNCH] All ${runtimeRequests.length} roles configured. Creating kickoff message...`);

    if (runtimeRequests.length === 0) {
      const failedSummary = failedRoles
        .map((role) => `${role.roleLabel || role.roleKey}: ${role.error}`)
        .join(' | ');
      throw new Error(
        `No se pudo lanzar el swarm: no se preparó ningún agente. ${failedSummary || 'Sin detalle de error.'}`
      );
    }

    const kickoffMessage = createMissionMessage(writeDb, {
      mission_id: mission.mission_id,
      sender_agent_id: directorAgentId,
      message_kind: LOCAL_MISSION_MESSAGE_KIND,
      body_summary: resolvedDraft.mission,
      created_at: now,
      updated_at: now,
    });

    for (const roleEntry of preview.rolePrograms || []) {
      if (roleEntry.role_key === 'director') continue;

      upsertMessageDelivery(writeDb, {
        message_id: kickoffMessage.message_id,
        recipient_agent_id: `${launchId}-${roleEntry.role_key}`,
        channel: LOCAL_MISSION_DELIVERY_CHANNEL,
        status: 'pending',
        last_attempt_at: now,
        updated_at: now,
      });
    }

    const missionSnapshot = getSwarmMissionDirectorSnapshot(writeDb, mission.mission_id, { now });

    console.log(`[SWARM_LAUNCH] SUCCESS: Swarm ${launchId} launched with ${runtimeRequests.length} agents`);
    console.log(`[SWARM_LAUNCH] Mission ID: ${mission.mission_id}`);
    console.log(`[SWARM_LAUNCH] Runtime requests: ${runtimeRequests.map(r => `${r.roleLabel}(${r.taskId})`).join(', ')}`);

    return {
      control_room_snapshot_input: buildMissionControlRoomSnapshotInput({
        db: writeDb,
        missionControl: missionSnapshot,
      }),
      launch_result: {
        launchId,
        mission_id: mission.mission_id,
        launchLabel: missionTitle,
        summaryLines: preview.summaryLines,
        runtime_requests: runtimeRequests,
        failed_roles: failedRoles,
      },
    };
  }, { label: 'swarm-launch', timeout: 30000 });

  return result;
}

const EVIDENCE_TIMELINE_KIND_RANK = Object.freeze({
  approval_checkpoint: 0,
  supervisor_snapshot: 1,
  artifact: 2,
  run: 3,
  delivery: 4,
  presence: 5,
  mission_message: 6,
});

export function buildMissionControlSnapshotInput(missionControl) {
  if (!missionControl) return {};
  return {
    mission_control: missionControl,
  };
}

function buildSupervisorApprovalProjection(missionControl = {}) {
  const snapshots = Array.isArray(missionControl.supervisor_snapshots)
    ? missionControl.supervisor_snapshots
    : [];
  const approvals = Array.isArray(missionControl.approval_checkpoints)
    ? missionControl.approval_checkpoints
    : [];
  const latestSnapshot = snapshots[0] || null;
  const pendingApprovals = approvals
    .filter((checkpoint) => checkpoint?.status === 'pending')
    .filter((checkpoint) => {
      if (!latestSnapshot) return true;
      return (
        latestSnapshot.supervisor_state === 'awaiting_approval' &&
        latestSnapshot.approval_checkpoint_key === checkpoint.checkpoint_key
      );
    })
    .map((checkpoint) => ({
      checkpoint_key: checkpoint.checkpoint_key || null,
      task_id: checkpoint.task_id || null,
      workspace_id: checkpoint.workspace_id || null,
      run_id: checkpoint.run_id || null,
      status: checkpoint.status || 'pending',
      reason_class: checkpoint.reason_class || null,
      decision_note: checkpoint.decision_note || null,
      decided_at: checkpoint.decided_at || null,
      authority: checkpoint.authority || 'authoritative',
      freshness: checkpoint.freshness || 'current',
      evidence_ref: checkpoint.evidence_ref || null,
      linked_supervisor_state: latestSnapshot?.supervisor_state || null,
      linked_supervisor_outcome: latestSnapshot?.outcome || null,
    }));

  if (!latestSnapshot && pendingApprovals.length === 0) return null;

  return {
    supervisor_state: latestSnapshot?.supervisor_state || 'unavailable',
    outcome: latestSnapshot?.outcome || null,
    reason_class: latestSnapshot?.reason_class || null,
    task_id: latestSnapshot?.task_id || missionControl?.mission?.task_id || null,
    workspace_id: latestSnapshot?.workspace_id || missionControl?.mission?.workspace_id || null,
    run_id: latestSnapshot?.run_id || missionControl?.mission?.run_id || null,
    approval_checkpoint_key: latestSnapshot?.approval_checkpoint_key || null,
    evidence_ref: latestSnapshot?.evidence_ref || null,
    approvals: pendingApprovals,
  };
}

function compareEvidenceTimelineItems(left = {}, right = {}) {
  const leftTime = left.occurred_at ? Date.parse(left.occurred_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.occurred_at ? Date.parse(right.occurred_at) : Number.NEGATIVE_INFINITY;

  if (leftTime !== rightTime) return rightTime - leftTime;

  const leftRank = EVIDENCE_TIMELINE_KIND_RANK[left.kind] ?? Number.MAX_SAFE_INTEGER;
  const rightRank = EVIDENCE_TIMELINE_KIND_RANK[right.kind] ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) return leftRank - rightRank;

  return String(left.item_id || '').localeCompare(String(right.item_id || ''));
}

function buildMissionLinkedIds(missionControl = {}, overrides = {}) {
  return {
    mission_id: overrides.mission_id ?? missionControl?.mission?.mission_id ?? null,
    task_id:
      overrides.task_id ??
      missionControl?.mission?.task_id ??
      missionControl?.latest_message?.related_task_id ??
      null,
    workspace_id:
      overrides.workspace_id ??
      missionControl?.mission?.workspace_id ??
      missionControl?.latest_message?.related_workspace_id ??
      null,
    run_id:
      overrides.run_id ??
      missionControl?.mission?.run_id ??
      missionControl?.latest_message?.related_run_id ??
      null,
    artifact_id: overrides.artifact_id ?? null,
    approval_checkpoint_key: overrides.approval_checkpoint_key ?? null,
  };
}

function pushTimelineItem(items, item) {
  if (!item?.item_id || !item?.occurred_at) return;
  items.push(item);
}

function buildMissionEvidenceTimeline(missionControl = {}) {
  if (!missionControl) return [];

  const items = [];

  (Array.isArray(missionControl.approval_checkpoints)
    ? missionControl.approval_checkpoints
    : []
  ).forEach((checkpoint) => {
    pushTimelineItem(items, {
      item_id: checkpoint.checkpoint_key || null,
      kind: 'approval_checkpoint',
      occurred_at:
        checkpoint.requested_at || checkpoint.updated_at || checkpoint.created_at || null,
      authority: checkpoint.authority || 'authoritative',
      freshness: checkpoint.freshness || 'current',
      summary: checkpoint.reason_class || null,
      linked_ids: buildMissionLinkedIds(missionControl, {
        task_id: checkpoint.task_id,
        workspace_id: checkpoint.workspace_id,
        run_id: checkpoint.run_id,
        approval_checkpoint_key: checkpoint.checkpoint_key,
      }),
      evidence_ref: checkpoint.evidence_ref || null,
    });
  });

  (Array.isArray(missionControl.supervisor_snapshots)
    ? missionControl.supervisor_snapshots
    : []
  ).forEach((snapshot) => {
    pushTimelineItem(items, {
      item_id: snapshot.task_id || null,
      kind: 'supervisor_snapshot',
      occurred_at: snapshot.updated_at || snapshot.created_at || null,
      authority: snapshot.authority || 'authoritative',
      freshness: snapshot.freshness || 'current',
      summary: snapshot.supervisor_state || null,
      linked_ids: buildMissionLinkedIds(missionControl, {
        task_id: snapshot.task_id,
        workspace_id: snapshot.workspace_id,
        run_id: snapshot.run_id,
      }),
      evidence_ref: snapshot.evidence_ref || null,
    });
  });

  (Array.isArray(missionControl.artifacts) ? missionControl.artifacts : []).forEach((artifact) => {
    pushTimelineItem(items, {
      item_id: artifact.artifact_id || null,
      kind: 'artifact',
      occurred_at: artifact.observed_at || artifact.created_at || null,
      authority: artifact.authority || 'authoritative',
      freshness: artifact.freshness || 'current',
      summary: artifact.summary || artifact.kind || null,
      linked_ids: buildMissionLinkedIds(missionControl, {
        task_id: artifact.task_id,
        workspace_id: artifact.workspace_id,
        run_id: artifact.run_id,
        artifact_id: artifact.artifact_id,
      }),
      evidence_ref: artifact.evidence_ref || null,
      secondary_session_evidence: Array.isArray(artifact.secondary_session_evidence)
        ? artifact.secondary_session_evidence.map((item) => ({
            source: item.source || null,
            observed_at: item.observed_at || null,
            summary: item.summary || null,
          }))
        : [],
    });
  });

  (Array.isArray(missionControl.runs) ? missionControl.runs : []).forEach((run) => {
    pushTimelineItem(items, {
      item_id: run.run_id || null,
      kind: 'run',
      occurred_at: run.started_at || run.updated_at || run.created_at || null,
      authority: run.authority || 'authoritative',
      freshness: run.freshness || 'current',
      summary: run.summary || run.status || null,
      linked_ids: buildMissionLinkedIds(missionControl, {
        task_id: run.task_id,
        workspace_id: run.workspace_id,
        run_id: run.run_id,
      }),
      evidence_ref: run.evidence_ref || null,
    });
  });

  (Array.isArray(missionControl.pending_deliveries)
    ? missionControl.pending_deliveries
    : []
  ).forEach((delivery) => {
    pushTimelineItem(items, {
      item_id: delivery.delivery_id || null,
      kind: 'delivery',
      occurred_at: delivery.last_attempt_at || delivery.updated_at || delivery.created_at || null,
      authority: delivery.authority || 'authoritative',
      freshness: delivery.freshness || 'current',
      summary: [delivery.status, delivery.recipient_agent_id, delivery.channel]
        .filter(Boolean)
        .join(' · '),
      linked_ids: buildMissionLinkedIds(missionControl),
      evidence_ref: delivery.evidence_ref || null,
    });
  });

  [
    ...(Array.isArray(missionControl.presence?.active) ? missionControl.presence.active : []),
    ...(Array.isArray(missionControl.presence?.stale) ? missionControl.presence.stale : []),
    ...(Array.isArray(missionControl.presence?.offline) ? missionControl.presence.offline : []),
  ].forEach((presence) => {
    pushTimelineItem(items, {
      item_id: presence.presence_id || null,
      kind: 'presence',
      occurred_at: presence.last_seen_at || presence.updated_at || presence.created_at || null,
      authority: presence.authority || 'authoritative',
      freshness: presence.freshness || 'current',
      summary:
        presence.status_summary || presence.effective_state || presence.presence_state || null,
      linked_ids: buildMissionLinkedIds(missionControl, {
        workspace_id: presence.workspace_id,
        run_id: presence.run_id,
      }),
      evidence_ref: presence.evidence_ref || null,
    });
  });

  (Array.isArray(missionControl.recent_messages) ? missionControl.recent_messages : []).forEach(
    (message) => {
      pushTimelineItem(items, {
        item_id: message.message_id || null,
        kind: 'mission_message',
        occurred_at: message.created_at || message.updated_at || null,
        authority: message.authority || 'authoritative',
        freshness: message.freshness || 'current',
        summary: message.body_summary || null,
        linked_ids: buildMissionLinkedIds(missionControl, {
          task_id: message.related_task_id,
          workspace_id: message.related_workspace_id,
          run_id: message.related_run_id,
        }),
        evidence_ref: message.evidence_ref || null,
      });
    }
  );

  return items.sort(compareEvidenceTimelineItems);
}

function getProjectIdFromRequest(request) {
  if (!request?.url) return null;

  try {
    return new URL(request.url).searchParams.get('project_id') || null;
  } catch {
    return null;
  }
}

function createDirectorQueueHandoff(overrides = {}) {
  return {
    ...EMPTY_DIRECTOR_QUEUE_HANDOFF,
    ...overrides,
  };
}

function buildCheckpointGateErrors(queue = []) {
  return (Array.isArray(queue) ? queue : [])
    .map((entry) => entry?.checkpoint_gate)
    .filter((gate) => gate && gate.status === 'blocked')
    .map((gate) => ({
      code: gate.code || 'checkpoint-gate-blocked',
      message: gate.message || 'Checkpoint gate blocked the handoff.',
      source: 'checkpoint_gate',
      remediation: gate.remediation || null,
    }));
}

async function callDevhubTool(toolName, args, { request, fetchImpl = fetch } = {}) {
  if (!request?.url) {
    throw new Error(`No se pudo resolver el origen para ${toolName}.`);
  }

  const url = new URL('/api/mcp/devhub', request.url);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, args }),
  });
  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Falló ${toolName}.`);
  }

  const raw = payload?.raw;
  const textContent = raw?.content?.find?.((entry) => entry?.type === 'text')?.text;
  if (!textContent) {
    throw new Error(`Respuesta inválida de ${toolName}.`);
  }

  return JSON.parse(textContent);
}

function getRouteMissionSnapshot(now, getMissionSnapshot, projectId = null) {
  if (getMissionSnapshot) return getMissionSnapshot();

  const db = getDb();
  const missionId = getActiveMissionId(db, projectId);
  return missionId ? getSwarmMissionDirectorSnapshot(db, missionId, { now }) : null;
}

async function readDirectorQueueEntries({ projectId, request, getExecutionQueue, fetchImpl }) {
  if (!projectId) return null;

  // Try shared durable core first (SQLite local path)
  if (!getExecutionQueue) {
    try {
      const db = getDb();
      const { total, queue } = readExecutionQueueSummary(db, {
        projectId,
        limit: 20,
        includeBlocked: true,
      });
      return presentExecutionQueue({ queue, total }).queue;
    } catch {
      // Fall through to MCP bounce if shared core fails
    }
  }

  const queuePayload = getExecutionQueue
    ? await getExecutionQueue({ projectId, includeBlocked: true })
    : await callDevhubTool(
        'get_execution_queue',
        { project_id: projectId, include_blocked: true },
        { request, fetchImpl }
      );

  if (Array.isArray(queuePayload)) return queuePayload;
  return queuePayload?.queue || [];
}

async function getDirectorQueueSnapshot({ projectId, request, getExecutionQueue, fetchImpl }) {
  const queue = await readDirectorQueueEntries({
    projectId,
    request,
    getExecutionQueue,
    fetchImpl,
  });
  if (!queue) return null;
  return createDirectorQueueContract({ queue });
}

function getEligibleMissionExecutors(missionSnapshot = null) {
  return (Array.isArray(missionSnapshot?.participants) ? missionSnapshot.participants : []).filter(
    (participant) => participant?.status === 'active' && participant?.role_in_mission === 'executor'
  );
}

async function getNextTaskResult({ projectId, agentId, request, getNextTask, fetchImpl }) {
  if (getNextTask) {
    return getNextTask({ projectId, agentId });
  }

  return callDevhubTool(
    'claim_next_task',
    { project_id: projectId, agent_id: agentId },
    { request, fetchImpl }
  );
}

async function getWorkspaceEvidenceResult({
  workspaceId,
  request,
  getWorkspaceEvidence,
  fetchImpl,
}) {
  if (!workspaceId) return null;

  // Try shared durable core first (local path)
  if (!getWorkspaceEvidence) {
    try {
      const db = getDb();
      const summary = readWorkspaceEvidenceSummary(db, { workspaceId });
      return summary ? presentWorkspaceEvidence(summary) : null;
    } catch {
      // Fall through to MCP bounce
    }
  }

  return getWorkspaceEvidence
    ? getWorkspaceEvidence({ workspaceId })
    : callDevhubTool(
        'get_workspace_evidence',
        { workspace_id: workspaceId },
        { request, fetchImpl }
      );
}

function getWorkspaceIdFromClaimResult(claimResult = {}) {
  return (
    claimResult?.task?.supervisor?.workspace_id ||
    claimResult?.task?.workspace_id ||
    claimResult?.workspace_id ||
    null
  );
}

function buildDirectorHandoffFromClaim({
  claimResult,
  recipientAgentId,
  queueEntries,
  workspaceEvidence,
}) {
  if (claimResult?.task) {
    return createDirectorQueueHandoff({
      status: 'claimed',
      recipient_agent_id: recipientAgentId,
      message: claimResult?.message || null,
      task: claimResult.task,
      workspace: workspaceEvidence?.workspace || null,
      run: workspaceEvidence?.latest_run || null,
      artifact: workspaceEvidence?.latest_artifact || null,
      supervisor: claimResult?.task?.supervisor || claimResult?.task?.supervisor_snapshot || null,
    });
  }

  const hasBlockedEntries = Array.isArray(queueEntries)
    ? queueEntries.some((entry) => Boolean(entry?.blocked))
    : false;

  return createDirectorQueueHandoff({
    status: hasBlockedEntries ? 'blocked' : 'empty',
    recipient_agent_id: recipientAgentId,
    message: claimResult?.message || null,
  });
}

function getActiveMissionId(db, projectId = null) {
  const mission = projectId
    ? db
        .prepare(
          "SELECT mission_id FROM swarm_missions WHERE status = 'active' AND project_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1"
        )
        .get(projectId)
    : db
        .prepare(
          "SELECT mission_id FROM swarm_missions WHERE status = 'active' ORDER BY updated_at DESC, rowid DESC LIMIT 1"
        )
        .get();

  return mission?.mission_id || null;
}

export function createLocalMissionMessage({
  db = getDb(),
  recipient_agent_ids = [],
  body_summary,
  now = new Date().toISOString(),
} = {}) {
  const missionId = getActiveMissionId(db);
  if (!missionId) {
    throw new Error('No hay misión activa para guardar un mensaje local.');
  }

  const summary = String(body_summary || '').trim();
  if (!summary) {
    throw new Error('body_summary es requerido para el mensaje local.');
  }

  const participants = listMissionParticipants(db, missionId);
  const eligibleAgentIds = new Set(
    participants
      .filter(
        (participant) =>
          participant.status === 'active' && participant.role_in_mission !== 'director'
      )
      .map((participant) => participant.agent_id)
      .filter(Boolean)
  );
  const normalizedRecipients = [
    ...new Set((recipient_agent_ids || []).map((value) => String(value).trim()).filter(Boolean)),
  ];

  if (normalizedRecipients.length === 0) {
    throw new Error('Elegí al menos un destinatario activo.');
  }

  const invalidRecipients = normalizedRecipients.filter(
    (agentId) => !eligibleAgentIds.has(agentId)
  );
  if (invalidRecipients.length > 0) {
    throw new Error(
      `Destinatarios inválidos para la misión activa: ${invalidRecipients.join(', ')}`
    );
  }

  const mission = getSwarmMissionDirectorSnapshot(db, missionId, { now });
  const message = createMissionMessage(db, {
    mission_id: missionId,
    sender_agent_id: mission?.mission?.owner_agent_id || null,
    message_kind: LOCAL_MISSION_MESSAGE_KIND,
    body_summary: summary,
    related_task_id: mission?.mission?.task_id || null,
    related_workspace_id: mission?.mission?.workspace_id || null,
    related_run_id: mission?.mission?.run_id || null,
    created_at: now,
    updated_at: now,
  });

  normalizedRecipients.forEach((recipientAgentId) => {
    upsertMessageDelivery(db, {
      message_id: message.message_id,
      recipient_agent_id: recipientAgentId,
      channel: LOCAL_MISSION_DELIVERY_CHANNEL,
      status: 'pending',
      last_attempt_at: now,
      updated_at: now,
    });
  });

  return getSwarmMissionDirectorSnapshot(db, missionId, { now });
}

async function getRoutePayload(routeGetter) {
  const response = await routeGetter();
  return response.json();
}

export async function gatherOperationalHealth(dependencies = {}, request = null) {
  const now = dependencies.now || new Date().toISOString();
  const projectId = dependencies.projectId || getProjectIdFromRequest(request);
  const getProcessStatus = dependencies.getProcessStatus || (() => processManager.getStatus());
  const getQueueStatus = dependencies.getQueueStatus || (() => swarmQueue.getStatus());
  const getActiveAgentCount = dependencies.getActiveAgentCount || (() => getDbActiveAgentCount());
  const getExecutionQueue = dependencies.getExecutionQueue || null;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const getMcpStatus =
    dependencies.getMcpStatus ||
    (async () => {
      const route = await import('@/app/api/agenthub/mcp/status/route');
      return getRoutePayload(route.GET);
    });
  const getSessionsHealth =
    dependencies.getSessionsHealth ||
    (async () => {
      const route = await import('@/app/api/agenthub/sessions/health/route');
      return getRoutePayload(route.GET);
    });
  const getTelegramStatus =
    dependencies.getTelegramStatus ||
    (async () => {
      const route = await import('@/app/api/telegram/status/route');
      return getRoutePayload(route.GET);
    });
  const getMissionSnapshot = dependencies.getMissionSnapshot || null;
  const getRuntimeDiagnostics =
    dependencies.getRuntimeDiagnostics ||
    (async () => {
      const route = await import('@/app/api/swarm/runtime-diagnostics/route');
      return getRoutePayload(route.GET);
    });

  const [
    processStatus,
    queueStatus,
    activeAgentCount,
    mcpStatus,
    sessionsHealth,
    telegramStatus,
    runtimeDiagnostics,
  ] = await Promise.all([
    getProcessStatus(),
    getQueueStatus(),
    getActiveAgentCount(),
    getMcpStatus(),
    getSessionsHealth(),
    getTelegramStatus(),
    getRuntimeDiagnostics(),
  ]);
  const [missionSnapshot, directorQueue] = await Promise.all([
    getRouteMissionSnapshot(now, getMissionSnapshot, projectId),
    getDirectorQueueSnapshot({
      projectId,
      request,
      getExecutionQueue,
      fetchImpl,
    }),
  ]);

  const snapshot = buildHealthSnapshot({
    generated_at: now,
    sources: [
      buildProcessHealthSource(processStatus, { now }),
      buildQueueHealthSource(queueStatus, {
        now,
        activeAgentCount,
      }),
      buildSessionStreamHealthSource(sessionsHealth, { now }),
      buildMcpHealthSource(mcpStatus, { now }),
      buildTelegramHealthSource(telegramStatus, { now }),
      buildRuntimeDiagnosticsHealthSource(runtimeDiagnostics, { now }),
    ],
  });

  const controlRoomSnapshotInput = {
    ...(buildControlRoomSnapshotInputFromHealth(snapshot) || {}),
    ...((!getMissionSnapshot || dependencies.enrichMissionSnapshot === true) && missionSnapshot
      ? buildMissionControlRoomSnapshotInput({
          db: getDb(),
          missionControl: missionSnapshot,
          directorQueue,
        })
      : buildMissionControlSnapshotInput(missionSnapshot)),
    ...(() => {
      const supervisorProjection = missionSnapshot
        ? buildSupervisorApprovalProjection(missionSnapshot)
        : null;
      return supervisorProjection ? { supervisor: supervisorProjection } : {};
    })(),
    ...(missionSnapshot
      ? { evidence_timeline: buildMissionEvidenceTimeline(missionSnapshot) }
      : {}),
    ...(directorQueue ? { director_queue: directorQueue } : {}),
    ...(() => {
      const checkpointErrors = buildCheckpointGateErrors(directorQueue?.items || []);
      return checkpointErrors.length > 0 ? { errors: checkpointErrors } : {};
    })(),
  };

  return {
    ...snapshot,
    ...(Object.keys(controlRoomSnapshotInput).length > 0
      ? {
          control_room_snapshot_input: controlRoomSnapshotInput,
        }
      : {}),
  };
}

export async function GET(request, _context, dependencies) {
  try {
    const snapshot = await gatherOperationalHealth(dependencies || {}, request);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[operations/health] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, _context, dependencies = {}) {
  try {
    const payload = await request.json();
    if (payload?.action === 'claim_director_next_task') {
      const now = new Date().toISOString();
      const projectId = payload?.project_id || getProjectIdFromRequest(request);
      const getMissionSnapshot = dependencies.getMissionSnapshot || null;
      const getExecutionQueue = dependencies.getExecutionQueue || null;
      const getNextTask = dependencies.getNextTask || null;
      const getWorkspaceEvidence = dependencies.getWorkspaceEvidence || null;
      const fetchImpl = dependencies.fetchImpl || fetch;

      if (!projectId) {
        return NextResponse.json({ error: 'project_id es requerido.' }, { status: 400 });
      }

      const missionSnapshot = await getRouteMissionSnapshot(now, getMissionSnapshot, projectId);
      const eligibleExecutors = getEligibleMissionExecutors(missionSnapshot);

      if (eligibleExecutors.length !== 1) {
        const queueEntries = await readDirectorQueueEntries({
          projectId,
          request,
          getExecutionQueue,
          fetchImpl,
        });

        return NextResponse.json({
          control_room_snapshot_input: {
            director_queue: createDirectorQueueContract({
              queue: queueEntries,
              handoff: {
                status: 'disabled',
                message:
                  eligibleExecutors.length === 0
                    ? DIRECTOR_HANDOFF_DISABLED_MESSAGES.none
                    : DIRECTOR_HANDOFF_DISABLED_MESSAGES.multiple,
              },
            }),
          },
        });
      }

      const recipientAgentId = eligibleExecutors[0].agent_id || null;
      const claimResult = await getNextTaskResult({
        projectId,
        agentId: recipientAgentId,
        request,
        getNextTask,
        fetchImpl,
      });
      const workspaceEvidence = await getWorkspaceEvidenceResult({
        workspaceId: getWorkspaceIdFromClaimResult(claimResult),
        request,
        getWorkspaceEvidence,
        fetchImpl,
      });
      const queueEntries = await readDirectorQueueEntries({
        projectId,
        request,
        getExecutionQueue,
        fetchImpl,
      });

      return NextResponse.json({
        control_room_snapshot_input: {
          director_queue: createDirectorQueueContract({
            queue: queueEntries,
            handoff: buildDirectorHandoffFromClaim({
              claimResult,
              recipientAgentId,
              queueEntries,
              workspaceEvidence,
            }),
          }),
        },
      });
    }

    if (payload?.action === 'launch_swarm_local') {
      if (!payload?.project_id) {
        return NextResponse.json({ error: 'project_id es requerido.' }, { status: 400 });
      }

      const launchPayload = await launchSwarmLocal({
        projectId: payload.project_id,
        draft: payload.draft || {},
      });

      return NextResponse.json(launchPayload);
    }

    if (payload?.action !== 'create_local_mission_message') {
      return NextResponse.json({ error: 'action inválida.' }, { status: 400 });
    }

    const missionControl = createLocalMissionMessage({
      recipient_agent_ids: payload.recipient_agent_ids,
      body_summary: payload.body_summary,
    });

    return NextResponse.json({
      control_room_snapshot_input: buildMissionControlSnapshotInput(missionControl),
    });
  } catch (error) {
    const status = /misi[oó]n activa|destinatarios|body_summary/i.test(error.message) ? 400 : 500;
    console.error('[operations/health][POST] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status });
  }
}

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
  getSupervisorSnapshot,
  getSwarmMissionDirectorSnapshot,
  insertTrace,
  listMissionParticipants,
  prepareAgentWorkspaceLease,
  registerMissionParticipant,
  resolveAgentRuntimeBinding,
  upsertAgentPresence,
  upsertMessageDelivery,
} from '@/lib/db/localDb.js';
import {
  listPendingDeliveriesForAgent,
  markDeliveryConsumed,
  getAgentPresenceStatus,
  listAgentPresenceForMission,
} from '@/lib/db/swarmMissions.js';
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
import { buildLaunchWrapperForRole, resolveBusHelperPaths } from '@/lib/bus/launchPaths.js';
import {
  buildMaterializedLaunchCommand,
  resolveLaunchWrapperScriptPath,
} from '@/lib/operations/materializeLaunchWrapper.js';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';
import { prepareAgentWorktree } from '@/lib/swarm/agentWorkspaceManager';
import { terminateSwarmLaunch } from '@/lib/swarm/terminateLaunch';
import { withAuth } from '@/lib/swarm/withAuth.js';
import { execSync } from 'child_process';

export const runtime = 'nodejs';

const LOCAL_MISSION_DELIVERY_CHANNEL = 'local_snapshot';
const LOCAL_MISSION_MESSAGE_KIND = 'directive';
const LOCAL_SWARM_RUNTIME_SURFACE = 'swarm-control-launch';
const DIRECTOR_TASK_LEASE_TTL_MS = 120_000;
const SWARM_LAUNCH_TRACE_TYPE = 'swarm_launch';
const SWARM_LAUNCH_TRACE_TOOL_NAME = 'launch_swarm_local';
const NON_ACTIVE_AGENT_SUPERVISOR_STATES = new Set([
  'offline',
  'stale',
  'dispatch_pending',
  'idle',
  'closed',
]);
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

export function buildLaunchPrompt({
  role,
  roleKey,
  mission,
  workspacePath,
  hierarchy = [],
  // T-017.2: launchId is no longer embedded in the verbose chat-list
  // example (dropped in the trim). Kept in the signature for API
  // compatibility with the route.js caller (buildLaunchCommand) and
  // reserved for T-018 (lazy spawn) which will use it as a per-launch
  // trace tag.
  // eslint-disable-next-line no-unused-vars
  launchId = null,
}) {
  const normalizedRoleKey = String(roleKey || '')
    .trim()
    .toLowerCase();
  const isDirector = normalizedRoleKey === 'director';
  const isWorker = normalizedRoleKey !== 'director';
  const workerRoles = hierarchy.filter((entry) => entry && entry.toLowerCase() !== 'director');

  // Instructions específicas para que usen las APIs de DevHub, no Engram MCP
  // T-017.2: trimmed from 9 to 4 lines. Keeps the contract (bus is source
  // of truth, no Engram MCP, no retired endpoints) without verbose examples.
  const devHubInstructions = [
    '',
    '=== Sistema de Comunicación ===',
    '- Fuente de verdad: bus DevHub (team_chat, team_inbox, agent_presence).',
    '- Mensajes salientes: `_devhub_chat`. Mensajes entrantes: `_devhub_inbox_check`.',
    '- NO uses Engram MCP ni /api/agenthub/events — esos paths estan retired.',
    '',
  ];

  // T-017.2: director prompt trimmed from 19 to 7 lines. Original was
  // ~45 lines total; trim target is 25. Required key phrases preserved:
  // team_chat, no Plyrium, agent DevHub.
  const directorSpecific = isDirector
    ? [
        '',
        '=== Director: status y coordinacion ===',
        '- Sos un agente DevHub. NO menciones Plyrium ni frameworks externos.',
        '- Fuente de verdad: team_chat (bus DevHub). /tmp/devhub-swarm-*.log es solo diagnostico del wrapper, NO la fuente.',
        '- Reparte foco con `_devhub_chat --to <role>`, lee respuestas con `_devhub_inbox_check`.',
        '- Workers publican heartbeats; no hagas polling manual.',
        '- Si un worker no responde en 2min, marcalo inactivo y reasigna foco.',
      ]
    : [];

  // T-017.2: worker prompt trimmed from 28 to 9 lines. Original was
  // ~50 lines total; trim target is 25. Required key phrases preserved:
  // _devhub_chat, _devhub_inbox_check, no Plyrium, agent DevHub.
  const workerSpecific = isWorker
    ? [
        '=== Worker: identidad y reporte ===',
        // T-016.2 + T-017.2: anti-hallucination. Worker must self-identify
        // as a DevHub agent and not invent Plyrium / Forge / warp tools.
        '- Sos un agente DevHub. NO menciones Plyrium, Forge, ni "warp". Si una herramienta no esta en tu toolbox, no la inventes.',
        '- Reporta al Director con `_devhub_chat --to director --message "..."` (helper bash, durable en team_chat).',
        '- Lee directivas con `_devhub_inbox_check` (lee de team_inbox).',
        '- NO uses _devhub_tell_director (retired en T-006) ni busques estado en Engram MCP.',
        '- /tmp/devhub-swarm-<role>.log es solo diagnostico del wrapper — para comunicacion durable usa _devhub_chat.',
        '1. Heartbeat al iniciar.',
        '2. Revisa inbox con `_devhub_inbox_check`, ejecuta directivas, reporta evidencia.',
        '3. Al terminar, envia resultado al Director con `_devhub_chat --to director`.',
      ]
    : [];

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
    ...devHubInstructions,
    ...(isDirector ? directorSpecific : []),
    ...(isWorker ? workerSpecific : []),
  ].join('\n');
}

export function buildLaunchCommand(
  programId,
  prompt,
  roleKey = '',
  modelId = null,
  launchId = null,
  workspacePath = ''
) {
  // T-023: default programId to 'opencode' when missing. Otherwise workers
  // fall through to the bash (hermes) default in buildAgentLaunchCommand,
  // which launches a zsh session, not OpenCode. The bootstrap prompt is
  // then pasted into zsh, which tries to execute prompt text as commands
  // (`1.`, `2.`, `3.` lines fail with "command not found"), zsh exits,
  // and the terminal stays empty. Symptom: 4 workers with bash prompts,
  // 1 director with the OpenCode TUI.
  const effectiveProgramId = programId || 'opencode';

  const agentProfile = roleKey ? buildRoleAgentProfile(roleKey) : 'sdd-orchestrator';
  const tmuxSessionName = launchId && roleKey ? `devhub-swarm-${launchId}-${roleKey}` : null;
  const directorTmuxSession = launchId ? `devhub-swarm-${launchId}-director` : null;
  const isWorker = roleKey && roleKey.toLowerCase() !== 'director';

  console.log(`[SWARM_LAUNCH_CMD] Building command for role: ${roleKey}`);
  console.log(`[SWARM_LAUNCH_CMD] Agent profile: ${agentProfile}`);
  console.log(`[SWARM_LAUNCH_CMD] TMUX session: ${tmuxSessionName}`);
  console.log(`[SWARM_LAUNCH_CMD] Model: ${modelId}`);
  console.log(`[SWARM_LAUNCH_CMD] Program: ${effectiveProgramId}`);
  console.log(`[SWARM_LAUNCH_CMD] Prompt length: ${prompt?.length || 0} chars`);

  const innerCommand = buildAgentLaunchCommand(effectiveProgramId, prompt, {
    opencodeAgent: agentProfile,
    modelId,
    tmuxSessionName,
    // `opencode --prompt` is non-interactive in current CLI builds. Start the
    // TUI first and inject the mission prompt into the already-running panel.
    interactiveBootstrapPrompt: effectiveProgramId === 'opencode',
  });

  console.log(`[SWARM_LAUNCH_CMD] Inner command: ${innerCommand}`);

  const supervisorUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/agenthub`
    : 'http://localhost:3100';

  // T-011 — bus helpers MUST be wired in the production launch path.
  // Without these, buildBusHelpersBlock emits the
  // "# Bus helpers skipped (missing busBinaryPath or dbPath)" placeholder
  // and the T-006 _devhub_tell_director shim (which calls _devhub_chat)
  // fails at runtime in every launched agent. The repo root for path
  // resolution is process.cwd() (Next.js server runs from the project
  // root); the worktree path is the agent's isolated workspace, not the
  // bus-binary host.
  const busPaths = resolveBusHelperPaths({
    repoRoot: process.cwd(),
    env: process.env,
  });

  const wrapper = buildLaunchWrapperForRole({
    agentId: `${launchId}-${roleKey}`,
    missionId: launchId,
    role: roleKey,
    workspacePath,
    tmuxSessionName,
    directorTmuxSession: isWorker ? directorTmuxSession : null,
    bootstrapPrompt: effectiveProgramId === 'opencode' ? prompt : '',
    innerCommand,
    supervisorUrl,
    busBinaryPath: busPaths.busBinaryPath,
    dbPath: busPaths.dbPath,
    // T-016.3: swarm agents are NOT the user's personal Zed session.
    // Opt out of the minimax MCP env var injection. The minimax MCP
    // routes the user's local Zed through their minimax subscription;
    // swarm agents in worktrees should run on the default anthropic
    // provider instead.
    disableMinimaxMcp: true,
  });

  console.log(`[SWARM_LAUNCH_CMD] Wrapper length: ${wrapper.length} chars`);
  console.log(`[SWARM_LAUNCH_CMD] Has bootstrap prompt: ${wrapper.includes('DEVHUB_BOOTSTRAP')}`);
  console.log(
    `[SWARM_LAUNCH_CMD] Has DEVHUB_TMUX_SESSION export: ${wrapper.includes('DEVHUB_TMUX_SESSION')}`
  );

  // The PTY receives initialCommand as a single pasted line over WebSocket input.
  // Pasting a multi-line bash wrapper (heredocs, functions) does not execute it;
  // materialize to disk and expose only a one-line launcher to the terminal.
  const wrapperScriptPath = resolveLaunchWrapperScriptPath(launchId, roleKey);
  const command = buildMaterializedLaunchCommand(wrapper, launchId, roleKey);

  console.log(`[SWARM_LAUNCH_CMD] Materialized wrapper: ${wrapperScriptPath}`);
  console.log(`[SWARM_LAUNCH_CMD] Runtime command: ${command}`);

  return { command, wrapper, wrapperScriptPath };
}

function summarizeLaunchPrompt(prompt = '', maxLength = 240) {
  const normalized = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function redactLaunchCommand(command = '') {
  return String(command || '')
    .replace(/^.*DEVHUB_AGENT_TOKEN=.*(?:\r?\n)?/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

function parseLeaseTimeMs(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function hasExpiredLease(value, nowMs = Date.now()) {
  const expiresAt = parseLeaseTimeMs(value);
  return expiresAt === null || expiresAt <= nowMs;
}

function isActiveTaskLease(task, nowMs = Date.now()) {
  return Boolean(
    task?.status === 'in_progress' &&
    task?.assigned_to &&
    task?.claim_token &&
    !hasExpiredLease(task?.lease_expires_at, nowMs)
  );
}

function getNewestActiveTaskForAgent(db, projectId, agentId, nowMs = Date.now()) {
  return (
    db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND assigned_to = ? AND status = 'in_progress'"
      )
      .all(projectId, agentId)
      .filter((task) => isActiveTaskLease(task, nowMs))
      .sort((left, right) => {
        const leftMs = parseLeaseTimeMs(left?.claimed_at) || 0;
        const rightMs = parseLeaseTimeMs(right?.claimed_at) || 0;
        return rightMs - leftMs;
      })[0] || null
  );
}

function syncAgentRegistryTaskState(
  db,
  { agentId, currentTaskId = null, status = 'idle', timestamp }
) {
  if (!agentId) return;

  db.prepare(
    `UPDATE agent_registry
     SET current_task_id = ?, status = ?, last_heartbeat = ?, updated_at = ?
     WHERE agent_id = ?`
  ).run(currentTaskId, status, timestamp, timestamp, agentId);
}

function cleanupExpiredTaskLeases(db, { projectId, nowMs = Date.now(), timestamp }) {
  const staleTasks = db
    .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = 'in_progress'")
    .all(projectId)
    .filter((task) => !isActiveTaskLease(task, nowMs));

  if (staleTasks.length === 0) return [];

  const impactedAgents = new Set();
  for (const staleTask of staleTasks) {
    if (staleTask.assigned_to) impactedAgents.add(staleTask.assigned_to);

    db.prepare(
      `UPDATE tasks
       SET status = 'pending', assigned_to = NULL, claimed_at = NULL,
           lease_expires_at = NULL, claim_token = NULL, completed_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'in_progress'`
    ).run(timestamp, staleTask.id);
  }

  for (const agentId of impactedAgents) {
    const activeTask = getNewestActiveTaskForAgent(db, projectId, agentId, nowMs);
    syncAgentRegistryTaskState(db, {
      agentId,
      currentTaskId: activeTask?.id || null,
      status: activeTask ? 'working' : 'idle',
      timestamp,
    });
  }

  return staleTasks;
}

function buildClaimResponseMessage({ reused = false, blocked = false } = {}) {
  if (reused) return 'El agente ya tiene una tarea activa.';
  if (blocked) return 'Todas las tareas pendientes están bloqueadas.';
  return 'Tarea reclamada.';
}

function hydrateClaimedTask(db, { projectId, agentId, task }) {
  if (!task) return null;

  const persistedTask = db.prepare('SELECT * FROM tasks WHERE id = ? LIMIT 1').get(task.id) || task;
  const supervisor = getSupervisorSnapshot(db, persistedTask.id) || task.supervisor || null;
  const runtimeBinding = resolveAgentRuntimeBinding(db, {
    project_id: projectId,
    agent_id: agentId,
    preferred_task_id: persistedTask.id,
  });

  return {
    ...task,
    ...persistedTask,
    supervisor,
    workspace_id: runtimeBinding?.workspace_id || task.workspace_id || null,
    run_id: runtimeBinding?.run_id || task.run_id || null,
    session_id: runtimeBinding?.run_id_or_session_id || task.session_id || null,
    runtime_binding: runtimeBinding || null,
  };
}

async function claimNextTaskLocally({ projectId, agentId }) {
  return withDbWriteQueue(
    (writeDb) => {
      const nowMs = Date.now();
      const timestamp = new Date(nowMs).toISOString();

      cleanupExpiredTaskLeases(writeDb, { projectId, nowMs, timestamp });

      const activeTask = getNewestActiveTaskForAgent(writeDb, projectId, agentId, nowMs);
      if (activeTask) {
        syncAgentRegistryTaskState(writeDb, {
          agentId,
          currentTaskId: activeTask.id,
          status: 'working',
          timestamp,
        });

        return {
          claimed: true,
          reused: true,
          task: hydrateClaimedTask(writeDb, { projectId, agentId, task: activeTask }),
          message: buildClaimResponseMessage({ reused: true }),
        };
      }

      const { queue } = readExecutionQueueSummary(writeDb, {
        projectId,
        limit: 20,
        includeBlocked: true,
        nowMs,
      });
      const candidates = queue.filter((entry) => !entry.blocked && entry.status === 'pending');

      for (const candidate of candidates) {
        const claimToken = crypto.randomUUID();
        const updateResult = writeDb
          .prepare(
            `UPDATE tasks
             SET status = 'in_progress', assigned_to = ?, claimed_at = ?,
                 lease_expires_at = ?, claim_token = ?, updated_at = ?
             WHERE id = ? AND status = 'pending'`
          )
          .run(
            agentId,
            timestamp,
            new Date(nowMs + DIRECTOR_TASK_LEASE_TTL_MS).toISOString(),
            claimToken,
            timestamp,
            candidate.id
          );

        if (updateResult.changes !== 1) continue;

        syncAgentRegistryTaskState(writeDb, {
          agentId,
          currentTaskId: candidate.id,
          status: 'working',
          timestamp,
        });

        return {
          claimed: true,
          reused: false,
          task: hydrateClaimedTask(writeDb, {
            projectId,
            agentId,
            task: {
              ...candidate,
              status: 'in_progress',
              assigned_to: agentId,
              claimed_at: timestamp,
              lease_expires_at: new Date(nowMs + DIRECTOR_TASK_LEASE_TTL_MS).toISOString(),
              claim_token: claimToken,
              updated_at: timestamp,
            },
          }),
          message: buildClaimResponseMessage({ reused: false }),
        };
      }

      syncAgentRegistryTaskState(writeDb, {
        agentId,
        currentTaskId: null,
        status: 'idle',
        timestamp,
      });

      return {
        claimed: false,
        reused: false,
        task: null,
        message:
          queue.length > 0 ? buildClaimResponseMessage({ blocked: true }) : 'Sin tareas pendientes',
      };
    },
    { label: 'director-claim-next-task', timeout: 10000 }
  );
}

function buildLaunchTracePayload({
  launchId,
  missionId,
  project,
  missionTitle,
  missionSummary,
  workspaceRoot,
  launchStrategy = 'director_first',
  bootstrapMode = 'engram_first',
  directorAgentId,
  directorSessionId,
  requestedAt,
  committedAt,
  runtimeRequests = [],
  failedRoles = [],
  phaseEvents = [],
  memorySnapshots = [],
}) {
  const requestedMs = Date.parse(requestedAt || '') || Date.now();
  const committedMs = Date.parse(committedAt || '') || requestedMs;
  const durationMs = Math.max(0, committedMs - requestedMs);

  return {
    traceId: `trace-${launchId}`,
    traceType: SWARM_LAUNCH_TRACE_TYPE,
    toolName: SWARM_LAUNCH_TRACE_TOOL_NAME,
    traceSessionId: directorSessionId,
    directorSessionId,
    directorAgentId,
    launchId,
    missionId,
    projectId: project?.id || null,
    projectName: project?.name || null,
    launchLabel: missionTitle,
    missionSummary: summarizeLaunchPrompt(missionSummary, 320),
    workspaceRoot: workspaceRoot || null,
    launchStrategy,
    bootstrapMode,
    requestedAt,
    committedAt,
    durationMs,
    runtimeRequestCount: runtimeRequests.length,
    failedRoleCount: failedRoles.length,
    phaseCount: phaseEvents.length,
    memorySnapshotCount: memorySnapshots.length,
    phaseEvents,
    memorySnapshots,
    runtimeRequests: runtimeRequests.map((request) => ({
      roleKey: request.roleKey,
      roleLabel: request.roleLabel,
      launchPhase: request.launchPhase || 'fanout',
      startAfterMs: Number.isFinite(request.startAfterMs) ? request.startAfterMs : 0,
      selectedAgent: request.selectedAgent,
      modelId: request.modelId || null,
      taskId: request.taskId,
      taskTitle: request.taskTitle || null,
      workspaceId: request.workspaceId || null,
      workspacePath: request.workspacePath || null,
      runId: request.runId || null,
      sessionId: request.sessionId || null,
      branchName: request.branchName || null,
      observedHead: request.observedHead || null,
      evidenceRef: request.evidenceRef || null,
      tmuxSessionName: request.tmuxSessionName || null,
      promptSummary: request.promptSummary || null,
      promptReference: request.promptReference || null,
      commandPreview: request.commandPreview || null,
    })),
    failedRoles: failedRoles.map((role) => ({
      roleKey: role.roleKey || null,
      roleLabel: role.roleLabel || null,
      error: role.error || null,
    })),
  };
}

function persistLaunchTrace(db, launchTrace) {
  if (!launchTrace?.traceSessionId) return;

  insertTrace(db, {
    id: launchTrace.traceId,
    session_id: launchTrace.traceSessionId,
    trace_type: launchTrace.traceType,
    agent_name: launchTrace.directorAgentId,
    tool_name: launchTrace.toolName,
    tool_status: 'success',
    content: `Swarm launch ${launchTrace.launchId} persisted with ${launchTrace.runtimeRequestCount} runtime request(s).`,
    duration_ms: launchTrace.durationMs,
    time_start: Date.parse(launchTrace.requestedAt || '') || null,
    time_end: Date.parse(launchTrace.committedAt || '') || null,
    metadata: launchTrace,
  });

  console.info(
    '[SWARM_LAUNCH_TRACE]',
    JSON.stringify({
      launchId: launchTrace.launchId,
      missionId: launchTrace.missionId,
      projectId: launchTrace.projectId,
      requestedAt: launchTrace.requestedAt,
      committedAt: launchTrace.committedAt,
      durationMs: launchTrace.durationMs,
      directorSessionId: launchTrace.traceSessionId,
      launchStrategy: launchTrace.launchStrategy,
      bootstrapMode: launchTrace.bootstrapMode,
      runtimeRequestCount: launchTrace.runtimeRequestCount,
      failedRoleCount: launchTrace.failedRoleCount,
      phaseCount: launchTrace.phaseCount,
      memorySnapshotCount: launchTrace.memorySnapshotCount,
      phases: launchTrace.phaseEvents.map((event) => ({
        phase: event.phase,
        at: event.at,
      })),
      roles: launchTrace.runtimeRequests.map((request) => ({
        roleKey: request.roleKey,
        launchPhase: request.launchPhase,
        startAfterMs: request.startAfterMs,
        selectedAgent: request.selectedAgent,
        modelId: request.modelId,
        sessionId: request.sessionId,
        workspaceId: request.workspaceId,
        runId: request.runId,
      })),
    })
  );
}

function captureLaunchMemorySnapshot({ phase, launchId, missionId = null, now = null } = {}) {
  const usage = typeof process.memoryUsage === 'function' ? process.memoryUsage() : {};
  return {
    timestamp: now || new Date().toISOString(),
    pid: typeof process.pid === 'number' ? process.pid : null,
    phase: phase || 'unknown',
    launchId: launchId || null,
    missionId: missionId || null,
    rss: usage?.rss ?? null,
    heapUsed: usage?.heapUsed ?? null,
    heapTotal: usage?.heapTotal ?? null,
    external: usage?.external ?? null,
    arrayBuffers: usage?.arrayBuffers ?? null,
  };
}

function buildLaunchPhaseEvent({
  phase,
  launchId,
  missionId = null,
  status = 'ok',
  detail = null,
} = {}) {
  return {
    phase,
    launchId: launchId || null,
    missionId: missionId || null,
    status,
    at: new Date().toISOString(),
    detail,
  };
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
  const isLaunchSeedPresence = presence?.runtime_surface === LOCAL_SWARM_RUNTIME_SURFACE;

  // 1. FIRST: check supervisor/running state — takes precedence over TTL checks
  if (latestSupervisorSnapshot?.supervisor_state === 'running') return 'running';
  if (latestSupervisorSnapshot?.supervisor_state === 'active') return 'active';
  if (run?.status === 'running') return 'lease_active';

  // 2. THEN: check presence TTL and stale/offline status as secondary indicator
  if (presence) {
    const expiresAt = presence.expires_at ? new Date(presence.expires_at).getTime() : null;
    const lastSeen = presence.last_seen_at ? new Date(presence.last_seen_at).getTime() : null;

    // Hard expiration: if expires_at is set and passed, agent is stale
    if (expiresAt && !Number.isNaN(expiresAt) && expiresAt < currentTime) {
      return 'stale';
    }

    // Soft expiration: if no expires_at but last_seen is older than 5 minutes, stale
    const STALENESS_THRESHOLD_MS = 5 * 60 * 1000;
    if (
      !expiresAt &&
      lastSeen &&
      !Number.isNaN(lastSeen) &&
      currentTime - lastSeen > STALENESS_THRESHOLD_MS
    ) {
      return 'stale';
    }

    if (presence.effective_state === 'stale') return 'stale';
    if (presence.effective_state === 'offline') return 'offline';
    if (isLaunchSeedPresence) {
      return latestSupervisorSnapshot?.supervisor_state || 'dispatch_pending';
    }
  } else {
    if (workspace?.status === 'provisioning' || run?.status === 'planned') {
      return 'dispatch_pending';
    }

    // If there is NO presence record at all, but the workspace is marked active/ready or run is running,
    // the agent is actually offline/dead.
    if (
      workspace?.status === 'active' ||
      workspace?.status === 'ready' ||
      run?.status === 'running'
    ) {
      return 'offline';
    }
  }

  // 3. Fallback to other workspace/run states
  if (workspace?.status === 'active' || workspace?.status === 'ready') return 'lease_active';
  if (run?.status === 'planned' || workspace?.status === 'provisioning') return 'dispatch_pending';
  if (participant?.status === 'active' && (workspace || run)) return 'dispatch_pending';
  return 'idle';
}

function getPresenceRecencyValue(row = null) {
  const timestamp = row?.updated_at || row?.last_seen_at || row?.expires_at || null;
  if (!timestamp) return 0;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function choosePreferredPresence(current, candidate) {
  if (!candidate?.agent_id) return current || null;
  if (!current) return candidate;

  const currentIsLaunchSeed = current.runtime_surface === LOCAL_SWARM_RUNTIME_SURFACE;
  const candidateIsLaunchSeed = candidate.runtime_surface === LOCAL_SWARM_RUNTIME_SURFACE;

  if (currentIsLaunchSeed !== candidateIsLaunchSeed) {
    return currentIsLaunchSeed ? candidate : current;
  }

  return getPresenceRecencyValue(candidate) >= getPresenceRecencyValue(current)
    ? candidate
    : current;
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
  const presenceByAgentId = presenceRows
    .filter((row) => row?.agent_id)
    .reduce((map, row) => {
      const current = map.get(row.agent_id) || null;
      map.set(row.agent_id, choosePreferredPresence(current, row));
      return map;
    }, new Map());
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
    (agent) => !NON_ACTIVE_AGENT_SUPERVISOR_STATES.has(agent.supervisor_state)
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
      (agentRows.some((agent) => agent.supervisor_state === 'lease_active')
        ? 'lease_active'
        : agentRows.some((agent) => agent.supervisor_state === 'dispatch_pending')
          ? 'dispatch_pending'
          : 'idle'),
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
  { workspaceId, sessionId, branchName, workspacePath, observedHead, now, status = 'ready' }
) {
  db.prepare(
    `UPDATE agent_workspaces
     SET run_id_or_session_id = ?,
         status = ?,
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
    status,
    branchName,
    workspacePath.includes('.devhub/worktrees')
      ? workspacePath
      : `${workspacePath}/.worktrees/${branchName}`,
    branchName,
    observedHead,
    now,
    now,
    now,
    workspaceId
  );

  return db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(workspaceId);
}

function configureLaunchRole({
  writeDb,
  projectId,
  launchId,
  missionId,
  missionTitle,
  roleEntry,
  resolvedDraft,
  preview,
  parentSessionId = null,
  now,
  launchPhase = 'fanout',
  startAfterMs = 0,
  precomputedWorktree = null,
}) {
  const roleKey = roleEntry.role_key;
  const agentId = `${launchId}-${roleKey}`;
  const taskId = `${launchId}:${roleKey}`;
  const sessionId = `${launchId}-${roleKey}-session`;

  console.log(`[SWARM_LAUNCH] Setting up role: ${roleEntry.role} (${roleKey})`);

  // T1.1: skip the (slow, 3× spawnSync) inner prepare when the caller
  // has already pre-computed the worktree for this role in parallel.
  // The precompute happens in launchSwarmLocal before the write queue
  // opens, so no concurrency hazard.
  let worktreeResult;
  if (precomputedWorktree) {
    worktreeResult = precomputedWorktree;
  } else {
    try {
      worktreeResult = prepareAgentWorktree({
        repoRoot: resolvedDraft.workspacePath,
        launchId,
        roleKey,
        baseRef: 'HEAD',
      });
    } catch (err) {
      console.error(`[SWARM_LAUNCH] FAILED to prepare worktree for ${roleKey}: ${err.message}`);
      return {
        failure: {
          roleKey,
          roleLabel: roleEntry.role,
          error: err?.message || 'No se pudo preparar worktree.',
        },
      };
    }
  }

  const { worktreePath, branchName, observedHead } = worktreeResult;

  const prompt = buildLaunchPrompt({
    role: roleEntry.role,
    roleKey,
    mission: resolvedDraft.mission,
    workspacePath: worktreePath,
    hierarchy: preview.topology?.roles || [],
    launchId,
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
    mission_id: missionId,
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
    opencode_session_id: null,
    now,
  });

  const workspace = activatePreparedWorkspace(writeDb, {
    workspaceId: workspaceLease.workspace.id,
    sessionId: session.id,
    branchName,
    workspacePath: worktreePath,
    observedHead,
    status: 'provisioning',
    now,
  });

  const run = createAgentRun(writeDb, {
    workspace_id: workspace.id,
    task_id: taskId,
    agent_id: agentId,
    requested_base_ref: workspace.base_commit,
    baseline_commit: workspace.base_commit,
    status: 'planned',
    observed_start: {
      branch: branchName,
      head: observedHead,
      dirty: 'clean',
      path: worktreePath,
    },
    started_at: now,
  });

  upsertAgentPresence(writeDb, {
    mission_id: missionId,
    agent_id: agentId,
    workspace_id: workspace.id,
    run_id: run.run_id,
    runtime_surface: LOCAL_SWARM_RUNTIME_SURFACE,
    presence_state: 'waiting',
    status_summary: `${roleEntry.role} esperando primer heartbeat`,
    evidence_ref: `evidence://launch/${launchId}/${roleKey}`,
    last_seen_at: now,
    updated_at: now,
  });

  console.log(
    `[SWARM_LAUNCH] Role ${roleEntry.role} configured. Workspace: ${workspace.id}, Run: ${run.run_id}`
  );

  const roleModel = resolvedDraft.roleModels?.[roleKey] || null;
  const evidenceRef = `evidence://launch/${launchId}/${roleKey}`;
  const launchCommand = buildLaunchCommand(
    roleEntry.program_id,
    prompt,
    roleKey,
    roleModel,
    launchId,
    worktreePath
  );

  return {
    session,
    runtimeRequest: {
      taskId,
      selectedAgent: roleEntry.program_id,
      command: launchCommand.command,
      commandPreview: redactLaunchCommand(launchCommand.wrapper),
      wrapperScriptPath: launchCommand.wrapperScriptPath,
      launchOrigin: 'swarm-control-launch',
      launchPhase,
      startAfterMs,
      roleKey,
      roleLabel: roleEntry.role,
      roleAbbrev: roleEntry.role_abbrev || null,
      promptSummary: `${roleEntry.role} · ${preview.template?.label || missionTitle}`,
      taskTitle: `${missionTitle} · ${roleEntry.role}`,
      modelId: roleModel,
      tmuxSessionName: `devhub-swarm-${launchId}-${roleKey}`,
      launchId,
      isSwarmRole: true,
      missionId,
      workspacePath: worktreePath,
      workspaceId: workspace.id,
      runId: run.run_id,
      sessionId: session.id,
      branchName,
      observedHead,
      evidenceRef,
      promptReference: `${evidenceRef}/prompt`,
    },
  };
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
  const activeMissions = readDb
    .prepare('SELECT count(*) as count FROM swarm_missions WHERE project_id = ? AND status = ?')
    .get(projectId, 'active');

  if (activeMissions.count > 0) {
    console.error(
      `[SWARM_LAUNCH] ERROR: Project ${projectId} already has ${activeMissions.count} active swarm(s)`
    );
    throw new Error(
      `Ya existe un swarm activo para este proyecto. Esperá a que termine o cancelalo antes de lanzar otro.`
    );
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
  const launchRequestedAt = now;

  console.log(`[SWARM_LAUNCH] Creating mission ${launchId}: ${missionTitle}`);
  console.log(
    `[SWARM_LAUNCH] Roles: ${preview.rolePrograms?.map((r) => r.role).join(', ') || 'none'}`
  );

  // T1.1: pre-compute all role worktrees in parallel BEFORE the write
  // queue opens. The WIP code path called prepareAgentWorktree serially
  // inside each configureLaunchRole call (5 × 1.3s ≈ 6.5s of git work).
  // Fanning out under a single Promise.all caps the wall-clock at the
  // slowest role (~1.3s). The precomputed map is then injected back into
  // each configureLaunchRole call so it can skip its inner prepare.
  // The repoRoot comes from the resolved draft; we fall back to cwd to
  // preserve the prior semantics when the draft didn't set a workspace.
  const roleEntriesForPrecompute = Array.isArray(preview.rolePrograms) ? preview.rolePrograms : [];
  const repoRootForPrecompute = resolvedDraft.workspacePath ?? process.cwd();
  const precomputedWorktrees = new Map(
    await Promise.all(
      roleEntriesForPrecompute.map(async (entry) => {
        if (!entry || !entry.role_key) return null;
        const result = await Promise.resolve().then(() =>
          prepareAgentWorktree({
            repoRoot: repoRootForPrecompute,
            launchId,
            roleKey: entry.role_key,
            baseRef: 'HEAD',
          })
        );
        return [entry.role_key, result];
      })
    ).then((entries) => entries.filter(Boolean))
  );

  // Writes: use write queue to serialize all critical DB mutations
  const result = await withDbWriteQueue(
    (writeDb) => {
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

      const launchStrategy = resolvedDraft.launchStrategy || 'director_first';
      const bootstrapMode = resolvedDraft.bootstrapMode || 'engram_first';
      const phaseEvents = [];
      const memorySnapshots = [];
      let parentSessionId = null;
      const runtimeRequests = [];
      const failedRoles = [];
      const roleEntries = Array.isArray(preview.rolePrograms) ? preview.rolePrograms : [];
      const directorRoleEntry = roleEntries.find((entry) => entry?.role_key === 'director') || null;
      const workerRoleEntries = roleEntries.filter((entry) => entry?.role_key !== 'director');

      if (directorRoleEntry) {
        phaseEvents.push(
          buildLaunchPhaseEvent({
            phase: 'bootstrap_start',
            launchId,
            missionId: mission.mission_id,
            detail: {
              launchStrategy,
              bootstrapMode,
              roleKey: directorRoleEntry.role_key,
            },
          })
        );
        memorySnapshots.push(
          captureLaunchMemorySnapshot({
            phase: 'bootstrap_start',
            launchId,
            missionId: mission.mission_id,
          })
        );

        const directorSetup = configureLaunchRole({
          writeDb,
          projectId,
          launchId,
          missionId: mission.mission_id,
          missionTitle,
          roleEntry: directorRoleEntry,
          resolvedDraft,
          preview,
          parentSessionId: null,
          now,
          launchPhase: 'bootstrap',
          startAfterMs: 0,
          precomputedWorktree: precomputedWorktrees.get(directorRoleEntry.role_key) ?? null,
        });

        if (directorSetup?.failure) {
          failedRoles.push(directorSetup.failure);
        } else if (directorSetup?.runtimeRequest) {
          parentSessionId = directorSetup.session?.id || parentSessionId;
          runtimeRequests.push(directorSetup.runtimeRequest);
        }

        const bootstrapPhaseName =
          bootstrapMode === 'skip_bootstrap' ? 'bootstrap_skipped' : 'bootstrap_complete';
        phaseEvents.push(
          buildLaunchPhaseEvent({
            phase: bootstrapPhaseName,
            launchId,
            missionId: mission.mission_id,
            detail: {
              bootstrapMode,
              directorReady: Boolean(parentSessionId),
            },
          })
        );
        memorySnapshots.push(
          captureLaunchMemorySnapshot({
            phase: bootstrapPhaseName,
            launchId,
            missionId: mission.mission_id,
          })
        );
      }

      phaseEvents.push(
        buildLaunchPhaseEvent({
          phase: 'fanout_start',
          launchId,
          missionId: mission.mission_id,
          detail: {
            workerCount: workerRoleEntries.length,
            startAfterMs: 0,
          },
        })
      );
      memorySnapshots.push(
        captureLaunchMemorySnapshot({
          phase: 'fanout_start',
          launchId,
          missionId: mission.mission_id,
        })
      );

      for (const roleEntry of workerRoleEntries) {
        const workerSetup = configureLaunchRole({
          writeDb,
          projectId,
          launchId,
          missionId: mission.mission_id,
          missionTitle,
          roleEntry,
          resolvedDraft,
          preview,
          parentSessionId,
          now,
          launchPhase: 'fanout',
          startAfterMs: 0,
          precomputedWorktree: precomputedWorktrees.get(roleEntry.role_key) ?? null,
        });

        if (workerSetup?.failure) {
          failedRoles.push(workerSetup.failure);
          continue;
        }

        if (workerSetup?.runtimeRequest) {
          runtimeRequests.push(workerSetup.runtimeRequest);
        }
      }

      phaseEvents.push(
        buildLaunchPhaseEvent({
          phase: 'fanout_complete',
          launchId,
          missionId: mission.mission_id,
          detail: {
            runtimeRequestCount: runtimeRequests.length,
            failedRoleCount: failedRoles.length,
          },
        })
      );
      memorySnapshots.push(
        captureLaunchMemorySnapshot({
          phase: 'fanout_complete',
          launchId,
          missionId: mission.mission_id,
        })
      );

      console.log(
        `[SWARM_LAUNCH] All ${runtimeRequests.length} roles configured. Creating kickoff message...`
      );

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

      for (const request of runtimeRequests) {
        if (request.roleKey === 'director') continue;

        upsertMessageDelivery(writeDb, {
          message_id: kickoffMessage.message_id,
          recipient_agent_id: `${launchId}-${request.roleKey}`,
          channel: LOCAL_MISSION_DELIVERY_CHANNEL,
          status: 'pending',
          last_attempt_at: now,
          updated_at: now,
        });
      }

      const missionSnapshot = getSwarmMissionDirectorSnapshot(writeDb, mission.mission_id, { now });
      const launchCommittedAt = new Date().toISOString();
      const launchTrace = buildLaunchTracePayload({
        launchId,
        missionId: mission.mission_id,
        project,
        missionTitle,
        missionSummary: resolvedDraft.mission,
        workspaceRoot: resolvedDraft.workspacePath,
        launchStrategy,
        bootstrapMode,
        directorAgentId,
        directorSessionId: parentSessionId,
        requestedAt: launchRequestedAt,
        committedAt: launchCommittedAt,
        runtimeRequests,
        failedRoles,
        phaseEvents,
        memorySnapshots,
      });

      persistLaunchTrace(writeDb, launchTrace);

      console.log(
        `[SWARM_LAUNCH] SUCCESS: Swarm ${launchId} launched with ${runtimeRequests.length} agents`
      );
      console.log(`[SWARM_LAUNCH] Mission ID: ${mission.mission_id}`);
      console.log(
        `[SWARM_LAUNCH] Runtime requests: ${runtimeRequests.map((r) => `${r.roleLabel}(${r.taskId})`).join(', ')}`
      );

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
          launch_trace: {
            traceId: launchTrace.traceId,
            traceType: launchTrace.traceType,
            traceSessionId: launchTrace.traceSessionId,
            requestedAt: launchTrace.requestedAt,
            committedAt: launchTrace.committedAt,
            durationMs: launchTrace.durationMs,
            directorAgentId: launchTrace.directorAgentId,
            launchStrategy: launchTrace.launchStrategy,
            bootstrapMode: launchTrace.bootstrapMode,
            runtimeRequestCount: launchTrace.runtimeRequestCount,
            failedRoleCount: launchTrace.failedRoleCount,
            phaseCount: launchTrace.phaseCount,
            memorySnapshotCount: launchTrace.memorySnapshotCount,
          },
        },
      };
    },
    { label: 'swarm-launch', timeout: 30000 }
  );

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

function getRouteMissionSnapshot(now, getMissionSnapshot, projectId = null) {
  if (getMissionSnapshot) return getMissionSnapshot();

  const db = getDb();
  const missionId = getActiveMissionId(db, projectId);
  return missionId ? getSwarmMissionDirectorSnapshot(db, missionId, { now }) : null;
}

async function readDirectorQueueEntries({ projectId, getExecutionQueue }) {
  if (!projectId) return null;

  if (getExecutionQueue) {
    const queuePayload = await getExecutionQueue({ projectId, includeBlocked: true });
    if (Array.isArray(queuePayload)) return queuePayload;
    return queuePayload?.queue || [];
  }

  try {
    const db = getDb();
    const { total, queue } = readExecutionQueueSummary(db, {
      projectId,
      limit: 20,
      includeBlocked: true,
    });
    return presentExecutionQueue({ queue, total }).queue;
  } catch (error) {
    throw new Error(
      `No se pudo leer la cola durable local para director handoff: ${error?.message || 'sin detalle.'}`
    );
  }
}

async function getDirectorQueueSnapshot({ projectId, getExecutionQueue }) {
  const queue = await readDirectorQueueEntries({
    projectId,
    getExecutionQueue,
  });
  if (!queue) return null;
  return createDirectorQueueContract({ queue });
}

function getEligibleMissionExecutors(missionSnapshot = null) {
  return (Array.isArray(missionSnapshot?.participants) ? missionSnapshot.participants : []).filter(
    (participant) => participant?.status === 'active' && participant?.role_in_mission === 'executor'
  );
}

async function getNextTaskResult({ projectId, agentId, getNextTask }) {
  if (getNextTask) {
    return getNextTask({ projectId, agentId });
  }

  try {
    return claimNextTaskLocally({ projectId, agentId });
  } catch (error) {
    throw new Error(
      `No se pudo reclamar la siguiente tarea desde durable local: ${error?.message || 'sin detalle.'}`
    );
  }
}

async function getWorkspaceEvidenceResult({ workspaceId, getWorkspaceEvidence }) {
  if (!workspaceId) return null;

  if (getWorkspaceEvidence) {
    return getWorkspaceEvidence({ workspaceId });
  }

  try {
    const db = getDb();
    const summary = readWorkspaceEvidenceSummary(db, { workspaceId });
    return summary ? presentWorkspaceEvidence(summary) : null;
  } catch (error) {
    throw new Error(
      `No se pudo leer evidencia durable local para workspace ${workspaceId}: ${error?.message || 'sin detalle.'}`
    );
  }
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

  // Fan-out: ['*'] or empty array resolves to all eligible active participants
  const resolvedRecipients =
    normalizedRecipients.length === 0 ||
    (normalizedRecipients.length === 1 && normalizedRecipients[0] === '*')
      ? [...eligibleAgentIds]
      : normalizedRecipients;

  if (resolvedRecipients.length === 0) {
    throw new Error('Elegí al menos un destinatario activo.');
  }

  const invalidRecipients = resolvedRecipients.filter((agentId) => !eligibleAgentIds.has(agentId));
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

  resolvedRecipients.forEach((recipientAgentId) => {
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
      getExecutionQueue,
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
    // T-012 — TCT-DELTA-S1/S2/S3/S6: when ?mission_id=X&role=Y is supplied,
    // the health endpoint reads team_inbox first and falls back to
    // pending_deliveries (legacy). The response carries inbox_source +
    // shim_warning so consumers can detect the deprecation path.
    let inboxSection = null;
    try {
      const url = new URL(
        request?.url || (typeof request === 'string' ? request : ''),
        'http://localhost'
      );
      const missionId = url.searchParams.get('mission_id');
      const role = url.searchParams.get('role');
      if (missionId && role) {
        const { resolveInboxForRole } = require('@/lib/bus/shim/tct.js');
        const db =
          (dependencies && dependencies.db) || (typeof getDb === 'function' ? getDb() : null);
        if (db) {
          const out = resolveInboxForRole(db, missionId, role, process.env);
          inboxSection = {
            mission_id: missionId,
            role,
            inbox_source: out.inbox_source,
            rows: out.rows,
            ...(out.shim_warning ? { shim_warning: out.shim_warning } : {}),
          };
        }
      }
    } catch (e) {
      // best-effort: do not break the existing health payload
      inboxSection = { error: e.message };
    }
    return NextResponse.json(inboxSection ? { ...snapshot, inbox: inboxSection } : snapshot);
  } catch (error) {
    console.error('[operations/health] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(async function POST(request, _context, dependencies = {}) {
  try {
    const payload = await request.json();
    if (payload?.action === 'claim_director_next_task') {
      const now = new Date().toISOString();
      const projectId = payload?.project_id || getProjectIdFromRequest(request);
      const getMissionSnapshot = dependencies.getMissionSnapshot || null;
      const getExecutionQueue = dependencies.getExecutionQueue || null;
      const getNextTask = dependencies.getNextTask || null;
      const getWorkspaceEvidence = dependencies.getWorkspaceEvidence || null;

      if (!projectId) {
        return NextResponse.json({ error: 'project_id es requerido.' }, { status: 400 });
      }

      const missionSnapshot = await getRouteMissionSnapshot(now, getMissionSnapshot, projectId);
      const eligibleExecutors = getEligibleMissionExecutors(missionSnapshot);

      if (eligibleExecutors.length !== 1) {
        const queueEntries = await readDirectorQueueEntries({
          projectId,
          getExecutionQueue,
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
        getNextTask,
      });
      const workspaceEvidence = await getWorkspaceEvidenceResult({
        workspaceId: getWorkspaceIdFromClaimResult(claimResult),
        getWorkspaceEvidence,
      });
      const queueEntries = await readDirectorQueueEntries({
        projectId,
        getExecutionQueue,
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

    if (payload?.action === 'terminate_swarm_local') {
      const launchId = String(payload?.launch_id || '').trim();
      if (!launchId) {
        return NextResponse.json({ error: 'launch_id es requerido.' }, { status: 400 });
      }

      const terminateFn = dependencies.terminateSwarmLaunch || terminateSwarmLaunch;
      const terminateResult = await terminateFn(launchId, {
        fetchImpl: dependencies.fetchImpl || fetch,
        closeTerminalSessionImpl: dependencies.closeTerminalSessionById,
        cleanupMissionWorktreesImpl: dependencies.cleanupMissionWorktrees,
        killTmuxSessionImpl: dependencies.killTmuxSession,
        db: dependencies.db || getDb(),
      });

      const refreshedSnapshot = await gatherOperationalHealth(
        {
          ...dependencies,
          db: dependencies.db,
          projectId: payload?.project_id || getProjectIdFromRequest(request),
        },
        request
      );

      return NextResponse.json({
        terminate_result: terminateResult,
        control_room_snapshot_input: refreshedSnapshot.control_room_snapshot_input || null,
      });
    }

    if (payload?.action === 'prune_all_worktrees') {
      const repoRoot = String(payload?.repo_root || '').trim();
      if (!repoRoot) {
        return NextResponse.json({ error: 'repo_root es requerido.' }, { status: 400 });
      }

      const { pruneWorktrees, safeRemoveWorktree } = require('@/lib/swarm/cleanup');

      function listWorktreesForPrune(root) {
        try {
          const output = execSync('git worktree list --porcelain', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: root,
          }).trim();
          if (!output) return [];

          const worktrees = [];
          let current = null;

          for (const line of output.split('\n')) {
            if (line.startsWith('worktree ')) {
              if (current) worktrees.push(current);
              current = { path: line.slice('worktree '.length), head: '', branch: '' };
            } else if (line.startsWith('head ') && current) {
              current.head = line.slice('head '.length);
            } else if (line.startsWith('branch ') && current) {
              current.branch = line.slice('branch '.length);
            }
          }
          if (current) worktrees.push(current);
          return worktrees;
        } catch {
          return [];
        }
      }

      const diskWorktrees = listWorktreesForPrune(repoRoot);
      const devhubWorktrees = diskWorktrees.filter((wt) => wt.path.includes('.devhub/worktrees'));

      const removeResults = [];
      for (const wt of devhubWorktrees) {
        const result = safeRemoveWorktree({ repoRoot, worktreePath: wt.path }, { force: true });
        removeResults.push({ path: wt.path, ...result });
      }

      const pruneResult = pruneWorktrees(repoRoot);

      return NextResponse.json({
        worktrees_removed: removeResults,
        prune_result: pruneResult,
        summary: `Removed ${removeResults.filter((r) => r.success).length} of ${removeResults.length} worktrees.`,
      });
    }

    if (payload?.action === 'agent_heartbeat') {
      const { agent_id, mission_id, workspace_id, status_summary } = payload;
      const now = new Date().toISOString();

      if (!agent_id || !mission_id) {
        return NextResponse.json(
          { error: 'agent_id y mission_id son requeridos.' },
          { status: 400 }
        );
      }

      try {
        const writeDb = dependencies.db || getDb();
        upsertAgentPresence(writeDb, {
          mission_id,
          agent_id,
          workspace_id: workspace_id || null,
          runtime_surface: LOCAL_SWARM_RUNTIME_SURFACE,
          presence_state: 'busy',
          status_summary: status_summary || 'heartbeat',
          last_seen_at: now,
          updated_at: now,
        });

        // Determine stale/offline tracking for response
        const presenceRows = listAgentPresenceForMission(writeDb, mission_id).filter(
          (p) => p.agent_id === agent_id
        );
        const latestPresence = presenceRows[0] || null;
        // eslint-disable-next-line no-unused-vars -- 'stale' is intentionally dropped (pre-existing)
        const { effective_state, stale } = getAgentPresenceStatus(latestPresence, { now });

        // Track missed heartbeats for stale/offline detection
        const missedKey = `stale_missed_${agent_id}`;
        let missedCount = parseInt(dependencies.missedHeartbeats?.get?.(missedKey) || '0', 10);
        if (effective_state === 'stale' || effective_state === 'offline') {
          missedCount += 1;
        } else {
          missedCount = 0;
        }

        // Determine presence_state: stale at 2 missed, offline at 3+
        let presenceState = effective_state;
        if (missedCount >= 3) {
          presenceState = 'offline';
        } else if (missedCount >= 2) {
          presenceState = 'stale';
        }

        // Backoff hint: 120s base, doubles per consecutive miss (max 900s)
        const baseInterval = 120_000;
        const maxInterval = 900_000;
        const retryAfterMs = Math.min(
          baseInterval * Math.pow(2, Math.max(0, missedCount - 1)),
          maxInterval
        );

        const pendingDeliveries = listPendingDeliveriesForAgent(writeDb, agent_id, {
          status: 'pending',
          limit: 50,
        });
        const pending_deliveries = pendingDeliveries.map((d) => ({
          delivery_id: d.delivery_id,
          message_id: d.message_id,
          sender_agent_id: d.sender_agent_id,
          payload: d.payload,
          created_at: d.created_at,
          status: d.status,
        }));

        const headers = new Headers();
        headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));

        return NextResponse.json(
          {
            ok: true,
            agent_id,
            mission_id,
            last_seen_at: now,
            presence_state: presenceState,
            retry_after_ms: retryAfterMs,
            pending_deliveries,
          },
          { headers }
        );
      } catch (err) {
        console.error('[operations/health][POST] Heartbeat error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    if (payload?.action === 'ack_delivery') {
      const { delivery_id } = payload;
      if (!delivery_id) {
        return NextResponse.json({ error: 'delivery_id required' }, { status: 400 });
      }
      const writeDb = dependencies.db || getDb();
      const result = markDeliveryConsumed(writeDb, delivery_id);
      return NextResponse.json({ ok: true, delivery_id, updated: result.changes });
    }

    if (payload?.action === 'signal_worker_handoff') {
      const { agent_id, task_id, event_type, related_task_id } = payload;
      if (!agent_id || !task_id || !event_type) {
        return NextResponse.json(
          { error: 'agent_id, task_id, event_type required' },
          { status: 400 }
        );
      }
      if (!['task_completed', 'handoff_ready'].includes(event_type)) {
        return NextResponse.json(
          { error: 'event_type must be task_completed or handoff_ready' },
          { status: 400 }
        );
      }
      const directive = {
        task_id,
        event_type,
        related_task_id,
        signaled_at: new Date().toISOString(),
      };
      const inboxDir = `/tmp/devhub-inbox`;
      const { existsSync, mkdirSync, writeFileSync } = require('fs');
      if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true });
      const directiveFile = `${inboxDir}/directive-${agent_id}-${task_id}.json`;
      writeFileSync(directiveFile, JSON.stringify(directive));
      return NextResponse.json({ ok: true, directive_file: directiveFile, directive });
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
});

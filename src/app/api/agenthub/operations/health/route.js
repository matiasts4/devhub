import { NextResponse } from 'next/server';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import {
  createMissionMessage,
  getActiveAgentCount as getDbActiveAgentCount,
  getDb,
  getSwarmMissionDirectorSnapshot,
  listMissionParticipants,
  upsertMessageDelivery,
} from '@/lib/db/localDb.js';
import {
  buildHealthSnapshot,
  buildMcpHealthSource,
  buildProcessHealthSource,
  buildQueueHealthSource,
  buildSessionStreamHealthSource,
  buildTelegramHealthSource,
} from '@/lib/operations/health';
import { buildControlRoomSnapshotInputFromHealth } from '@/lib/operations/swarmControl';

export const runtime = 'nodejs';

const LOCAL_MISSION_DELIVERY_CHANNEL = 'local_snapshot';
const LOCAL_MISSION_MESSAGE_KIND = 'directive';
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

export function buildMissionControlSnapshotInput(missionControl) {
  if (!missionControl) return {};
  return {
    mission_control: missionControl,
  };
}

function getProjectIdFromRequest(request) {
  if (!request?.url) return null;

  try {
    return new URL(request.url).searchParams.get('project_id') || null;
  } catch {
    return null;
  }
}

function createDirectorQueueItem(entry = {}, index = 0) {
  const blockingDependencies = Array.isArray(entry.blocking_dependencies)
    ? entry.blocking_dependencies.filter(Boolean)
    : [];

  return {
    id: entry.id || null,
    title: entry.title || null,
    status: entry.blocked ? 'blocked' : entry.status || 'unknown',
    position: index + 1,
    priority: entry.priority || null,
    blocked_reason: entry.blocked_reason || blockingDependencies[0] || null,
    supervisor: entry.supervisor || null,
  };
}

function createDirectorQueueHandoff(overrides = {}) {
  return {
    ...EMPTY_DIRECTOR_QUEUE_HANDOFF,
    ...overrides,
  };
}

function createDirectorQueueSnapshot(queue = [], handoff = EMPTY_DIRECTOR_QUEUE_HANDOFF) {
  return {
    authority: 'authoritative',
    freshness: 'current',
    items: Array.isArray(queue) ? queue.map(createDirectorQueueItem) : [],
    handoff: createDirectorQueueHandoff(handoff),
  };
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

function getRouteMissionSnapshot(now, getMissionSnapshot) {
  if (getMissionSnapshot) return getMissionSnapshot();

  const db = getDb();
  const missionId = getActiveMissionId(db);
  return missionId ? getSwarmMissionDirectorSnapshot(db, missionId, { now }) : null;
}

async function readDirectorQueueEntries({ projectId, request, getExecutionQueue, fetchImpl }) {
  if (!projectId) return null;

  const queuePayload = getExecutionQueue
    ? await getExecutionQueue({ projectId, includeBlocked: true })
    : await callDevhubTool(
        'get_execution_queue',
        { project_id: projectId, include_blocked: true },
        { request, fetchImpl }
      );

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
  return createDirectorQueueSnapshot(queue);
}

function getEligibleMissionExecutors(missionSnapshot = null) {
  return (Array.isArray(missionSnapshot?.participants) ? missionSnapshot.participants : []).filter(
    (participant) => participant?.status === 'active' && participant?.role_in_mission === 'executor'
  );
}

async function getNextTaskResult({ projectId, agentId, request, getNextTask, fetchImpl }) {
  return getNextTask
    ? getNextTask({ projectId, agentId })
    : callDevhubTool(
        'get_next_task',
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

function getActiveMissionId(db) {
  const mission = db
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

  const [processStatus, queueStatus, activeAgentCount, mcpStatus, sessionsHealth, telegramStatus] =
    await Promise.all([
      getProcessStatus(),
      getQueueStatus(),
      getActiveAgentCount(),
      getMcpStatus(),
      getSessionsHealth(),
      getTelegramStatus(),
    ]);
  const [missionSnapshot, directorQueue] = await Promise.all([
    getRouteMissionSnapshot(now, getMissionSnapshot),
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
    ],
  });

  const controlRoomSnapshotInput = {
    ...(buildControlRoomSnapshotInputFromHealth(snapshot) || {}),
    ...buildMissionControlSnapshotInput(missionSnapshot),
    ...(directorQueue ? { director_queue: directorQueue } : {}),
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

      const missionSnapshot = await getRouteMissionSnapshot(now, getMissionSnapshot);
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
            director_queue: createDirectorQueueSnapshot(
              queueEntries,
              createDirectorQueueHandoff({
                status: 'disabled',
                message:
                  eligibleExecutors.length === 0
                    ? DIRECTOR_HANDOFF_DISABLED_MESSAGES.none
                    : DIRECTOR_HANDOFF_DISABLED_MESSAGES.multiple,
              })
            ),
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
          director_queue: createDirectorQueueSnapshot(
            queueEntries,
            buildDirectorHandoffFromClaim({
              claimResult,
              recipientAgentId,
              queueEntries,
              workspaceEvidence,
            })
          ),
        },
      });
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

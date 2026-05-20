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

export function buildMissionControlSnapshotInput(missionControl) {
  if (!missionControl) return {};
  return {
    mission_control: missionControl,
  };
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

export async function gatherOperationalHealth(dependencies = {}) {
  const now = dependencies.now || new Date().toISOString();
  const getProcessStatus = dependencies.getProcessStatus || (() => processManager.getStatus());
  const getQueueStatus = dependencies.getQueueStatus || (() => swarmQueue.getStatus());
  const getActiveAgentCount = dependencies.getActiveAgentCount || (() => getDbActiveAgentCount());
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
  const getMissionSnapshot =
    dependencies.getMissionSnapshot ||
    (() => {
      const db = getDb();
      const missionId = getActiveMissionId(db);

      return missionId ? getSwarmMissionDirectorSnapshot(db, missionId, { now }) : null;
    });

  const [processStatus, queueStatus, activeAgentCount, mcpStatus, sessionsHealth, telegramStatus] =
    await Promise.all([
      getProcessStatus(),
      getQueueStatus(),
      getActiveAgentCount(),
      getMcpStatus(),
      getSessionsHealth(),
      getTelegramStatus(),
    ]);
  const missionSnapshot = await getMissionSnapshot();

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

export async function GET() {
  try {
    const snapshot = await gatherOperationalHealth();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[operations/health] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
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

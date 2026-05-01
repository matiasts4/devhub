import { NextResponse } from 'next/server';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import { getActiveAgentCount as getDbActiveAgentCount } from '@/lib/db/localDb.js';
import {
  buildHealthSnapshot,
  buildMcpHealthSource,
  buildProcessHealthSource,
  buildQueueHealthSource,
  buildSessionStreamHealthSource,
  buildTelegramHealthSource,
} from '@/lib/operations/health';

export const runtime = 'nodejs';

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

  const [processStatus, queueStatus, activeAgentCount, mcpStatus, sessionsHealth, telegramStatus] =
    await Promise.all([
      getProcessStatus(),
      getQueueStatus(),
      getActiveAgentCount(),
      getMcpStatus(),
      getSessionsHealth(),
      getTelegramStatus(),
    ]);

  return buildHealthSnapshot({
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

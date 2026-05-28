/**
 * Runtime-internal health source collector.
 *
 * This module gathers runtime-local diagnostics (process status, session
 * streams, MCP connectivity, Telegram status) that enrich the health route
 * response. It MUST NOT be required by public MCP adapters or the shared
 * durable-read core; its outputs are observer-only hints, not authoritative
 * durable truth.
 */

import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import { getActiveAgentCount as getDbActiveAgentCount } from '@/lib/db/localDb.js';
import {
  buildMcpHealthSource,
  buildProcessHealthSource,
  buildQueueHealthSource,
  buildSessionStreamHealthSource,
  buildTelegramHealthSource,
} from '@/lib/operations/health';

async function getRoutePayload(routeGetter) {
  const response = await routeGetter();
  return response.json();
}

async function getDefaultMcpStatus() {
  const route = await import('@/app/api/agenthub/mcp/status/route');
  return getRoutePayload(route.GET);
}

async function getDefaultSessionsHealth() {
  const route = await import('@/app/api/agenthub/sessions/health/route');
  return getRoutePayload(route.GET);
}

async function getDefaultTelegramStatus() {
  const route = await import('@/app/api/telegram/status/route');
  return getRoutePayload(route.GET);
}

export async function collectOperationalHealthSources(dependencies = {}) {
  const now = dependencies.now || new Date().toISOString();
  const getProcessStatus = dependencies.getProcessStatus || (() => processManager.getStatus());
  const getQueueStatus = dependencies.getQueueStatus || (() => swarmQueue.getStatus());
  const getActiveAgentCount = dependencies.getActiveAgentCount || (() => getDbActiveAgentCount());
  const getMcpStatus = dependencies.getMcpStatus || getDefaultMcpStatus;
  const getSessionsHealth = dependencies.getSessionsHealth || getDefaultSessionsHealth;
  const getTelegramStatus = dependencies.getTelegramStatus || getDefaultTelegramStatus;

  const [processStatus, queueStatus, activeAgentCount, mcpStatus, sessionsHealth, telegramStatus] =
    await Promise.all([
      getProcessStatus(),
      getQueueStatus(),
      getActiveAgentCount(),
      getMcpStatus(),
      getSessionsHealth(),
      getTelegramStatus(),
    ]);

  return {
    now,
    sources: [
      buildProcessHealthSource(processStatus, { now }),
      buildQueueHealthSource(queueStatus, { now, activeAgentCount }),
      buildSessionStreamHealthSource(sessionsHealth, { now }),
      buildMcpHealthSource(mcpStatus, { now }),
      buildTelegramHealthSource(telegramStatus, { now }),
    ],
  };
}

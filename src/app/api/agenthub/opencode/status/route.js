import { NextResponse } from 'next/server';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import { getSwarmConfig, getActiveAgentCount } from '@/lib/db/localDb.js';

export const runtime = 'nodejs';

/**
 * GET /api/agenthub/opencode/status
 * Returns process status, concurrency info, and queue state.
 * Used by bot and UI for coordination.
 */
export async function GET() {
  try {
    const pmStatus = await processManager.getStatus();
    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();
    const queueStatus = swarmQueue.getStatus();

    return NextResponse.json({
      process: {
        running: pmStatus.running,
        healthy: pmStatus.healthy,
        pid: pmStatus.pid,
        port: pmStatus.port,
        uptime: pmStatus.processInfo?.uptime || null,
        memoryRss: pmStatus.processInfo?.memoryMB
          ? pmStatus.processInfo.memoryMB * 1024 * 1024
          : null,
        status: pmStatus.running ? 'healthy' : 'stopped',
      },
      concurrency: {
        active: activeCount,
        activeSessions: activeCount,
        effectiveActive: activeCount,
        max: maxConcurrent,
        atLimit: activeCount >= maxConcurrent,
      },
      queue: {
        length: queueStatus.length,
        estimatedWaitMs: queueStatus.length > 0 ? queueStatus.items[0]?.estimatedWaitMs || 0 : 0,
      },
    });
  } catch (err) {
    console.error('[status/route] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

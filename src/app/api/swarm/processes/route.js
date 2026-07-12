import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getOpenCodeProcesses } from '@/lib/swarm/openCodeProcesses';
import { getDb } from '@/lib/db/core';

export const dynamic = 'force-dynamic';

/**
 * Close every active swarm mission so a new launch is not blocked.
 *
 * Status constraints (schema):
 *   swarm_missions:       planned | active | paused | completed | failed | aborted
 *   mission_participants: invited | active | paused | completed | removed
 *
 * Using status='aborted' on participants fails CHECK and left missions stuck
 * as active forever (blocks relaunch).
 */
function closeActiveSwarmMissions(db, { now = new Date().toISOString() } = {}) {
  const activeMissions = db
    .prepare("SELECT mission_id FROM swarm_missions WHERE status = 'active'")
    .all();

  if (activeMissions.length === 0) {
    return 0;
  }

  const missionStmt = db.prepare(
    "UPDATE swarm_missions SET status = 'aborted', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE mission_id = ?"
  );
  const presenceStmt = db.prepare(
    "UPDATE agent_presence SET presence_state = 'offline', updated_at = ? WHERE mission_id = ?"
  );
  // Participants must use 'removed' (not 'aborted') per CHECK constraint.
  const participantStmt = db.prepare(
    "UPDATE mission_participants SET status = 'removed', left_at = COALESCE(left_at, ?), updated_at = ? WHERE mission_id = ? AND status IN ('invited', 'active', 'paused')"
  );

  const runAll = db.transaction((missions) => {
    let closed = 0;
    for (const { mission_id } of missions) {
      missionStmt.run(now, now, mission_id);
      try {
        presenceStmt.run(now, mission_id);
      } catch {
        // presence table may be missing in older DBs
      }
      participantStmt.run(now, now, mission_id);
      closed += 1;
    }
    return closed;
  });

  return runAll(activeMissions);
}

// Kill a process by PID (Windows-safe)
function killProcess(pid, force = false) {
  try {
    const numericPid = Number(pid);
    if (!Number.isFinite(numericPid) || numericPid <= 0) {
      return { success: false, pid, error: 'invalid pid' };
    }

    if (process.platform === 'win32') {
      // /T kills the process tree (kimi/bash children). /F forces when requested.
      const args = force ? `taskkill /PID ${numericPid} /T /F` : `taskkill /PID ${numericPid} /T`;
      try {
        execSync(args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
      } catch (err) {
        // taskkill exits non-zero when the process is already gone — treat as success
        const msg = String(err?.message || '');
        if (!/not found|no se encontró|no se encuentra|ERROR: The process/i.test(msg)) {
          // Retry once with force
          if (!force) {
            try {
              execSync(`taskkill /PID ${numericPid} /T /F`, {
                encoding: 'utf8',
                timeout: 8000,
                windowsHide: true,
              });
            } catch (forceErr) {
              return { success: false, pid: numericPid, error: forceErr.message };
            }
          } else {
            return { success: false, pid: numericPid, error: err.message };
          }
        }
      }
      return { success: true, pid: numericPid, signal: force ? 'SIGKILL' : 'SIGTERM' };
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    process.kill(numericPid, signal);
    return { success: true, pid: numericPid, signal };
  } catch (error) {
    return { success: false, pid, error: error.message };
  }
}

export async function GET() {
  try {
    const processes = getOpenCodeProcesses();

    const totalMem = processes.reduce((sum, p) => sum + (p.rss || 0), 0);
    const totalCpu = processes.reduce((sum, p) => sum + (p.cpu || 0), 0);

    const launchCounts = {};
    processes.forEach((p) => {
      if (p.launchId) {
        launchCounts[p.launchId] = (launchCounts[p.launchId] || 0) + 1;
      }
    });

    const duplicateWarnings = Object.entries(launchCounts)
      .filter(([, count]) => count > 5)
      .map(([launchId, count]) => ({
        launchId,
        count,
        warning: `Possible duplicate: ${count} agents for ${launchId}`,
      }));

    return NextResponse.json({
      processes,
      summary: {
        count: processes.length,
        totalMemoryMB: Math.round(totalMem / 1024),
        totalCpu: totalCpu.toFixed(1),
        agents: [...new Set(processes.map((p) => p.agent))],
        duplicateWarnings,
      },
    });
  } catch (error) {
    console.error('[swarm/processes] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, pid, all, force = false } = body;

    if (action === 'abort_all_active') {
      // Abort all active swarm missions without killing processes.
      // Useful when processes were already killed but DB state is stale.
      let missionsClosed = 0;
      try {
        const db = getDb();
        missionsClosed = closeActiveSwarmMissions(db);
      } catch (dbErr) {
        console.error('[swarm/processes] Failed to abort active missions:', dbErr.message);
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
      return NextResponse.json({ action: 'abort_all_active', missionsClosed });
    }

    if (action === 'kill') {
      if (all) {
        const processes = getOpenCodeProcesses();
        const results = processes.map((p) => killProcess(p.pid, force));
        const killed = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        let missionsClosed = 0;
        try {
          const db = getDb();
          missionsClosed = closeActiveSwarmMissions(db);
        } catch (dbErr) {
          console.error(
            '[swarm/processes] Failed to abort missions after kill-all:',
            dbErr.message
          );
        }

        return NextResponse.json({
          action: 'kill_all',
          killed,
          failed,
          results,
          missionsClosed,
        });
      }

      if (!pid) {
        return NextResponse.json({ error: 'pid is required' }, { status: 400 });
      }

      const result = killProcess(pid, force);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[swarm/processes] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

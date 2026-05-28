import { NextResponse } from 'next/server';
import { getOpenCodeProcesses } from '@/lib/swarm/openCodeProcesses';
import { getDb } from '@/lib/db/core';

export const dynamic = 'force-dynamic';

// Kill a process by PID
function killProcess(pid, force = false) {
  try {
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    process.kill(pid, signal);
    return { success: true, pid, signal };
  } catch (error) {
    return { success: false, pid, error: error.message };
  }
}

export async function GET() {
  try {
    const processes = getOpenCodeProcesses();

    // Calculate totals
    const totalMem = processes.reduce((sum, p) => sum + (p.rss || 0), 0);
    const totalCpu = processes.reduce((sum, p) => sum + (p.cpu || 0), 0);

    // Detect duplicate swarms
    const launchCounts = {};
    processes.forEach(p => {
      if (p.launchId) {
        launchCounts[p.launchId] = (launchCounts[p.launchId] || 0) + 1;
      }
    });
    
    const duplicateWarnings = Object.entries(launchCounts)
      .filter(([, count]) => count > 5)
      .map(([launchId, count]) => ({
        launchId,
        count,
        warning: `Possible duplicate: ${count} agents for ${launchId}`
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
      // Abort all active swarm missions without killing processes
      // Useful when processes were already killed but DB state is stale
      let missionsClosed = 0;
      try {
        const db = getDb();
        const now = new Date().toISOString();
        const activeMissions = db
          .prepare("SELECT mission_id FROM swarm_missions WHERE status = 'active'")
          .all();
        const stmt = db.prepare(
          "UPDATE swarm_missions SET status = 'aborted', completed_at = ?, updated_at = ? WHERE mission_id = ?"
        );
        const presenceStmt = db.prepare(
          "UPDATE agent_presence SET presence_state = 'offline', updated_at = ? WHERE mission_id = ?"
        );
        const participantStmt = db.prepare(
          "UPDATE mission_participants SET status = 'aborted', left_at = ?, updated_at = ? WHERE mission_id = ? AND status = 'active'"
        );
        for (const { mission_id } of activeMissions) {
          stmt.run(now, now, mission_id);
          presenceStmt.run(now, mission_id);
          participantStmt.run(now, now, mission_id);
          missionsClosed++;
        }
      } catch (dbErr) {
        console.error('[swarm/processes] Failed to abort active missions:', dbErr.message);
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
      return NextResponse.json({ action: 'abort_all_active', missionsClosed });
    }

    if (action === 'kill') {
      if (all) {
        // Kill all opencode processes
        const processes = getOpenCodeProcesses();
        const results = processes.map((p) => killProcess(p.pid, force));
        const killed = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        // Abort all active swarm missions in DB so new launches are not blocked
        let missionsClosed = 0;
        try {
          const db = getDb();
          const now = new Date().toISOString();
          const activeMissions = db
            .prepare("SELECT mission_id FROM swarm_missions WHERE status = 'active'")
            .all();
          const stmt = db.prepare(
            "UPDATE swarm_missions SET status = 'aborted', completed_at = ?, updated_at = ? WHERE mission_id = ?"
          );
          const presenceStmt = db.prepare(
            "UPDATE agent_presence SET presence_state = 'offline', updated_at = ? WHERE mission_id = ?"
          );
          const participantStmt = db.prepare(
            "UPDATE mission_participants SET status = 'aborted', left_at = ?, updated_at = ? WHERE mission_id = ? AND status = 'active'"
          );
          for (const { mission_id } of activeMissions) {
            stmt.run(now, now, mission_id);
            presenceStmt.run(now, mission_id);
            participantStmt.run(now, now, mission_id);
            missionsClosed++;
          }
        } catch (dbErr) {
          console.error('[swarm/processes] Failed to abort missions after kill-all:', dbErr.message);
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

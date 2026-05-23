import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

// Get all running opencode processes with their details
function getOpenCodeProcesses() {
  try {
    const output = execSync(
      'ps aux | grep -E "opencode.*--agent|opencode.*--session" | grep -v grep',
      { encoding: 'utf8' }
    );

    if (!output.trim()) return [];

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1]);
        const cpu = parseFloat(parts[2]);
        const mem = parseFloat(parts[3]);
        const rss = parseInt(parts[5]); // KB
        const command = parts.slice(10).join(' ');

        // Extract agent name from command
        const agentMatch = command.match(/--agent\s+([\w-]+)/);
        const sessionMatch = command.match(/--session\s+([\w-]+)/);
        const workspaceMatch = command.match(/Workspace:\\s*([^\\n]+)/);

        return {
          pid,
          cpu,
          mem,
          rss,
          command,
          agent: agentMatch?.[1] || 'unknown',
          sessionId: sessionMatch?.[1] || null,
          workspace: workspaceMatch?.[1]?.trim() || null,
          startedAt: null, // Could be enhanced with ps -o lstart
        };
      });
  } catch {
    return [];
  }
}

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

    return NextResponse.json({
      processes,
      summary: {
        count: processes.length,
        totalMemoryMB: Math.round(totalMem / 1024),
        totalCpu: totalCpu.toFixed(1),
        agents: [...new Set(processes.map((p) => p.agent))],
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

    if (action === 'kill') {
      if (all) {
        // Kill all opencode processes
        const processes = getOpenCodeProcesses();
        const results = processes.map((p) => killProcess(p.pid, force));
        const killed = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return NextResponse.json({
          action: 'kill_all',
          killed,
          failed,
          results,
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

import { execSync } from 'child_process';

export function getOpenCodeProcesses() {
  try {
    const output = execSync(
      'ps aux | grep -E "opencode.*--agent|opencode.*--session" | grep -v grep',
      { encoding: 'utf8', timeout: 5000 }
    );

    if (!output.trim()) {
      console.log('[SWARM_PROCESSES] No opencode processes found');
      return [];
    }

    const processes = output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1], 10);
        const cpu = parseFloat(parts[2]);
        const mem = parseFloat(parts[3]);
        const rss = parseInt(parts[5], 10);
        const command = parts.slice(10).join(' ');
        const normalizedCommand = command.replace(/\\n/g, '\n');
        const agentMatch = command.match(/--agent\s+([\w-]+)/);
        const sessionMatch = command.match(/--session\s+([\w-]+)/);
        const workspaceMatch = normalizedCommand.match(/Workspace:\s*([^\r\n]+)/);
        const roleMatch = normalizedCommand.match(/Rol:\s*([^\r\n]+)/);

        // Extract launch ID to detect duplicates
        const launchIdMatch = command.match(/launch-([a-f0-9-]+)/);

        return {
          pid,
          cpu,
          mem,
          rss,
          command,
          agent: agentMatch?.[1] || 'unknown',
          role: roleMatch?.[1]?.trim() || null,
          sessionId: sessionMatch?.[1] || null,
          workspace: workspaceMatch?.[1]?.trim() || null,
          launchId: launchIdMatch?.[0] || null,
          startedAt: null,
        };
      });

    // Log process count for diagnostics
    console.log(`[SWARM_PROCESSES] Found ${processes.length} opencode process(es)`);

    // Detect duplicate swarms (same launchId appearing more than expected)
    const launchCounts = {};
    processes.forEach((p) => {
      if (p.launchId) {
        launchCounts[p.launchId] = (launchCounts[p.launchId] || 0) + 1;
      }
    });

    const duplicates = Object.entries(launchCounts)
      .filter(([, count]) => count > 5) // More than 5 agents per launch is suspicious
      .map(([launchId, count]) => ({ launchId, count }));

    if (duplicates.length > 0) {
      console.warn(`[SWARM_PROCESSES] WARNING: Possible duplicate swarms detected:`, duplicates);
    }

    return processes;
  } catch (err) {
    console.error('[SWARM_PROCESSES] Error scanning processes:', err.message);
    return [];
  }
}

/**
 * Check if there's an active swarm for a given project
 * Returns { hasActiveSwarm: boolean, launchId: string|null, agentCount: number }
 */
export function hasActiveSwarmForProject(projectId) {
  try {
    const processes = getOpenCodeProcesses();

    // Filter processes that belong to this project's swarm
    const projectSwarmProcesses = processes.filter(
      (p) => p.workspace?.includes(projectId) || p.command?.includes(projectId)
    );

    return {
      hasActiveSwarm: projectSwarmProcesses.length > 0,
      agentCount: projectSwarmProcesses.length,
      processes: projectSwarmProcesses,
    };
  } catch {
    return { hasActiveSwarm: false, agentCount: 0, processes: [] };
  }
}

import { isActiveAgent } from './agentRegistryTelemetry.js';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function getAgentLaunchMetadata(agent = {}, agentRuns = {}) {
  // devhub_agent_runs stays observer-only: prefer durable workspace identity, then task, then agent.
  const run =
    agentRuns?.[agent.workspace_id] ||
    agentRuns?.[agent.current_task_id] ||
    agentRuns?.[agent.agent_id] ||
    {};
  return {
    ...run,
    selectedAgent: run.selectedAgent || run.selected_agent || null,
    launchOrigin: run.launchOrigin || run.origin || null,
    promptSummary: run.promptSummary || run.commandSummary || run.taskTitle || null,
  };
}

export function getAgentDisplayMeta(agent = {}, { agentRuns = {} } = {}) {
  const launch = getAgentLaunchMetadata(agent, agentRuns);
  const selectedAgent = normalizeText(launch.selectedAgent);
  const launchOrigin = normalizeText(launch.launchOrigin);
  const name = normalizeText(agent.nombre || agent.profile_name || agent.agent_id);
  const taskTitle = launch.promptSummary || null;
  const summary =
    taskTitle ||
    launch.commandSummary ||
    (agent.current_task_id ? `Tarea ${String(agent.current_task_id).slice(0, 8)}` : null) ||
    'Sin contexto activo';

  if (
    selectedAgent.includes('sdd-orchestrator') ||
    name.includes('sdd-orchestrator') ||
    launchOrigin.includes('dashboard')
  ) {
    return {
      label: 'META / Orquestación',
      tone: 'bg-[#8957E5]/10 text-[#D2A8FF] border-[#8957E5]/20',
      summary,
    };
  }

  if (selectedAgent.includes('worker') || name.includes('worker')) {
    return {
      label: 'WORKER / Ejecución',
      tone: 'bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/20',
      summary,
    };
  }

  if (taskTitle || agent.current_task_id) {
    return {
      label: 'TASK / Trabajo concreto',
      tone: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      summary,
    };
  }

  if (launch.launchOrigin || launch.promptSummary) {
    return {
      label: 'APP / Lanzado desde la app',
      tone: 'bg-surface-elevated text-text-muted border-borders-subtle',
      summary,
    };
  }

  return {
    label: 'APP / Sin contexto',
    tone: 'bg-surface-elevated text-text-muted border-borders-subtle',
    summary,
  };
}

export function getAgentRegistryLiveSnapshot({
  agents = [],
  liveSessions = {},
  agentRuns = {},
} = {}) {
  const activeAgents = (agents || []).filter((agent) => {
    const run =
      agentRuns?.[agent.workspace_id] ||
      agentRuns?.[agent.current_task_id] ||
      agentRuns?.[agent.agent_id];
    const hasLiveSession = run?.panelId && liveSessions?.[run.panelId]?.alive;
    return isActiveAgent(agent) || hasLiveSession;
  });

  return {
    activeAgents,
    activeAgentsCount: activeAgents.length,
  };
}

/**
 * resolveAgentToPanelId — Bridge between agent_registry and devhub_agent_runs.
 *
 * Maps agent.task_id (or agent_id) → agentRuns[taskId].panelId.
 * Handles missing keys gracefully — returns null if no match found.
 *
 * @param {object} agent — agent_registry row
 * @param {object} agentRuns — devhub_agent_runs from localStorage (keyed by taskId)
 * @returns {string|null} panelId or null
 */
export function resolveAgentToPanelId(agent = {}, agentRuns = {}) {
  if (!agent || !agentRuns) return null;

  const run =
    agentRuns[agent.workspace_id] || agentRuns[agent.current_task_id] || agentRuns[agent.agent_id];
  return run?.panelId || null;
}

/**
 * findAgentWorkspaceAndPanel — Full bridge that finds which workspace + panel
 * an agent's terminal is in, given all workspaces and agent runs.
 *
 * @param {object} agent — agent_registry row
 * @param {object} agentRuns — devhub_agent_runs from localStorage
 * @param {Array} workspaces — current workspaces state
 * @returns {{ wsId: string|null, panelId: string|null }}
 */
export function findAgentWorkspaceAndPanel(agent = {}, agentRuns = {}, workspaces = []) {
  const panelId = resolveAgentToPanelId(agent, agentRuns);
  if (!panelId) return { wsId: null, panelId: null };

  // Find which workspace contains this panel
  for (const ws of workspaces) {
    for (const col of ws.columns) {
      const found = col.panels.find((p) => p.id === panelId);
      if (found) {
        return { wsId: ws.id, panelId };
      }
    }
  }

  // Panel exists in agentRuns but not in current workspaces (may have been closed)
  return { wsId: null, panelId };
}

export function getAgentExecutionContext(agent = {}) {
  const status = String(agent.status || '').toLowerCase();
  const hasTask = Boolean(agent.current_task_id);
  const staleHeartbeat = !isActiveAgent(agent);

  if (status === 'completed') {
    return { label: 'COMPLETADO', tone: 'bg-green-500/10 text-green-400 border-green-500/20' };
  }

  if (staleHeartbeat) {
    return { label: 'DESFASADO', tone: 'bg-red-500/10 text-red-400 border-red-500/20' };
  }

  if (hasTask) {
    return { label: 'TASK', tone: 'bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/20' };
  }

  return { label: 'META', tone: 'bg-[#8957E5]/10 text-[#D2A8FF] border-[#8957E5]/20' };
}

/**
 * Client-side helpers: detect swarm launches bound to a workspace and request termination.
 */

function readAgentRuns(storage) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

export function getSwarmSnapshotStorageKey(projectId) {
  return projectId ? `devhub_swarm_control_snapshot:${projectId}` : 'devhub_swarm_control_snapshot';
}

function getPanelIdsFromColumns(columns = []) {
  return columns.flatMap((column) => (column?.panels || []).map((panel) => panel.id));
}

function getPanelsFromColumns(columns = []) {
  return columns.flatMap((column) => column?.panels || []);
}

/**
 * Collect launch IDs associated with panels in a single workspace.
 * @param {object|null} workspace
 * @param {Storage|null} storage
 * @returns {string[]}
 */
export function collectSwarmLaunchIdsForWorkspace(workspace, storage) {
  const launchIds = new Set();
  const panelIds = new Set(getPanelIdsFromColumns(workspace?.columns || []));

  getPanelsFromColumns(workspace?.columns || []).forEach((panel) => {
    const fromContext = String(panel?.swarmContext?.launchId || '').trim();
    if (fromContext) launchIds.add(fromContext);
  });

  Object.entries(readAgentRuns(storage)).forEach(([taskId, run]) => {
    if (!run?.panelId || !panelIds.has(String(run.panelId))) return;
    if (run?.launchOrigin && run.launchOrigin !== 'swarm-control-launch') return;
    const launchId = String(run?.launchId || taskId.split(':')[0] || '').trim();
    if (launchId) launchIds.add(launchId);
  });

  return [...launchIds];
}

/**
 * Build terminate hints (panel + opencode ids) for a launch, optionally scoped to one workspace.
 * @param {Storage|null} storage
 * @param {string} launchId
 * @param {object[]} [workspaces]
 * @param {object|null} [scopeWorkspace]
 */
export function collectSwarmTerminateHints(
  storage,
  launchId,
  workspaces = [],
  scopeWorkspace = null
) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) {
    return { panel_ids: [], opencode_session_ids: [] };
  }

  const panelIds = new Set();
  const opencodeSessionIds = new Set();
  const scopedWorkspaces = scopeWorkspace ? [scopeWorkspace] : workspaces;

  try {
    const runs = readAgentRuns(storage);
    Object.entries(runs).forEach(([taskId, run]) => {
      const taskLaunchId = String(taskId || '').split(':')[0];
      if ((run?.launchId || taskLaunchId) !== normalizedLaunchId) return;
      if (scopeWorkspace) {
        const scopePanelIds = new Set(getPanelIdsFromColumns(scopeWorkspace?.columns || []));
        if (!scopePanelIds.has(String(run?.panelId || ''))) return;
      }
      if (run?.panelId) panelIds.add(String(run.panelId).trim());
      if (run?.opencodeSessionId) opencodeSessionIds.add(String(run.opencodeSessionId).trim());
    });
  } catch {
    // Ignore localStorage failures.
  }

  scopedWorkspaces.forEach((workspace) => {
    getPanelsFromColumns(workspace?.columns || []).forEach((panel) => {
      if (panel?.swarmContext?.launchId === normalizedLaunchId && panel?.id) {
        panelIds.add(String(panel.id).trim());
      }
    });
  });

  return {
    panel_ids: [...panelIds],
    opencode_session_ids: [...opencodeSessionIds],
  };
}

/**
 * POST terminate_swarm_local for a launch id.
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.launchId
 * @param {Storage|null} [params.storage]
 * @param {object[]} [params.workspaces]
 * @param {object|null} [params.scopeWorkspace]
 * @param {typeof fetch} [params.fetchImpl]
 */
export async function requestTerminateSwarmLaunch({
  projectId,
  launchId,
  storage = null,
  workspaces = [],
  scopeWorkspace = null,
  fetchImpl = fetch,
} = {}) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) {
    throw new Error('launch_id es requerido para terminar el swarm.');
  }

  const hints = collectSwarmTerminateHints(storage, normalizedLaunchId, workspaces, scopeWorkspace);
  const response = await fetchImpl('/api/agenthub/operations/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'terminate_swarm_local',
      project_id: projectId || null,
      launch_id: normalizedLaunchId,
      panel_ids: hints.panel_ids,
      opencode_session_ids: hints.opencode_session_ids,
      force_orphan_cleanup: true,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudo terminar el swarm.');
  }

  return payload;
}

/**
 * Terminate every swarm launch tied to a workspace (tmux, opencode, DB).
 * @param {object} params
 * @param {object} params.workspace
 * @param {string|null} [params.projectId]
 * @param {Storage|null} [params.storage]
 * @param {object[]} [params.workspaces]
 * @param {typeof fetch} [params.fetchImpl]
 */
export async function terminateSwarmLaunchesForWorkspace({
  workspace,
  projectId = null,
  storage = null,
  workspaces = [],
  fetchImpl = fetch,
} = {}) {
  const launchIds = collectSwarmLaunchIdsForWorkspace(workspace, storage);
  const results = [];

  for (const launchId of launchIds) {
    try {
      const payload = await requestTerminateSwarmLaunch({
        projectId,
        launchId,
        storage,
        workspaces,
        scopeWorkspace: workspace,
        fetchImpl,
      });
      results.push({ launchId, ok: true, payload });
    } catch (error) {
      results.push({ launchId, ok: false, error: error?.message || String(error) });
    }
  }

  if (projectId && storage && launchIds.length > 0) {
    try {
      storage.removeItem(getSwarmSnapshotStorageKey(projectId));
    } catch {
      /* ignore */
    }
  }

  return results;
}

/**
 * Dispatch terminal-session-closing for panels in terminate_result.
 * @param {object} payload
 */
export function dispatchTerminatePanelCloseEvents(payload) {
  const root = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!root?.dispatchEvent || typeof root.CustomEvent !== 'function') return;
  (payload?.terminate_result?.terminals?.attempted || []).forEach((panelId) => {
    root.dispatchEvent(
      new root.CustomEvent('devhub:terminal-session-closing', {
        detail: { panelId },
      })
    );
  });
}

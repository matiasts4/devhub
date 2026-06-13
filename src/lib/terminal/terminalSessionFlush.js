import { buildRestoreManifestFromWorkspaceState } from './startupRestoreCoordinator';
import {
  extractOpenCodeSessionId,
  normalizeWorkspacesOpenCodeCommands,
} from './restorePolicyResolver';
import { readTerminalRestorePreferences } from './restorePreferences';

export function resolveTerminalStorageKeys(projectId = null) {
  return {
    terminalStateKey: projectId ? `devhub_terminal_state:${projectId}` : 'devhub_terminal_state',
    restoreManifestKey: projectId ? `devhub_restore_manifest:${projectId}` : 'devhub_restore_manifest',
    legacyTerminalStateKey: 'devhub_terminal_state',
  };
}

export function buildCleanTerminalStatePayload({
  workspaces = [],
  activeWsId = null,
  activePanelIds = {},
  workspaceWindows = {},
  activeWindowIds = {},
} = {}) {
  const cleanWorkspaces = (workspaces || []).map((ws) => ({
    ...ws,
    columns: (ws?.columns || []).map((col) => ({
      ...col,
      panels: (col?.panels || []).map((panel) => ({
        id: panel.id,
        cwd: panel?.cwd || null,
        initialCommand: panel?.initialCommand || null,
      })),
    })),
  }));

  return {
    workspaces: cleanWorkspaces,
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
  };
}

function readAgentRunsRecord(storage) {
  if (!storage || typeof storage.getItem !== 'function') return {};

  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

function indexAgentRunsByPanel(runs = {}) {
  const indexed = {};

  Object.entries(runs || {}).forEach(([taskId, run]) => {
    const panelId = typeof run?.panelId === 'string' ? run.panelId.trim() : '';
    if (!panelId) return;

    const previous = indexed[panelId];
    const nextTimestamp = Number(run?.launchedAt) || 0;
    const previousTimestamp = Number(previous?.launchedAt) || 0;

    if (!previous || nextTimestamp >= previousTimestamp) {
      indexed[panelId] = { taskId, ...run };
    }
  });

  return indexed;
}

/**
 * Copies OpenCode session ids from panels into devhub_agent_runs so reboot restore
 * does not depend on a pending React state flush.
 */
export function syncAgentRunsFromWorkspacePanels(storage, workspaces = [], { agentRuns = null } = {}) {
  if (!storage || typeof storage.setItem !== 'function') return false;

  const runs = agentRuns || readAgentRunsRecord(storage);
  let changed = false;

  (workspaces || []).forEach((workspace) => {
    (workspace?.columns || []).forEach((column) => {
      (column?.panels || []).forEach((panel) => {
        const panelId = panel?.id;
        if (!panelId) return;

        const sessionId =
          extractOpenCodeSessionId(panel?.initialCommand) ||
          indexAgentRunsByPanel(runs)[panelId]?.opencodeSessionId ||
          null;

        if (!sessionId) return;

        Object.entries(runs).forEach(([taskId, run]) => {
          if (run?.panelId !== panelId) return;
          if (run?.opencodeSessionId === sessionId) return;

          runs[taskId] = { ...run, opencodeSessionId: sessionId };
          changed = true;
        });
      });
    });
  });

  if (!changed) return false;

  try {
    storage.setItem('devhub_agent_runs', JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous persistence for abrupt app/OS shutdown (beforeunload / pagehide).
 */
export function flushTerminalSessionPersistence(
  storage,
  {
    workspaces = [],
    activeWsId = null,
    activePanelIds = {},
    workspaceWindows = {},
    activeWindowIds = {},
    projectId = null,
    appSessionId = null,
    agentRunsByPanel = null,
  } = {}
) {
  if (!storage || typeof storage.setItem !== 'function') return false;

  const keys = resolveTerminalStorageKeys(projectId);
  const runsRecord = readAgentRunsRecord(storage);
  const indexedRuns =
    agentRunsByPanel && typeof agentRunsByPanel === 'object'
      ? agentRunsByPanel
      : indexAgentRunsByPanel(runsRecord);

  const normalizedWorkspaces = normalizeWorkspacesOpenCodeCommands(workspaces, indexedRuns);
  syncAgentRunsFromWorkspacePanels(storage, normalizedWorkspaces, { agentRuns: runsRecord });

  const refreshedRuns = readAgentRunsRecord(storage);
  const refreshedIndex = indexAgentRunsByPanel(refreshedRuns);
  const payload = buildCleanTerminalStatePayload({
    workspaces: normalizeWorkspacesOpenCodeCommands(normalizedWorkspaces, refreshedIndex),
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
  });

  try {
    const serialized = JSON.stringify(payload);
    storage.setItem(keys.terminalStateKey, serialized);
    if (keys.terminalStateKey !== keys.legacyTerminalStateKey) {
      storage.setItem(keys.legacyTerminalStateKey, serialized);
    }

    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: payload.workspaces,
      activeWorkspaceId: activeWsId,
      projectId,
      appSessionId: appSessionId || `flush-${Date.now()}`,
      agentRunsByPanel: refreshedIndex,
      restorePreferences: readTerminalRestorePreferences(storage),
    });
    storage.setItem(keys.restoreManifestKey, JSON.stringify(manifest));

    return true;
  } catch {
    return false;
  }
}
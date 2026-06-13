import {
  inferPanelSessionKind,
  resolveEffectiveRestorePolicy,
} from './restorePolicyResolver';
import { readTerminalRestorePreferences } from './restorePreferences';

function readRunsRecord(storage) {
  if (!storage || typeof storage.getItem !== 'function') return {};
  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

function writeRunsRecord(storage, runs) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem('devhub_agent_runs', JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures devhub_agent_runs has a durable OpenCode entry for a panel, even when
 * the panel was opened without a prior swarm/task run record.
 */
export function upsertOpenCodeAgentRunForPanel(
  storage,
  { panelId, sessionId, restorePreferences = null } = {}
) {
  const normalizedPanelId = typeof panelId === 'string' ? panelId.trim() : '';
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalizedPanelId || !normalizedSessionId) {
    return { changed: false, taskId: null, runs: readRunsRecord(storage) };
  }

  const runs = readRunsRecord(storage);
  const prefs = restorePreferences || readTerminalRestorePreferences(storage);
  const defaultRestorePolicy = resolveEffectiveRestorePolicy({
    sessionKind: 'opencode',
    perSessionPolicy: null,
    preferences: prefs,
  });

  const existingEntry = Object.entries(runs).find(
    ([, run]) => run?.panelId === normalizedPanelId
  );

  if (existingEntry) {
    const [taskId, run] = existingEntry;
    if (run?.opencodeSessionId === normalizedSessionId) {
      return { changed: false, taskId, runs };
    }
    runs[taskId] = {
      ...run,
      opencodeSessionId: normalizedSessionId,
      restorePolicy: run?.restorePolicy || defaultRestorePolicy,
    };
    writeRunsRecord(storage, runs);
    return { changed: true, taskId, runs };
  }

  const taskId = `oc-panel-${normalizedPanelId}`;
  runs[taskId] = {
    panelId: normalizedPanelId,
    opencodeSessionId: normalizedSessionId,
    runId: taskId,
    restorePolicy: defaultRestorePolicy,
    launchedAt: Date.now(),
    launchOrigin: 'opencode-session-detected',
  };
  writeRunsRecord(storage, runs);
  return { changed: true, taskId, runs };
}

export function applyOpenCodeSessionToWorkspaces(workspaces = [], panelId, sessionId) {
  const normalizedPanelId = typeof panelId === 'string' ? panelId.trim() : '';
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalizedPanelId || !normalizedSessionId || !Array.isArray(workspaces)) {
    return { workspaces, changed: false };
  }

  const nextCommand = `opencode --session ${normalizedSessionId}`;
  let changed = false;

  const nextWorkspaces = workspaces.map((workspace) => ({
    ...workspace,
    columns: (workspace?.columns || []).map((column) => ({
      ...column,
      panels: (column?.panels || []).map((panel) => {
        if (panel?.id !== normalizedPanelId) return panel;
        if (panel?.initialCommand === nextCommand) return panel;
        changed = true;
        return { ...panel, initialCommand: nextCommand };
      }),
    })),
  }));

  return { workspaces: changed ? nextWorkspaces : workspaces, changed };
}

export function persistOpenCodeSessionDetection(
  storage,
  {
    panelId,
    sessionId,
    workspaces = [],
    restorePreferences = null,
  } = {}
) {
  const runResult = upsertOpenCodeAgentRunForPanel(storage, {
    panelId,
    sessionId,
    restorePreferences,
  });
  const workspaceResult = applyOpenCodeSessionToWorkspaces(workspaces, panelId, sessionId);

  return {
    changed: runResult.changed || workspaceResult.changed,
    taskId: runResult.taskId,
    runs: runResult.runs,
    workspaces: workspaceResult.workspaces,
    sessionKind: inferPanelSessionKind({
      initialCommand: `opencode --session ${sessionId}`,
      agentRun: runResult.runs?.[runResult.taskId] || null,
    }),
  };
}
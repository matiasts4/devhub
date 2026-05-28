import { normalizeRestoreManifest } from './restoreManifest';

export const RESTORE_ACTION = Object.freeze({
  RESTORE_READY: 'restore-ready',
  REATTACH_LIVE_TERMINAL: 'reattach-live-terminal',
  RESUME_OPENCODE_SESSION: 'resume-opencode-session',
  PROCESS_ORPHAN: 'process-orphan',
  METADATA_STALE: 'metadata-stale',
  QUOTA_BLOCKED: 'quota-blocked',
  TERMINATED: 'terminated',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function actionKey(entry = {}) {
  return [entry.action, entry.terminalId || '', entry.panelId || '', entry.opencodeSessionId || ''].join(':');
}

function createAction({
  action,
  terminalId = null,
  panelId = null,
  workspaceId = null,
  opencodeSessionId = null,
  reason = null,
} = {}) {
  return {
    action,
    terminalId,
    panelId,
    workspaceId,
    opencodeSessionId,
    reason,
  };
}

function indexByKey(records = [], keyName) {
  return new Map(
    asArray(records)
      .filter((record) => record && record[keyName])
      .map((record) => [record[keyName], record])
  );
}

function collectWorkspacePanels(workspaces = []) {
  return asArray(workspaces).flatMap((workspace) =>
    asArray(workspace?.columns).flatMap((column) =>
      asArray(column?.panels).map((panel) => ({ workspace, panel }))
    )
  );
}

export function buildRestoreManifestFromWorkspaceState({
  workspaces = [],
  activeWorkspaceId = null,
  projectId = null,
  appSessionId = null,
  agentRunsByPanel = {},
} = {}) {
  const panelEntries = collectWorkspacePanels(workspaces);

  const terminalSessions = panelEntries
    .map(({ workspace, panel }) => {
      if (!panel?.id) return null;

      const initialCommand = String(panel.initialCommand || '').trim();
      const opencodeMatch = initialCommand.match(/opencode\s+--session\s+([\w-]+)/i);
      const agentRun = panel?.id ? agentRunsByPanel?.[panel.id] || null : null;

      return {
        terminalId: panel.id,
        panelId: panel.id,
        workspaceId: workspace?.id || null,
        cwd: panel?.cwd || null,
        opencodeSessionId: agentRun?.opencodeSessionId || opencodeMatch?.[1] || null,
        runId: agentRun?.runId || null,
        launchId: agentRun?.launchId || null,
        missionId: agentRun?.missionId || null,
      };
    })
    .filter(Boolean);

  const swarmRuns = Object.values(agentRunsByPanel || {})
    .map((run) => {
      const runId = typeof run?.runId === 'string' && run.runId.trim() ? run.runId.trim() : null;
      if (!runId) return null;

      return {
        runId,
        launchId:
          typeof run?.launchId === 'string' && run.launchId.trim() ? run.launchId.trim() : null,
        missionId:
          typeof run?.missionId === 'string' && run.missionId.trim()
            ? run.missionId.trim()
            : null,
        agentId:
          typeof run?.agentId === 'string' && run.agentId.trim() ? run.agentId.trim() : null,
        role:
          typeof run?.swarmRole === 'string' && run.swarmRole.trim()
            ? run.swarmRole.trim()
            : null,
        panelId:
          typeof run?.panelId === 'string' && run.panelId.trim() ? run.panelId.trim() : null,
        terminalId:
          typeof run?.panelId === 'string' && run.panelId.trim() ? run.panelId.trim() : null,
        pid: Number.isFinite(run?.pid) ? Number(run.pid) : null,
        status:
          typeof run?.status === 'string' && run.status.trim() ? run.status.trim() : 'unknown',
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  return normalizeRestoreManifest({
    appSessionId,
    activeProjectId: projectId,
    activeWorkspaceId: activeWorkspaceId,
    workspaces: asArray(workspaces).map((workspace) => ({
      workspaceId: workspace?.id || null,
      name: workspace?.name || null,
      tabs: [],
      layout: { columns: asArray(workspace?.columns).length },
      activePanelId: null,
    })),
    terminalSessions,
    swarmRuns,
  });
}

export function buildStartupRestorePlan({ manifest = null, runtimeSnapshot = null } = {}) {
  const normalizedManifest = normalizeRestoreManifest(manifest);
  const terminals = asArray(runtimeSnapshot?.terminals);
  const processes = asArray(runtimeSnapshot?.processes);
  const anomalies = runtimeSnapshot?.anomalies || {};

  const terminalById = indexByKey(terminals, 'terminalId');
  const processBySessionId = indexByKey(processes, 'sessionId');
  const dedupe = new Set();
  const actions = [];

  normalizedManifest.terminalSessions.forEach((session) => {
    const runtimeTerminal = terminalById.get(session.terminalId);
    const runtimeProcess = session.opencodeSessionId
      ? processBySessionId.get(session.opencodeSessionId)
      : null;

    let nextAction = null;

    if (anomalies.quotaBlocked) {
      nextAction = createAction({
        action: RESTORE_ACTION.QUOTA_BLOCKED,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'runtime-quota-blocked',
      });
    } else if (runtimeTerminal?.alive && Number(runtimeTerminal.socketCount || 0) === 0) {
      nextAction = createAction({
        action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'alive-without-sockets',
      });
    } else if (runtimeProcess && !runtimeTerminal) {
      nextAction = createAction({
        action: RESTORE_ACTION.PROCESS_ORPHAN,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'process-without-terminal',
      });
    } else if (!runtimeTerminal && session.opencodeSessionId) {
      nextAction = createAction({
        action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'session-resume-needed',
      });
    } else if (runtimeTerminal?.alive) {
      nextAction = createAction({
        action: RESTORE_ACTION.RESTORE_READY,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'terminal-already-live',
      });
    } else {
      nextAction = createAction({
        action: RESTORE_ACTION.TERMINATED,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'no-runtime-evidence',
      });
    }

    const key = actionKey(nextAction);
    if (dedupe.has(key)) return;
    dedupe.add(key);
    actions.push(nextAction);
  });

  return {
    generatedAt: new Date().toISOString(),
    actions,
  };
}

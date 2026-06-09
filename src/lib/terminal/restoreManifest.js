export const RESTORE_MANIFEST_VERSION = 1;

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeIsoTimestamp(value) {
  const candidate = asString(value);
  if (!candidate) return new Date().toISOString();
  const parsed = new Date(candidate).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeWorkspaceRecord(record = null) {
  if (!record || typeof record !== 'object') return null;
  const workspaceId = asString(record.workspaceId || record.id);
  if (!workspaceId) return null;

  // Derive workspace_label from swarm metadata
  const workspaceLabel =
    record.workspace_label ||
    (record.swarmRole ? `swarm-${record.swarmRole}` : null) ||
    (record.swarmId ? `swarm-${record.swarmId}` : null) ||
    null;

  return {
    workspaceId,
    name: asString(record.name),
    workspace_label: workspaceLabel,
    tabs: asArray(record.tabs).filter((tab) => typeof tab === 'string'),
    layout: record.layout && typeof record.layout === 'object' ? record.layout : null,
    activePanelId: asString(record.activePanelId),
  };
}

function normalizeTerminalSessionRecord(record = null) {
  if (!record || typeof record !== 'object') return null;
  const terminalId = asString(record.terminalId || record.id);
  if (!terminalId) return null;

  return {
    terminalId,
    panelId: asString(record.panelId),
    workspaceId: asString(record.workspaceId),
    cwd: asString(record.cwd),
    rendererRequested: asString(record.rendererRequested),
    rendererEffective: asString(record.rendererEffective),
    opencodeSessionId: asString(record.opencodeSessionId),
    sessionType: asString(record.sessionType),
    initialCommand: asString(record.initialCommand),
    runId: asString(record.runId),
    launchId: asString(record.launchId),
    missionId: asString(record.missionId),
    lastDisconnectReason: asString(record.lastDisconnectReason),
    restorePolicy: asString(record.restorePolicy),
    sessionKind: asString(record.sessionKind),
    roleKey: asString(record.roleKey),
  };
}

function normalizeSwarmRunRecord(record = null) {
  if (!record || typeof record !== 'object') return null;
  const runId = asString(record.runId);
  if (!runId) return null;

  return {
    runId,
    launchId: asString(record.launchId),
    missionId: asString(record.missionId),
    agentId: asString(record.agentId),
    role: asString(record.role),
    panelId: asString(record.panelId),
    terminalId: asString(record.terminalId),
    pid: Number.isFinite(record.pid) ? record.pid : null,
    status: asString(record.status),
    updatedAt: safeIsoTimestamp(record.updatedAt),
  };
}

function dedupeByKey(records = [], getKey) {
  const deduped = [];
  const seen = new Set();

  records.forEach((record) => {
    const key = getKey(record);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(record);
  });

  return deduped;
}

export function createDefaultRestoreManifest({
  appSessionId = null,
  projectId = null,
  workspaceId = null,
} = {}) {
  return {
    version: RESTORE_MANIFEST_VERSION,
    savedAt: new Date().toISOString(),
    appSessionId: asString(appSessionId),
    activeProjectId: asString(projectId),
    activeWorkspaceId: asString(workspaceId),
    workspaces: [],
    terminalSessions: [],
    swarmRuns: [],
  };
}

export function normalizeRestoreManifest(input = null) {
  const base = createDefaultRestoreManifest({
    appSessionId: input?.appSessionId,
    projectId: input?.activeProjectId,
    workspaceId: input?.activeWorkspaceId,
  });

  const normalizedWorkspaces = dedupeByKey(
    asArray(input?.workspaces).map(normalizeWorkspaceRecord).filter(Boolean),
    (record) => record.workspaceId
  );

  const normalizedTerminalSessions = dedupeByKey(
    asArray(input?.terminalSessions).map(normalizeTerminalSessionRecord).filter(Boolean),
    (record) => record.terminalId
  );

  const normalizedSwarmRuns = dedupeByKey(
    asArray(input?.swarmRuns).map(normalizeSwarmRunRecord).filter(Boolean),
    (record) => record.runId
  );

  return {
    ...base,
    savedAt: safeIsoTimestamp(input?.savedAt),
    workspaces: normalizedWorkspaces,
    terminalSessions: normalizedTerminalSessions,
    swarmRuns: normalizedSwarmRuns,
  };
}

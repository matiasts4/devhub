import { isOrchestratorRoleKey } from '@/lib/operations/swarmControl';

export const SWARM_SPAWN_STRATEGY_AUTOMATIC = 'automatic';
export const SWARM_SPAWN_STRATEGY_LAZY = 'lazy-on-demand';

export function isLazyOnDemandSpawnStrategy(spawnStrategy = '') {
  return String(spawnStrategy || '').trim() === SWARM_SPAWN_STRATEGY_LAZY;
}

/**
 * Lazy spawn: only orchestrator panels mount at launch; workers provision on demand.
 */
export function partitionRuntimeRequestsForSpawnStrategy(runtimeRequests = [], spawnStrategy = '') {
  const requests = Array.isArray(runtimeRequests) ? runtimeRequests : [];
  if (!isLazyOnDemandSpawnStrategy(spawnStrategy)) {
    return { materialized: requests, deferred: [] };
  }

  const materialized = [];
  const deferred = [];
  for (const request of requests) {
    if (isOrchestratorRoleKey(request?.roleKey)) {
      materialized.push(request);
    } else {
      deferred.push(request);
    }
  }
  return { materialized, deferred };
}

export function findDirectorPanelInColumns(columns = []) {
  for (const column of columns) {
    for (const panel of column?.panels || []) {
      if (isOrchestratorRoleKey(panel?.swarmContext?.roleKey)) {
        return panel;
      }
    }
  }
  return null;
}

export function findSwarmWorkspaceByLaunchId(workspaces = [], launchId = '') {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) return null;

  return (
    workspaces.find((workspace) => {
      if (String(workspace?.swarmLaunchId || '').trim() === normalizedLaunchId) {
        return true;
      }
      return (workspace?.columns || []).some((column) =>
        (column?.panels || []).some(
          (panel) => String(panel?.swarmContext?.launchId || '').trim() === normalizedLaunchId
        )
      );
    }) || null
  );
}

export function resolveDirectorColumnIndex(columns = [], directorPanelId = null) {
  if (!Array.isArray(columns) || columns.length === 0) return -1;

  if (directorPanelId) {
    const byId = columns.findIndex((column) =>
      (column?.panels || []).some((panel) => panel.id === directorPanelId)
    );
    if (byId >= 0) return byId;
  }

  const byRole = columns.findIndex((column) =>
    (column?.panels || []).some((panel) => isOrchestratorRoleKey(panel?.swarmContext?.roleKey))
  );
  if (byRole >= 0) return byRole;

  return columns.length - 1;
}

/**
 * Growing grid (option B): workers stack in the left column; ZED stays in the right column.
 * Launch starts as a single ZED column; the first worker adds a left workers column.
 */
export function insertWorkerPanelIntoGrowingSwarmColumns(
  columns = [],
  workerPanel,
  directorPanelId = null
) {
  if (!workerPanel) return columns;

  const safeColumns = (columns || []).map((column) => ({
    ...column,
    panels: [...(column?.panels || [])],
  }));

  if (safeColumns.length === 0) {
    return [{ id: 'c_workers', panels: [workerPanel] }];
  }

  const directorColIndex = resolveDirectorColumnIndex(safeColumns, directorPanelId);

  if (safeColumns.length === 1) {
    const directorColumn = safeColumns[directorColIndex] || safeColumns[0];
    return [
      { id: 'c_workers', panels: [workerPanel] },
      { ...directorColumn, panels: [...(directorColumn.panels || [])] },
    ];
  }

  const workersColIndex = directorColIndex <= 0 ? 1 : 0;
  return safeColumns.map((column, index) => {
    if (index !== workersColIndex) return column;
    return {
      ...column,
      panels: [...(column.panels || []), workerPanel],
    };
  });
}

export function buildProvisionedWorkerKey(launchId = '', roleKey = '') {
  return `${String(launchId || '').trim()}:${String(roleKey || '').trim()}`;
}

export function appendPendingUiProvision(metadata = {}, runtimeRequest = {}) {
  const launchId = String(runtimeRequest?.launchId || metadata?.launchId || '').trim();
  const roleKey = String(runtimeRequest?.roleKey || '').trim();
  if (!launchId || !roleKey) return metadata;

  const provisionedRoleKeys = Array.isArray(metadata.provisionedRoleKeys)
    ? [...metadata.provisionedRoleKeys]
    : [];
  if (!provisionedRoleKeys.includes(roleKey)) {
    provisionedRoleKeys.push(roleKey);
  }

  const pendingUiProvisions = Array.isArray(metadata.pendingUiProvisions)
    ? metadata.pendingUiProvisions.filter((entry) => entry?.roleKey !== roleKey)
    : [];

  pendingUiProvisions.push({
    launchId,
    roleKey,
    runtimeRequest,
    requestedAt: new Date().toISOString(),
  });

  return {
    ...metadata,
    launchId: metadata.launchId || launchId,
    provisionedRoleKeys,
    pendingUiProvisions,
  };
}

/**
 * Eager provisioning at launch: pre-seed pendingUiProvisions for the roles
 * the operator picked in the wizard, so the UI materializes their panels in
 * parallel with the orchestrator instead of waiting for the LLM orchestrator
 * to discover and call provision_swarm_worker (~5 min on first contact).
 * Roles not present in the deferred roster are skipped (non-lazy strategies
 * materialize every role at launch anyway, so nothing is needed there).
 */
export function buildEagerUiProvisions({
  launchId = '',
  provisionRoleKeys = [],
  deferredRuntimeRequests = [],
} = {}) {
  const deferred = Array.isArray(deferredRuntimeRequests) ? deferredRuntimeRequests : [];
  const requested = Array.isArray(provisionRoleKeys) ? provisionRoleKeys : [];
  let metadata = {
    launchId: String(launchId || '').trim(),
    provisionedRoleKeys: [],
    pendingUiProvisions: [],
  };
  const skippedRoleKeys = [];
  for (const rawKey of requested) {
    const roleKey = String(rawKey || '').trim();
    if (!roleKey) continue;
    const request = deferred.find((entry) => String(entry?.roleKey || '').trim() === roleKey);
    if (!request) {
      skippedRoleKeys.push(roleKey);
      continue;
    }
    metadata = appendPendingUiProvision(metadata, request);
  }
  return { metadata, skippedRoleKeys };
}

export function consumePendingUiProvision(metadata = {}, launchId = '', roleKey = '') {  const normalizedLaunchId = String(launchId || '').trim();
  const normalizedRoleKey = String(roleKey || '').trim();
  const pendingUiProvisions = Array.isArray(metadata.pendingUiProvisions)
    ? metadata.pendingUiProvisions.filter(
        (entry) =>
          !(
            String(entry?.launchId || '').trim() === normalizedLaunchId &&
            String(entry?.roleKey || '').trim() === normalizedRoleKey
          )
      )
    : [];

  return {
    ...metadata,
    pendingUiProvisions,
  };
}

export function extractPendingUiProvisionsFromLaunchTraces(traces = []) {
  const pending = [];
  for (const trace of traces) {
    const metadata = trace?.metadata || {};
    const entries = Array.isArray(metadata.pendingUiProvisions) ? metadata.pendingUiProvisions : [];
    for (const entry of entries) {
      if (entry?.runtimeRequest) pending.push(entry);
    }
  }
  return pending;
}

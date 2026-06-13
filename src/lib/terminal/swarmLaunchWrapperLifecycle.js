/**
 * Tracks which swarm launch wrappers were already dispatched to tmux panels.
 * Survives app restarts — prevents re-sending `bash /tmp/devhub-launch-*.sh`.
 */

const STORAGE_KEY = 'devhub_swarm_launch_wrapper_dispatched';

function normalizeLaunchId(launchId) {
  return String(launchId || '').trim();
}

function normalizeRoleKey(roleKey) {
  return String(roleKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildSwarmLaunchWrapperDispatchKey(launchId, roleKey) {
  const id = normalizeLaunchId(launchId);
  const role = normalizeRoleKey(roleKey);
  if (!id || !role) return null;
  return `${id}:${role}`;
}

export function isSwarmLaunchWrapperCommand(command) {
  const normalized = String(command || '').trim();
  return /^bash\s+\/tmp\/devhub-launch-/i.test(normalized);
}

function readDispatchMap(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDispatchMap(storage, map) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function markSwarmLaunchWrapperDispatched(
  { launchId, roleKey, panelId = null } = {},
  storage = null
) {
  const key = buildSwarmLaunchWrapperDispatchKey(launchId, roleKey);
  if (!key || !storage) return;
  const map = readDispatchMap(storage);
  map[key] = {
    launchId: normalizeLaunchId(launchId),
    roleKey: normalizeRoleKey(roleKey),
    panelId: panelId ? String(panelId) : null,
    at: Date.now(),
  };
  writeDispatchMap(storage, map);
}

export function isSwarmLaunchWrapperDispatched({ launchId, roleKey } = {}, storage = null) {
  const key = buildSwarmLaunchWrapperDispatchKey(launchId, roleKey);
  if (!key || !storage) return false;
  return Boolean(readDispatchMap(storage)[key]);
}

/**
 * After localStorage workspace restore, clear needsLaunchWrapper when wrapper already ran.
 * @param {object[]} workspaces
 * @param {Storage|null} storage
 * @returns {object[]}
 */
export function hydrateSwarmLaunchWrapperFlags(workspaces = [], storage = null) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return workspaces;
  const map = readDispatchMap(storage);
  if (Object.keys(map).length === 0) return workspaces;

  return workspaces.map((workspace) => ({
    ...workspace,
    columns: (workspace.columns || []).map((column) => ({
      ...column,
      panels: (column.panels || []).map((panel) => {
        const launchId = panel?.swarmContext?.launchId;
        const roleKey = panel?.swarmContext?.roleKey;
        const key = buildSwarmLaunchWrapperDispatchKey(launchId, roleKey);
        if (!key || !map[key] || panel?.swarmContext?.needsLaunchWrapper !== true) {
          return panel;
        }
        return {
          ...panel,
          swarmContext: {
            ...panel.swarmContext,
            needsLaunchWrapper: false,
          },
        };
      }),
    })),
  }));
}

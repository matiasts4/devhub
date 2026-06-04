export const TERMINAL_RENDERER_PREFERENCE_VERSION = 1;
export const TERMINAL_RENDERER_INHERIT_MODE = 'inherit';
export const TERMINAL_RENDERER_DEFAULT_MODE = 'vte-experimental';
export const TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY = 'devhub_terminal_renderer_default_mode';

const VALID_RENDERER_MODES = new Set(['xterm', 'vte-experimental', 'canvas']);
const VALID_PANEL_MODES = new Set([TERMINAL_RENDERER_INHERIT_MODE, ...VALID_RENDERER_MODES]);

function normalizeRendererMode(mode, fallback = TERMINAL_RENDERER_DEFAULT_MODE) {
  if (mode === 'ghostty-experimental') return 'xterm';
  return VALID_RENDERER_MODES.has(mode) ? mode : fallback;
}

function normalizePanelRendererMode(mode) {
  if (mode === TERMINAL_RENDERER_INHERIT_MODE) return TERMINAL_RENDERER_INHERIT_MODE;
  return normalizeRendererMode(mode, null);
}

export function createDefaultTerminalRendererPreferences(defaultMode = TERMINAL_RENDERER_DEFAULT_MODE) {
  return {
    version: TERMINAL_RENDERER_PREFERENCE_VERSION,
    defaultMode: normalizeRendererMode(defaultMode),
    workspaces: {},
  };
}

export function getTerminalRendererPreferencesStorageKey(projectId) {
  return projectId
    ? `devhub_terminal_renderer_preferences:${projectId}`
    : 'devhub_terminal_renderer_preferences';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readTerminalRendererDefaultModeSetting(storage) {
  if (!storage || typeof storage.getItem !== 'function') return TERMINAL_RENDERER_DEFAULT_MODE;

  try {
    return normalizeRendererMode(storage.getItem(TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY));
  } catch {
    return TERMINAL_RENDERER_DEFAULT_MODE;
  }
}

export function writeTerminalRendererDefaultModeSetting(storage, mode) {
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY, normalizeRendererMode(mode));
}

function sanitizeWorkspaceRendererPreference(workspacePreference, panelIds, fallbackDefaultMode) {
  const safeDefaultMode = normalizeRendererMode(workspacePreference?.defaultMode, fallbackDefaultMode);

  const safePanels = panelIds.reduce((accumulator, panelId) => {
    const requestedMode = normalizePanelRendererMode(workspacePreference?.panels?.[panelId]);
    if (!requestedMode || !VALID_PANEL_MODES.has(requestedMode)) {
      return accumulator;
    }
    accumulator[panelId] = requestedMode;
    return accumulator;
  }, {});

  return {
    defaultMode: safeDefaultMode,
    panels: safePanels,
  };
}

export function sanitizeTerminalRendererPreferences(rawValue, { workspaces = [] } = {}) {
  const fallbackDefaultMode = normalizeRendererMode(rawValue?.defaultMode);
  const fallback = createDefaultTerminalRendererPreferences(fallbackDefaultMode);
  if (!isPlainObject(rawValue)) return fallback;

  const nextWorkspaces = workspaces.reduce((accumulator, workspace) => {
    if (!workspace?.id) return accumulator;
    const panelIds = (workspace.columns || []).flatMap((column) => column?.panels || []).map((panel) => panel?.id).filter(Boolean);
    const sanitized = sanitizeWorkspaceRendererPreference(
      rawValue.workspaces?.[workspace.id],
      panelIds,
      fallbackDefaultMode
    );
    if (sanitized.defaultMode !== fallbackDefaultMode || Object.keys(sanitized.panels).length > 0) {
      accumulator[workspace.id] = sanitized;
    }
    return accumulator;
  }, {});

  return {
    version: TERMINAL_RENDERER_PREFERENCE_VERSION,
    defaultMode: fallbackDefaultMode,
    workspaces: nextWorkspaces,
  };
}

export function readTerminalRendererPreferences(storage, projectId, workspaces = []) {
  const fallbackDefaultMode = readTerminalRendererDefaultModeSetting(storage);
  const fallback = createDefaultTerminalRendererPreferences(fallbackDefaultMode);
  if (!storage || typeof storage.getItem !== 'function') return fallback;

  try {
    const scopedKey = getTerminalRendererPreferencesStorageKey(projectId);
    const rawValue = storage.getItem(scopedKey) || storage.getItem('devhub_terminal_renderer_preferences');
    if (!rawValue) return fallback;
    return {
      ...sanitizeTerminalRendererPreferences(JSON.parse(rawValue), { workspaces }),
      defaultMode: fallbackDefaultMode,
    };
  } catch {
    return fallback;
  }
}

export function writeTerminalRendererPreferences(storage, projectId, prefs, workspaces = []) {
  if (!storage || typeof storage.setItem !== 'function') return;
  const sanitized = sanitizeTerminalRendererPreferences(prefs, { workspaces });
  storage.setItem(getTerminalRendererPreferencesStorageKey(projectId), JSON.stringify(sanitized));
}

export function resolveRequestedRenderer({ workspaceId, panelId, prefs }) {
  const workspacePreference = prefs?.workspaces?.[workspaceId];
  if (!workspacePreference) return normalizeRendererMode(prefs?.defaultMode);

  const panelMode = workspacePreference.panels?.[panelId];
  // Panel override wins unless it explicitly inherits the workspace baseline.
  if (panelMode && panelMode !== TERMINAL_RENDERER_INHERIT_MODE) {
    return normalizeRendererMode(panelMode);
  }

  return normalizeRendererMode(workspacePreference.defaultMode, normalizeRendererMode(prefs?.defaultMode));
}

export function getPanelRendererPreferenceMode({ workspaceId, panelId, prefs }) {
  const workspacePreference = prefs?.workspaces?.[workspaceId];
  const panelMode = workspacePreference?.panels?.[panelId];

  return VALID_PANEL_MODES.has(panelMode) ? panelMode : TERMINAL_RENDERER_INHERIT_MODE;
}

export function setWorkspaceDefaultRenderer(prefs, workspaceId, mode) {
  const nextMode = normalizeRendererMode(mode, normalizeRendererMode(prefs?.defaultMode));
  return {
    ...prefs,
    workspaces: {
      ...prefs.workspaces,
      [workspaceId]: {
        defaultMode: nextMode,
        panels: {
          ...(prefs.workspaces?.[workspaceId]?.panels || {}),
        },
      },
    },
  };
}

export function setPanelRendererPreference(prefs, workspaceId, panelId, mode) {
  const nextMode = normalizePanelRendererMode(mode) || TERMINAL_RENDERER_INHERIT_MODE;
  return {
    ...prefs,
    workspaces: {
      ...prefs.workspaces,
      [workspaceId]: {
        defaultMode:
          prefs.workspaces?.[workspaceId]?.defaultMode || normalizeRendererMode(prefs?.defaultMode),
        panels: {
          ...(prefs.workspaces?.[workspaceId]?.panels || {}),
          [panelId]: nextMode,
        },
      },
    },
  };
}

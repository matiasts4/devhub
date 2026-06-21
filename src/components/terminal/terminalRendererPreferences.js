export const TERMINAL_RENDERER_PREFERENCE_VERSION = 1;
export const TERMINAL_RENDERER_INHERIT_MODE = 'inherit';
export const TERMINAL_RENDERER_DEFAULT_MODE = 'xterm-webgl';
export const TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY = 'devhub_terminal_renderer_default_mode';

/** WebKitGTK in the packaged Tauri app often crashes on xterm-addon-webgl. */
export function shouldAvoidWebglOnThisRuntime() {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /linux/i.test(ua);
}

export function getRuntimeDefaultTerminalRendererMode() {
  return shouldAvoidWebglOnThisRuntime() ? 'xterm' : TERMINAL_RENDERER_DEFAULT_MODE;
}

function demoteWebglForTauriLinux(mode) {
  if (mode === 'xterm-webgl' && shouldAvoidWebglOnThisRuntime()) return 'xterm';
  return mode;
}

// VTE (vte-experimental / GTK) is disabled as a selectable/usable renderer.
// Code and packages remain in place for reference / future re-enable, but
// no UI surfaces offer it and resolution never activates the VTE paths.
export const LEGACY_VTE_ENABLED = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

// Renderer switcher (the per-panel header control that lets users pick
// xterm-webgl vs xterm etc.) is hidden/disabled per request.
// The full component, logic, preferences, and resolution remain in the
// codebase. We simply do not render the UI element.
export const SHOW_RENDERER_SWITCH = false;

const ACTIVE_RENDERER_MODES = LEGACY_VTE_ENABLED
  ? ['xterm', 'vte-experimental', 'xterm-webgl', 'canvas']
  : ['xterm', 'xterm-webgl', 'canvas'];

const VALID_RENDERER_MODES = new Set([...ACTIVE_RENDERER_MODES, 'vte-experimental']);
const VALID_PANEL_MODES = new Set([
  TERMINAL_RENDERER_INHERIT_MODE,
  ...ACTIVE_RENDERER_MODES,
  'vte-experimental',
]);

function normalizeRendererMode(mode, fallback = TERMINAL_RENDERER_DEFAULT_MODE) {
  if (mode === 'ghostty-experimental') return 'xterm';
  if (mode === 'vte-experimental') return 'vte-experimental';
  return VALID_RENDERER_MODES.has(mode) ? mode : fallback;
}

function normalizePanelRendererMode(mode) {
  if (mode === TERMINAL_RENDERER_INHERIT_MODE) return TERMINAL_RENDERER_INHERIT_MODE;
  return normalizeRendererMode(mode, null);
}

export function createDefaultTerminalRendererPreferences(
  defaultMode = TERMINAL_RENDERER_DEFAULT_MODE
) {
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
  const runtimeDefault = getRuntimeDefaultTerminalRendererMode();
  if (!storage || typeof storage.getItem !== 'function') return runtimeDefault;

  try {
    return demoteWebglForTauriLinux(
      normalizeRendererMode(storage.getItem(TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY), runtimeDefault)
    );
  } catch {
    return runtimeDefault;
  }
}

export function writeTerminalRendererDefaultModeSetting(storage, mode) {
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(TERMINAL_RENDERER_DEFAULT_MODE_STORAGE_KEY, normalizeRendererMode(mode));
}

function sanitizeWorkspaceRendererPreference(workspacePreference, panelIds, fallbackDefaultMode) {
  const safeDefaultMode = normalizeRendererMode(
    workspacePreference?.defaultMode,
    fallbackDefaultMode
  );

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
    const panelIds = (workspace.columns || [])
      .flatMap((column) => column?.panels || [])
      .map((panel) => panel?.id)
      .filter(Boolean);
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
    const rawValue =
      storage.getItem(scopedKey) || storage.getItem('devhub_terminal_renderer_preferences');
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
  const demote = (mode) => demoteWebglForTauriLinux(normalizeRendererMode(mode));
  const workspacePreference = prefs?.workspaces?.[workspaceId];
  if (!workspacePreference) {
    return demote(prefs?.defaultMode);
  }

  const panelMode = workspacePreference.panels?.[panelId];

  // Panel override wins unless it explicitly inherits the workspace baseline.
  if (panelMode && panelMode !== TERMINAL_RENDERER_INHERIT_MODE) {
    return demote(panelMode);
  }

  const defaultMode = workspacePreference.defaultMode;
  return demote(normalizeRendererMode(defaultMode, normalizeRendererMode(prefs?.defaultMode)));
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

const STORAGE_PREFIX = 'devhub_ui_prefs_';

const DEFAULT_PREFS = {
  sidebarCollapsed: false,
  historialExpandedMonths: [],
  editorExpandedPaths: [],
};

function getStorageKey(projectId) {
  return `${STORAGE_PREFIX}${projectId}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readPrefs(projectId) {
  if (!projectId || !canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePrefs(projectId, prefs) {
  if (!projectId || !canUseStorage()) return;

  try {
    window.localStorage.setItem(getStorageKey(projectId), JSON.stringify(prefs));
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function getUIPrefs(projectId) {
  const saved = readPrefs(projectId) || {};

  return {
    ...DEFAULT_PREFS,
    ...saved,
    historialExpandedMonths: normalizeArray(saved.historialExpandedMonths),
    editorExpandedPaths: normalizeArray(saved.editorExpandedPaths),
  };
}

export function saveUIPref(projectId, key, value) {
  if (!projectId || !key) return;

  const current = getUIPrefs(projectId);
  const next = { ...current, [key]: value };
  writePrefs(projectId, next);
}

export function clearUIPrefs(projectId) {
  if (!projectId || !canUseStorage()) return;

  try {
    window.localStorage.removeItem(getStorageKey(projectId));
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}

export function getUIPrefsStorageKey(projectId) {
  return projectId ? getStorageKey(projectId) : '';
}

export function hasUIPrefs(projectId) {
  if (!projectId || !canUseStorage()) return false;

  try {
    return window.localStorage.getItem(getStorageKey(projectId)) !== null;
  } catch {
    return false;
  }
}

export function hasUIPref(projectId, key) {
  if (!projectId || !key || !canUseStorage()) return false;

  try {
    const raw = window.localStorage.getItem(getStorageKey(projectId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Object.prototype.hasOwnProperty.call(parsed || {}, key);
  } catch {
    return false;
  }
}

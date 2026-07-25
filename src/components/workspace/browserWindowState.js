/* global module */

const DEFAULT_BROWSER_WINDOW_STATE = {
  open: false,
  label: '',
  url: '',
  updatedAt: 0,
};

function sanitizeLabelPart(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function buildBrowserWindowLabel(projectId, workspaceId) {
  const projectPart = sanitizeLabelPart(projectId, 'global');
  const workspacePart = sanitizeLabelPart(workspaceId, 'workspace');
  return `devhub-browser-${projectPart}-${workspacePart}`;
}

function buildBrowserWindowStorageKey(projectId) {
  return `devhub_browser_windows_${projectId || 'global'}`;
}

function sanitizeBrowserWindowState(rawState = {}) {
  return {
    open: rawState.open === true,
    label: typeof rawState.label === 'string' ? rawState.label : '',
    url: typeof rawState.url === 'string' ? rawState.url : '',
    updatedAt: Number.isFinite(Number(rawState.updatedAt)) ? Number(rawState.updatedAt) : 0,
  };
}

function readBrowserWindowStates(storage, projectId) {
  if (!storage || typeof storage.getItem !== 'function') return {};

  try {
    const raw = storage.getItem(buildBrowserWindowStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([workspaceId, state]) => [
        workspaceId,
        sanitizeBrowserWindowState(state),
      ])
    );
  } catch {
    return {};
  }
}

function writeBrowserWindowStates(storage, projectId, states) {
  if (!storage || typeof storage.setItem !== 'function') return;

  try {
    const normalized = Object.fromEntries(
      Object.entries(states || {}).map(([workspaceId, state]) => [
        workspaceId,
        sanitizeBrowserWindowState(state),
      ])
    );

    storage.setItem(buildBrowserWindowStorageKey(projectId), JSON.stringify(normalized));
  } catch {
    // Ignore storage failures.
  }
}

module.exports = {
  DEFAULT_BROWSER_WINDOW_STATE,
  buildBrowserWindowLabel,
  buildBrowserWindowStorageKey,
  readBrowserWindowStates,
  sanitizeBrowserWindowState,
  writeBrowserWindowStates,
};

'use client';

export const DEFAULT_EDITOR_PANE_CONTENT = '// Selecciona un archivo del árbol para verlo aquí.';

export const DEFAULT_EDITOR_PANE_STATE = {
  expandedPaths: ['src'],
  selectedPath: '',
  searchQuery: '',
  isTreeCollapsed: false,
  markdownViewMode: 'preview',
  latexViewMode: 'preview',
};

function normalizeStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

export function buildEditorPaneStateStorageKey(projectId, workspaceId) {
  return `devhub_editor_pane_${projectId || 'global'}_${workspaceId || 'default'}`;
}

export function sanitizeEditorPaneState(rawState = {}) {
  return {
    expandedPaths: normalizeStringArray(rawState.expandedPaths, DEFAULT_EDITOR_PANE_STATE.expandedPaths),
    selectedPath:
      typeof rawState.selectedPath === 'string' ? rawState.selectedPath : DEFAULT_EDITOR_PANE_STATE.selectedPath,
    searchQuery:
      typeof rawState.searchQuery === 'string' ? rawState.searchQuery : DEFAULT_EDITOR_PANE_STATE.searchQuery,
    isTreeCollapsed: rawState.isTreeCollapsed === true,
    markdownViewMode: rawState.markdownViewMode === 'raw' ? 'raw' : 'preview',
    latexViewMode: rawState.latexViewMode === 'raw' ? 'raw' : 'preview',
  };
}

export function readEditorPaneState(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_EDITOR_PANE_STATE };
  }

  try {
    const raw = storage.getItem(buildEditorPaneStateStorageKey(projectId, workspaceId));
    if (!raw) return { ...DEFAULT_EDITOR_PANE_STATE };
    return sanitizeEditorPaneState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EDITOR_PANE_STATE };
  }
}

export function writeEditorPaneState(storage, projectId, workspaceId, state) {
  if (!storage || typeof storage.setItem !== 'function') return;

  try {
    storage.setItem(
      buildEditorPaneStateStorageKey(projectId, workspaceId),
      JSON.stringify(sanitizeEditorPaneState(state))
    );
  } catch {
    // Ignore storage failures.
  }
}

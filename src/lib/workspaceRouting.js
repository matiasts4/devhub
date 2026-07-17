import { getUIPrefs as defaultGetUIPrefs } from '@/lib/uiState';

/** Valid hash-router project sections (WorkspaceLayout child routes). */
export const PROJECT_PAGE_KEYS = Object.freeze([
  'dashboard',
  'planificacion',
  'tareas',
  'editor',
  'scaffolding',
  'roadmap',
  'historial',
  'conexiones',
  'ajustes',
  'swarm',
  'telegram',
  'motion-lab',
  'terminales',
]);

const PROJECT_PAGE_SET = new Set(PROJECT_PAGE_KEYS);

export function normalizeProjectPageKey(page) {
  const key = String(page || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!key || !PROJECT_PAGE_SET.has(key)) return null;
  return key;
}

/**
 * Last visited project section (ui prefs). Falls back to dashboard.
 * Speeds cold "project → Terminales" when the user habitually lands on terminales.
 */
export function resolveProjectEntryPage(
  projectId,
  { getUIPrefs: getPrefs = defaultGetUIPrefs } = {}
) {
  if (!projectId) return 'dashboard';
  try {
    const prefs = getPrefs(projectId) || {};
    return normalizeProjectPageKey(prefs.lastProjectPage) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

export function getProjectEntryPath(projectId, opts = {}) {
  const page = resolveProjectEntryPage(projectId, opts);
  return `/project/${projectId}/${page}`;
}

export function getProjectPlanningPath(projectId, mode = 'initial') {
  const base = `/project/${projectId}/planificacion`;
  return mode && mode !== 'initial' ? `${base}?mode=${mode}` : base;
}

export function getLegacyWorkspaceRedirectPath(projectId, search = '') {
  return `/project/${projectId}/swarm${search || ''}`;
}

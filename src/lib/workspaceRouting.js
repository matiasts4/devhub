export function getProjectEntryPath(projectId) {
  return `/project/${projectId}/dashboard`;
}

export function getProjectPlanningPath(projectId, mode = 'initial') {
  const base = `/project/${projectId}/planificacion`;
  return mode && mode !== 'initial' ? `${base}?mode=${mode}` : base;
}

export function getLegacyWorkspaceRedirectPath(projectId, search = '') {
  return `/project/${projectId}/swarm${search || ''}`;
}

export function getProjectEntryPath(projectId, planningEnabled = false) {
  const base = `/project/${projectId}`;
  return planningEnabled ? `${base}/swarm` : `${base}/dashboard`;
}

export function getLegacyWorkspaceRedirectPath(projectId, search = '') {
  return `/project/${projectId}/swarm${search || ''}`;
}

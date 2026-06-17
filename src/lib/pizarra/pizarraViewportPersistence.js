/**
 * Persist pizarra camera (pan/zoom) per project + workspace.
 */

export function buildPizarraViewportKey(projectId, workspaceId) {
  return `devhub_pizarra_viewport:${projectId || 'default'}:${workspaceId || 'default'}`;
}

export function readPizarraViewport(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(buildPizarraViewportKey(projectId, workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const zoom = Number(parsed?.zoom);
    const pan = parsed?.pan;
    if (!Number.isFinite(zoom) || zoom <= 0) return null;
    if (!pan || typeof pan.x !== 'number' || typeof pan.y !== 'number') return null;
    return { zoom, pan: { x: pan.x, y: pan.y } };
  } catch {
    return null;
  }
}

export function writePizarraViewport(storage, projectId, workspaceId, { pan, zoom }) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) return false;
  if (!pan || typeof pan.x !== 'number' || typeof pan.y !== 'number') return false;
  try {
    storage.setItem(
      buildPizarraViewportKey(projectId, workspaceId),
      JSON.stringify({ zoom: z, pan: { x: pan.x, y: pan.y } })
    );
    return true;
  } catch {
    return false;
  }
}

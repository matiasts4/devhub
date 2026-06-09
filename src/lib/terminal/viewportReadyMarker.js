import fs from 'node:fs';
import path from 'node:path';

export function buildSwarmTmuxSessionName(launchId, roleKey) {
  const safeLaunch = String(launchId || '').trim();
  const safeRole = String(roleKey || '').trim();
  if (!safeLaunch || !safeRole) return null;
  return `devhub-swarm-${safeLaunch}-${safeRole}`;
}

export function resolveViewportReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return path.join('/tmp', `devhub-viewport-ready-${safe}`);
}

export function writeViewportReadyMarker(tmuxSession, payload = {}, { fsImpl = fs } = {}) {
  const markerPath = resolveViewportReadyMarkerPath(tmuxSession);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    ...payload,
    at: Date.now(),
  });
  fsImpl.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });
  return markerPath;
}

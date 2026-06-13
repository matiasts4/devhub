import fs from 'node:fs';
import { resolveViewportReadyMarkerPath } from './viewportReadyMarker';

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

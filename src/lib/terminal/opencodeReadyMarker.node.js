import fs from 'node:fs';
import { resolveOpencodeReadyMarkerPath } from './opencodeReadyMarker.js';

export function writeOpencodeReadyMarker(tmuxSession, payload = {}, { fsImpl = fs } = {}) {
  const markerPath = resolveOpencodeReadyMarkerPath(tmuxSession);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    ...payload,
    at: Date.now(),
  });
  fsImpl.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });
  return markerPath;
}

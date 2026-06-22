import fs from 'node:fs';
import {
  resolveOpencodeReadyMarkerPath,
  resolveAgentReadyMarkerPath,
} from './opencodeReadyMarker.js';

export function writeAgentReadyMarker(
  tmuxSession,
  program = 'opencode',
  payload = {},
  { fsImpl = fs } = {}
) {
  const markerPath = resolveAgentReadyMarkerPath(tmuxSession, program);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    program,
    ...payload,
    at: Date.now(),
  });
  fsImpl.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });

  // Keep the legacy OpenCode marker in sync so older wrapper versions and the
  // sidecar backend continue to work regardless of which program is running.
  const legacyPath = resolveOpencodeReadyMarkerPath(tmuxSession);
  if (legacyPath) {
    fsImpl.writeFileSync(legacyPath, body, { encoding: 'utf8', mode: 0o644 });
  }

  return markerPath;
}

export function writeOpencodeReadyMarker(tmuxSession, payload = {}, { fsImpl = fs } = {}) {
  writeAgentReadyMarker(tmuxSession, 'opencode', payload, { fsImpl });
  // Backward-compat return value: callers expect the legacy OpenCode marker path.
  return resolveOpencodeReadyMarkerPath(tmuxSession);
}

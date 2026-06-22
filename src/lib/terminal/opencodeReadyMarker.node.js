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

  const legacyPath = resolveOpencodeReadyMarkerPath(tmuxSession);
  if (legacyPath) {
    fsImpl.writeFileSync(legacyPath, body, { encoding: 'utf8', mode: 0o644 });
  }

  return markerPath;
}

export function writeOpencodeReadyMarker(tmuxSession, payload = {}, { fsImpl = fs } = {}) {
  writeAgentReadyMarker(tmuxSession, 'opencode', payload, { fsImpl });
  return resolveOpencodeReadyMarkerPath(tmuxSession);
}
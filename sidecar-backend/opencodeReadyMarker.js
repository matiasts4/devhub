const fs = require('fs');

function resolveOpencodeReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-opencode-ready-${safe}`;
}

function writeOpencodeReadyMarker(tmuxSession, payload = {}) {
  const markerPath = resolveOpencodeReadyMarkerPath(tmuxSession);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    ...payload,
    at: Date.now(),
  });
  fs.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });
  return markerPath;
}

module.exports = {
  resolveOpencodeReadyMarkerPath,
  writeOpencodeReadyMarker,
};

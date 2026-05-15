const fs = require('fs');
const os = require('os');
const path = require('path');

function normalizeCwd(candidate) {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function isUsableDirectory(candidate, { fsImpl = fs } = {}) {
  const normalized = normalizeCwd(candidate);
  if (!normalized) return false;

  try {
    return fsImpl.statSync(normalized).isDirectory();
  } catch {
    return false;
  }
}

function resolveTerminalSpawnCwd(
  requestedCwd,
  {
    fsImpl = fs,
    processCwd = process.cwd(),
    homeDir = os.homedir(),
  } = {}
) {
  const normalizedRequestedCwd = normalizeCwd(requestedCwd);

  if (normalizedRequestedCwd && isUsableDirectory(normalizedRequestedCwd, { fsImpl })) {
    return {
      requestedCwd: normalizedRequestedCwd,
      effectiveCwd: normalizedRequestedCwd,
      usedFallback: false,
    };
  }

  const fallbackCandidates = [processCwd, homeDir, path.parse(processCwd || homeDir || '/').root]
    .map((candidate) => normalizeCwd(candidate))
    .filter((candidate, index, values) => candidate && values.indexOf(candidate) === index);

  const effectiveCwd =
    fallbackCandidates.find((candidate) => isUsableDirectory(candidate, { fsImpl })) ||
    normalizedRequestedCwd ||
    normalizeCwd(process.cwd()) ||
    '/';

  return {
    requestedCwd: normalizedRequestedCwd,
    effectiveCwd,
    usedFallback: effectiveCwd !== normalizedRequestedCwd,
  };
}

module.exports = {
  isUsableDirectory,
  resolveTerminalSpawnCwd,
};

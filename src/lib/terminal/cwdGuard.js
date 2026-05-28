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

/**
 * Check if a path is under the DevHub worktrees directory.
 * @param {string} cwdPath
 * @returns {boolean}
 */
function isDevHubWorktreePath(cwdPath) {
  if (!cwdPath) return false;
  return cwdPath.includes('.devhub/worktrees');
}

/**
 * Check if a path is under the Plyrium worktrees directory.
 * @param {string} cwdPath
 * @returns {boolean}
 */
function isPlyriumWorktreePath(cwdPath) {
  if (!cwdPath) return false;
  return cwdPath.includes('.plyrium-forge');
}

/**
 * Validate cwd for swarm agent spawn.
 *
 * For swarm roles, the cwd MUST be under .devhub/worktrees.
 * Rejects:
 *   - Non-existent paths
 *   - Paths outside the repo
 *   - Paths not under .devhub/worktrees for swarm roles
 *   - Paths under .plyrium-forge
 *
 * @param {object} params
 * @param {string} params.requestedCwd - The requested cwd
 * @param {string} params.roleKey - The agent role (director, coder, etc.)
 * @param {boolean} params.isSwarmRole - Whether this is a swarm agent
 * @param {object} [fsImpl] - Optional fs override for testing
 * @returns {{ valid: boolean, error: string|null, effectiveCwd: string|null }}
 */
function validateSwarmCwd({
  requestedCwd,
  roleKey,
  isSwarmRole,
  fsImpl = fs,
}) {
  const normalized = normalizeCwd(requestedCwd);

  if (!normalized) {
    return {
      valid: false,
      error: `cwd is empty or invalid for role ${roleKey}`,
      effectiveCwd: null,
    };
  }

  // Reject Plyrium paths
  if (isPlyriumWorktreePath(normalized)) {
    return {
      valid: false,
      error: `cwd is under .plyrium-forge (DevHub worktrees only): ${normalized}`,
      effectiveCwd: null,
    };
  }

  // For swarm roles, enforce .devhub/worktrees
  if (isSwarmRole) {
    if (!isDevHubWorktreePath(normalized)) {
      return {
        valid: false,
        error: `Swarm role ${roleKey} must use .devhub/worktrees, got: ${normalized}`,
        effectiveCwd: null,
      };
    }

    // Path must exist
    if (!fsImpl.existsSync(normalized)) {
      return {
        valid: false,
        error: `Swarm worktree does not exist: ${normalized}`,
        effectiveCwd: null,
      };
    }

    // Must have .git marker
    const gitMarker = path.join(normalized, '.git');
    if (!fsImpl.existsSync(gitMarker)) {
      return {
        valid: false,
        error: `Swarm worktree missing .git marker: ${normalized}`,
        effectiveCwd: null,
      };
    }
  }

  return {
    valid: true,
    error: null,
    effectiveCwd: normalized,
  };
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
  isDevHubWorktreePath,
  isPlyriumWorktreePath,
  validateSwarmCwd,
};

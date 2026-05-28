/* eslint-env node */
 

/**
 * AgentWorkspaceManager — DevHub's own worktree manager.
 *
 * Creates, validates, and cleans up git worktrees for swarm agents.
 * Does NOT call Plyrium CLI. Does NOT use .plyrium-forge paths.
 *
 * Worktree layout:
 *   .devhub/worktrees/<launch-id>/<role>
 * Branch naming:
 *   devhub/swarm/<launch-id>/<role>
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Pure helpers (testable without git)
// ---------------------------------------------------------------------------

/**
 * Build the root directory for a launch's worktrees.
 * @param {string} repoRoot - Absolute path to the git repo root.
 * @param {string} launchId - Unique launch identifier.
 * @returns {string} Absolute path to .devhub/worktrees/<launch-id>
 */
function buildLaunchWorkspaceRoot(repoRoot, launchId) {
  const cleanRoot = repoRoot.replace(/\/+$/, '');
  return path.join(cleanRoot, '.devhub', 'worktrees', launchId);
}

/**
 * Compute the worktree path for a specific role within a launch.
 * @param {string} repoRoot
 * @param {string} launchId
 * @param {string} roleKey
 * @returns {string}
 */
function computeWorktreePath(repoRoot, launchId, roleKey) {
  const root = buildLaunchWorkspaceRoot(repoRoot, launchId);
  return path.join(root, roleKey);
}

/**
 * Compute the branch name for a role within a launch.
 * @param {string} launchId
 * @param {string} roleKey
 * @returns {string}
 */
function computeBranchName(launchId, roleKey) {
  return `devhub/swarm/${launchId}/${roleKey}`;
}

/**
 * Validate that a worktree path exists and is a proper DevHub worktree.
 * @param {string} worktreePath
 * @param {object} [fsImpl] - Optional fs override for testing.
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateWorktreePath(worktreePath, fsImpl = fs) {
  // Must be under .devhub/worktrees
  if (!worktreePath.includes('.devhub/worktrees')) {
    return {
      valid: false,
      error: `Path is not under .devhub/worktrees: ${worktreePath}`,
    };
  }

  // Must NOT be under .plyrium-forge
  if (worktreePath.includes('.plyrium-forge')) {
    return {
      valid: false,
      error: `Path is under .plyrium-forge (DevHub worktrees only): ${worktreePath}`,
    };
  }

  // Must exist
  if (!fsImpl.existsSync(worktreePath)) {
    return {
      valid: false,
      error: `Worktree path does not exist: ${worktreePath}`,
    };
  }

  // Must have .git (worktree marker)
  const gitMarker = path.join(worktreePath, '.git');
  if (!fsImpl.existsSync(gitMarker)) {
    return {
      valid: false,
      error: `Worktree path missing .git marker: ${worktreePath}`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Parse git worktree list --porcelain output into structured data.
 * @param {string} porcelainOutput
 * @returns {Array<{path: string, head: string, branch: string}>}
 */
function parseWorktreeInfo(porcelainOutput) {
  if (!porcelainOutput || !porcelainOutput.trim()) return [];

  const lines = porcelainOutput.trim().split('\n');
  const worktrees = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current);
      current = {
        path: line.slice('worktree '.length),
        head: '',
        branch: '',
      };
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length);
    }
  }

  if (current) worktrees.push(current);
  return worktrees;
}

// ---------------------------------------------------------------------------
// Git operations (require real git)
// ---------------------------------------------------------------------------

/**
 * Execute a git command in the repo root.
 */
function gitExec(args, repoRoot, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `git ${args.join(' ')} failed with status ${result.status}`);
  }

  return String(result.stdout || '').trim();
}

/**
 * Check if a branch already exists.
 */
function branchExists(repoRoot, branchName) {
  try {
    gitExec(['rev-parse', '--verify', branchName], repoRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a worktree already exists for a given path.
 */
function worktreeExists(repoRoot, worktreePath) {
  try {
    const output = gitExec(['worktree', 'list', '--porcelain'], repoRoot);
    return output.includes(worktreePath);
  } catch {
    return false;
  }
}

/**
 * Prepare a worktree for an agent role.
 *
 * @param {object} params
 * @param {string} params.repoRoot - Absolute path to git repo root.
 * @param {string} params.launchId - Unique launch identifier.
 * @param {string} params.roleKey - Role key (director, coder, etc.).
 * @param {string} [params.baseRef] - Base ref to branch from (default: HEAD).
 * @returns {{ branchName: string, worktreePath: string, observedHead: string, created: boolean }}
 */
function prepareAgentWorktree({ repoRoot, launchId, roleKey, baseRef = 'HEAD' }) {
  const worktreePath = computeWorktreePath(repoRoot, launchId, roleKey);
  const branchName = computeBranchName(launchId, roleKey);

  // Idempotency: check if worktree already exists
  if (worktreeExists(repoRoot, worktreePath)) {
    const observedHead = gitExec(['rev-parse', 'HEAD'], worktreePath);
    return {
      branchName,
      worktreePath,
      observedHead,
      created: false,
    };
  }

  // Create branch if it doesn't exist
  if (!branchExists(repoRoot, branchName)) {
    gitExec(['branch', branchName, baseRef], repoRoot);
  }

  // Create the worktree directory parent if needed
  const worktreeDir = path.dirname(worktreePath);
  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  // Add the worktree
  gitExec(['worktree', 'add', worktreePath, branchName], repoRoot);

  // Validate
  const validation = validateWorktreePath(worktreePath);
  if (!validation.valid) {
    throw new Error(
      `Worktree validation failed for ${worktreePath}: ${validation.error}`
    );
  }

  const observedHead = gitExec(['rev-parse', 'HEAD'], worktreePath);

  return {
    branchName,
    worktreePath,
    observedHead,
    created: true,
  };
}

/**
 * Remove a worktree for an agent role.
 *
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.launchId
 * @param {string} params.roleKey
 * @param {object} [options]
 * @param {boolean} [options.force] - Force removal even with uncommitted changes.
 * @returns {{ removed: boolean, worktreePath: string }}
 */
function removeAgentWorktree({ repoRoot, launchId, roleKey }, options = {}) {
  const worktreePath = computeWorktreePath(repoRoot, launchId, roleKey);

  if (!worktreeExists(repoRoot, worktreePath)) {
    return { removed: false, worktreePath };
  }

  const args = ['worktree', 'remove'];
  if (options.force) {
    args.push('--force');
  }
  args.push(worktreePath);

  try {
    gitExec(args, repoRoot);
    return { removed: true, worktreePath };
  } catch (e) {
    throw new Error(
      `Failed to remove worktree ${worktreePath}: ${e.message}`
    );
  }
}

/**
 * List all DevHub worktrees for a given launch.
 *
 * @param {string} repoRoot
 * @param {string} launchId
 * @returns {Array<{path: string, head: string, branch: string}>}
 */
function listLaunchWorktrees(repoRoot, launchId) {
  const output = gitExec(['worktree', 'list', '--porcelain'], repoRoot);
  const allWorktrees = parseWorktreeInfo(output);

  const launchRoot = buildLaunchWorkspaceRoot(repoRoot, launchId);
  return allWorktrees.filter((wt) => wt.path.startsWith(launchRoot));
}

/**
 * Get the status of all DevHub worktrees.
 *
 * @param {string} repoRoot
 * @returns {Array<{path: string, head: string, branch: string}>}
 */
function listAllDevHubWorktrees(repoRoot) {
  const output = gitExec(['worktree', 'list', '--porcelain'], repoRoot);
  const allWorktrees = parseWorktreeInfo(output);

  return allWorktrees.filter((wt) => wt.path.includes('.devhub/worktrees'));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Pure helpers (testable without git)
  buildLaunchWorkspaceRoot,
  computeWorktreePath,
  computeBranchName,
  validateWorktreePath,
  parseWorktreeInfo,

  // Git operations
  prepareAgentWorktree,
  removeAgentWorktree,
  listLaunchWorktrees,
  listAllDevHubWorktrees,
  branchExists,
  worktreeExists,
};

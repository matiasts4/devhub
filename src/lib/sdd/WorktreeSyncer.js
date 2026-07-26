/**
 * @module WorktreeSyncer
 * Phase-branch-map operations, git merge workflow basics,
 * worktree isolation per phase, auto-cleanup post-archive.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Git helpers (using execSync for simplicity; can be async-ified)
// ---------------------------------------------------------------------------

/**
 * Run a git command in a directory.
 */
function runGit(cwd, args) {
  try {
    const result = execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (e) {
    return { success: false, output: e.message, stderr: e.stderr?.toString() || '' };
  }
}

/**
 * Check if a directory is a git repo.
 */
function isGitRepo(cwd) {
  return runGit(cwd, 'rev-parse --git-dir').success;
}

/**
 * Get current branch name.
 */
function getCurrentBranch(cwd) {
  const result = runGit(cwd, 'rev-parse --abbrev-ref HEAD');
  return result.success ? result.output : null;
}

/**
 * Get current HEAD commit hash.
 */
function getCurrentHead(cwd) {
  const result = runGit(cwd, 'rev-parse HEAD');
  return result.success ? result.output : null;
}

/**
 * Check if repo is dirty (has uncommitted changes).
 */
function isDirty(cwd) {
  const result = runGit(cwd, 'status --porcelain');
  return result.success && result.output.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Worktree operations
// ---------------------------------------------------------------------------

/**
 * List all worktrees (git worktree list --porcelain).
 */
function listWorktrees(repoRoot) {
  const result = runGit(repoRoot, 'worktree list --porcelain');
  if (!result.success) return [];

  const worktrees = [];
  const lines = result.output.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current);
      current = { path: line.replace('worktree ', '').trim() };
    } else if (line.startsWith('HEAD ')) {
      if (current) current.head = line.replace('HEAD ', '').trim();
    } else if (line.startsWith('branch ')) {
      if (current) current.branch = line.replace('branch ', '').trim();
    } else if (line.startsWith('detached')) {
      if (current) current.detached = true;
    }
  }
  if (current) worktrees.push(current);

  return worktrees;
}

/**
 * Add a new worktree for a branch.
 */
function addWorktree(repoRoot, branchName, worktreePath) {
  const result = runGit(repoRoot, `worktree add -b ${branchName} "${worktreePath}"`);
  return result;
}

/**
 * Remove a worktree.
 */
function removeWorktree(repoRoot, worktreePath, force = false) {
  const forceFlag = force ? ' --force' : '';
  const result = runGit(repoRoot, `worktree remove "${worktreePath}"${forceFlag}`);
  return result;
}

/**
 * Prune stale worktrees.
 */
function pruneWorktrees(repoRoot) {
  return runGit(repoRoot, 'worktree prune');
}

// ---------------------------------------------------------------------------
// Phase-branch sync
// ---------------------------------------------------------------------------

/**
 * Sync a worktree to a new phase by updating its branch.
 * Uses SessionPersistence.phase_branch_map under the hood.
 */
async function syncPhaseBranch({ launchId, phase, worktreePath }) {
  // Dynamic import to avoid circular deps
  const { upsertPhaseBranch } = require('./SessionPersistence');

  if (!launchId) throw new Error('launchId is required');
  if (!phase) throw new Error('phase is required');
  if (!worktreePath) throw new Error('worktreePath is required');

  // Get current branch in worktree
  if (!isGitRepo(worktreePath)) {
    return { success: false, error: 'Worktree is not a git repo' };
  }

  const currentBranch = getCurrentBranch(worktreePath);
  const currentHead = getCurrentHead(worktreePath);

  // Determine new branch name based on phase
  const branchName = `sdd-${phase.replace('sdd-', '')}-${launchId.substring(0, 8)}`;

  // Checkout or create the phase branch
  let checkoutResult;
  const branchExists = runGit(worktreePath, `rev-parse --verify ${branchName}`).success;

  if (branchExists) {
    checkoutResult = runGit(worktreePath, `checkout ${branchName}`);
  } else {
    checkoutResult = runGit(worktreePath, `checkout -b ${branchName}`);
  }

  if (!checkoutResult.success) {
    return { success: false, error: `Checkout failed: ${checkoutResult.output}` };
  }

  // Update phase_branch_map
  await upsertPhaseBranch({
    missionId: launchId,
    phase,
    branchName,
    worktreePath,
    baselineCommit: currentHead,
  });

  return {
    success: true,
    branchName,
    previousBranch: currentBranch,
    head: getCurrentHead(worktreePath),
  };
}

/**
 * Merge worktrees: takes artifacts from a source phase branch
 * and merges them into the integration/target branch.
 */
async function mergeWorktrees({ integrationPath, roleBranches = [] }) {
  if (!integrationPath) throw new Error('integrationPath is required');

  if (!isGitRepo(integrationPath)) {
    return { success: false, error: 'Integration path is not a git repo' };
  }

  const results = [];

  for (const { phase, branchName, worktreePath } of roleBranches) {
    if (!branchName || !worktreePath) continue;

    // Check if branch exists in integration repo
    const branchExists = runGit(integrationPath, `rev-parse --verify ${branchName}`).success;

    if (!branchExists) {
      // Fetch the branch from the worktree's repo if accessible
      results.push({
        phase,
        branchName,
        status: 'skipped',
        reason: 'Branch not found in integration repo',
      });
      continue;
    }

    // Merge the branch
    const mergeResult = runGit(integrationPath, `merge ${branchName} --no-edit`);

    if (mergeResult.success) {
      results.push({ phase, branchName, status: 'merged', output: mergeResult.output });
    } else {
      results.push({ phase, branchName, status: 'failed', error: mergeResult.output });
    }
  }

  return {
    success: results.every((r) => r.status === 'merged'),
    results,
  };
}

/**
 * Auto-cleanup worktrees post-archive.
 * Removes all sdd-* worktrees and marks phase branches as cleaned.
 */
async function cleanupWorktrees({ repoRoot, missionId }) {
  if (!repoRoot) throw new Error('repoRoot is required');

  const { cleanupMissionPhaseBranches, listPhaseBranches } = require('./SessionPersistence');

  // Get all phase branches for this mission
  const phaseBranches = missionId ? await listPhaseBranches({ missionId }) : [];

  const results = [];

  // Prune git worktrees
  const pruneResult = pruneWorktrees(repoRoot);
  results.push({ action: 'prune', ...pruneResult });

  // Remove worktrees for this mission's phases
  for (const pb of phaseBranches) {
    if (pb.worktreePath) {
      const removeResult = removeWorktree(repoRoot, pb.worktreePath, true);
      results.push({
        action: 'remove-worktree',
        phase: pb.phase,
        path: pb.worktreePath,
        ...removeResult,
      });
    }
  }

  // Mark phase branches as cleaned in DB
  if (missionId) {
    await cleanupMissionPhaseBranches({ missionId });
    results.push({ action: 'mark-cleaned', missionId });
  }

  return results;
}

/**
 * Detect conflicts between branches.
 */
async function detectConflicts({ repoRoot, branchA, branchB }) {
  if (!repoRoot || !branchA || !branchB) {
    return { hasConflicts: false, conflictingFiles: [] };
  }

  // Use git merge --no-commit to check for conflicts
  const result = runGit(repoRoot, `merge ${branchB} --no-commit --no-edit`);

  // If there are conflicts, git merge returns non-zero
  if (!result.success) {
    // Abort the merge
    runGit(repoRoot, 'merge --abort');

    // Find conflicting files
    const statusResult = runGit(repoRoot, 'diff --name-only --diff-filter=U');
    const conflictingFiles = statusResult.success
      ? statusResult.output.split('\n').filter(Boolean)
      : [];

    return {
      hasConflicts: true,
      conflictingFiles,
      output: result.output,
    };
  } else {
    // No conflicts - abort the pre-merge
    runGit(repoRoot, 'merge --abort');
    return { hasConflicts: false, conflictingFiles: [] };
  }
}

/**
 * Get integration worktree path (where all phase branches merge).
 */
function getIntegrationWorktreePath(repoRoot, missionId) {
  return path.join(repoRoot, `.worktrees`, `integration-${missionId || 'default'}`);
}

/**
 * Ensure integration worktree exists.
 */
async function ensureIntegrationWorktree(repoRoot, missionId) {
  const integrationPath = getIntegrationWorktreePath(repoRoot, missionId);

  if (!isGitRepo(integrationPath)) {
    // Create integration worktree
    const branchName = `integration-${missionId || 'default'}`;
    const result = addWorktree(repoRoot, branchName, integrationPath);

    if (!result.success) {
      return { success: false, error: result.output, path: integrationPath };
    }
  }

  return { success: true, path: integrationPath };
}

module.exports = {
  // Git helpers
  runGit,
  isGitRepo,
  getCurrentBranch,
  getCurrentHead,
  isDirty,
  // Worktree ops
  listWorktrees,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
  // Phase sync
  syncPhaseBranch,
  mergeWorktrees,
  cleanupWorktrees,
  // Conflict detection
  detectConflicts,
  // Integration worktree
  getIntegrationWorktreePath,
  ensureIntegrationWorktree,
};

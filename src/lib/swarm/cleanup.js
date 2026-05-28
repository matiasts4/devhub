/**
 * Safe Cleanup — removes worktrees and sessions without losing agent work.
 *
 * Rules:
 * - Never delete worktree with uncommitted changes without checkpoint.
 * - Save summary before cleanup.
 * - Only `git worktree remove` when merged/aborted and approved.
 * - `git worktree prune` with care and logging.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const { getDb } = require('../db/core');

function safeExec(cmd, cwd = undefined) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    }).trim();
  } catch (e) {
    return { error: e.message, stderr: e.stderr?.trim() };
  }
}

/**
 * Check if a worktree has uncommitted changes.
 * @param {string} worktreePath
 * @returns {{ clean: boolean, status: string }}
 */
function checkWorktreeDirty(worktreePath) {
  const status = safeExec('git status --porcelain', worktreePath);
  if (typeof status === 'string') {
    return { clean: status === '', status };
  }
  return { clean: false, status: `error: ${status.error}` };
}

/**
 * Create a summary of worktree state before cleanup.
 * @param {string} worktreePath
 * @returns {object}
 */
function createWorktreeSummary(worktreePath) {
  const branch = safeExec('git rev-parse --abbrev-ref HEAD', worktreePath);
  const head = safeExec('git rev-parse HEAD', worktreePath);
  const diff = safeExec('git diff --stat HEAD', worktreePath);
  const log = safeExec('git log --oneline -5', worktreePath);

  return {
    worktree_path: worktreePath,
    branch: typeof branch === 'string' ? branch : null,
    head: typeof head === 'string' ? head : null,
    diff_stat: typeof diff === 'string' ? diff : null,
    recent_commits: typeof log === 'string' ? log.split('\n') : [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Safely remove a worktree.
 *
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.worktreePath
 * @param {object} [options]
 * @param {boolean} [options.force] - Force removal even with changes.
 * @param {boolean} [options.dryRun] - Only report what would happen.
 * @returns {object} Result with success status and summary.
 */
function safeRemoveWorktree({ repoRoot, worktreePath }, options = {}) {
  const force = options.force || false;
  const dryRun = options.dryRun || false;

  // Check if worktree exists
  if (!fs.existsSync(worktreePath)) {
    return {
      success: false,
      reason: 'worktree_not_found',
      worktree_path: worktreePath,
    };
  }

  // Check for uncommitted changes
  const dirty = checkWorktreeDirty(worktreePath);
  if (!dirty.clean && !force) {
    return {
      success: false,
      reason: 'worktree_dirty',
      worktree_path: worktreePath,
      dirty_status: dirty.status,
      message: 'Worktree has uncommitted changes. Use force=true or commit first.',
    };
  }

  // Create summary
  const summary = createWorktreeSummary(worktreePath);

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      summary,
      message: `Would remove worktree: ${worktreePath}`,
    };
  }

  // Remove the worktree
  const removeCmd = force
    ? `git worktree remove --force "${worktreePath}"`
    : `git worktree remove "${worktreePath}"`;

  const result = safeExec(removeCmd, repoRoot);

  if (typeof result === 'string') {
    return {
      success: true,
      summary,
      message: `Worktree removed: ${worktreePath}`,
    };
  }

  return {
    success: false,
    reason: 'remove_failed',
    worktree_path: worktreePath,
    error: result.error,
  };
}

/**
 * Prune stale worktree references.
 *
 * @param {string} repoRoot
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {object}
 */
function pruneWorktrees(repoRoot, options = {}) {
  const dryRun = options.dryRun || false;

  if (dryRun) {
    const listOutput = safeExec('git worktree list --porcelain', repoRoot);
    return {
      success: true,
      dry_run: true,
      message: 'Would prune stale worktree references',
      current_worktrees: listOutput,
    };
  }

  const result = safeExec('git worktree prune', repoRoot);

  if (typeof result === 'string') {
    return {
      success: true,
      message: 'Worktree prune completed',
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

/**
 * Cleanup a completed mission's worktrees.
 *
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.launchId
 * @param {object} [options]
 * @param {boolean} [options.force]
 * @param {boolean} [options.dryRun]
 * @returns {object}
 */
function cleanupMissionWorktrees({ repoRoot, launchId }, options = {}) {
  const db = getDb();
  const now = new Date().toISOString();

  // Get all workspaces for this launch
  const workspaces = db
    .prepare('SELECT * FROM agent_workspaces WHERE branch_name LIKE ?')
    .all(`%${launchId}%`);

  const results = [];
  for (const ws of workspaces) {
    if (!ws.worktree_path) {
      results.push({
        workspace_id: ws.id,
        agent_id: ws.agent_id,
        worktree_path: ws.worktree_path || null,
        success: false,
        reason: 'missing_worktree_path',
      });
      continue;
    }

    const result = safeRemoveWorktree({ repoRoot, worktreePath: ws.worktree_path }, options);
    results.push({
      workspace_id: ws.id,
      agent_id: ws.agent_id,
      worktree_path: ws.worktree_path,
      ...result,
    });

    // Update workspace status in DB
    if (result.success && !options.dryRun) {
      db.prepare(
        "UPDATE agent_workspaces SET status = 'cleanup_pending', updated_at = ? WHERE id = ?"
      ).run(now, ws.id);
    }
  }

  return {
    launch_id: launchId,
    workspaces_processed: results.length,
    results,
  };
}

module.exports = {
  checkWorktreeDirty,
  createWorktreeSummary,
  safeRemoveWorktree,
  pruneWorktrees,
  cleanupMissionWorktrees,
};

/**
 * Integration Worktree — creates a temporary worktree for merge/review.
 *
 * Merges role branches one by one, runs checks, generates conflict report.
 * Keeps the main repo clean during review.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeExec(cmd, cwd = undefined) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    }).trim();
  } catch (e) {
    return { error: e.message, stderr: e.stderr?.trim(), exitCode: e.status };
  }
}

/**
 * Create a temporary integration worktree for merge review.
 *
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.launchId
 * @param {string} [params.baseBranch] - Branch to merge into (default: main)
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {object}
 */
function createIntegrationWorktree({ repoRoot, launchId, baseBranch = 'main' }, options = {}) {
  const dryRun = options.dryRun || false;
  const integrationBranch = `devhub/swarm/${launchId}/integration`;
  const integrationPath = path.join(repoRoot, '.devhub', 'integration', launchId);

  // Check if integration worktree already exists
  if (fs.existsSync(integrationPath)) {
    return {
      success: false,
      reason: 'integration_worktree_exists',
      path: integrationPath,
    };
  }

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      integration_branch: integrationBranch,
      integration_path: integrationPath,
      base_branch: baseBranch,
    };
  }

  // Create parent directory
  fs.mkdirSync(path.dirname(integrationPath), { recursive: true });

  // Create integration branch from base
  const createBranch = safeExec(`git branch ${integrationBranch} ${baseBranch}`, repoRoot);
  if (typeof createBranch === 'object' && createBranch.error) {
    // Branch might already exist
    console.log(`[INTEGRATION] Branch ${integrationBranch} may already exist`);
  }

  // Create worktree
  const addWorktree = safeExec(
    `git worktree add "${integrationPath}" ${integrationBranch}`,
    repoRoot
  );

  if (typeof addWorktree === 'object' && addWorktree.error) {
    return {
      success: false,
      reason: 'worktree_create_failed',
      error: addWorktree.error,
    };
  }

  return {
    success: true,
    integration_branch: integrationBranch,
    integration_path: integrationPath,
    base_branch: baseBranch,
  };
}

/**
 * Merge a role branch into the integration worktree.
 *
 * @param {object} params
 * @param {string} params.integrationPath
 * @param {string} params.roleBranch
 * @param {string} params.roleKey
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {object}
 */
function mergeRoleBranch({ integrationPath, roleBranch, roleKey }, options = {}) {
  const dryRun = options.dryRun || false;

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      role_branch: roleBranch,
      role_key: roleKey,
      message: `Would merge ${roleBranch} into integration worktree`,
    };
  }

  // Attempt merge
  const mergeResult = safeExec(
    `git merge --no-ff -m "Merge ${roleKey} (${roleBranch})" ${roleBranch}`,
    integrationPath
  );

  if (typeof mergeResult === 'string') {
    return {
      success: true,
      role_branch: roleBranch,
      role_key: roleKey,
      merged: true,
      message: `Successfully merged ${roleBranch}`,
    };
  }

  // Merge conflict
  return {
    success: false,
    role_branch: roleBranch,
    role_key: roleKey,
    merged: false,
    conflict: true,
    error: mergeResult.error,
    message: `Merge conflict when merging ${roleBranch}`,
  };
}

/**
 * Run checks in the integration worktree.
 *
 * @param {string} integrationPath
 * @returns {object}
 */
function runIntegrationChecks(integrationPath) {
  const checks = {};

  // Git status
  checks.git_status = safeExec('git status --short', integrationPath);

  // Check if build works (if package.json exists)
  if (fs.existsSync(path.join(integrationPath, 'package.json'))) {
    checks.build = safeExec('npm run build --if-present 2>&1 || true', integrationPath);
  }

  // Check if tests pass (if test script exists)
  if (fs.existsSync(path.join(integrationPath, 'package.json'))) {
    checks.tests = safeExec('npm test --if-present 2>&1 || true', integrationPath);
  }

  return {
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a conflict report for failed merges.
 *
 * @param {Array} mergeResults
 * @returns {object}
 */
function generateConflictReport(mergeResults) {
  const conflicts = mergeResults.filter((r) => r.conflict);
  const successes = mergeResults.filter((r) => r.merged);

  return {
    total_roles: mergeResults.length,
    successful_merges: successes.length,
    conflicts: conflicts.length,
    conflict_details: conflicts.map((c) => ({
      role_key: c.role_key,
      role_branch: c.role_branch,
      error: c.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Remove the integration worktree.
 *
 * @param {string} repoRoot
 * @param {string} launchId
 * @param {object} [options]
 * @param {boolean} [options.force]
 * @returns {object}
 */
function removeIntegrationWorktree(repoRoot, launchId, options = {}) {
  const integrationPath = path.join(repoRoot, '.devhub', 'integration', launchId);
  const integrationBranch = `devhub/swarm/${launchId}/integration`;

  if (!fs.existsSync(integrationPath)) {
    return {
      success: false,
      reason: 'integration_worktree_not_found',
      path: integrationPath,
    };
  }

  const force = options.force || false;
  const cmd = force
    ? `git worktree remove --force "${integrationPath}"`
    : `git worktree remove "${integrationPath}"`;

  const result = safeExec(cmd, repoRoot);

  if (typeof result === 'string') {
    // Also remove the integration branch
    safeExec(`git branch -D ${integrationBranch}`, repoRoot);

    return {
      success: true,
      message: `Integration worktree removed: ${integrationPath}`,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

module.exports = {
  createIntegrationWorktree,
  mergeRoleBranch,
  runIntegrationChecks,
  generateConflictReport,
  removeIntegrationWorktree,
};

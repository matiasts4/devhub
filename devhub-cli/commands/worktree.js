'use strict';

/**
 * `devhub worktree` — worktree management.
 * Subcommands: list, status, clean
 *
 * NOTE: This command uses agent_workspaces as the schema-backed source for
 * workspace worktrees.
 */

const fs = require('fs');
const path = require('path');

const { getDb, readWorkspaceDiagnosticList, readWorkspaceDiagnosticSummary } = require('../lib/db');
const { table, section, row } = require('../lib/format');
const { safeRemoveWorktree, pruneWorktrees } = require('../../src/lib/swarm/cleanup.js');

/**
 * Parse args for worktree subcommands.
 */
function parseWorktreeArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0];
  let workspaceId = null;
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--status' && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    } else if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !workspaceId) {
      workspaceId = args[i];
    }
  }

  return { subcommand, workspaceId, options };
}

/**
 * `devhub worktree list` — list worktrees via agent_workspaces.
 */
function worktreeList(opts = {}) {
  try {
    const worktrees = readWorkspaceDiagnosticList(getDb(), { status: opts.status || null });

    if (opts.json) {
      process.stdout.write(JSON.stringify({ worktrees, count: worktrees.length }) + '\n');
    } else {
      if (worktrees.length === 0) {
        process.stdout.write('No worktrees found.\n');
      } else {
        process.stdout.write(section(`WORKTREES (${worktrees.length})`));
        process.stdout.write('\n');
        const headers = ['Workspace ID', 'Agent', 'Project', 'Path', 'Branch', 'Status', 'Created'];
        const rows = worktrees.map((w) => [
          w.id || '',
          w.agent_id || '',
          w.project_id || '',
          w.worktree_path || '',
          w.branch_name || '',
          w.status || '',
          w.created_at || '',
        ]);
        process.stdout.write(table(headers, rows));
        process.stdout.write('\n');
      }
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub worktree status <workspace-id>` — show worktree detail.
 */
function worktreeStatus(workspaceId, opts = {}) {
  if (!workspaceId) {
    process.stderr.write('Workspace ID required\n');
    process.exit(2);
  }

  try {
    const summary = readWorkspaceDiagnosticSummary(getDb(), { workspaceId });

    if (!summary) {
      process.stderr.write('Workspace not found\n');
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(summary) + '\n');
    } else {
      const workspace = summary.workspace;
      process.stdout.write(section('WORKTREE'));
      process.stdout.write('\n');
      process.stdout.write(row('Workspace ID', workspace.id));
      process.stdout.write('\n');
      process.stdout.write(row('Path', workspace.worktree_path || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Branch', workspace.branch_name || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Status', workspace.status || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Binding', summary.session_binding?.classification || 'missing'));
      process.stdout.write('\n\n');
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

function resolveRepoRoot(workspace) {
  const repoRoot = workspace.repo_root;
  if (!repoRoot || !fs.existsSync(repoRoot)) {
    return {
      success: false,
      reason: 'repo_root_missing',
      message: `Repository root not found for workspace ${workspace.id}`,
    };
  }

  return { success: true, repoRoot: path.resolve(repoRoot) };
}

/**
 * `devhub worktree clean <workspace-id>` — remove a workspace worktree.
 */
function worktreeClean(workspaceId, opts = {}) {
  if (!workspaceId) {
    process.stderr.write('Workspace ID required\n');
    process.exit(2);
  }

  if (!opts.force) {
    process.stderr.write('Error: --force flag required for cleanup operations\n');
    process.exit(1);
  }

  const db = getDb();

  try {
    const workspace = db
      .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
      .get(workspaceId);

    if (!workspace) {
      process.stderr.write('Workspace not found\n');
      process.exit(1);
    }

    if (!workspace.worktree_path) {
      process.stderr.write('Workspace has no worktree_path\n');
      process.exit(1);
    }

    const repoResult = resolveRepoRoot(workspace);
    if (!repoResult.success) {
      process.stderr.write(`Error: ${repoResult.message}\n`);
      process.exit(1);
    }

    const result = safeRemoveWorktree(
      {
        repoRoot: repoResult.repoRoot,
        worktreePath: workspace.worktree_path,
      },
      { force: true }
    );

    if (!result.success) {
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        process.stderr.write(`Error: ${result.message || result.reason || 'cleanup failed'}\n`);
      }
      process.exit(1);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE agent_workspaces
       SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ?
       WHERE id = ?`
    ).run(now, now, workspaceId);

    const prune = pruneWorktrees(repoResult.repoRoot);
    const payload = {
      workspace_id: workspaceId,
      worktree_path: workspace.worktree_path,
      removed: true,
      prune,
      summary: result.summary,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(payload) + '\n');
    } else {
      process.stdout.write(`Removed worktree ${workspace.worktree_path}\n`);
      if (!prune.success) {
        process.stdout.write(`Prune warning: ${prune.error || 'unknown error'}\n`);
      }
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Main worktree command handler.
 */
function worktreeCommand(opts = {}) {
  const { subcommand, workspaceId, options } = parseWorktreeArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub worktree <list|status|clean> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list    List worktrees\n');
    process.stdout.write('  status  Show worktree detail\n');
    process.stdout.write(
      '  clean   Remove a workspace worktree by workspace ID (requires --force)\n'
    );
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --status <val> Filter by workspace status (list only)\n');
    process.stdout.write('  --force        Force cleanup (clean only)\n');
    process.stdout.write('  --json         Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return worktreeList({ ...opts, ...options });
    case 'status':
      return worktreeStatus(workspaceId, { ...opts, ...options });
    case 'clean':
      return worktreeClean(workspaceId, { ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.exit(1);
  }
}

module.exports = worktreeCommand;

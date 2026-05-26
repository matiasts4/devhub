'use strict';

/**
 * `devhub run` — agent run management.
 * Subcommands: list, status
 */

const { getDb } = require('../lib/db');
const { table, section, row } = require('../lib/format');

/**
 * Parse args for run subcommands.
 */
function parseRunArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0];
  let runId = null;
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      options.workspaceId = args[i + 1];
      i++;
    } else if (args[i] === '--task' && args[i + 1]) {
      options.taskId = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !runId) {
      runId = args[i];
    }
  }

  return { subcommand, runId, options };
}

/**
 * `devhub run list` — list agent runs.
 */
function runList(opts = {}) {
  const db = getDb();
  const limit = opts.limit || 20;

  try {
    const localDb = require('../../src/lib/db/localDb.js');
    if (!localDb.listAgentRuns) {
      throw new Error('listAgentRuns function not available');
    }

    const runs = localDb.listAgentRuns(db, {
      workspace_id: opts.workspaceId,
      task_id: opts.taskId,
      limit,
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify({ runs, count: runs.length }) + '\n');
    } else {
      if (runs.length === 0) {
        process.stdout.write('No runs found.\n');
      } else {
        process.stdout.write(section(`AGENT RUNS (${runs.length})`));
        process.stdout.write('\n');
        const headers = ['Run ID', 'Workspace', 'Task', 'Status', 'Created'];
        const rows = runs.map((r) => [
          r.run_id || '',
          r.workspace_id || '',
          r.task_id || '',
          r.status || '',
          r.created_at || '',
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
 * `devhub run status <id>` — show run detail with artifacts.
 */
function runStatus(runId, opts = {}) {
  if (!runId) {
    process.stderr.write('Run ID required\n');
    process.exit(2);
  }

  const db = getDb();

  try {
    const localDb = require('../../src/lib/db/localDb.js');
    if (!localDb.getAgentRunById || !localDb.listAgentArtifacts) {
      throw new Error('Run/artifact functions not available');
    }

    const run = localDb.getAgentRunById(db, runId);
    if (!run) {
      process.stderr.write('Run not found\n');
      process.exit(1);
    }

    const artifacts = localDb.listAgentArtifacts(db, runId);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ run, artifacts }) + '\n');
    } else {
      process.stdout.write(section('AGENT RUN'));
      process.stdout.write('\n');
      process.stdout.write(row('Run ID', run.run_id));
      process.stdout.write('\n');
      process.stdout.write(row('Workspace', run.workspace_id || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Task', run.task_id || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Status', run.status || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Artifacts', artifacts.length));
      process.stdout.write('\n\n');

      if (artifacts.length > 0) {
        process.stdout.write(section('ARTIFACTS'));
        process.stdout.write('\n');
        const headers = ['Type', 'Path', 'Size'];
        const rows = artifacts.map((a) => [
          a.artifact_type || '',
          a.path || '',
          a.size_bytes ? `${a.size_bytes} bytes` : '',
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
 * Main run command handler.
 */
function runCommand(opts = {}) {
  const { subcommand, runId, options } = parseRunArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub run <list|status> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list    List agent runs\n');
    process.stdout.write('  status  Show run detail with artifacts\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --workspace <id>  Filter by workspace ID (list only)\n');
    process.stdout.write('  --task <id>       Filter by task ID (list only)\n');
    process.stdout.write('  --limit <n>       Max runs (default: 20)\n');
    process.stdout.write('  --json            Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return runList({ ...opts, ...options });
    case 'status':
      return runStatus(runId, { ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.exit(1);
  }
}

module.exports = runCommand;

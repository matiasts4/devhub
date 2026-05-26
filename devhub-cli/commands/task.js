'use strict';

const { getDb, readTaskById } = require('../lib/db');
const { section, row, isTTY: formatIsTTY, table } = require('../lib/format');

const TRUNCATE_LENGTH = 120;

/**
 * Parse args for task subcommands.
 * @returns {object} { subcommand, taskId, options }
 */
function parseTaskArgs() {
  const args = process.argv.slice(3); // ['node', 'bin/devhub', 'task', ...]
  let subcommand = null;
  let taskId = null;
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'history') {
      subcommand = 'history';
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !taskId) {
      taskId = args[i];
    }
  }

  return { subcommand, taskId, options };
}

/**
 * `devhub task history <task-id>` — show task history.
 * @param {string} taskId
 * @param {object} opts
 */
function taskHistory(taskId, opts = {}) {
  const db = getDb();
  const limit = opts.limit || 10;

  // Import getTaskHistory from tasks.js
  let getTaskHistory;
  try {
    const tasks = require('../../src/lib/db/tasks.js');
    getTaskHistory = tasks.getTaskHistory;
  } catch (err) {
    process.stderr.write(`Error: getTaskHistory not available: ${err.message}\n`);
    process.exit(1);
  }

  const history = getTaskHistory(db, { taskId, limit });

  if (opts.json) {
    process.stdout.write(JSON.stringify({ task_id: taskId, history }) + '\n');
    process.exit(0);
  }

  // TTY formatted output
  if (history.length === 0) {
    process.stdout.write('No history found.\n');
    process.exit(0);
  }

  const effectiveTTY = process.env.FORCE_TTY === '1' || formatIsTTY;

  if (effectiveTTY) {
    process.stdout.write(section(`TASK HISTORY: ${taskId}`));
    process.stdout.write('\n');
    const headers = ['Timestamp', 'Action', 'Agent', 'Details'];
    const rows = history.map((h) => [
      h.timestamp || h.created_at || '',
      h.action || '',
      h.actor_id || h.agent_id || 'system',
      truncate(h.details || h.metadata || '', 60),
    ]);
    process.stdout.write(table(headers, rows));
    process.stdout.write('\n');
  } else {
    for (const h of history) {
      process.stdout.write(
        `${h.timestamp || h.created_at}|${h.action}|${h.actor_id || h.agent_id || 'system'}|${h.details || h.metadata || ''}\n`
      );
    }
  }

  process.exit(0);
}

/**
 * `devhub task <id>` — display task detail from SQLite.
 * TTY: formatted sections. Non-TTY: key=value pairs.
 * @param {string} taskId
 * @param {object} opts
 */
function taskDetail(taskId, opts = {}) {
  const verbose = opts.verbose === true;

  const db = getDb();
  const task = readTaskById(db, taskId);

  if (!task) {
    process.stderr.write('Task not found\n');
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ task }) + '\n');
    process.exit(0);
  }

  // Support FORCE_TTY for testing
  const forceTTY = process.env.FORCE_TTY === '1';
  const effectiveTTY = forceTTY || formatIsTTY;

  if (effectiveTTY) {
    // TTY formatted output
    const description = task.description
      ? verbose
        ? task.description
        : truncate(task.description, TRUNCATE_LENGTH)
      : '(none)';

    const lines = [];
    lines.push(section('TASK'));
    lines.push(row('Title', task.title || '(none)'));
    lines.push(row('Status', task.status || '(none)'));
    lines.push(row('Priority', task.priority || '(none)'));
    lines.push(row('Project', task.project_id || '(none)'));
    lines.push(row('Assigned To', task.assigned_to || '(none)'));
    lines.push(row('Due Date', task.due_date || '(none)'));
    lines.push(row('Description', description));
    lines.push('');

    process.stdout.write(lines.join('\n'));
  } else {
    // Non-TTY key=value output
    const description = task.description || '';
    const lines = [
      `id=${task.id}`,
      `title=${task.title || ''}`,
      `status=${task.status || ''}`,
      `priority=${task.priority || ''}`,
      `project=${task.project_id || ''}`,
      `assigned_to=${task.assigned_to || ''}`,
      `due_date=${task.due_date || ''}`,
      `description=${description}`,
    ];

    process.stdout.write(lines.join('\n') + '\n');
  }

  process.exit(0);
}

/**
 * Main task command handler.
 * @param {object} opts
 */
function taskCommand(opts = {}) {
  const { subcommand, taskId, options } = parseTaskArgs();

  if (!taskId) {
    process.stderr.write('Task ID required\n');
    process.stderr.write('Usage: devhub task <id> [--verbose] [--json]\n');
    process.stderr.write('       devhub task history <id> [--limit <n>] [--json]\n');
    process.exit(2);
  }

  if (subcommand === 'history') {
    return taskHistory(taskId, { ...opts, ...options });
  } else {
    return taskDetail(taskId, { ...opts, ...options });
  }
}

/**
 * Truncate text to maxLen, appending ellipsis if truncated.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

module.exports = taskCommand;

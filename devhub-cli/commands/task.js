'use strict';

const { getDb, readTaskById } = require('../lib/db');
const { section, row, divider, isTTY: formatIsTTY } = require('../lib/format');

const TRUNCATE_LENGTH = 120;

/**
 * `devhub task <id>` — display task detail from SQLite.
 * TTY: formatted sections. Non-TTY: key=value pairs.
 * @param {object} opts
 * @param {boolean} [opts.verbose] - Show full description without truncation
 */
function taskCommand(opts = {}) {
  const verbose = opts.verbose === true;

  // Validate ID argument
  const args = process.argv.slice(3); // ['node', 'bin/devhub', 'task', ...]
  const id = args.find(a => !a.startsWith('--'));

  if (!id) {
    process.stderr.write('ID required\n');
    process.exit(2);
  }

  const db = getDb();
  const task = readTaskById(db, id);

  if (!task) {
    process.stderr.write('Task not found\n');
    process.exit(1);
  }

  // Support FORCE_TTY for testing
  const forceTTY = process.env.FORCE_TTY === '1';
  const effectiveTTY = forceTTY || formatIsTTY;

  if (effectiveTTY) {
    // TTY formatted output
    const description = task.description
      ? (verbose ? task.description : truncate(task.description, TRUNCATE_LENGTH))
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

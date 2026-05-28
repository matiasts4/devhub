'use strict';

/**
 * `devhub inbox` — inbox item management.
 * Subcommands: list, read, dismiss
 *
 * NOTE: This command relies on operator_inbox, the current runtime inbox projection.
 * If the table is missing, these commands will fail with clear error messages.
 */

const { getDb } = require('../lib/db');
const { table, section } = require('../lib/format');

/**
 * Parse args for inbox subcommands.
 */
function parseInboxArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0];
  let itemId = null;
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--status' && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    } else if (args[i] === '--category' && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !itemId) {
      itemId = args[i];
    }
  }

  return { subcommand, itemId, options };
}

/**
 * `devhub inbox list` — list inbox items.
 */
function inboxList(opts = {}) {
  const db = getDb();
  const limit = opts.limit || 20;

  try {
    const localDb = require('../../src/lib/db/localDb.js');
    if (!localDb.queryOperatorInbox) {
      throw new Error('queryOperatorInbox function not available');
    }

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operator_inbox'")
      .get();

    if (!tableExists) {
      throw new Error('operator_inbox table does not exist');
    }

    const items = localDb.queryOperatorInbox(db, {
      status: opts.status,
      category: opts.category,
      limit,
      offset: 0,
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify({ items, count: items.length }) + '\n');
    } else {
      if (items.length === 0) {
        process.stdout.write('No inbox items found.\n');
      } else {
        process.stdout.write(section(`INBOX (${items.length})`));
        process.stdout.write('\n');
        const headers = ['ID', 'Status', 'Category', 'Message', 'Created'];
        const rows = items.map((i) => [
          i.inbox_id || '',
          i.status || '',
          i.category || '',
          (i.message || '').slice(0, 40),
          i.created_at || '',
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
 * `devhub inbox read <id>` — mark item as read.
 */
function inboxRead(itemId, opts = {}) {
  if (!itemId) {
    process.stderr.write('Item ID required\n');
    process.exit(2);
  }

  const db = getDb();

  try {
    const localDb = require('../../src/lib/db/localDb.js');
    if (!localDb.markInboxItemRead) {
      throw new Error('markInboxItemRead function not available');
    }

    localDb.markInboxItemRead(db, itemId);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ success: true, item_id: itemId }) + '\n');
    } else {
      process.stdout.write(`Marked item ${itemId} as read.\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub inbox dismiss <id>` — dismiss item.
 */
function inboxDismiss(itemId, opts = {}) {
  if (!itemId) {
    process.stderr.write('Item ID required\n');
    process.exit(2);
  }

  const db = getDb();

  try {
    const localDb = require('../../src/lib/db/localDb.js');
    if (!localDb.dismissInboxItem) {
      throw new Error('dismissInboxItem function not available');
    }

    localDb.dismissInboxItem(db, itemId);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ success: true, item_id: itemId }) + '\n');
    } else {
      process.stdout.write(`Dismissed item ${itemId}.\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Main inbox command handler.
 */
function inboxCommand(opts = {}) {
  const { subcommand, itemId, options } = parseInboxArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub inbox <list|read|dismiss> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list     List inbox items\n');
    process.stdout.write('  read     Mark item as read\n');
    process.stdout.write('  dismiss  Dismiss item\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --status <s>    Filter by status (unread|read|dismissed)\n');
    process.stdout.write('  --category <c>  Filter by category\n');
    process.stdout.write('  --limit <n>     Max items (default: 20)\n');
    process.stdout.write('  --json          Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return inboxList({ ...opts, ...options });
    case 'read':
      return inboxRead(itemId, { ...opts, ...options });
    case 'dismiss':
      return inboxDismiss(itemId, { ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.exit(1);
  }
}

module.exports = inboxCommand;

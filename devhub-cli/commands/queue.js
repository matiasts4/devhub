'use strict';

const { getDb } = require('../lib/db');
const { table } = require('../lib/format');

const MAX_TITLE_LEN = 40;

/**
 * Format lease expiry with relative time indicator.
 * @param {string|null} leaseExpiresAt - ISO 8601 timestamp
 * @returns {string}
 */
function formatLease(leaseExpiresAt) {
  if (!leaseExpiresAt) return '';
  const expiry = new Date(leaseExpiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const diffM = Math.round(diffMs / (1000 * 60));

  let relative;
  if (diffMs < 0) {
    relative = 'expired';
  } else if (diffM < 60) {
    relative = `in ${diffM}m`;
  } else {
    relative = `in ${diffH}h`;
  }

  return `${leaseExpiresAt} (${relative})`;
}

/**
 * Truncate title to MAX_TITLE_LEN with ellipsis.
 * @param {string} title
 * @returns {string}
 */
function truncateTitle(title) {
  if (title.length <= MAX_TITLE_LEN) return title;
  return title.slice(0, MAX_TITLE_LEN - 3) + '...';
}

/**
 * `devhub queue` — shows prioritized execution queue.
 * @param {object} opts
 * @param {number} opts.limit - Max rows (default 20)
 * @param {string} [opts.project] - Project ID filter
 * @param {boolean} [opts.blocked] - Show only blocked tasks
 */
function queueCommand(opts = {}) {
  const limit = opts.limit !== undefined ? Number(opts.limit) : 20;
  const projectId = opts.project;
  const blocked = opts.blocked === true;

  // Handle --limit 0
  if (limit === 0) {
    process.stdout.write('No tasks in queue\n');
    process.exit(0);
  }

  const db = getDb();

  let entries;

  if (projectId) {
    // Single project query path
    const { queue } = require('../lib/db').readExecutionQueueSummary(db, {
      projectId,
      limit,
      includeBlocked: true,
    });
    entries = queue;
  } else {
    // Cross-project merge path
    const activeProjects = db.prepare(
      "SELECT id, name FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 10"
    ).all();

    const seen = new Map();
    for (const proj of activeProjects) {
      const { queue } = require('../lib/db').readExecutionQueueSummary(db, {
        projectId: proj.id,
        limit: 1000,
        includeBlocked: true,
      });
      for (const entry of queue) {
        entry.project_name = proj.name;
        if (!seen.has(entry.id)) {
          seen.set(entry.id, entry);
        }
      }
    }

    entries = Array.from(seen.values())
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, limit);
  }

  // Apply blocked filter
  if (blocked) {
    entries = entries.filter(e => e.blocked);
  }

  // Handle empty result
  if (entries.length === 0) {
    process.stdout.write('No tasks in queue\n');
    process.exit(0);
  }

  // Build table rows
  const rows = entries.map(entry => {
    const status = entry.blocked ? 'blocked' : (entry.status || 'pending');
    const title = truncateTitle(entry.title);
    const blockedReason = entry.blocked && entry.blocked_reason
      ? `blocked by: ${entry.blocked_reason}`
      : '';
    const lease = entry.lease_expires_at ? formatLease(entry.lease_expires_at) : '';

    return [
      String(entry.priority_score),
      status,
      title,
      entry.project_name || '',
      blockedReason,
      lease,
    ];
  });

  const headers = ['Score', 'Status', 'Title', 'Project', 'Blocked', 'Lease'];
  const output = table(headers, rows);

  process.stdout.write(output + '\n');
  process.exit(0);
}

module.exports = queueCommand;

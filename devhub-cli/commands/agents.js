'use strict';

const { getDb, readAgentRegistrySummary } = require('../lib/db');
const { table } = require('../lib/format');

/**
 * Truncate agent_id to 20 chars if needed.
 * @param {string} id
 * @returns {string}
 */
function truncateAgentId(id) {
  if (!id) return '—';
  return id.length > 20 ? id.slice(0, 17) + '...' : id;
}

/**
 * `devhub agents` — displays live swarm agent state from SQLite.
 * @param {object} opts
 * @param {string} [opts.status] - Exact status filter
 * @param {boolean} [opts.active] - Filter to active statuses
 */
function agentsCommand(opts = {}) {
  const statusFilter = opts.status;
  const activeOnly = opts.active === true;

  // Validate mutual exclusion
  if (statusFilter && activeOnly) {
    process.stderr.write('error: --active and --status are mutually exclusive\n');
    process.exit(2);
  }

  const db = getDb();

  const { rows, total } = readAgentRegistrySummary(db, {
    statusFilter,
    activeOnly,
  });

  // Handle empty state
  if (total === 0) {
    process.stdout.write('No agents registered\n');
    process.exit(0);
  }

  // Build table rows
  const dataRows = rows.map((row) => [
    truncateAgentId(row.agent_id),
    row.status || '—',
    row.current_task_id || '—',
    row.branch_name || '—',
    row.modelo_llm || '—',
    row.heartbeat_label || 'unknown',
  ]);

  const headers = ['AGENT', 'STATUS', 'TASK', 'BRANCH', 'MODEL', 'HEARTBEAT'];
  // Support FORCE_TTY for testing TTY output in non-TTY environments
  const forceTTY = process.env.FORCE_TTY === '1';
  const output = table(headers, dataRows, forceTTY || undefined);

  process.stdout.write(output + '\n');
  process.exit(0);
}

module.exports = agentsCommand;

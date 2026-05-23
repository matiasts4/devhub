'use strict';

const { getDb, ensureWriteSchema } = require('../lib/db');

const VALID_STATUSES = new Set([
  'active', 'idle', 'working', 'running', 'thinking',
  'asking_questions', 'completed', 'failed', 'error', 'offline',
]);

/**
 * Update-status command: updates status and optional task_description for a given agent_id.
 * Usage: devhub update-status <agent-id> <status> [task-description]
 * Exit codes: 0 = success, 1 = invalid status or agent not found, 2 = missing args
 */
function updateStatus(agentId, status, taskDescription) {
  if (!agentId || !status) {
    process.stderr.write('error: missing required arguments <agent-id> <status>\n');
    process.exit(2);
  }

  if (!VALID_STATUSES.has(status)) {
    process.stderr.write(
      `error: invalid status '${status}'. Valid values: ${[...VALID_STATUSES].join(', ')}\n`
    );
    process.exit(1);
  }

  ensureWriteSchema();
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE agent_registry SET status = ?, task_description = COALESCE(?, task_description) WHERE agent_id = ?"
    )
    .run(status, taskDescription || null, agentId);

  if (result.changes === 0) {
    process.stderr.write(`warning: agent '${agentId}' not found in registry\n`);
    process.exit(1);
  }

  process.stdout.write(`Status updated for agent '${agentId}': ${status}\n`);
  process.exit(0);
}

module.exports = updateStatus;

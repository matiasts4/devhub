'use strict';

const { getDb, ensureWriteSchema, releaseTask } = require('../lib/db');

const VALID_OUTCOMES = new Set(['completed', 'paused', 'failed', 'abandoned']);

/**
 * Release command: validates token, clears lease, updates status.
 * Usage: devhub release <task-id> <claim-token> [--outcome completed|paused|failed|abandoned]
 * Exit codes: 0 = success, 1 = not found/not claimed/token mismatch, 2 = missing args/invalid outcome
 */
function release(taskId, claimToken, opts) {
  if (!taskId) {
    process.stderr.write('error: missing required arguments: task-id, claim-token\n');
    process.exit(2);
  }

  if (!claimToken) {
    process.stderr.write('error: missing required argument: claim-token\n');
    process.exit(2);
  }

  const outcome = opts?.outcome || 'completed';

  if (!VALID_OUTCOMES.has(outcome)) {
    process.stderr.write(
      `error: invalid outcome: ${outcome}. Must be one of: completed, paused, failed, abandoned\n`
    );
    process.exit(2);
  }

  ensureWriteSchema();
  const db = getDb();

  // Check if task exists and if it's claimed
  const task = db.prepare('SELECT id, claim_token, lease_expires_at FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    process.stderr.write(`error: task not found: ${taskId}\n`);
    process.exit(1);
  }

  if (!task.claim_token) {
    process.stderr.write(`error: task ${taskId} is not currently claimed\n`);
    process.exit(1);
  }

  // Check for expired lease
  if (task.lease_expires_at) {
    const leaseExpiry = new Date(task.lease_expires_at).getTime();
    if (leaseExpiry < Date.now()) {
      process.stdout.write(`warning: lease expired at ${task.lease_expires_at}\n`);
    }
  }

  // Perform the release
  const result = releaseTask(taskId, claimToken, outcome);

  if (result.changes === 0 && result.wasClaimed) {
    process.stderr.write('error: invalid claim token\n');
    process.exit(1);
  }

  process.stdout.write(`Task ${taskId} released (${outcome})\n`);
  process.exit(0);
}

module.exports = release;

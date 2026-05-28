'use strict';

const crypto = require('crypto');
const { getDb, ensureWriteSchema, claimNextTask } = require('../lib/db');

/**
 * Claim command: takes next pending task for an agent, sets lease.
 * Usage: devhub claim <agent-id>
 * Exit codes: 0 = success, 1 = no tasks or agent not found, 2 = missing args
 */
function claim(agentId) {
  if (!agentId) {
    process.stderr.write('error: missing required argument: agent-id\n');
    process.exit(2);
  }

  ensureWriteSchema();
  const db = getDb();

  // Check agent exists in registry
  const agent = db.prepare('SELECT project_id FROM agent_registry WHERE agent_id = ?').get(agentId);
  if (!agent || !agent.project_id) {
    process.stderr.write(`error: agent '${agentId}' not found in registry\n`);
    process.exit(1);
  }

  // Get next available task
  const task = claimNextTask(agentId);
  if (!task) {
    process.stdout.write('No pending tasks available\n');
    process.exit(1);
  }

  // Generate claim token
  const claimToken = crypto.randomBytes(16).toString('hex');
  const leaseExpiry = new Date(Date.now() + 300_000).toISOString();

  // Atomic claim update
  const result = db.prepare(
    "UPDATE tasks SET status = 'in_progress', claim_token = ?, lease_expires_at = ?, claimed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).run(claimToken, leaseExpiry, task.id);

  if (result.changes === 0) {
    process.stderr.write(`error: task '${task.id}' could not be claimed (may have been claimed by another agent)\n`);
    process.exit(1);
  }

  // Get project name for output
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(agent.project_id);
  const projectName = project ? project.name : agent.project_id;

  // TTY-aware output
  const isTTY = process.stdout.isTTY === true || process.env.FORCE_TTY === '1';

  if (!isTTY) {
    // JSON output for piping
    process.stdout.write(JSON.stringify({
      id: task.id,
      title: task.title,
      project: projectName,
      claim_token: claimToken,
      lease_expires_at: leaseExpiry,
    }) + '\n');
  } else {
    process.stdout.write(`Task: ${task.id}\n`);
    process.stdout.write(`Title: ${task.title}\n`);
    process.stdout.write(`Project: ${projectName}\n`);
    process.stdout.write(`Token: ${claimToken}\n`);
    process.stdout.write(`Lease: ${leaseExpiry}\n`);
  }

  process.exit(0);
}

module.exports = claim;

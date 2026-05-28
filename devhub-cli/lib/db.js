'use strict';

const compactReads = require('../../src/lib/db/compactReads.js');
const { getDb, closeDb } = require('../../src/lib/db/core.js');
const swarmMissions = require('../../src/lib/db/swarmMissions.js');
const crypto = require('crypto');

// Re-export mission message / delivery functions from swarmMissions barrel
const { createMissionMessage, upsertMessageDelivery, isMissionMessageKind, MISSION_MESSAGE_KINDS } =
  swarmMissions;

/**
 * Claim the next available pending task for a given agent.
 * Resolves agent's project, queries execution queue, returns first non-blocked task or null.
 * @param {string} agentId - Agent ID from agent_registry
 * @returns {object|null} First non-blocked pending task, or null
 */
function claimNextTask(agentId) {
  const db = getDb();

  // Resolve project_id from agent_registry
  const agent = db.prepare('SELECT project_id FROM agent_registry WHERE agent_id = ?').get(agentId);
  if (!agent || !agent.project_id) {
    return null;
  }

  // Get prioritized execution queue
  const { readExecutionQueueSummary } = compactReads;
  const { queue } = readExecutionQueueSummary(db, {
    projectId: agent.project_id,
    limit: 20,
    includeBlocked: true,
  });

  // Find first non-blocked pending task
  for (const entry of queue) {
    if (!entry.blocked && entry.status === 'pending') {
      return entry;
    }
  }

  return null;
}

/**
 * Release a claimed task: validate token, clear lease, update status.
 * Returns { changes, taskFound, wasClaimed } for caller to distinguish error types.
 * @param {string} taskId - Task ID
 * @param {string} claimToken - Claim token to validate
 * @param {string} outcome - Outcome value (completed|paused|failed|abandoned)
 * @returns {{ changes: number, taskFound: boolean, wasClaimed: boolean }}
 */
function releaseTask(taskId, claimToken, outcome) {
  const db = getDb();

  // Map outcome to status
  const outcomeMap = {
    completed: 'completed',
    paused: 'paused',
    failed: 'failed',
    abandoned: 'blocked',
  };
  const newStatus = outcomeMap[outcome] || 'completed';

  // Check if task exists
  const task = db.prepare('SELECT id, claim_token FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    return { changes: 0, taskFound: false, wasClaimed: false };
  }

  // Check if task was claimed
  if (!task.claim_token) {
    return { changes: 0, taskFound: true, wasClaimed: false };
  }

  // Atomic update: validate token in WHERE clause
  const result = db
    .prepare(
      "UPDATE tasks SET status = ?, claim_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND claim_token = ?"
    )
    .run(newStatus, taskId, claimToken);

  return { changes: result.changes, taskFound: true, wasClaimed: true };
}

/**
 * Ensure writable schema columns exist on agent_registry.
 * Called once on CLI startup — safe to call repeatedly.
 * Adds task_description column if missing (needed by update-status command).
 */
function ensureWriteSchema() {
  const db = getDb();
  // Check if agent_registry exists; create it if missing (fresh test DB)
  const hasTable = db
    .prepare(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='agent_registry'"
    )
    .get();
  if (!hasTable.cnt) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_registry (
        agent_id TEXT PRIMARY KEY,
        project_id TEXT,
        nombre TEXT,
        modelo_llm TEXT,
        status TEXT DEFAULT 'idle',
        current_task_id TEXT,
        last_heartbeat TEXT,
        task_description TEXT
      )
    `);
    return; // Fresh table already has task_description column
  }
  const cols = db.pragma('table_info(agent_registry)');
  const hasTaskDesc = cols.some((c) => c.name === 'task_description');
  if (!hasTaskDesc) {
    db.exec('ALTER TABLE agent_registry ADD COLUMN task_description TEXT');
  }
}

module.exports = {
  ...compactReads,
  getDb,
  closeDb,
  ensureWriteSchema,
  claimNextTask,
  releaseTask,
  crypto,
  createMissionMessage,
  upsertMessageDelivery,
  isMissionMessageKind,
  MISSION_MESSAGE_KINDS,
};

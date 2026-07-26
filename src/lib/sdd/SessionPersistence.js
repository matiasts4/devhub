/**
 * @module SessionPersistence
 * Session persistence layer with SQLite swarm_sessions table
 * and Engram sync for agent_context.
 * Aligns tmux session naming with sessionId.
 */

'use strict';

const { generateSessionId, buildTmuxSessionName } = require('./sessionIdUtils');

// ---------------------------------------------------------------------------
// SQLite schema for swarm_sessions
// ---------------------------------------------------------------------------

const SWARM_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS swarm_sessions (
    session_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    mission_id TEXT,
    phase TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'failed')),
    artifacts_json TEXT,
    context_json TEXT,
    checkpoint TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_swarm_sessions_agent ON swarm_sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_sessions_mission ON swarm_sessions(mission_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_sessions_phase ON swarm_sessions(phase);
`;

// ---------------------------------------------------------------------------
// Phase branch map schema
// ---------------------------------------------------------------------------

const PHASE_BRANCH_MAP_SQL = `
  CREATE TABLE IF NOT EXISTS phase_branch_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    worktree_path TEXT,
    baseline_commit TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'merged', 'cleaned')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(mission_id, phase)
  );
  CREATE INDEX IF NOT EXISTS idx_phase_branch_mission ON phase_branch_map(mission_id);
  CREATE INDEX IF NOT EXISTS idx_phase_branch_phase ON phase_branch_map(phase);
`;

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

let _db = null;

function getDb() {
  if (!_db) {
    // Guard: only load SQLite in Node.js runtime (not browser)
    if (typeof window !== 'undefined') {
      throw new Error('SessionPersistence.getDb() is server-only');
    }
    // Lazy load to avoid circular deps
    const { getDb: getSharedDb } = require('../db/shared');
    _db = getSharedDb();
    // Ensure tables exist
    try {
      _db.exec(SWARM_SESSIONS_TABLE_SQL);
      _db.exec(PHASE_BRANCH_MAP_SQL);
    } catch (_e) {
      // Tables may already exist
    }
  }
  return _db;
}

function resetDb() {
  _db = null;
}

/**
 * Persist a swarm session to SQLite.
 */
async function persistSession({
  sessionId,
  agentId,
  missionId,
  phase,
  artifacts = {},
  context = {},
  checkpoint = null,
} = {}) {
  const db = getDb();
  const now = new Date().toISOString();

  const row = {
    session_id: sessionId || generateSessionId(),
    agent_id: agentId,
    mission_id: missionId || null,
    phase: phase || 'sdd-apply',
    status: 'active',
    artifacts_json: JSON.stringify(artifacts),
    context_json: JSON.stringify(context),
    checkpoint: checkpoint || null,
    updated_at: now,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO swarm_sessions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(session_id) DO UPDATE SET
       agent_id = excluded.agent_id,
       mission_id = excluded.mission_id,
       phase = excluded.phase,
       artifacts_json = excluded.artifacts_json,
       context_json = excluded.context_json,
       checkpoint = excluded.checkpoint,
       updated_at = excluded.updated_at`
  ).run(...keys.map((k) => row[k]));

  // Sync to Engram if available
  await syncSessionToEngram(row);

  return row.session_id;
}

/**
 * Sync session to Engram for cross-session recall.
 */
async function syncSessionToEngram(sessionRow) {
  try {
    // Engram sync via mem_save - fire and forget
    const { engram_mem_save } = require('./engramSync');
    if (engram_mem_save) {
      await engram_mem_save({
        title: `swarm-session-${sessionRow.session_id}`,
        type: 'architecture',
        capture_prompt: false,
        content: JSON.stringify({
          session_id: sessionRow.session_id,
          agent_id: sessionRow.agent_id,
          mission_id: sessionRow.mission_id,
          phase: sessionRow.phase,
          status: sessionRow.status,
          artifacts: JSON.parse(sessionRow.artifacts_json || '{}'),
          context: JSON.parse(sessionRow.context_json || '{}'),
          checkpoint: sessionRow.checkpoint,
          created_at: sessionRow.created_at,
          updated_at: sessionRow.updated_at,
        }),
      });
    }
  } catch (e) {
    // Engram sync is best-effort; don't fail the operation
    console.warn('[SessionPersistence] Engram sync failed:', e.message);
  }
}

/**
 * Reactivate an existing session by sessionId.
 */
async function reactivateSession({ sessionId }) {
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM swarm_sessions WHERE session_id = ? LIMIT 1')
    .get(sessionId);

  if (!row) return null;

  // Update status to active
  db.prepare(
    `UPDATE swarm_sessions SET status = 'active', updated_at = ? WHERE session_id = ?`
  ).run(new Date().toISOString(), sessionId);

  return {
    sessionId: row.session_id,
    agentId: row.agent_id,
    missionId: row.mission_id,
    phase: row.phase,
    artifacts: JSON.parse(row.artifacts_json || '{}'),
    context: JSON.parse(row.context_json || '{}'),
    checkpoint: row.checkpoint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get session state without reactivating.
 */
async function getSession({ sessionId }) {
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM swarm_sessions WHERE session_id = ? LIMIT 1')
    .get(sessionId);

  if (!row) return null;

  return {
    sessionId: row.session_id,
    agentId: row.agent_id,
    missionId: row.mission_id,
    phase: row.phase,
    status: row.status,
    artifacts: JSON.parse(row.artifacts_json || '{}'),
    context: JSON.parse(row.context_json || '{}'),
    checkpoint: row.checkpoint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/**
 * Update session checkpoint (save progress).
 */
async function updateCheckpoint({ sessionId, checkpoint, artifacts = null, context = null }) {
  const db = getDb();
  const now = new Date().toISOString();

  const updates = ['checkpoint = ?', 'updated_at = ?'];
  const values = [checkpoint, now];

  if (artifacts !== null) {
    updates.push('artifacts_json = ?');
    values.push(JSON.stringify(artifacts));
  }
  if (context !== null) {
    updates.push('context_json = ?');
    values.push(JSON.stringify(context));
  }

  values.push(sessionId);
  db.prepare(`UPDATE swarm_sessions SET ${updates.join(', ')} WHERE session_id = ?`).run(...values);
}

/**
 * Complete a session.
 */
async function completeSession({ sessionId, status = 'completed' }) {
  const db = getDb();
  db.prepare(
    `UPDATE swarm_sessions SET status = ?, completed_at = ?, updated_at = ? WHERE session_id = ?`
  ).run(status, new Date().toISOString(), new Date().toISOString(), sessionId);
}

/**
 * List active sessions for a mission.
 */
async function listActiveSessions({ missionId }) {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM swarm_sessions WHERE mission_id = ? AND status = ? ORDER BY updated_at DESC'
    )
    .all(missionId, 'active');

  return rows.map((row) => ({
    sessionId: row.session_id,
    agentId: row.agent_id,
    phase: row.phase,
    status: row.status,
    checkpoint: row.checkpoint,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Phase branch map operations
// ---------------------------------------------------------------------------

/**
 * Register or update a phase branch mapping.
 */
async function upsertPhaseBranch({
  missionId,
  phase,
  branchName,
  worktreePath = null,
  baselineCommit = null,
}) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO phase_branch_map (mission_id, phase, branch_name, worktree_path, baseline_commit, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(mission_id, phase) DO UPDATE SET
       branch_name = excluded.branch_name,
       worktree_path = excluded.worktree_path,
       baseline_commit = excluded.baseline_commit,
       status = 'active',
       updated_at = excluded.updated_at`
  ).run(missionId, phase, branchName, worktreePath, baselineCommit, now);
}

/**
 * Get branch for a specific phase.
 */
async function getPhaseBranch({ missionId, phase }) {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM phase_branch_map WHERE mission_id = ? AND phase = ? LIMIT 1')
    .get(missionId, phase);

  if (!row) return null;
  return {
    missionId: row.mission_id,
    phase: row.phase,
    branchName: row.branch_name,
    worktreePath: row.worktree_path,
    baselineCommit: row.baseline_commit,
    status: row.status,
  };
}

/**
 * Mark a phase branch as merged.
 */
async function markPhaseMerged({ missionId, phase }) {
  const db = getDb();
  db.prepare(
    `UPDATE phase_branch_map SET status = 'merged', updated_at = ? WHERE mission_id = ? AND phase = ?`
  ).run(new Date().toISOString(), missionId, phase);
}

/**
 * Mark a phase branch as cleaned (post-archive).
 */
async function markPhaseCleaned({ missionId, phase }) {
  const db = getDb();
  db.prepare(
    `UPDATE phase_branch_map SET status = 'cleaned', updated_at = ? WHERE mission_id = ? AND phase = ?`
  ).run(new Date().toISOString(), missionId, phase);
}

/**
 * Cleanup all phase branches for a mission (post-archive).
 */
async function cleanupMissionPhaseBranches({ missionId }) {
  const db = getDb();
  db.prepare(
    `UPDATE phase_branch_map SET status = 'cleaned', updated_at = ? WHERE mission_id = ?`
  ).run(new Date().toISOString(), missionId);
}

/**
 * List all phase branches for a mission.
 */
async function listPhaseBranches({ missionId }) {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM phase_branch_map WHERE mission_id = ? ORDER BY created_at ASC')
    .all(missionId);

  return rows.map((row) => ({
    missionId: row.mission_id,
    phase: row.phase,
    branchName: row.branch_name,
    worktreePath: row.worktree_path,
    baselineCommit: row.baseline_commit,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

module.exports = {
  generateSessionId,
  buildTmuxSessionName,
  persistSession,
  reactivateSession,
  getSession,
  updateCheckpoint,
  completeSession,
  listActiveSessions,
  upsertPhaseBranch,
  getPhaseBranch,
  markPhaseMerged,
  markPhaseCleaned,
  cleanupMissionPhaseBranches,
  listPhaseBranches,
  SWARM_SESSIONS_TABLE_SQL,
  PHASE_BRANCH_MAP_SQL,
  resetDb,
};

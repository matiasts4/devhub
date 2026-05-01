/**
 * DB Bridge — Thin wrapper around the shared DevHub SQLite database.
 *
 * Provides the telegram-bot process with read/write access to the same
 * `data/devhub.db` that the Next.js server uses. This bridges Phase 1
 * schema additions (agent_traces, telegram_session_map, etc.) to the bot.
 *
 * Uses a SINGLE persistent connection (like activityLogger.js).
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const { ensureRuntimeSchema } = require('../../src/lib/db/localDb');
const { resolveDbPath } = require('../../src/lib/db/pathResolver');

const DB_PATH = resolveDbPath({ moduleDir: __dirname });

const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
ensureRuntimeSchema(db);

// ── Prepared statements: telegram_session_map ───────────────────────────────

const getActiveTelegramSession = db.prepare(`
  SELECT * FROM telegram_session_map
  WHERE telegram_chat_id = ? AND active = 1
`);

const createTelegramSessionMap = db.prepare(`
  INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
  VALUES (?, ?, ?, 1)
  ON CONFLICT(telegram_chat_id) DO UPDATE SET
    session_id = excluded.session_id,
    project_id = excluded.project_id,
    active = 1,
    updated_at = datetime('now')
`);

const getSessionsByTelegramChat = db.prepare(`
  SELECT s.* FROM agent_hub_sessions s
  JOIN telegram_session_map tsm ON s.id = tsm.session_id
  WHERE tsm.telegram_chat_id = ?
  ORDER BY s.updated_at DESC
  LIMIT ?
`);

// ── Prepared statements: agent_hub_sessions ─────────────────────────────────

const getSessionById = db.prepare(`
  SELECT * FROM agent_hub_sessions WHERE id = ?
`);

const createAgentHubSession = db.prepare(`
  INSERT INTO agent_hub_sessions
    (id, project_id, title, agent_model, telegram_chat_id, directory, status)
  VALUES (?, ?, ?, ?, ?, ?, 'active')
`);

const _updateSessionStatus = db.prepare(`
  UPDATE agent_hub_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?
`);

const _updateSessionOpenCodeId = db.prepare(`
  UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?
`);

const _getActiveSessionsForProject = db.prepare(`
  SELECT * FROM agent_hub_sessions
  WHERE project_id = ? AND status IN ('active', 'busy')
  ORDER BY updated_at DESC
`);

// ── Prepared statements: agent_hub_messages ─────────────────────────────────

const insertMessageStmt = db.prepare(`
  INSERT INTO agent_hub_messages
    (id, session_id, role, content, meta, source, tool_call_id, tool_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getMessagesBySession = db.prepare(`
  SELECT * FROM agent_hub_messages
  WHERE session_id = ?
  ORDER BY created_at ASC
`);

const getMessagesBySessionLimited = db.prepare(`
  SELECT * FROM agent_hub_messages
  WHERE session_id = ?
  ORDER BY created_at ASC
  LIMIT ?
`);

// ── Prepared statements: agent_traces ────────────────────────────────────────

const insertTrace = db.prepare(`
  INSERT INTO agent_traces
    (id, session_id, trace_type, agent_name, tool_name, tool_input, tool_output,
     tool_status, content, duration_ms, time_start, time_end, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── Prepared statements: agent_session_usage ─────────────────────────────────

const upsertSessionUsage = db.prepare(`
  INSERT INTO agent_session_usage
    (id, session_id, prompt_tokens, completion_tokens, total_tokens,
     context_window_size, context_utilization, tool_calls_count, total_duration_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    prompt_tokens = excluded.prompt_tokens,
    completion_tokens = excluded.completion_tokens,
    total_tokens = excluded.total_tokens,
    context_window_size = excluded.context_window_size,
    context_utilization = excluded.context_utilization,
    tool_calls_count = excluded.tool_calls_count,
    total_duration_ms = excluded.total_duration_ms,
    updated_at = datetime('now')
`);

const getSessionUsage = db.prepare(`
  SELECT * FROM agent_session_usage WHERE session_id = ?
`);

// ── Prepared statements: projects ────────────────────────────────────────────

const getProjectById = db.prepare(`
  SELECT * FROM projects WHERE id = ?
`);

const getProjectByName = db.prepare(`
  SELECT * FROM projects WHERE name LIKE ? LIMIT 1
`);

const _getActiveProjects = db.prepare(`
  SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC
`);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the active telegram_session_map entry for a chat ID.
 * @param {string} chatId
 * @returns {object|null}
 */
function getTelegramSession(chatId) {
  return getActiveTelegramSession.get(String(chatId)) || null;
}

/**
 * Create or overwrite the telegram_session_map entry for a chat.
 * @param {string} chatId
 * @param {string} sessionId
 * @param {string|null} projectId
 * @returns {object} run result
 */
function createTelegramSession(chatId, sessionId, projectId) {
  return createTelegramSessionMap.run(String(chatId), sessionId, projectId || null);
}

/**
 * Get session history for a Telegram chat.
 * @param {string} chatId
 * @param {number} [limit=20]
 * @returns {Array}
 */
function getSessionsByChat(chatId, limit = 20) {
  return getSessionsByTelegramChat.all(String(chatId), limit);
}

/**
 * Get an agent_hub_session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
function getSession(sessionId) {
  return getSessionById.get(sessionId) || null;
}

/**
 * Create a new agent_hub_session.
 * @param {object} data
 * @returns {object} the created row
 */
function createSession(data) {
  const id = data.id || crypto.randomUUID();
  createAgentHubSession.run(
    id,
    data.project_id || null,
    data.title || `Session ${new Date().toLocaleString()}`,
    data.agent_model || null,
    data.telegram_chat_id || null,
    data.directory || null
  );
  return getSession(id);
}

/**
 * Update session status.
 */
function updateSessionStatus(sessionId, status) {
  return _updateSessionStatus.run(status, sessionId);
}

/**
 * Update session's OpenCode session ID.
 */
function updateSessionOpenCodeId(sessionId, opencodeSessionId) {
  return _updateSessionOpenCodeId.run(opencodeSessionId, sessionId);
}

/**
 * Insert a trace into agent_traces.
 * @param {object} trace
 */
function insertTraceRecord(trace) {
  return insertTrace.run(
    trace.id || crypto.randomUUID(),
    trace.session_id,
    trace.trace_type || 'text',
    trace.agent_name || null,
    trace.tool_name || null,
    trace.tool_input ? JSON.stringify(trace.tool_input) : null,
    trace.tool_output || null,
    trace.tool_status || null,
    trace.content || null,
    trace.duration_ms || null,
    trace.time_start || null,
    trace.time_end || null,
    trace.metadata ? JSON.stringify(trace.metadata) : null
  );
}

/**
 * Upsert session usage stats.
 * @param {object} data
 */
function upsertUsage(data) {
  return upsertSessionUsage.run(
    data.id || crypto.randomUUID(),
    data.session_id,
    data.prompt_tokens || 0,
    data.completion_tokens || 0,
    data.total_tokens || 0,
    data.context_window_size || null,
    data.context_utilization || 0,
    data.tool_calls_count || 0,
    data.total_duration_ms || 0
  );
}

/**
 * Get session usage stats.
 * @param {string} sessionId
 * @returns {object|null}
 */
function getUsage(sessionId) {
  return getSessionUsage.get(sessionId) || null;
}

/**
 * Insert a message into agent_hub_messages.
 * @param {object} data - { id, session_id, role, content, meta, source, tool_call_id, tool_name }
 * @returns {object} run result
 */
function insertMessage(data) {
  return insertMessageStmt.run(
    data.id || crypto.randomUUID(),
    data.session_id,
    data.role,
    data.content,
    data.meta ? JSON.stringify(data.meta) : null,
    data.source || 'telegram',
    data.tool_call_id || null,
    data.tool_name || null
  );
}

/**
 * Get messages for a session, optionally limited.
 * @param {string} sessionId
 * @param {number} [limit]
 * @returns {Array}
 */
function getMessagesForSession(sessionId, limit) {
  if (limit) {
    return getMessagesBySessionLimited.all(sessionId, limit);
  }
  return getMessagesBySession.all(sessionId);
}

/**
 * Get a project by ID or name.
 * @param {string} nameOrId
 * @returns {object|null}
 */
function findProject(nameOrId) {
  let project = getProjectById.get(nameOrId);
  if (!project) {
    project = getProjectByName.get(`%${nameOrId}%`);
  }
  return project || null;
}

/**
 * Get all active projects.
 * @returns {Array}
 */
function getActiveProjects() {
  return _getActiveProjects.all();
}

/**
 * Update session's task state (turn count, last activity).
 * Used by the multi-turn executor to persist progress.
 *
 * @param {string} sessionId - Session UUID
 * @param {number} turnCount - Current turn count
 * @param {string} [lastActivity] - ISO timestamp or 'now'
 */
function updateSessionTaskState(sessionId, turnCount, lastActivity) {
  const stmt = db.prepare(`
    UPDATE agent_hub_sessions
    SET turn_count = ?, last_activity = datetime(?), updated_at = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(turnCount || 0, lastActivity || 'now', sessionId);
}

/**
 * Ensure the agent_hub_sessions table has the required columns for multi-turn.
 * Adds columns if they don't exist (idempotent).
 */
function ensureMultiTurnColumns() {
  // Check/add status column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active'
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add turn_count column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN turn_count INTEGER DEFAULT 0
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add last_activity column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN last_activity TEXT
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add opencode_session_id column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT
    `);
  } catch {
    // Column already exists — ignore
  }
}

/**
 * Update session's task state (turn count, last activity).
 * Used by the multi-turn executor to persist progress.
 *
 * @param {string} sessionId - Session UUID
 * @param {number} turnCount - Current turn count
 * @param {string} [lastActivity] - ISO timestamp or 'now'
 */
function updateSessionTaskState(sessionId, turnCount, lastActivity) {
  const stmt = db.prepare(`
    UPDATE agent_hub_sessions
    SET turn_count = ?, last_activity = datetime(?), updated_at = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(turnCount || 0, lastActivity || 'now', sessionId);
}

/**
 * Ensure the agent_hub_sessions table has the required columns for multi-turn.
 * Adds columns if they don't exist (idempotent).
 */
function ensureMultiTurnColumns() {
  // Check/add status column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active'
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add turn_count column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN turn_count INTEGER DEFAULT 0
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add last_activity column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN last_activity TEXT
    `);
  } catch {
    // Column already exists — ignore
  }

  // Check/add opencode_session_id column
  try {
    db.exec(`
      ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT
    `);
  } catch {
    // Column already exists — ignore
  }
}

/**
 * Close the database connection.
 */
function close() {
  try {
    db.close();
  } catch {}
}

module.exports = {
  getTelegramSession,
  createTelegramSession,
  getSessionsByChat,
  getSession,
  createSession,
  updateSessionStatus,
  updateSessionOpenCodeId,
  updateSessionTaskState,
  ensureMultiTurnColumns,
  insertTraceRecord,
  upsertUsage,
  getUsage,
  insertMessage,
  getMessagesForSession,
  findProject,
  getActiveProjects,
  close,
  // Direct DB access for advanced queries
  db,
};

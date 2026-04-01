/**
 * Activity Logger — shared write path between Telegram bot and DevHub DB.
 *
 * Opens a SINGLE persistent better-sqlite3 connection to the shared
 * data/devhub.db file so the bot can log commands, messages, errors,
 * and session state that the Next.js UI can query.
 *
 * Usage (in bot.js):
 *   const activityLogger = require('./services/activityLogger');
 *   activityLogger.logActivity({ ... });
 *   activityLogger.upsertSession({ ... });
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.resolve(__dirname, '../../data/devhub.db');

const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_activity (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    event_type TEXT NOT NULL,
    direction TEXT,
    source TEXT DEFAULT 'telegram',
    command TEXT,
    content_preview TEXT,
    status TEXT DEFAULT 'ok',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_activity_created ON telegram_activity(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_telegram_activity_chat ON telegram_activity(chat_id);

  CREATE TABLE IF NOT EXISTS telegram_sessions (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    user_name TEXT,
    agent TEXT,
    message_count INTEGER DEFAULT 0,
    last_activity TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat ON telegram_sessions(chat_id);
`);

// ── Prepared statements ─────────────────────────────────────────────────────

const insertActivity = db.prepare(`
  INSERT INTO telegram_activity
    (id, chat_id, event_type, direction, source, command, content_preview, status, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const _upsertSessionStmt = db.prepare(`
  INSERT INTO telegram_sessions
    (id, chat_id, user_name, agent, message_count, last_activity, status)
  VALUES (
    ?, ?, ?, ?,
    COALESCE((SELECT message_count FROM telegram_sessions WHERE chat_id = ?), 0) + 1,
    datetime('now'), ?
  )
  ON CONFLICT(chat_id) DO UPDATE SET
    user_name  = excluded.user_name,
    agent      = excluded.agent,
    message_count = excluded.message_count,
    last_activity = excluded.last_activity,
    status     = excluded.status
`);

const insertSystemEvent = db.prepare(`
  INSERT INTO telegram_activity
    (id, chat_id, event_type, direction, source, command, content_preview, status)
  VALUES (?, NULL, 'system', 'outbound', 'telegram_bot', ?, ?, 'ok')
`);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log a single activity event.
 *
 * @param {object} opts
 * @param {string} [opts.chatId]      - Telegram chat/user ID
 * @param {string} opts.eventType      - command | chat_message | chat_response | error | system
 * @param {string} [opts.direction]    - inbound | outbound
 * @param {string} [opts.source='telegram'] - telegram | opencode | devhub
 * @param {string} [opts.command]      - Command name (estado, tareas, etc.)
 * @param {string} [opts.contentPreview] - Truncated message content (max 500 chars)
 * @param {string} [opts.status='ok']  - ok | error | pending
 * @param {string} [opts.metadata]     - JSON string for extra context
 */
function logActivity({
  chatId,
  eventType,
  direction,
  source = 'telegram',
  command,
  contentPreview,
  status = 'ok',
  metadata,
}) {
  try {
    insertActivity.run(
      crypto.randomUUID(),
      String(chatId || ''),
      eventType,
      direction || null,
      source,
      command || null,
      contentPreview ? contentPreview.substring(0, 500) : null,
      status,
      metadata || null
    );
  } catch (err) {
    // Best-effort: don't crash the bot if logging fails
    console.error('[activityLogger] insert failed:', err.message);
  }
}

/**
 * Upsert a session row. Increments message_count automatically.
 *
 * @param {object} opts
 * @param {string} opts.chatId
 * @param {string} opts.userName
 * @param {string} [opts.agent]
 * @param {string} [opts.status='active']
 */
function upsertSession({ chatId, userName, agent, status = 'active' }) {
  try {
    _upsertSessionStmt.run(
      crypto.randomUUID(),
      String(chatId),
      userName || null,
      agent || null,
      String(chatId),
      status
    );
  } catch (err) {
    console.error('[activityLogger] session upsert failed:', err.message);
  }
}

/**
 * Log a system-level event (startup, shutdown, crash).
 *
 * @param {string} eventLabel   - e.g. 'startup', 'shutdown'
 * @param {string} msg          - Human-readable message
 */
function logSystem(eventLabel, msg) {
  try {
    insertSystemEvent.run(crypto.randomUUID(), eventLabel, msg.substring(0, 500));
  } catch (err) {
    console.error('[activityLogger] system log failed:', err.message);
  }
}

/**
 * Close the database connection (call on bot shutdown).
 */
function close() {
  try {
    db.close();
  } catch {
    // Ignore close errors
  }
}

module.exports = { logActivity, upsertSession, logSystem, close };

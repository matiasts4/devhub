/**
 * Test Schema Helper — applies the full DevHub schema to any better-sqlite3 database.
 *
 * Extracted DDL from src/lib/db/localDb.js so that :memory: test databases
 * can be created without depending on the localDb.js singleton.
 *
 * Usage:
 *   const Database = require('better-sqlite3');
 *   const { applyTestSchema } = require('./lib/test-schema');
 *   const db = new Database(':memory:');
 *   applyTestSchema(db);
 *
 * Projects include documentation_policy with a safe default of 'personal'.
 */

const Database = require('better-sqlite3');

/**
 * Full DDL extracted from ensureRuntimeSchema in localDb.js.
 * Includes all tables, indexes, triggers, and FTS5 virtual table.
 */
const SCHEMA_DDL = `
  -- Core tables
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#58A6FF',
    status TEXT DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    planning_prompt TEXT,
    planning_status TEXT DEFAULT 'none',
    project_type TEXT DEFAULT 'software',
    documentation_policy TEXT DEFAULT 'personal',
    local_path TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    milestone_id TEXT,
    business_value INTEGER DEFAULT 0,
    stale_alert INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    last_qa_feedback TEXT,
    assigned_to TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'planned',
    due_date TEXT,
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT,
    file_name TEXT NOT NULL,
    content TEXT,
    file_type TEXT,
    size_chars INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

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

  CREATE TABLE IF NOT EXISTS agent_hub_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    agent_model TEXT,
    parent_id TEXT,
    telegram_chat_id TEXT,
    directory TEXT,
    status TEXT DEFAULT 'active',
    opencode_session_id TEXT,
    custom_name TEXT,
    visibility TEXT DEFAULT 'visible',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES agent_hub_sessions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_project ON agent_hub_sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id);

  CREATE TABLE IF NOT EXISTS agent_hub_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    meta TEXT,
    source TEXT DEFAULT 'web',
    tool_call_id TEXT,
    tool_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_hub_messages_session ON agent_hub_messages(session_id);

  -- Agent Traces (observability)
  CREATE TABLE IF NOT EXISTS agent_traces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    trace_type TEXT NOT NULL,
    agent_name TEXT,
    tool_name TEXT,
    tool_input TEXT,
    tool_output TEXT,
    tool_status TEXT,
    content TEXT,
    duration_ms INTEGER,
    time_start REAL,
    time_end REAL,
    metadata TEXT,
    message_id TEXT,
    part_id TEXT,
    updated_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
  CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
  CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name);
  CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status);
  CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_session_part ON agent_traces(session_id, part_id);

  -- FTS5 for trace search
  CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(
    tool_name, tool_input, tool_output, content,
    content='agent_traces',
    content_rowid='rowid'
  );
  CREATE TRIGGER IF NOT EXISTS traces_fts_insert AFTER INSERT ON agent_traces BEGIN
    INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
    VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS traces_fts_delete AFTER DELETE ON agent_traces BEGIN
    INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
    VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS traces_fts_update AFTER UPDATE ON agent_traces BEGIN
    INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
    VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
    INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
    VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
  END;

  -- Session Usage tracking
  CREATE TABLE IF NOT EXISTS agent_session_usage (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    context_window_size INTEGER,
    context_utilization REAL,
    tool_calls_count INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_usage_session ON agent_session_usage(session_id);

  -- Telegram session mapping
  CREATE TABLE IF NOT EXISTS telegram_session_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_chat_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    project_id TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tg_map_chat ON telegram_session_map(telegram_chat_id);
  CREATE INDEX IF NOT EXISTS idx_tg_map_session ON telegram_session_map(session_id);

  -- Swarm process configuration
  CREATE TABLE IF NOT EXISTS swarm_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Swarm process tracking
  CREATE TABLE IF NOT EXISTS swarm_processes (
    id TEXT PRIMARY KEY,
    pid INTEGER,
    port INTEGER NOT NULL,
    status TEXT DEFAULT 'starting',
    cwd TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    last_heartbeat TEXT,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_swarm_processes_status ON swarm_processes(status);
  CREATE INDEX IF NOT EXISTS idx_swarm_processes_pid ON swarm_processes(pid);

  -- Test locks (distributed locking for test isolation)
  CREATE TABLE IF NOT EXISTS test_locks (
    lock_id TEXT PRIMARY KEY,
    lock_type TEXT NOT NULL CHECK(lock_type IN ('session', 'endpoint', 'resource', 'flow')),
    lock_key TEXT NOT NULL,
    owner TEXT NOT NULL,
    acquired_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    metadata TEXT,
    UNIQUE(lock_type, lock_key)
  );
  CREATE INDEX IF NOT EXISTS idx_test_locks_expires ON test_locks(expires_at);
  CREATE INDEX IF NOT EXISTS idx_test_locks_type_key ON test_locks(lock_type, lock_key);
  CREATE INDEX IF NOT EXISTS idx_test_locks_owner ON test_locks(owner);
`;

/**
 * Tables that need ALTER TABLE columns (from localDb.js alterStatements).
 * Already baked into the DDL above as columns, but kept here for reference
 * and for applying to existing databases that may lack them.
 */
const ALTER_STATEMENTS = [
  "ALTER TABLE projects ADD COLUMN documentation_policy TEXT DEFAULT 'personal'",
  'ALTER TABLE agent_hub_sessions ADD COLUMN telegram_chat_id TEXT',
  'ALTER TABLE agent_hub_sessions ADD COLUMN directory TEXT',
  "ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active'",
  'ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT',
  "ALTER TABLE agent_hub_messages ADD COLUMN source TEXT DEFAULT 'web'",
  'ALTER TABLE agent_hub_messages ADD COLUMN tool_call_id TEXT',
  'ALTER TABLE agent_hub_messages ADD COLUMN tool_name TEXT',
  'ALTER TABLE agent_traces ADD COLUMN message_id TEXT',
  'ALTER TABLE agent_traces ADD COLUMN part_id TEXT',
  'ALTER TABLE agent_traces ADD COLUMN updated_at TEXT',
  'ALTER TABLE agent_hub_sessions ADD COLUMN parent_id TEXT',
  'ALTER TABLE agent_hub_sessions ADD COLUMN custom_name TEXT',
  "ALTER TABLE agent_hub_sessions ADD COLUMN visibility TEXT DEFAULT 'visible'",
];

/**
 * Apply the full DevHub schema to a better-sqlite3 database instance.
 *
 * Works with both :memory: and file-based databases.
 * Idempotent — safe to call multiple times (uses IF NOT EXISTS).
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 */
function applyTestSchema(db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create all tables, indexes, triggers
  db.exec(SCHEMA_DDL);

  // Apply ALTER TABLE statements (idempotent — wrapped in try-catch)
  for (const stmt of ALTER_STATEMENTS) {
    try {
      db.exec(stmt);
    } catch (e) {
      // Ignore "duplicate column name" errors — column already exists
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
  }

  // Composite unique index for idempotent trace upserts
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_session_part
      ON agent_traces(session_id, part_id);
  `);

  // Index on parent_id
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );
}

/**
 * Create a fresh in-memory database with the full schema applied.
 * Convenience wrapper for the common test pattern.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createTestDb() {
  const db = new Database(':memory:');
  applyTestSchema(db);
  return db;
}

module.exports = {
  applyTestSchema,
  createTestDb,
  SCHEMA_DDL,
  ALTER_STATEMENTS,
};

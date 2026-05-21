#!/usr/bin/env node
/**
 * migrate-supabase-to-sqlite.js
 *
 * Exports data from Supabase (via PostgREST) and imports into a local SQLite database.
 * Run: node scripts/migrate-supabase-to-sqlite.js
 *
 * Requires: better-sqlite3 installed (npm install better-sqlite3)
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'devhub.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Remove existing DB to start fresh
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('Removed existing devhub.db');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Created SQLite database at:', DB_PATH);

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
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

  CREATE TABLE IF NOT EXISTS agent_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    nombre TEXT,
    modelo_llm TEXT,
    status TEXT DEFAULT 'idle',
    current_task_id TEXT,
    last_heartbeat TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_agents_project ON agent_registry(project_id);

  CREATE TABLE IF NOT EXISTS mcp_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'generic',
    endpoint_url TEXT,
    api_key_encrypted TEXT,
    config TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    last_sync TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT REFERENCES projects(id),
    query TEXT,
    answer TEXT,
    sources TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_project ON ai_interactions(project_id);

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    depends_on TEXT NOT NULL REFERENCES tasks(id),
    tipo TEXT DEFAULT 'blocks',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Phase 5: Agent Logs (Traceability & Analytics)
  CREATE TABLE IF NOT EXISTS agent_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    agent_name TEXT,
    event_type TEXT NOT NULL,
    tool_name TEXT,
    status TEXT DEFAULT 'ok',
    message TEXT,
    metadata TEXT,
    duration_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_logs_session ON agent_logs(session_id);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_event ON agent_logs(event_type);
`);

console.log('Schema created.');

// ── Import helpers ────────────────────────────────────────────────────────────

function importTable(tableName, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ${tableName}: 0 rows (skipped)`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const colList = columns.join(', ');
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${placeholders})`
  );

  const insertMany = db.transaction((batch) => {
    for (const row of batch) {
      const values = columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        if (typeof val === 'boolean') return val ? 1 : 0;
        return val;
      });
      stmt.run(...values);
    }
  });

  insertMany(rows);
  console.log(`  ${tableName}: ${rows.length} rows imported`);
}

// ── Load exported data ────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, 'export');

function loadJSON(filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  ${filename}: not found (skipped)`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ── Import ────────────────────────────────────────────────────────────────────

console.log('\nImporting data...');
importTable('projects', loadJSON('projects.json'));
importTable('tasks', loadJSON('tasks.json'));
importTable('milestones', loadJSON('milestones.json'));
importTable('agent_registry', loadJSON('agent_registry.json'));
importTable('mcp_connections', loadJSON('mcp_connections.json'));
importTable('ai_interactions', loadJSON('ai_interactions.json'));
importTable('profiles', loadJSON('profiles.json'));

// ── Verify ────────────────────────────────────────────────────────────────────

console.log('\nVerification:');
const tables = [
  'projects',
  'tasks',
  'milestones',
  'agent_registry',
  'mcp_connections',
  'ai_interactions',
  'profiles',
];
for (const table of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
  console.log(`  ${table}: ${count.c} rows`);
}

db.close();
console.log('\nMigration complete! Database:', DB_PATH);

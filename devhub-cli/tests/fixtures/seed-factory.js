'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// ---------------------------------------------------------------------------
// Temp DB lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a temporary database path and return it.
 * Does NOT open a connection — caller controls lifecycle.
 * @returns {string} Absolute path to the .db file
 */
function createTempDb() {
  const tmpDir = os.tmpdir();
  const dbName = `devhub-test-${crypto.randomUUID()}.db`;
  return path.join(tmpDir, dbName);
}

/**
 * Clean up all SQLite files for a given dbPath.
 * @param {string} dbPath - Absolute path to the .db file
 */
function cleanupDb(dbPath) {
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const f of files) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // ignore — file may not exist
    }
  }
}

// ---------------------------------------------------------------------------
// Direct DB access (for assertions in tests)
// ---------------------------------------------------------------------------

/**
 * Open a direct better-sqlite3 connection for read assertions.
 * Caller MUST close the connection when done.
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
function openDb(dbPath) {
  const db = new Database(dbPath, { fileMustExist: false, readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  _ensureSchema(db);
  return db;
}

/**
 * Execute a read query and return results, auto-opening/closing.
 * @param {string} dbPath
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Array}
 */
function readDb(dbPath, sql, params = []) {
  const db = openDb(dbPath);
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

/**
 * Execute a write statement and return run info, auto-opening/closing.
 * @param {string} dbPath
 * @param {string} sql
 * @param {Array} [params]
 * @returns {{ changes: number, lastInsertRowid: number }}
 */
function writeDb(dbPath, sql, params = []) {
  const db = openDb(dbPath);
  try {
    return db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Schema bootstrap (minimal for test DBs)
// ---------------------------------------------------------------------------

function _ensureSchema(db) {
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
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      business_value INTEGER DEFAULT 5,
      due_date TEXT,
      milestone_id TEXT,
      assigned_to TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      claim_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'planned',
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_registry (
      agent_id TEXT PRIMARY KEY,
      project_id TEXT,
      nombre TEXT,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT,
      task_description TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      current_task_id TEXT,
      run_id_or_session_id TEXT,
      repo_root TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      worktree_path TEXT,
      base_branch TEXT NOT NULL,
      base_commit TEXT NOT NULL DEFAULT 'f814998dd05cb491caf8637bf570dbd74b539090',
      branch_name TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      observed_branch TEXT,
      observed_head TEXT,
      observed_dirty TEXT,
      last_error TEXT,
      last_error_class TEXT,
      recovery_reason TEXT,
      evidence_ref TEXT,
      reservation_token TEXT,
      correlation_id TEXT,
      accepted_at TEXT,
      claimed_at TEXT,
      started_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_project ON agent_workspaces(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_agent ON agent_workspaces(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_status ON agent_workspaces(status);
  `);
}

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

/**
 * Seed a baseline dataset: 2 projects, 1 milestone, 5 tasks, 2 agents.
 * Validates schema with PRAGMA table_info.
 * @param {string} dbPath
 */
function seedBaseline(dbPath) {
  const db = openDb(dbPath);
  try {
    // Validate schema
    const projectCols = db.pragma('table_info(projects)').map(c => c.name);
    if (!projectCols.includes('id') || !projectCols.includes('name')) {
      throw new Error('Schema drift: projects table missing expected columns');
    }
    const taskCols = db.pragma('table_info(tasks)').map(c => c.name);
    if (!taskCols.includes('claim_token') || !taskCols.includes('lease_expires_at')) {
      throw new Error('Schema drift: tasks table missing claim columns');
    }

    // Projects
    db.prepare("INSERT OR REPLACE INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)")
      .run('proj-alpha', 'user-1', 'Project Alpha', 'active');
    db.prepare("INSERT OR REPLACE INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)")
      .run('proj-beta', 'user-1', 'Project Beta', 'active');

    // Milestone
    db.prepare("INSERT OR REPLACE INTO milestones (id, project_id, title, status) VALUES (?, ?, ?, ?)")
      .run('milestone-1', 'proj-alpha', 'Milestone 1', 'planned');

    // Tasks
    const tasks = [
      ['task-1', 'proj-alpha', 'Task 1 Alpha', 'pending', 'high', 8, 'milestone-1'],
      ['task-2', 'proj-alpha', 'Task 2 Alpha', 'pending', 'medium', 5, 'milestone-1'],
      ['task-3', 'proj-alpha', 'Task 3 Alpha', 'pending', 'low', 3, null],
      ['task-4', 'proj-beta', 'Task 1 Beta', 'pending', 'high', 9, null],
      ['task-5', 'proj-beta', 'Task 2 Beta', 'blocked', 'medium', 5, null],
    ];
    const insertTask = db.prepare(
      "INSERT OR REPLACE INTO tasks (id, project_id, title, status, priority, business_value, milestone_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const t of tasks) {
      insertTask.run(...t);
    }

    // Agents
    db.prepare("INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)")
      .run('agent-1', 'proj-alpha', 'Agent One', 'idle');
    db.prepare("INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)")
      .run('agent-2', 'proj-beta', 'Agent Two', 'idle');
  } finally {
    db.close();
  }
}

/**
 * Seed a single project.
 * @param {string} dbPath
 * @param {string} id
 * @param {string} name
 * @param {string} [status]
 */
function seedProject(dbPath, id, name, status = 'active') {
  writeDb(dbPath,
    "INSERT OR REPLACE INTO projects (id, user_id, name, status) VALUES (?, 'user-1', ?, ?)",
    [id, name, status]
  );
}

/**
 * Seed a single task.
 * @param {string} dbPath
 * @param {string} id
 * @param {string} projectId
 * @param {string} title
 * @param {string} [status]
 * @param {string} [priority]
 * @param {number} [businessValue]
 */
function seedTask(dbPath, id, projectId, title, status = 'pending', priority = 'medium', businessValue = 5) {
  writeDb(dbPath,
    "INSERT OR REPLACE INTO tasks (id, project_id, title, status, priority, business_value) VALUES (?, ?, ?, ?, ?, ?)",
    [id, projectId, title, status, priority, businessValue]
  );
}

/**
 * Seed a single agent.
 * @param {string} dbPath
 * @param {string} agentId
 * @param {string} projectId
 * @param {string} [status]
 */
function seedAgent(dbPath, agentId, projectId, status = 'idle') {
  writeDb(dbPath,
    "INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)",
    [agentId, projectId, `Agent ${agentId}`, status]
  );
}

/**
 * Seed a workspace.
 * @param {string} dbPath
 * @param {string} wsId
 * @param {string} projectId
 * @param {string} agentId
 * @param {string} [status]
 */
function seedWorkspace(dbPath, wsId, projectId, agentId, status = 'planned') {
  writeDb(dbPath,
    `INSERT OR REPLACE INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
     VALUES (?, ?, ?, '/repo', '/workspace', 'main', ?)`,
    [wsId, projectId, agentId, status]
  );
}

/**
 * Seed a task dependency.
 * @param {string} dbPath
 * @param {string} depId
 * @param {string} taskId
 * @param {string} dependsOn
 */
function seedDependency(dbPath, depId, taskId, dependsOn) {
  writeDb(dbPath,
    "INSERT OR REPLACE INTO task_dependencies (id, task_id, depends_on) VALUES (?, ?, ?)",
    [depId, taskId, dependsOn]
  );
}

// ---------------------------------------------------------------------------
// Test helper: spawn CLI with temp DB
// ---------------------------------------------------------------------------

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'devhub');

/**
 * Spawn a CLI command with DEVHUB_DB_PATH pointing to a temp DB.
 * @param {string} dbPath
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
function runCli(dbPath, args, opts = {}) {
  const { spawnSync } = require('child_process');
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath, NODE_ENV: 'test', ...(opts.env || {}) },
    timeout: opts.timeout || 10000,
  });
}

module.exports = {
  createTempDb,
  cleanupDb,
  openDb,
  readDb,
  writeDb,
  seedBaseline,
  seedProject,
  seedTask,
  seedAgent,
  seedWorkspace,
  seedDependency,
  runCli,
  CLI,
};

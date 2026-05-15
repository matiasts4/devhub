/**
 * DevHub Local Database Layer — better-sqlite3 for local-first architecture.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { resolveDbPath } = require('./pathResolver');

const DB_PATH = resolveDbPath();
let _db = null;

function ensureRuntimeSchema(db) {
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES agent_hub_sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_project ON agent_hub_sessions(project_id);

    CREATE TABLE IF NOT EXISTS agent_hub_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
    CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name);
    CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status);
    CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at);

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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_session_unique ON agent_session_usage(session_id);

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
  `);

  // ALTER TABLE statements — wrapped in try-catch since columns may already exist
  const alterStatements = [
    "ALTER TABLE projects ADD COLUMN documentation_policy TEXT DEFAULT 'personal'",
    'ALTER TABLE tasks ADD COLUMN claimed_at TEXT',
    'ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT',
    'ALTER TABLE tasks ADD COLUMN claim_token TEXT',
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
    'ALTER TABLE agent_hub_sessions ADD COLUMN error_message TEXT',
  ];
  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch (e) {
      // Ignore "duplicate column" errors — column already exists
      if (!e.message.includes('duplicate column name') && !e.message.includes('no such table')) {
        throw e;
      }
    }
  }

  db.exec(
    "UPDATE projects SET documentation_policy = 'personal' WHERE documentation_policy IS NULL"
  );

  // Composite unique index for idempotent trace upserts (session_id + part_id)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_session_part 
      ON agent_traces(session_id, part_id);
  `);

  // Index on parent_id — must run AFTER ALTER TABLE adds the column
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(lease_expires_at)`);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_claim_token ON tasks(claim_token)`);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_session_unique
      ON agent_session_usage(session_id);
  `);

  // Index on parent_id — must run AFTER ALTER TABLE adds the column
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );
}

function getDb() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
    ensureRuntimeSchema(_db);
  }
  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function buildSelectQuery(table, options = {}) {
  const { select = '*', where = [], orderBy = [], limit = null } = options;
  let sql = `SELECT ${select} FROM ${table}`;
  const params = [];
  if (where.length > 0) {
    const conditions = where.map(([col, op, _val]) => {
      params.push(_val);
      return `${col} ${op} ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (orderBy.length > 0) {
    sql += ` ORDER BY ${orderBy.map(([col, dir]) => `${col} ${dir.toUpperCase()}`).join(', ')}`;
  }
  if (limit) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }
  return { sql, params };
}

function buildWhere(where) {
  if (!where || where.length === 0) return { clauses: ['1=1'], values: [] };
  const clauses = [];
  const values = [];
  for (const [col, op, val] of where) {
    if (op === 'IN') {
      if (!Array.isArray(val) || val.length === 0) {
        clauses.push('1=0');
      } else {
        clauses.push(`${col} IN (${val.map(() => '?').join(', ')})`);
        values.push(...val);
      }
      continue;
    }
    if (op === 'IS NOT' && val === null) {
      clauses.push(`${col} IS NOT NULL`);
      continue;
    }
    clauses.push(`${col} ${op} ?`);
    values.push(val);
  }
  return { clauses, values };
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function tableHasColumn(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function deleteByProjectId(db, tableName, projectId) {
  if (!tableHasColumn(db, tableName, 'project_id')) return;
  db.prepare(`DELETE FROM ${tableName} WHERE project_id = ?`).run(projectId);
}

function deleteByValues(db, tableName, columnName, values) {
  if (!values || values.length === 0 || !tableHasColumn(db, tableName, columnName)) return;
  const placeholders = values.map(() => '?').join(', ');
  db.prepare(`DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`).run(...values);
}

function deleteProjectCascadeUnsafe(db, projectId) {
  if (!projectId) return { changes: 0 };

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return { changes: 0 };

  const taskIds = tableHasColumn(db, 'tasks', 'project_id')
    ? db
        .prepare('SELECT id FROM tasks WHERE project_id = ?')
        .all(projectId)
        .map((row) => row.id)
    : [];

  deleteByValues(db, 'task_dependencies', 'task_id', taskIds);
  deleteByValues(db, 'task_dependencies', 'depends_on', taskIds);
  deleteByValues(db, 'task_comments', 'task_id', taskIds);

  deleteByProjectId(db, 'tasks', projectId);
  deleteByProjectId(db, 'milestones', projectId);
  deleteByProjectId(db, 'agent_registry', projectId);
  deleteByProjectId(db, 'ai_interactions', projectId);
  deleteByProjectId(db, 'project_files', projectId);
  deleteByProjectId(db, 'agent_memory', projectId);
  deleteByProjectId(db, 'telegram_session_map', projectId);
  deleteByProjectId(db, 'agent_hub_sessions', projectId);

  return db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

function makeTableOps(tableName, idCol = 'id') {
  return {
    select(options = {}) {
      const db = getDb();
      const { sql, params } = buildSelectQuery(tableName, options);
      return db.prepare(sql).all(...params);
    },
    single(options = {}) {
      const db = getDb();
      const { sql, params } = buildSelectQuery(tableName, { ...options, limit: 1 });
      return db.prepare(sql).get(...params);
    },
    insert(data) {
      const db = getDb();
      const cols = Object.keys(data);
      const vals = cols.map((k) => data[k] ?? null);
      const info = db
        .prepare(
          `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        )
        .run(...vals);
      // If data includes the PK use it; otherwise fall back to lastInsertRowid
      if (data[idCol] !== undefined && data[idCol] !== null) {
        return db.prepare(`SELECT * FROM ${tableName} WHERE ${idCol} = ?`).get(data[idCol]);
      }
      return db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
    },
    update(data, where) {
      const db = getDb();
      const keys = Object.keys(data);
      if (keys.length === 0) return null;
      const { clauses, values } = buildWhere(where);
      const setCols = keys.map((k) => `${k} = ?`);
      const setVals = keys.map((k) => data[k] ?? null);
      db.prepare(
        `UPDATE ${tableName} SET ${setCols.join(', ')} WHERE ${clauses.join(' AND ')}`
      ).run(...setVals, ...values);
      return db
        .prepare(`SELECT * FROM ${tableName} WHERE ${clauses.join(' AND ')} LIMIT 1`)
        .get(...values);
    },
    delete(where) {
      const db = getDb();
      const { clauses, values } = buildWhere(where);
      return db.prepare(`DELETE FROM ${tableName} WHERE ${clauses.join(' AND ')}`).run(...values);
    },
  };
}

const projectTableOps = makeTableOps('projects', 'id');

const tables = {
  projects: {
    ...projectTableOps,
    delete(where) {
      const db = getDb();
      const { clauses, values } = buildWhere(where);
      const projectIds = db
        .prepare(`SELECT id FROM projects WHERE ${clauses.join(' AND ')}`)
        .all(...values)
        .map((row) => row.id);

      if (projectIds.length === 0) return { changes: 0 };

      const deleteProjectsTxn = db.transaction((ids) => {
        let totalChanges = 0;
        for (const projectId of ids) {
          totalChanges += deleteProjectCascadeUnsafe(db, projectId).changes || 0;
        }
        return { changes: totalChanges };
      });

      return deleteProjectsTxn(projectIds);
    },
  },
  tasks: makeTableOps('tasks', 'id'),
  milestones: makeTableOps('milestones', 'id'),
  project_files: makeTableOps('project_files', 'id'),
  agent_registry: makeTableOps('agent_registry', 'agent_id'),
  mcp_connections: makeTableOps('mcp_connections', 'id'),
  ai_interactions: makeTableOps('ai_interactions', 'id'),
  agent_hub_sessions: makeTableOps('agent_hub_sessions', 'id'),
  agent_hub_messages: makeTableOps('agent_hub_messages', 'id'),
  swarm_config: makeTableOps('swarm_config', 'key'),
  swarm_processes: makeTableOps('swarm_processes', 'id'),
  profiles: {
    ...makeTableOps('profiles', 'id'),
    upsert(data) {
      const db = getDb();
      const cols = Object.keys(data);
      const vals = cols.map((k) => data[k] ?? null);
      const updateCols = cols
        .filter((k) => k !== 'id')
        .map((k) => `${k} = excluded.${k}`)
        .join(', ');
      db.prepare(
        `INSERT INTO profiles (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateCols}`
      ).run(...vals);
      return db.prepare('SELECT * FROM profiles WHERE id = ?').get(data.id);
    },
  },
  task_dependencies: makeTableOps('task_dependencies', 'id'),
};

class LocalQuery {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._where = [];
    this._orderBy = [];
    this._limitVal = null;
  }
  select(fields) {
    if (typeof fields === 'string') {
      this._select =
        fields === '*'
          ? '*'
          : fields
              .split(',')
              .map((f) => f.trim())
              .join(', ');
    }
    return this;
  }
  eq(col, val) {
    this._where.push([col, '=', val]);
    return this;
  }
  neq(col, val) {
    this._where.push([col, '!=', val]);
    return this;
  }
  in(col, vals) {
    if (!vals || vals.length === 0) {
      this._where.push(['1', '=', '0']);
      return this;
    }
    this._where.push([col, `IN (${vals.map(() => '?').join(', ')})`, vals]);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this._orderBy.push([col, ascending ? 'ASC' : 'DESC']);
    return this;
  }
  limit(n) {
    this._limitVal = n;
    return this;
  }
  async then(resolve, reject) {
    try {
      const r = await this.execute();
      if (resolve) resolve(r);
      return r;
    } catch (e) {
      if (reject) reject(e);
      throw e;
    }
  }
  async execute() {
    const tableOps = tables[this.table];
    if (!tableOps) throw new Error(`Table ${this.table} not found`);
    return tableOps.select({
      select: this._select,
      where: this._where,
      orderBy: this._orderBy,
      limit: this._limitVal,
    });
  }
  [Symbol.for('nodejs.util.promisify.custom')]() {
    return this.execute();
  }
  get [Symbol.toStringTag]() {
    return 'LocalQuery';
  }
}

// ============================================================
// Agent Traces ORM
// ============================================================

function insertTrace(trace) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO agent_traces 
    (id, session_id, message_id, trace_type, agent_name, tool_name, tool_input, tool_output, 
     tool_status, content, duration_ms, time_start, time_end, metadata)
    VALUES (@id, @session_id, @message_id, @trace_type, @agent_name, @tool_name, @tool_input, @tool_output,
            @tool_status, @content, @duration_ms, @time_start, @time_end, @metadata)`);
  return stmt.run({
    id: trace.id || crypto.randomUUID(),
    session_id: trace.session_id,
    message_id: trace.message_id || null,
    trace_type: trace.trace_type,
    agent_name: trace.agent_name || null,
    tool_name: trace.tool_name || null,
    tool_input: trace.tool_input ? JSON.stringify(trace.tool_input) : null,
    tool_output: trace.tool_output || null,
    tool_status: trace.tool_status || null,
    content: trace.content || null,
    duration_ms: trace.duration_ms || null,
    time_start: trace.time_start || null,
    time_end: trace.time_end || null,
    metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
  });
}

function getTracesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_traces WHERE session_id = ?';
  const params = [sessionId];

  if (options.message_id) {
    query += ' AND message_id = ?';
    params.push(options.message_id);
  }
  if (options.trace_type) {
    query += ' AND trace_type = ?';
    params.push(options.trace_type);
  }
  if (options.tool_name) {
    query += ' AND tool_name = ?';
    params.push(options.tool_name);
  }
  if (options.tool_status) {
    query += ' AND tool_status = ?';
    params.push(options.tool_status);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * Sanitize a search term for FTS5 MATCH syntax.
 * FTS5 interprets special characters as operators: " * + - ( ) / \ : ^ $ ~
 * AND, OR, NOT are also operators.
 * Wrapping in double quotes and escaping internal quotes makes it a literal phrase search.
 */
function sanitizeFtsQuery(term) {
  if (!term || typeof term !== 'string') return '';
  // Escape double quotes inside the term
  const escaped = term.replace(/"/g, '""');
  // Wrap in double quotes for literal phrase matching
  return `"${escaped}"`;
}

function searchTraces(sessionId, searchTerm, options = {}) {
  const db = getDb();
  const safeTerm = sanitizeFtsQuery(searchTerm);
  if (!safeTerm) return [];
  const query = `
    SELECT t.*, fts.rank
    FROM agent_traces t
    JOIN agent_traces_fts fts ON t.rowid = fts.rowid
    WHERE t.session_id = ? AND agent_traces_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `;
  const rows = db.prepare(query).all(sessionId, safeTerm, options.limit || 50);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function updateTrace(id, updates) {
  const db = getDb();
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'tool_input' || key === 'metadata') {
      setClauses.push(`${key} = ?`);
      params.push(value ? JSON.stringify(value) : null);
    } else {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  // Preserve original id — changing PK on conflict breaks references
  setClauses.push('id = agent_traces.id');
  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  const query = `UPDATE agent_traces SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(query).run(...params);
}

/**
 * Idempotent upsert for trace parts.
 * Upsert key: (session_id, part_id) — falls back to trace.id when part_id is missing.
 * Uses ON CONFLICT DO UPDATE to avoid FTS5 DELETE triggers (INSERT OR REPLACE would fire them).
 */
function upsertTrace(trace) {
  const db = getDb();
  const partId = trace.part_id || trace.id || crypto.randomUUID();
  const traceId = trace.id || crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO agent_traces 
      (id, session_id, message_id, part_id, trace_type, agent_name, tool_name, 
       tool_input, tool_output, tool_status, content, duration_ms, time_start, time_end, metadata)
    VALUES (@id, @session_id, @message_id, @part_id, @trace_type, @agent_name, @tool_name,
            @tool_input, @tool_output, @tool_status, @content, @duration_ms, @time_start, @time_end, @metadata)
    ON CONFLICT(session_id, part_id) DO UPDATE SET
      message_id = COALESCE(excluded.message_id, agent_traces.message_id),
      trace_type = excluded.trace_type,
      agent_name = COALESCE(excluded.agent_name, agent_traces.agent_name),
      tool_name = COALESCE(excluded.tool_name, agent_traces.tool_name),
      tool_input = COALESCE(excluded.tool_input, agent_traces.tool_input),
      tool_output = COALESCE(excluded.tool_output, agent_traces.tool_output),
      tool_status = excluded.tool_status,
      content = COALESCE(NULLIF(excluded.content, ''), NULLIF(agent_traces.content, '')),
      duration_ms = COALESCE(excluded.duration_ms, agent_traces.duration_ms),
      time_start = COALESCE(excluded.time_start, agent_traces.time_start),
      time_end = COALESCE(excluded.time_end, agent_traces.time_end),
      metadata = COALESCE(excluded.metadata, agent_traces.metadata),
      created_at = COALESCE(agent_traces.created_at, excluded.created_at),
      updated_at = datetime('now')
  `);

  return stmt.run({
    id: traceId,
    session_id: trace.session_id,
    message_id: trace.message_id || null,
    part_id: partId,
    trace_type: trace.trace_type,
    agent_name: trace.agent_name || null,
    tool_name: trace.tool_name || null,
    tool_input: trace.tool_input ? JSON.stringify(trace.tool_input) : null,
    tool_output: trace.tool_output
      ? typeof trace.tool_output === 'string'
        ? trace.tool_output
        : JSON.stringify(trace.tool_output)
      : null,
    tool_status: trace.tool_status || null,
    content: trace.content || null,
    duration_ms: trace.duration_ms || null,
    time_start: trace.time_start || null,
    time_end: trace.time_end || null,
    metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
  });
}

// ============================================================
// Session Usage ORM
// ============================================================

function upsertSessionUsage(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO agent_session_usage 
      (id, session_id, prompt_tokens, completion_tokens, total_tokens, 
       context_window_size, context_utilization, tool_calls_count, total_duration_ms)
    VALUES (@id, @session_id, @prompt_tokens, @completion_tokens, @total_tokens,
            @context_window_size, @context_utilization, @tool_calls_count, @total_duration_ms)
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
  return stmt.run({
    id: data.id || crypto.randomUUID(),
    session_id: data.session_id,
    prompt_tokens: data.prompt_tokens || 0,
    completion_tokens: data.completion_tokens || 0,
    total_tokens: data.total_tokens || 0,
    context_window_size: data.context_window_size || null,
    context_utilization: data.context_utilization || 0,
    tool_calls_count: data.tool_calls_count || 0,
    total_duration_ms: data.total_duration_ms || 0,
  });
}

function getSessionUsage(sessionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_session_usage WHERE session_id = ?').get(sessionId);
}

// ============================================================
// Telegram Session Map ORM
// ============================================================

function getTelegramSession(chatId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1')
    .get(chatId);
}

function createTelegramSession(chatId, sessionId, projectId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      session_id = excluded.session_id,
      project_id = excluded.project_id,
      active = 1,
      updated_at = datetime('now')
  `);
  return stmt.run(chatId, sessionId, projectId || null);
}

// ============================================================
// Agent Hub Messages ORM
// ============================================================

function insertMessage(data) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO agent_hub_messages
    (id, session_id, role, content, meta, source, tool_call_id, tool_name)
    VALUES (@id, @session_id, @role, @content, @meta, @source, @tool_call_id, @tool_name)`);
  return stmt.run({
    id: data.id || crypto.randomUUID(),
    session_id: data.session_id,
    role: data.role,
    content: data.content,
    meta: data.meta ? JSON.stringify(data.meta) : null,
    source: data.source || 'web',
    tool_call_id: data.tool_call_id || null,
    tool_name: data.tool_name || null,
  });
}

function getMessagesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_hub_messages WHERE session_id = ?';
  const params = [sessionId];

  if (options.role) {
    query += ' AND role = ?';
    params.push(options.role);
  }
  if (options.source) {
    query += ' AND source = ?';
    params.push(options.source);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}

function getToolTracesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_traces WHERE session_id = ? AND trace_type LIKE ?';
  const params = [sessionId, 'tool%'];

  if (options.tool_status) {
    query += ' AND tool_status = ?';
    params.push(options.tool_status);
  }
  if (options.tool_name) {
    query += ' AND tool_name = ?';
    params.push(options.tool_name);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function getSessionsByProject(projectId, options = {}) {
  const { includeHidden } = options;
  const db = getDb();

  let whereClause = 'WHERE s.project_id = ?';
  const params = [projectId];

  if (includeHidden === 'active') {
    // Include visible + hidden_active
    whereClause += " AND s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    // Include visible + hidden_history
    whereClause += " AND s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
    // Default: exclude hidden_all
    whereClause += " AND s.visibility != 'hidden_all'";
  }

  return db
    .prepare(
      `
    SELECT s.*, tsm.telegram_chat_id 
    FROM agent_hub_sessions s
    LEFT JOIN telegram_session_map tsm ON s.id = tsm.session_id
    ${whereClause}
    ORDER BY s.updated_at DESC
  `
    )
    .all(...params);
}

function getRecentSessions(limit = 20, options = {}) {
  const { includeHidden } = options;
  const db = getDb();

  let whereClause = '';
  const params = [limit];

  if (includeHidden === 'active') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
    // Default: exclude hidden_all
    whereClause = " WHERE s.visibility != 'hidden_all'";
  }

  return db
    .prepare(
      `
    SELECT s.*, tsm.telegram_chat_id 
    FROM agent_hub_sessions s
    LEFT JOIN telegram_session_map tsm ON s.id = tsm.session_id
    ${whereClause}
    ORDER BY s.updated_at DESC
    LIMIT ?
  `
    )
    .all(...params);
}

function getSessionsByTelegramChat(chatId, limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT s.* FROM agent_hub_sessions s
    JOIN telegram_session_map tsm ON s.id = tsm.session_id
    WHERE tsm.telegram_chat_id = ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `
    )
    .all(chatId, limit);
}

function updateSessionStatus(sessionId, status) {
  const db = getDb();
  return db
    .prepare("UPDATE agent_hub_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, sessionId);
}

/**
 * Marks a session as failed and stores the error message for UI display.
 */
function updateSessionError(sessionId, errorMessage) {
  const db = getDb();
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(errorMessage || 'Unknown error', sessionId);
}

function updateSessionOpenCodeId(sessionId, opencodeSessionId) {
  const db = getDb();
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(opencodeSessionId, sessionId);
}

// ============================================================
// Swarm Config Helpers
// ============================================================

function getSwarmConfig() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM swarm_config').all();
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

function setSwarmConfig(key, value) {
  const db = getDb();
  db.prepare(
    "INSERT INTO swarm_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(key, String(value));
}

// ============================================================
// Swarm Process Helpers
// ============================================================

function registerSwarmProcess(data) {
  const db = getDb();
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO swarm_processes (id, pid, port, status, cwd, started_at, last_heartbeat, metadata)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`
  ).run(
    id,
    data.pid || null,
    data.port,
    data.status || 'starting',
    data.cwd || null,
    data.metadata ? JSON.stringify(data.metadata) : null
  );
  return id;
}

function updateSwarmProcess(id, updates) {
  const db = getDb();
  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'metadata' && typeof value === 'object') {
      setClauses.push(`${key} = ?`);
      params.push(JSON.stringify(value));
    } else {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  setClauses.push("last_heartbeat = datetime('now')");
  params.push(id);
  const query = `UPDATE swarm_processes SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(query).run(...params);
}

function getSwarmProcesses() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM swarm_processes ORDER BY started_at DESC').all();
  return rows.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function removeSwarmProcess(id) {
  const db = getDb();
  return db.prepare('DELETE FROM swarm_processes WHERE id = ?').run(id);
}

function getActiveSwarmCount() {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM swarm_processes WHERE status IN ('running', 'starting')"
    )
    .get();
  return row.count;
}

/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
function getActiveAgentCount() {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM agent_hub_sessions WHERE status = 'active'")
    .get();
  return row.count;
}

// ============================================================
// Session Hierarchy (parent/child navigation)
// ============================================================
// Session Hierarchy (parent/child navigation)
// ============================================================

function getSessionWithParent(sessionId) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT s.*, p.id AS parent_id, p.title AS parent_title
      FROM agent_hub_sessions s
      LEFT JOIN agent_hub_sessions p ON s.parent_id = p.id
      WHERE s.id = ?
    `
    )
    .get(sessionId);
}

function getChildSessions(parentId) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT * FROM agent_hub_sessions
      WHERE parent_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(parentId);
}

function getSessionChain(sessionId) {
  const db = getDb();
  const chain = [];
  let current = db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(sessionId);
  while (current) {
    chain.unshift({
      id: current.id,
      title: current.title,
      isRoot: !current.parent_id,
    });
    if (current.parent_id) {
      current = db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(current.parent_id);
    } else {
      break;
    }
  }
  return chain;
}

function getSiblingSessions(sessionId) {
  const db = getDb();
  const current = db
    .prepare('SELECT parent_id FROM agent_hub_sessions WHERE id = ?')
    .get(sessionId);
  if (!current || !current.parent_id) return [];
  return db
    .prepare(
      `
      SELECT * FROM agent_hub_sessions
      WHERE parent_id = ? AND id != ?
      ORDER BY created_at ASC
    `
    )
    .all(current.parent_id, sessionId);
}

module.exports = {
  getDb,
  closeDb,
  ensureRuntimeSchema,
  tables,
  from(table) {
    return new LocalQuery(table);
  },
  db: tables,
  // Agent Traces
  insertTrace,
  upsertTrace,
  getTracesBySession,
  searchTraces,
  updateTrace,
  // Agent Hub Messages
  insertMessage,
  getMessagesBySession,
  getToolTracesBySession,
  // Session Usage
  upsertSessionUsage,
  getSessionUsage,
  // Telegram Session Map
  getTelegramSession,
  createTelegramSession,
  getSessionsByProject,
  getRecentSessions,
  getSessionsByTelegramChat,
  updateSessionStatus,
  updateSessionError,
  updateSessionOpenCodeId,
  // Session Hierarchy
  getSessionWithParent,
  getChildSessions,
  getSessionChain,
  getSiblingSessions,
  // Swarm Config
  getSwarmConfig,
  setSwarmConfig,
  // Swarm Processes
  registerSwarmProcess,
  updateSwarmProcess,
  getSwarmProcesses,
  removeSwarmProcess,
  getActiveSwarmCount,
  // Active Agent Count
  getActiveAgentCount,
};

/**
 * DevHub Local Database Layer
 * Replaces Supabase client with better-sqlite3 for local-first architecture.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function resolveDbPath() {
  const candidates = [
    path.join(process.cwd(), 'data', 'devhub.db'),
    path.join(__dirname, '..', '..', '..', 'data', 'devhub.db'),
    '/home/matias/devhub/data/devhub.db',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const DB_PATH = resolveDbPath();
let _db = null;

function ensureRuntimeSchema(db) {
  db.exec(`
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
  `);
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
      db.prepare(
        `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      ).run(...vals);
      return db.prepare(`SELECT * FROM ${tableName} WHERE ${idCol} = ?`).get(data[idCol]);
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

const tables = {
  projects: makeTableOps('projects', 'id'),
  tasks: makeTableOps('tasks', 'id'),
  milestones: makeTableOps('milestones', 'id'),
  project_files: makeTableOps('project_files', 'id'),
  agent_registry: makeTableOps('agent_registry', 'agent_id'),
  mcp_connections: makeTableOps('mcp_connections', 'id'),
  ai_interactions: makeTableOps('ai_interactions', 'id'),
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

module.exports = {
  getDb,
  closeDb,
  tables,
  from(table) {
    return new LocalQuery(table);
  },
  db: tables,
};

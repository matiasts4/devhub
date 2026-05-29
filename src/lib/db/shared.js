'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const constants = require('./constants');
const { resolveDbPath } = require('./pathResolver');

const DB_PATH = resolveDbPath();
let _db = null;

function getDb() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let needsRecovery = false;
    if (fs.existsSync(DB_PATH)) {
      try {
        const stats = fs.statSync(DB_PATH);
        if (stats.size > 0) {
          const tempDb = new Database(DB_PATH, { readonly: true });
          const integrity = tempDb.prepare('PRAGMA integrity_check').get();
          tempDb.close();

          if (integrity.integrity_check !== 'ok') {
            console.error(
              `[localDb] WARNING: DB integrity check failed: ${integrity.integrity_check}`
            );
            needsRecovery = true;
          } else {
            const backupPath = `${DB_PATH}.backup-${Date.now()}`;
            fs.copyFileSync(DB_PATH, backupPath);
            const backups = fs
              .readdirSync(dir)
              .filter((fileName) => fileName.startsWith('devhub.db.backup-'))
              .sort()
              .reverse();
            backups.slice(5).forEach((fileName) => fs.unlinkSync(path.join(dir, fileName)));
          }
        }
      } catch (error) {
        console.error('[localDb] Pre-open check failed:', error.message);
        needsRecovery = true;
      }
    } else {
      needsRecovery = true;
    }

    if (needsRecovery) {
      console.error('[localDb] Attempting DB recovery...');
      try {
        const backups = fs
          .readdirSync(dir)
          .filter(
            (fileName) =>
              fileName.startsWith('devhub.db.backup-') || fileName === 'devhub.db.pre-restore'
          )
          .map((fileName) => path.join(dir, fileName))
          .filter((fileName) => {
            try {
              if (!fs.existsSync(fileName)) return false;
              const tempDb = new Database(fileName, { readonly: true });
              const integrity = tempDb.prepare('PRAGMA integrity_check').get();
              tempDb.close();
              return integrity.integrity_check === 'ok';
            } catch {
              return false;
            }
          })
          .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

        if (backups.length > 0) {
          const latestGoodBackup = backups[0];
          console.error(`[localDb] Recovering from: ${latestGoodBackup}`);
          fs.copyFileSync(latestGoodBackup, DB_PATH);
          try {
            fs.unlinkSync(`${DB_PATH}-wal`);
          } catch {
            // ignore
          }
          try {
            fs.unlinkSync(`${DB_PATH}-shm`);
          } catch {
            // ignore
          }
        } else {
          console.error('[localDb] No valid backups found. Creating fresh DB.');
        }
      } catch (error) {
        console.error('[localDb] Recovery failed:', error.message);
      }
    }

    _db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');

    const { ensureAllSchema } = require('./schema');
    ensureAllSchema(_db);

    // Post-schema safety net: detect WAL-replay corruption before using the handle.
    // If integrity_check fails here, the handle is unsafe — close and recreate clean.
    const postIntegrity = _db.prepare('PRAGMA integrity_check').get();
    if (postIntegrity.integrity_check !== 'ok') {
      console.error('[localDb] CRITICAL: Post-schema integrity check failed — resetting DB');
      _db.close();
      _db = null;
      try {
        fs.unlinkSync(DB_PATH);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(`${DB_PATH}-wal`);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(`${DB_PATH}-shm`);
      } catch {
        /* ignore */
      }
      _db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
      _db.pragma('journal_mode = WAL');
      _db.pragma('foreign_keys = ON');
      _db.pragma('busy_timeout = 5000');
      ensureAllSchema(_db);
    }

    const finalCount = _db.prepare('SELECT count(*) as c FROM projects').get().c;
    if (finalCount === 0) {
      console.error('[localDb] CRITICAL: Projects table is still empty after recovery!');
    } else {
      console.log(`[localDb] DB ready with ${finalCount} projects`);
    }
  }

  if (!_db.tables) {
    _db.tables = tables;
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
    const conditions = where.map(([column, operator, value]) => {
      params.push(value);
      return `${column} ${operator} ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (orderBy.length > 0) {
    sql += ` ORDER BY ${orderBy.map(([column, direction]) => `${column} ${direction.toUpperCase()}`).join(', ')}`;
  }

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return { sql, params };
}

function buildWhere(where) {
  if (!where || where.length === 0) return { clauses: ['1=1'], values: [] };

  const clauses = [];
  const values = [];
  for (const [column, operator, value] of where) {
    if (operator === 'IN') {
      if (!Array.isArray(value) || value.length === 0) {
        clauses.push('1=0');
      } else {
        clauses.push(`${column} IN (${value.map(() => '?').join(', ')})`);
        values.push(...value);
      }
      continue;
    }
    if (operator === 'IS NOT' && value === null) {
      clauses.push(`${column} IS NOT NULL`);
      continue;
    }
    clauses.push(`${column} ${operator} ?`);
    values.push(value);
  }

  return { clauses, values };
}

function resolveDbArgs(dbOrInput, maybeInput) {
  if (dbOrInput && typeof dbOrInput.prepare === 'function') {
    return { db: dbOrInput, input: maybeInput || {} };
  }
  return { db: getDb(), input: dbOrInput || {} };
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
      const columns = Object.keys(data);
      const values = columns.map((key) => data[key] ?? null);
      const info = db
        .prepare(
          `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
        )
        .run(...values);
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
      const setColumns = keys.map((key) => `${key} = ?`);
      const setValues = keys.map((key) => data[key] ?? null);
      db.prepare(
        `UPDATE ${tableName} SET ${setColumns.join(', ')} WHERE ${clauses.join(' AND ')}`
      ).run(...setValues, ...values);
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

      const { deleteProjectCascadeUnsafe } = require('./projects');
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
  task_comments: makeTableOps('task_comments', 'id'),
  agent_workspaces: makeTableOps('agent_workspaces', 'id'),
  agent_runs: makeTableOps('agent_runs', 'run_id'),
  agent_artifacts: makeTableOps('agent_artifacts', 'artifact_id'),
  supervisor_snapshots: makeTableOps('supervisor_snapshots', 'task_id'),
  supervisor_approval_checkpoints: makeTableOps(
    'supervisor_approval_checkpoints',
    'checkpoint_key'
  ),
  swarm_missions: makeTableOps('swarm_missions', 'mission_id'),
  mission_participants: makeTableOps('mission_participants', 'participant_id'),
  mission_messages: makeTableOps('mission_messages', 'message_id'),
  message_deliveries: makeTableOps('message_deliveries', 'delivery_id'),
  agent_presence: makeTableOps('agent_presence', 'presence_id'),
  telegram_actor_mappings: makeTableOps('telegram_actor_mappings', 'actor_id'),
  telegram_intent_envelopes: makeTableOps('telegram_intent_envelopes', 'intent_id'),
  telegram_delivery_receipts: makeTableOps('telegram_delivery_receipts', 'delivery_key'),
  telegram_subscriptions: makeTableOps('telegram_subscriptions', 'subscription_key'),
  project_files: makeTableOps('project_files', 'id'),
  agent_registry: makeTableOps('agent_registry', 'agent_id'),
  mcp_connections: makeTableOps('mcp_connections', 'id'),
  ai_interactions: makeTableOps('ai_interactions', 'id'),
  agent_hub_sessions: makeTableOps('agent_hub_sessions', 'id'),
  agent_hub_messages: makeTableOps('agent_hub_messages', 'id'),
  swarm_config: makeTableOps('swarm_config', 'key'),
  swarm_processes: makeTableOps('swarm_processes', 'id'),
  swarm_queue_items: makeTableOps('swarm_queue_items', 'id'),
  profiles: {
    ...makeTableOps('profiles', 'id'),
    upsert(data) {
      const db = getDb();
      const columns = Object.keys(data);
      const values = columns.map((key) => data[key] ?? null);
      const updateColumns = columns
        .filter((key) => key !== 'id')
        .map((key) => `${key} = excluded.${key}`)
        .join(', ');
      db.prepare(
        `INSERT INTO profiles (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateColumns}`
      ).run(...values);
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
              .map((field) => field.trim())
              .join(', ');
    }
    return this;
  }

  eq(column, value) {
    this._where.push([column, '=', value]);
    return this;
  }

  neq(column, value) {
    this._where.push([column, '!=', value]);
    return this;
  }

  in(column, values) {
    if (!values || values.length === 0) {
      this._where.push(['1', '=', '0']);
      return this;
    }
    this._where.push([column, `IN (${values.map(() => '?').join(', ')})`, values]);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this._orderBy.push([column, ascending ? 'ASC' : 'DESC']);
    return this;
  }

  limit(limit) {
    this._limitVal = limit;
    return this;
  }

  async then(resolve, reject) {
    try {
      const result = await this.execute();
      if (resolve) resolve(result);
      return result;
    } catch (error) {
      if (reject) reject(error);
      throw error;
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
  ...constants,
  getDb,
  closeDb,
  buildSelectQuery,
  buildWhere,
  resolveDbArgs,
  tableExists,
  tableHasColumn,
  makeTableOps,
  tables,
  LocalQuery,
};

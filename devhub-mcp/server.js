#!/usr/bin/env node
/**
 * DevHub MCP Server
 * Expone herramientas de DevHub (proyectos, tareas, hitos) para OpenCode.
 * Comunicación via stdio — sin API key externa necesaria.
 *
 * Uso: node devhub-mcp/server.js
 * Config OpenCode: ver devhub-mcp/README.md
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

// Cargar .env.local desde la raíz del proyecto
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const require = createRequire(import.meta.url);
const localDb = require('../src/lib/db/localDb.js');

const DB_DRIVER = (process.env.DEVHUB_MCP_DB_DRIVER || 'sqlite').toLowerCase();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function nowIso() {
  return new Date().toISOString();
}

const LEASE_TTL_MS = 120_000;
const LEASE_OUTCOME_STATUS = {
  completed: 'completed',
  paused: 'pending',
  abandoned: 'pending',
  failed: 'blocked',
};

function leaseExpiryIso(baseMs = Date.now()) {
  return new Date(baseMs + LEASE_TTL_MS).toISOString();
}

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function hasExpired(value, nowMs = Date.now()) {
  const expiresAt = parseIsoMs(value);
  return expiresAt === null || expiresAt <= nowMs;
}

function isActiveLease(task, nowMs = Date.now()) {
  return Boolean(
    task?.status === 'in_progress' &&
    task?.assigned_to &&
    task?.claim_token &&
    parseIsoMs(task?.lease_expires_at) !== null &&
    !hasExpired(task.lease_expires_at, nowMs)
  );
}

function needsLeaseCleanup(task, nowMs = Date.now()) {
  if (task?.status !== 'in_progress') return false;
  return !task?.assigned_to || !task?.claim_token || hasExpired(task?.lease_expires_at, nowMs);
}

function buildLeaseFields(agentId, { nowMs = Date.now(), claimToken = randomUUID() } = {}) {
  const timestamp = new Date(nowMs).toISOString();
  return {
    status: 'in_progress',
    assigned_to: agentId,
    claimed_at: timestamp,
    lease_expires_at: leaseExpiryIso(nowMs),
    claim_token: claimToken,
    updated_at: timestamp,
  };
}

function buildReleaseFields(outcome, nowMs = Date.now()) {
  const status = LEASE_OUTCOME_STATUS[outcome];
  const timestamp = new Date(nowMs).toISOString();
  return {
    status,
    assigned_to: null,
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    completed_at: outcome === 'completed' ? timestamp : null,
    updated_at: timestamp,
  };
}

function claimResponseMessage({ reused = false } = {}) {
  return reused ? 'El agente ya tiene una tarea activa.' : 'Tarea reclamada.';
}

function generateLegacyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const UUID_REQUIRED_TABLES = new Set(['projects', 'tasks', 'milestones']);
const AUTO_ID_TABLES = new Set([
  'projects',
  'tasks',
  'milestones',
  'task_comments',
  'agent_memory',
  'mcp_connections',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ID_REGEX = /^[a-z]+-\d{10,}-[a-z0-9]{8}$/i;

const UUID_OR_LEGACY_ID_SCHEMA = z
  .string()
  .refine((value) => UUID_REGEX.test(String(value)) || LEGACY_ID_REGEX.test(String(value)), {
    message: 'Debe ser UUID o ID legacy (<tipo>-<timestamp>-<suffix>)',
  });

function generatePrimaryIdForTable(tableName) {
  if (UUID_REQUIRED_TABLES.has(tableName)) return randomUUID();
  return generateLegacyId(tableName.replace(/s$/, ''));
}

function ensureLocalMcpTables() {
  const db = localDb.getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
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
      business_value INTEGER DEFAULT 5,
      stale_alert INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      last_qa_feedback TEXT,
      assigned_to TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      claim_token TEXT
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'planned',
      due_date TEXT,
      assigned_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author_type TEXT DEFAULT 'agent',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(task_id, depends_on)
    );

    CREATE TABLE IF NOT EXISTS agent_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      agent_id TEXT,
      key TEXT NOT NULL,
      tipo TEXT NOT NULL,
      value TEXT NOT NULL,
      embedding TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_claim_token ON tasks(claim_token);
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends ON task_dependencies(depends_on);
    CREATE INDEX IF NOT EXISTS idx_agent_registry_project ON agent_registry(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry(status);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_tipo ON agent_memory(tipo);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
  `);

  const alterStatements = [
    'ALTER TABLE tasks ADD COLUMN milestone_id TEXT',
    'ALTER TABLE tasks ADD COLUMN business_value INTEGER DEFAULT 5',
    'ALTER TABLE tasks ADD COLUMN stale_alert INTEGER DEFAULT 0',
    'ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0',
    'ALTER TABLE tasks ADD COLUMN last_qa_feedback TEXT',
    'ALTER TABLE tasks ADD COLUMN assigned_to TEXT',
    'ALTER TABLE tasks ADD COLUMN claimed_at TEXT',
    'ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT',
    'ALTER TABLE tasks ADD COLUMN claim_token TEXT',
    'ALTER TABLE milestones ADD COLUMN assigned_to TEXT',
    'ALTER TABLE agent_registry ADD COLUMN current_task_id TEXT',
    'ALTER TABLE agent_registry ADD COLUMN updated_at TEXT',
    'ALTER TABLE agent_registry ADD COLUMN error_message TEXT',
  ];

  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch (e) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
  }
}

function parseOrIlike(expression) {
  if (!expression) return [];
  return expression
    .split(',')
    .map((raw) => raw.trim())
    .map((raw) => {
      const match = raw.match(/^([a-zA-Z0-9_]+)\.ilike\.(.+)$/);
      if (!match) return null;
      const col = match[1];
      const pattern = match[2].replace(/\*/g, '%');
      return { col, pattern };
    })
    .filter(Boolean);
}

function toSqlOrder(orderItems) {
  if (!orderItems || orderItems.length === 0) return '';
  const clauses = orderItems.map(({ col, ascending = true, nullsFirst }) => {
    const dir = ascending ? 'ASC' : 'DESC';
    if (nullsFirst === undefined) return `${col} ${dir}`;
    const nulls = nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    return `${col} ${dir} ${nulls}`;
  });
  return ` ORDER BY ${clauses.join(', ')}`;
}

class LocalQueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this._filters = [];
    this._orIlike = [];
    this._orderBy = [];
    this._limit = null;
    this._single = false;
    this._selectFields = '*';
    this._action = 'select';
    this._payload = null;
    this._upsertOptions = null;
    this._count = null;
    this._head = false;
  }

  select(fields = '*', options = {}) {
    if (typeof fields === 'string' && fields.trim().length > 0) {
      this._selectFields = fields;
    }
    this._count = options?.count || null;
    this._head = !!options?.head;
    return this;
  }

  eq(col, val) {
    this._filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this._filters.push({ op: 'in', col, val: vals || [] });
    return this;
  }

  or(expression) {
    this._orIlike = parseOrIlike(expression);
    return this;
  }

  order(col, { ascending = true, nullsFirst } = {}) {
    this._orderBy.push({ col, ascending, nullsFirst });
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  insert(data) {
    this._action = 'insert';
    this._payload = data;
    return this;
  }

  update(data) {
    this._action = 'update';
    this._payload = data;
    return this;
  }

  upsert(data, options = {}) {
    this._action = 'upsert';
    this._payload = data;
    this._upsertOptions = options;
    return this;
  }

  delete() {
    this._action = 'delete';
    this._payload = null;
    return this;
  }

  _buildWhere() {
    const clauses = [];
    const params = [];

    for (const f of this._filters) {
      if (f.op === 'eq') {
        clauses.push(`${f.col} = ?`);
        params.push(f.val);
      } else if (f.op === 'in') {
        if (!Array.isArray(f.val) || f.val.length === 0) {
          clauses.push('1 = 0');
        } else {
          clauses.push(`${f.col} IN (${f.val.map(() => '?').join(', ')})`);
          params.push(...f.val);
        }
      }
    }

    if (this._orIlike.length > 0) {
      const orParts = this._orIlike.map((it) => `LOWER(${it.col}) LIKE LOWER(?)`);
      clauses.push(`(${orParts.join(' OR ')})`);
      params.push(...this._orIlike.map((it) => it.pattern));
    }

    return {
      whereSql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  _queryRows(fields = this._selectFields) {
    const { whereSql, params } = this._buildWhere();
    const orderSql = toSqlOrder(this._orderBy);
    const limitSql = Number.isInteger(this._limit) ? ' LIMIT ?' : '';
    const sql = `SELECT ${fields} FROM ${this.table}${whereSql}${orderSql}${limitSql}`;
    const finalParams = Number.isInteger(this._limit) ? [...params, this._limit] : params;
    return this.db.prepare(sql).all(...finalParams);
  }

  _insertRow(row) {
    const payload = { ...row };
    if (payload.id === undefined && AUTO_ID_TABLES.has(this.table)) {
      payload.id = generatePrimaryIdForTable(this.table);
    }
    if (payload.created_at === undefined) payload.created_at = nowIso();
    if (
      payload.updated_at === undefined &&
      ['projects', 'tasks', 'milestones', 'agent_registry'].includes(this.table)
    ) {
      payload.updated_at = nowIso();
    }

    const cols = Object.keys(payload);
    const values = cols.map((k) => payload[k] ?? null);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);

    if (payload.id !== undefined) {
      return this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(payload.id);
    }
    if (payload.agent_id !== undefined) {
      return this.db
        .prepare(`SELECT * FROM ${this.table} WHERE agent_id = ?`)
        .get(payload.agent_id);
    }
    return this.db.prepare(`SELECT * FROM ${this.table} ORDER BY rowid DESC LIMIT 1`).get();
  }

  _updateRows() {
    const data = this._payload || {};
    const keys = Object.keys(data);
    if (keys.length === 0) return [];
    const { whereSql, params } = this._buildWhere();
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => data[k] ?? null);
    const sql = `UPDATE ${this.table} SET ${setSql}${whereSql}`;
    this.db.prepare(sql).run(...values, ...params);
    return this._queryRows('*');
  }

  _upsertRows() {
    const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
    const conflict = this._upsertOptions?.onConflict || 'id';
    const results = [];

    for (const row of rows) {
      if (!row || row[conflict] === undefined || row[conflict] === null) {
        results.push(this._insertRow(row || {}));
        continue;
      }

      const existing = this.db
        .prepare(`SELECT * FROM ${this.table} WHERE ${conflict} = ? LIMIT 1`)
        .get(row[conflict]);

      if (!existing) {
        results.push(this._insertRow(row));
        continue;
      }

      const merged = { ...row, updated_at: nowIso() };
      const keys = Object.keys(merged);
      const setSql = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => merged[k] ?? null);
      this.db
        .prepare(`UPDATE ${this.table} SET ${setSql} WHERE ${conflict} = ?`)
        .run(...values, row[conflict]);
      const updated = this.db
        .prepare(`SELECT * FROM ${this.table} WHERE ${conflict} = ? LIMIT 1`)
        .get(row[conflict]);
      results.push(updated);
    }

    return results;
  }

  async execute() {
    try {
      if (this._action === 'select') {
        const rows = this._queryRows(this._selectFields);
        if (this._head && this._count === 'exact') {
          return { data: null, error: null, count: rows.length };
        }
        return {
          data: this._single ? rows[0] || null : rows,
          error: null,
          count: this._count === 'exact' ? rows.length : null,
        };
      }

      if (this._action === 'insert') {
        const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
        const inserted = rows.map((row) => this._insertRow(row));
        return { data: this._single ? inserted[0] || null : inserted, error: null };
      }

      if (this._action === 'update') {
        const updatedRows = this._updateRows();
        return { data: this._single ? updatedRows[0] || null : updatedRows, error: null };
      }

      if (this._action === 'upsert') {
        const upserted = this._upsertRows();
        return { data: this._single ? upserted[0] || null : upserted, error: null };
      }

      if (this._action === 'delete') {
        const { whereSql, params } = this._buildWhere();
        this.db.prepare(`DELETE FROM ${this.table}${whereSql}`).run(...params);
        return { data: null, error: null };
      }

      return { data: null, error: { message: `Acción no soportada: ${this._action}` } };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function createLocalClient() {
  const db = localDb.getDb();
  ensureLocalMcpTables();

  return {
    from(table) {
      return new LocalQueryBuilder(db, table);
    },
    async rpc(name, params = {}) {
      try {
        if (name === 'search_memory_fts') {
          const projectId = params.p_project_id;
          const query = params.p_query || '';
          const tipo = params.p_tipo || 'all';
          const limit = params.p_limit || 10;
          const where = ['project_id = ?'];
          const values = [projectId];
          if (tipo !== 'all') {
            where.push('tipo = ?');
            values.push(tipo);
          }
          where.push('(LOWER(key) LIKE LOWER(?) OR LOWER(value) LIKE LOWER(?))');
          values.push(`%${query}%`, `%${query}%`);
          values.push(limit);
          const rows = db
            .prepare(
              `SELECT id, key, tipo, value, created_at FROM agent_memory WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
            )
            .all(...values);
          return { data: rows, error: null };
        }

        if (name === 'search_memory_semantic') {
          const projectId = params.p_project_id;
          const limit = params.p_match_count || 10;
          const rows = db
            .prepare(
              'SELECT id, key, tipo, value, created_at FROM agent_memory WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
            )
            .all(projectId, limit);
          return { data: rows, error: null };
        }

        return { data: null, error: { message: `RPC no soportado en SQLite: ${name}` } };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
  };
}

let supabase;
if (DB_DRIVER === 'supabase') {
  const { createClient } = await import('@supabase/supabase-js');
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    process.stderr.write('❌ ERROR: Faltan variables SUPABASE en .env.local\n');
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  process.stderr.write('ℹ️  DevHub MCP usando driver Supabase (DEVHUB_MCP_DB_DRIVER=supabase)\n');
} else {
  supabase = createLocalClient();
  process.stderr.write('ℹ️  DevHub MCP usando driver SQLite local (local-first)\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function err(msg) {
  return { content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true };
}

const TOPIC_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;

function normalizeTopicKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/\/+/g, '/');
}

function validateTopicKey(value) {
  const normalized = normalizeTopicKey(value);
  const valid = TOPIC_KEY_REGEX.test(normalized);
  return {
    valid,
    normalized,
    reason: valid
      ? null
      : 'Formato invalido. Usa <dominio>/<subdominio>/<tema> en lowercase, hasta 4 segmentos y guion medio.',
  };
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.35);
}

const TASK_PRIORITY_SCORE = { critical: 4, high: 3, medium: 2, low: 1 };

function scoreTask(task, depsUnlock = 0) {
  const urgency = TASK_PRIORITY_SCORE[task.priority] || 2;
  const businessValue = Number(task.business_value ?? 5);
  const updatedAt = task.updated_at ? new Date(task.updated_at) : null;
  const stalledHours =
    updatedAt && !Number.isNaN(updatedAt.getTime())
      ? Math.max(0, (Date.now() - updatedAt.getTime()) / 36e5)
      : 0;
  const staleComponent = Math.min(stalledHours / 48, 10);
  const dueComponent =
    task.due_date && !Number.isNaN(new Date(task.due_date).getTime())
      ? Math.max(0, Math.min(5, 5 - (new Date(task.due_date).getTime() - Date.now()) / 864e5))
      : 0;

  return Number(
    (
      urgency * 0.4 +
      businessValue * 0.3 +
      Number(depsUnlock || 0) * 0.2 +
      staleComponent * 0.1 +
      dueComponent * 0.05
    ).toFixed(3)
  );
}

function buildQueue(tasks = [], deps = [], allTasks = [], { includeBlocked = false } = {}) {
  const statusMap = Object.fromEntries((allTasks || []).map((t) => [t.id, t.status]));
  const unlockCounts = deps.reduce((acc, dep) => {
    acc[dep.depends_on] = (acc[dep.depends_on] || 0) + 1;
    return acc;
  }, {});

  return (tasks || [])
    .map((task) => {
      const taskDeps = deps.filter((d) => d.task_id === task.id && d.tipo === 'blocks');
      const blockingDeps = taskDeps.filter((d) => statusMap[d.depends_on] !== 'completed');
      const blocked = blockingDeps.length > 0;
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        milestone_id: task.milestone_id,
        assigned_to: task.assigned_to,
        business_value: task.business_value ?? 5,
        blocked,
        blocking_dependencies: blockingDeps.map((d) => d.depends_on),
        priority_score: blocked ? 0 : scoreTask(task, unlockCounts[task.id] || 0),
      };
    })
    .filter((task) => includeBlocked || !task.blocked)
    .sort((a, b) => b.priority_score - a.priority_score);
}

function filterCompatibilityQueue(queue = [], deps = [], pendingTaskIds = []) {
  const pendingIds = new Set(pendingTaskIds);
  return queue.filter(
    (task) =>
      !(deps || []).some(
        (dep) => dep.depends_on === task.id && dep.tipo === 'blocks' && pendingIds.has(dep.task_id)
      )
  );
}

async function getAgentActiveTask(projectId, agentId, nowMs = Date.now()) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const params = [];
    let sql = "SELECT * FROM tasks WHERE assigned_to = ? AND status = 'in_progress'";
    params.push(agentId);
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    sql += ' ORDER BY claimed_at DESC';
    const tasks = db
      .prepare(sql)
      .all(...params)
      .filter((task) => isActiveLease(task, nowMs));
    return tasks[0] || null;
  }

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', agentId)
    .eq('status', 'in_progress');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const tasks = (data || []).filter((task) => isActiveLease(task, nowMs));
  tasks.sort((a, b) => {
    const aMs = parseIsoMs(a.claimed_at) || 0;
    const bMs = parseIsoMs(b.claimed_at) || 0;
    return bMs - aMs;
  });
  return tasks[0] || null;
}

async function syncAgentRegistryState(
  agentId,
  { currentTaskId = null, status, lastHeartbeat } = {}
) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const fields = ['current_task_id = ?', 'updated_at = ?'];
    const values = [currentTaskId, nowIso()];
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }
    if (lastHeartbeat !== undefined) {
      fields.push('last_heartbeat = ?');
      values.push(lastHeartbeat);
    }
    values.push(agentId);
    db.prepare(`UPDATE agent_registry SET ${fields.join(', ')} WHERE agent_id = ?`).run(...values);
    return;
  }

  const updates = {
    current_task_id: currentTaskId,
    updated_at: nowIso(),
  };
  if (status !== undefined) updates.status = status;
  if (lastHeartbeat !== undefined) updates.last_heartbeat = lastHeartbeat;
  const { error } = await supabase.from('agent_registry').update(updates).eq('agent_id', agentId);
  if (error) throw new Error(error.message);
}

async function cleanupExpiredLeases(projectId = null, agentId = null, nowMs = Date.now()) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const params = [];
    let sql = "SELECT * FROM tasks WHERE status = 'in_progress'";
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (agentId) {
      sql += ' AND assigned_to = ?';
      params.push(agentId);
    }
    const staleTasks = db
      .prepare(sql)
      .all(...params)
      .filter((task) => needsLeaseCleanup(task, nowMs));
    if (staleTasks.length === 0) return [];

    const impactedAgents = new Set();
    for (const task of staleTasks) {
      if (task.assigned_to) impactedAgents.add(task.assigned_to);
      const releaseFields = buildReleaseFields('abandoned', nowMs);
      db.prepare(
        `UPDATE tasks
         SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
             claim_token = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'in_progress'`
      ).run(releaseFields.status, releaseFields.updated_at, task.id);
    }

    for (const affectedAgentId of impactedAgents) {
      const activeTask = await getAgentActiveTask(projectId, affectedAgentId, nowMs);
      await syncAgentRegistryState(affectedAgentId, {
        currentTaskId: activeTask?.id || null,
        status: activeTask ? 'working' : 'idle',
      });
    }

    return staleTasks;
  }

  let query = supabase.from('tasks').select('*').eq('status', 'in_progress');
  if (projectId) query = query.eq('project_id', projectId);
  if (agentId) query = query.eq('assigned_to', agentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const staleTasks = (data || []).filter((task) => needsLeaseCleanup(task, nowMs));
  if (staleTasks.length === 0) return [];

  const impactedAgents = new Set();
  for (const task of staleTasks) {
    if (task.assigned_to) impactedAgents.add(task.assigned_to);
    const { error: updateError } = await supabase
      .from('tasks')
      .update(buildReleaseFields('abandoned', nowMs))
      .eq('id', task.id)
      .eq('status', 'in_progress');
    if (updateError) throw new Error(updateError.message);
  }

  for (const affectedAgentId of impactedAgents) {
    const activeTask = await getAgentActiveTask(projectId, affectedAgentId, nowMs);
    await syncAgentRegistryState(affectedAgentId, {
      currentTaskId: activeTask?.id || null,
      status: activeTask ? 'working' : 'idle',
    });
  }

  return staleTasks;
}

async function getExecutionQueueData(projectId, { limit = 20, includeBlocked = false } = {}) {
  await cleanupExpiredLeases(projectId);
  const [{ data: tasks, error: tasksErr }, { data: allTasks }, { data: deps }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.from('tasks').select('id, status').eq('project_id', projectId),
    supabase.from('task_dependencies').select('*'),
  ]);

  if (tasksErr) throw new Error(tasksErr.message);
  return buildQueue(tasks || [], deps || [], allTasks || [], { includeBlocked }).slice(0, limit);
}

async function claimNextTaskSupabase(projectId, agentId, { compatibilityMode = false } = {}) {
  const nowMs = Date.now();
  const timestamp = new Date(nowMs).toISOString();

  await cleanupExpiredLeases(projectId, null, nowMs);

  const activeTask = await getAgentActiveTask(projectId, agentId, nowMs);
  if (activeTask) {
    await syncAgentRegistryState(agentId, {
      currentTaskId: activeTask.id,
      status: 'working',
      lastHeartbeat: timestamp,
    });
    return {
      claimed: true,
      reused: true,
      task: activeTask,
      message: claimResponseMessage({ reused: true }),
    };
  }

  const queue = await getExecutionQueueData(projectId, { limit: 20, includeBlocked: false });
  const { data: deps, error: depsError } = await supabase.from('task_dependencies').select('*');
  if (depsError) return { error: depsError.message };
  const { data: pendingTasks, error: pendingError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'pending');
  if (pendingError) return { error: pendingError.message };
  const candidates = compatibilityMode
    ? filterCompatibilityQueue(
        queue,
        deps || [],
        (pendingTasks || []).map((task) => task.id)
      )
    : queue;
  for (const candidate of candidates) {
    const leaseFields = buildLeaseFields(agentId, { nowMs, claimToken: randomUUID() });
    const { data, error } = await supabase
      .from('tasks')
      .update(leaseFields)
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) return { error: error.message };
    if (!data) continue;

    await syncAgentRegistryState(agentId, {
      currentTaskId: data.id,
      status: 'working',
      lastHeartbeat: timestamp,
    });

    return {
      claimed: true,
      reused: false,
      task: { ...candidate, ...data },
      message: claimResponseMessage({ reused: false }),
    };
  }

  await syncAgentRegistryState(agentId, {
    currentTaskId: null,
    status: 'idle',
    lastHeartbeat: timestamp,
  }).catch(() => {});
  return { claimed: false, reused: false, task: null, message: 'Sin tareas disponibles' };
}

function getLocalClaimTransaction() {
  const db = localDb.getDb();
  return db.transaction(({ projectId, agentId, compatibilityMode = false }) => {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();

    const staleTasks = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = 'in_progress'")
      .all(projectId)
      .filter((task) => needsLeaseCleanup(task, nowMs));

    for (const staleTask of staleTasks) {
      db.prepare(
        `UPDATE tasks
         SET status = 'pending', assigned_to = NULL, claimed_at = NULL,
             lease_expires_at = NULL, claim_token = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ?`
      ).run(timestamp, staleTask.id);

      if (staleTask.assigned_to) {
        db.prepare(
          `UPDATE agent_registry
           SET current_task_id = NULL,
               status = CASE WHEN status = 'working' THEN 'idle' ELSE status END,
               updated_at = ?
           WHERE agent_id = ?`
        ).run(timestamp, staleTask.assigned_to);
      }
    }

    const activeTask = db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND assigned_to = ? AND status = 'in_progress'"
      )
      .all(projectId, agentId)
      .filter((task) => isActiveLease(task, nowMs))
      .sort((a, b) => (parseIsoMs(b.claimed_at) || 0) - (parseIsoMs(a.claimed_at) || 0))[0];

    if (activeTask) {
      db.prepare(
        `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, updated_at = ?, last_heartbeat = ?
         WHERE agent_id = ?`
      ).run(activeTask.id, timestamp, timestamp, agentId);
      return {
        claimed: true,
        reused: true,
        task: activeTask,
        message: claimResponseMessage({ reused: true }),
      };
    }

    const tasks = db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
      )
      .all(projectId);
    const allTasks = db.prepare('SELECT id, status FROM tasks WHERE project_id = ?').all(projectId);
    const deps = db.prepare('SELECT * FROM task_dependencies').all();
    const queue = buildQueue(tasks, deps, allTasks, { includeBlocked: false });
    const candidates = compatibilityMode
      ? filterCompatibilityQueue(
          queue,
          deps,
          tasks.map((task) => task.id)
        )
      : queue;
    for (const candidate of candidates) {
      const leaseFields = buildLeaseFields(agentId, { nowMs, claimToken: randomUUID() });
      const result = db
        .prepare(
          `UPDATE tasks
           SET status = ?, assigned_to = ?, claimed_at = ?, lease_expires_at = ?, claim_token = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`
        )
        .run(
          leaseFields.status,
          leaseFields.assigned_to,
          leaseFields.claimed_at,
          leaseFields.lease_expires_at,
          leaseFields.claim_token,
          leaseFields.updated_at,
          candidate.id
        );

      if (result.changes !== 1) continue;

      db.prepare(
        `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, last_heartbeat = ?, updated_at = ?
         WHERE agent_id = ?`
      ).run(candidate.id, timestamp, timestamp, agentId);

      const claimedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(candidate.id);
      return {
        claimed: true,
        reused: false,
        task: { ...candidate, ...claimedTask },
        message: claimResponseMessage({ reused: false }),
      };
    }

    return { claimed: false, reused: false, task: null, message: 'Sin tareas disponibles' };
  });
}

// ─── Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'devhub',
  version: '1.0.0',
});

// ────────────────────────────────────────────────────────────────────────────
// PROYECTOS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  'list_projects',
  'Lista todos los proyectos del usuario en DevHub con su progreso y estado.',
  {
    status: z
      .enum(['active', 'paused', 'completed', 'archived', 'all'])
      .optional()
      .describe('Filtrar por estado. Default: all'),
  },
  async ({ status }) => {
    let query = supabase
      .from('projects')
      .select('id, name, status, progress')
      .order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, projects: data });
  }
);

server.tool(
  'get_project',
  'Obtiene todos los detalles de un proyecto específico incluyendo sus tareas e hitos.',
  { project_id: z.string().uuid().describe('UUID del proyecto') },
  async ({ project_id }) => {
    const [projRes, tasksRes, msRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', project_id).single(),
      supabase
        .from('tasks')
        .select('*')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('milestones')
        .select('*')
        .eq('project_id', project_id)
        .order('due_date', { ascending: true }),
    ]);
    if (projRes.error) return err(projRes.error.message);
    return ok({
      project: projRes.data,
      tasks: (tasksRes.data || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      })),
      milestones: (msRes.data || []).map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        due_date: m.due_date,
      })),
      summary: {
        total_tasks: tasksRes.data?.length || 0,
        completed_tasks: tasksRes.data?.filter((t) => t.status === 'completed').length || 0,
        in_progress: tasksRes.data?.filter((t) => t.status === 'in_progress').length || 0,
        blocked: tasksRes.data?.filter((t) => t.status === 'blocked').length || 0,
        milestones_done: msRes.data?.filter((m) => m.status === 'completed').length || 0,
      },
    });
  }
);

server.tool(
  'update_project',
  'Actualiza los campos de un proyecto (nombre, descripción, progreso, estado, color, planning_status).',
  {
    project_id: z.string().uuid(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
    progress: z.number().min(0).max(100).optional(),
    color: z.string().optional(),
    planning_status: z
      .enum(['none', 'pending', 'completed'])
      .optional()
      .describe('Estado del planning IA del proyecto'),
  },
  async ({ project_id, ...updates }) => {
    const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length === 0) return err('No se proporcionaron campos para actualizar');
    const { data, error } = await supabase
      .from('projects')
      .update(fields)
      .eq('id', project_id)
      .select()
      .single();
    if (error) return err(error.message);
    if (!data) return err(`Proyecto ${project_id} no encontrado.`);
    return ok({ updated: true, project: data });
  }
);

server.tool(
  'create_project',
  'Crea un nuevo proyecto en DevHub con nombre, descripción y opciones de configuración.',
  {
    name: z.string().min(1).describe('Nombre del proyecto'),
    description: z.string().optional().describe('Descripción breve del proyecto'),
    color: z.string().optional().describe('Color de acento en hex (ej. #58A6FF)'),
    project_type: z
      .enum(['software', 'university', 'research', 'security', 'business', 'creative'])
      .optional()
      .describe('Tipo de proyecto. Default: software'),
    documentation_policy: z
      .enum(['personal', 'shared', 'file-only'])
      .optional()
      .describe('Política de documentación. Default: personal'),
    local_path: z.string().optional().describe('Ruta local del proyecto en disco'),
    planning_prompt: z.string().optional().describe('Prompt para el planning IA automático'),
  },
  async ({
    name,
    description,
    color,
    project_type,
    documentation_policy,
    local_path,
    planning_prompt,
  }) => {
    const id = randomUUID();
    const payload = {
      id,
      user_id: 'local-user',
      name,
      description: description || '',
      color: color || '#58A6FF',
      project_type: project_type || 'software',
      documentation_policy: documentation_policy || 'personal',
      local_path: local_path || '',
      planning_prompt: planning_prompt || '',
      status: 'active',
      progress: 0,
    };
    const { data, error } = await supabase.from('projects').insert(payload).select().single();
    if (error) return err(error.message);
    return ok({ created: true, project: data });
  }
);

server.tool(
  'delete_project',
  'Elimina un proyecto de DevHub y todas sus tareas, hitos y archivos asociados.',
  {
    project_id: z.string().uuid().describe('UUID del proyecto a eliminar'),
    confirm: z
      .boolean()
      .describe('Debe ser true para confirmar la eliminación. Previene borrados accidentales.'),
  },
  async ({ project_id, confirm }) => {
    if (!confirm)
      return err('Debes pasar confirm: true para confirmar la eliminación del proyecto.');

    // Verificar que el proyecto existe antes de proceder
    const { data: proj } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .single();
    if (!proj) return err(`Proyecto ${project_id} no encontrado.`);

    // Eliminar todas las dependencias en orden correcto
    await supabase.from('tasks').delete().eq('project_id', project_id);
    await supabase.from('milestones').delete().eq('project_id', project_id);
    await supabase.from('project_files').delete().eq('project_id', project_id);

    const { error } = await supabase.from('projects').delete().eq('id', project_id);
    if (error) return err(error.message);
    return ok({ deleted: true, project_id, name: proj.name });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// TAREAS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  'list_tasks',
  'Lista las tareas de un proyecto, opcionalmente filtradas por estado o prioridad.',
  {
    project_id: z.string().uuid(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'all']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical', 'all']).optional(),
  },
  async ({ project_id, status, priority }) => {
    let query = supabase
      .from('tasks')
      .select('id, title, status, priority, description')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    if (priority && priority !== 'all') query = query.eq('priority', priority);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, tasks: data });
  }
);

server.tool(
  'create_task',
  'Crea una nueva tarea en un proyecto de DevHub.',
  {
    project_id: z.string().uuid(),
    user_id: z.string().uuid().describe('UUID del usuario propietario'),
    title: z.string().min(1).describe('Título de la tarea'),
    description: z.string().optional(),
    status: z
      .enum(['pending', 'in_progress', 'completed', 'blocked'])
      .optional()
      .default('pending'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
    due_date: z.string().optional().describe('Fecha ISO YYYY-MM-DD'),
    milestone_id: UUID_OR_LEGACY_ID_SCHEMA.optional().describe(
      'ID del hito (UUID o legacy) al que pertenece la tarea'
    ),
    assigned_to: z.string().uuid().optional().describe('UUID del usuario o agente asignado'),
  },
  async ({
    project_id,
    user_id,
    title,
    description,
    status,
    priority,
    due_date,
    milestone_id,
    assigned_to,
  }) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id,
        user_id,
        title,
        description: description || null,
        milestone_id: milestone_id || null,
        assigned_to: assigned_to || null,
        status,
        priority,
        due_date: due_date || null,
      })
      .select()
      .single();
    if (error) return err(error.message);
    return ok({ created: true, task: data });
  }
);

server.tool(
  'bulk_create_tasks',
  'Crea múltiples tareas de planning de forma idempotente: si ya existe una tarea con el mismo título en el proyecto, la omite.',
  {
    project_id: z.string().uuid(),
    user_id: z.string().uuid().describe('UUID del usuario propietario'),
    tasks: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
          priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          due_date: z.string().optional(),
          milestone_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
          business_value: z.number().min(1).max(10).optional(),
        })
      )
      .min(1)
      .max(200),
  },
  async ({ project_id, user_id, tasks }) => {
    const { data: existing, error: existingErr } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('project_id', project_id);
    if (existingErr) return err(existingErr.message);

    const existingTitles = new Set((existing || []).map((task) => task.title.trim().toLowerCase()));
    const seenTitles = new Set();
    const skipped = [];
    const payload = [];

    for (const task of tasks) {
      const key = task.title.trim().toLowerCase();
      if (existingTitles.has(key) || seenTitles.has(key)) {
        skipped.push({ title: task.title, reason: 'duplicate-title' });
        continue;
      }
      seenTitles.add(key);
      payload.push({
        project_id,
        user_id,
        title: task.title,
        description: task.description || null,
        status: task.status || 'pending',
        priority: task.priority || 'medium',
        due_date: task.due_date || null,
        milestone_id: task.milestone_id || null,
        business_value: task.business_value || 5,
      });
    }

    if (payload.length === 0) {
      return ok({ created_count: 0, skipped_count: skipped.length, tasks: [], skipped });
    }

    const { data, error } = await supabase.from('tasks').insert(payload).select();
    if (error) return err(error.message);
    return ok({
      created_count: data.length,
      skipped_count: skipped.length,
      tasks: data,
      skipped,
    });
  }
);

server.tool(
  'update_task',
  'Actualiza el estado, prioridad u otros campos de una tarea existente.',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA,
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    due_date: z.string().nullable().optional(),
    milestone_id: UUID_OR_LEGACY_ID_SCHEMA.nullable()
      .optional()
      .describe('ID del hito (UUID o legacy). null para desvincular'),
    assigned_to: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe('UUID del usuario o agente asignado'),
  },
  async ({ task_id, status, ...rest }) => {
    const updates = {
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    };
    if (status) {
      updates.status = status;
      if (status === 'completed') updates.completed_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', task_id)
      .select()
      .single();
    if (error) return err(error.message);
    if (!data) return err(`Tarea ${task_id} no encontrada.`);
    return ok({ updated: true, task: data });
  }
);

server.tool(
  'add_task_comment',
  'Añade un comentario a una tarea (útil para que los agentes dejen notas técnicas o log de QA).',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA,
    content: z.string(),
    author_type: z.enum(['human', 'agent']).default('agent'),
  },
  async ({ task_id, content, author_type }) => {
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id, content, author_type })
      .select()
      .single();
    if (error) return err(error.message);
    return ok({ created: true, comment: data });
  }
);

server.tool(
  'get_next_task',
  'Devuelve la siguiente tarea priorizada de la cola usando la fórmula de prioridad matemática.',
  {
    project_id: z.string().uuid(),
    agent_id: z.string(),
  },
  async ({ project_id, agent_id }) => {
    try {
      const claimed =
        DB_DRIVER !== 'supabase'
          ? getLocalClaimTransaction()({
              projectId: project_id,
              agentId: agent_id,
              compatibilityMode: true,
            })
          : await claimNextTaskSupabase(project_id, agent_id, { compatibilityMode: true });

      if (claimed?.error) return err(claimed.error);
      if (!claimed?.claimed) {
        const [nextPending] = await getExecutionQueueData(project_id, {
          limit: 1,
          includeBlocked: true,
        });
        if (nextPending) {
          return ok({ task: null, message: 'Todas las tareas pendientes están bloqueadas.' });
        }
        return ok({ task: null, message: 'Sin tareas pendientes' });
      }

      return ok({ task: claimed.task, message: 'Tarea asignada al agente.' });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'get_execution_queue',
  'Devuelve la cola de tareas pendientes ordenada por score, con explicación de bloqueos por dependencias.',
  {
    project_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).optional().default(20),
    include_blocked: z.boolean().optional().default(false),
  },
  async ({ project_id, limit, include_blocked }) => {
    try {
      const queue = await getExecutionQueueData(project_id, {
        limit,
        includeBlocked: include_blocked,
      });
      return ok({ total: queue.length, queue });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'claim_next_task',
  'Reclama de forma segura la siguiente tarea disponible para un agente y la marca como in_progress.',
  {
    project_id: z.string().uuid(),
    agent_id: z.string(),
  },
  async ({ project_id, agent_id }) => {
    try {
      if (DB_DRIVER !== 'supabase') {
        const claimed = getLocalClaimTransaction()({ projectId: project_id, agentId: agent_id });
        return ok(claimed);
      }

      const claimed = await claimNextTaskSupabase(project_id, agent_id);
      if (claimed?.error) return err(claimed.error);
      return ok(claimed);
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'renew_task_lease',
  'Renueva el lease de una tarea reclamada por el agente si token y ownership siguen vigentes.',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA,
    agent_id: z.string(),
    claim_token: z.string(),
  },
  async ({ task_id, agent_id, claim_token }) => {
    try {
      const nowMs = Date.now();
      const timestamp = new Date(nowMs).toISOString();

      if (DB_DRIVER !== 'supabase') {
        const db = localDb.getDb();
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
        if (!task) return err(`Tarea ${task_id} no encontrada.`);
        if (
          !isActiveLease(task, nowMs) ||
          task.assigned_to !== agent_id ||
          task.claim_token !== claim_token
        ) {
          return err('Lease inválido o expirado para renovar la tarea.');
        }
        const leaseExpiresAt = leaseExpiryIso(nowMs);
        db.prepare('UPDATE tasks SET lease_expires_at = ?, updated_at = ? WHERE id = ?').run(
          leaseExpiresAt,
          timestamp,
          task_id
        );
        db.prepare(
          'UPDATE agent_registry SET last_heartbeat = ?, status = ?, current_task_id = ?, updated_at = ? WHERE agent_id = ?'
        ).run(timestamp, 'working', task_id, timestamp, agent_id);
        const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
        return ok({ renewed: true, task: updated, message: 'Lease renovado.' });
      }

      await cleanupExpiredLeases(null, agent_id, nowMs);
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();
      if (taskError) return err(taskError.message);
      if (!task) return err(`Tarea ${task_id} no encontrada.`);
      if (
        !isActiveLease(task, nowMs) ||
        task.assigned_to !== agent_id ||
        task.claim_token !== claim_token
      ) {
        return err('Lease inválido o expirado para renovar la tarea.');
      }

      const { data, error } = await supabase
        .from('tasks')
        .update({ lease_expires_at: leaseExpiryIso(nowMs), updated_at: timestamp })
        .eq('id', task_id)
        .eq('assigned_to', agent_id)
        .eq('claim_token', claim_token)
        .eq('status', 'in_progress')
        .select()
        .single();
      if (error) return err(error.message);
      if (!data) return err('Lease inválido o expirado para renovar la tarea.');

      await syncAgentRegistryState(agent_id, {
        currentTaskId: data.id,
        status: 'working',
        lastHeartbeat: timestamp,
      });

      return ok({ renewed: true, task: data, message: 'Lease renovado.' });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'release_task',
  'Libera el lease de una tarea del agente y aplica outcome operativo seguro.',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA,
    agent_id: z.string(),
    claim_token: z.string(),
    outcome: z.enum(['completed', 'paused', 'abandoned', 'failed']),
  },
  async ({ task_id, agent_id, claim_token, outcome }) => {
    try {
      const nowMs = Date.now();
      const timestamp = new Date(nowMs).toISOString();

      if (DB_DRIVER !== 'supabase') {
        const db = localDb.getDb();
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
        if (!task) return err(`Tarea ${task_id} no encontrada.`);
        if (
          task.assigned_to !== agent_id ||
          task.claim_token !== claim_token ||
          task.status !== 'in_progress'
        ) {
          return err('Lease inválido o ownership inconsistente para liberar la tarea.');
        }
        const releaseFields = buildReleaseFields(outcome, nowMs);
        db.prepare(
          `UPDATE tasks
           SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
               claim_token = NULL, completed_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(releaseFields.status, releaseFields.completed_at, releaseFields.updated_at, task_id);

        const remaining = db
          .prepare("SELECT * FROM tasks WHERE assigned_to = ? AND status = 'in_progress'")
          .all(agent_id)
          .filter((entry) => isActiveLease(entry, nowMs))[0];
        db.prepare(
          'UPDATE agent_registry SET current_task_id = ?, status = ?, last_heartbeat = ?, updated_at = ? WHERE agent_id = ?'
        ).run(
          remaining?.id || null,
          remaining ? 'working' : 'idle',
          timestamp,
          timestamp,
          agent_id
        );

        const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
        return ok({ released: true, task: updated, message: 'Tarea liberada.' });
      }

      await cleanupExpiredLeases(null, agent_id, nowMs);
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();
      if (taskError) return err(taskError.message);
      if (!task) return err(`Tarea ${task_id} no encontrada.`);
      if (
        task.assigned_to !== agent_id ||
        task.claim_token !== claim_token ||
        task.status !== 'in_progress'
      ) {
        return err('Lease inválido o ownership inconsistente para liberar la tarea.');
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(buildReleaseFields(outcome, nowMs))
        .eq('id', task_id)
        .eq('assigned_to', agent_id)
        .eq('claim_token', claim_token)
        .eq('status', 'in_progress')
        .select()
        .single();
      if (error) return err(error.message);
      if (!data) return err('Lease inválido o ownership inconsistente para liberar la tarea.');

      const activeTask = await getAgentActiveTask(task.project_id, agent_id, nowMs);
      await syncAgentRegistryState(agent_id, {
        currentTaskId: activeTask?.id || null,
        status: activeTask ? 'working' : 'idle',
        lastHeartbeat: timestamp,
      });

      return ok({ released: true, task: data, message: 'Tarea liberada.' });
    } catch (e) {
      return err(e.message);
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// HITOS (MILESTONES)
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  'list_milestones',
  'Lista los hitos del roadmap de un proyecto.',
  {
    project_id: z.string().uuid(),
    status: z.enum(['planned', 'in_progress', 'completed', 'at_risk', 'all']).optional(),
  },
  async ({ project_id, status }) => {
    let query = supabase
      .from('milestones')
      .select('*')
      .eq('project_id', project_id)
      .order('due_date', { ascending: true });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, milestones: data });
  }
);

server.tool(
  'create_milestone',
  'Crea un nuevo hito en el roadmap de un proyecto.',
  {
    project_id: z.string().uuid(),
    user_id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    status: z
      .enum(['planned', 'in_progress', 'completed', 'at_risk'])
      .optional()
      .default('planned'),
    due_date: z.string().optional().describe('Fecha ISO YYYY-MM-DD'),
  },
  async ({ project_id, user_id, title, description, status, due_date }) => {
    const { data, error } = await supabase
      .from('milestones')
      .insert({
        project_id,
        user_id,
        title,
        description: description || null,
        status,
        due_date: due_date || null,
      })
      .select()
      .single();
    if (error) return err(error.message);
    return ok({ created: true, milestone: data });
  }
);

server.tool(
  'bulk_create_milestones',
  'Crea múltiples hitos de roadmap de forma idempotente: si ya existe un hito con el mismo título en el proyecto, lo omite.',
  {
    project_id: z.string().uuid(),
    user_id: z.string().uuid(),
    milestones: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          status: z.enum(['planned', 'in_progress', 'completed', 'at_risk']).optional(),
          due_date: z.string().optional(),
        })
      )
      .min(1)
      .max(50),
  },
  async ({ project_id, user_id, milestones }) => {
    const { data: existing, error: existingErr } = await supabase
      .from('milestones')
      .select('id, title')
      .eq('project_id', project_id);
    if (existingErr) return err(existingErr.message);

    const existingTitles = new Set((existing || []).map((m) => m.title.trim().toLowerCase()));
    const seenTitles = new Set();
    const skipped = [];
    const payload = [];

    for (const milestone of milestones) {
      const key = milestone.title.trim().toLowerCase();
      if (existingTitles.has(key) || seenTitles.has(key)) {
        skipped.push({ title: milestone.title, reason: 'duplicate-title' });
        continue;
      }
      seenTitles.add(key);
      payload.push({
        project_id,
        user_id,
        title: milestone.title,
        description: milestone.description || null,
        status: milestone.status || 'planned',
        due_date: milestone.due_date || null,
      });
    }

    if (payload.length === 0) {
      return ok({ created_count: 0, skipped_count: skipped.length, milestones: [], skipped });
    }

    const { data, error } = await supabase.from('milestones').insert(payload).select();
    if (error) return err(error.message);
    return ok({
      created_count: data.length,
      skipped_count: skipped.length,
      milestones: data,
      skipped,
    });
  }
);

server.tool(
  'update_milestone',
  'Actualiza el estado o los campos de un hito del roadmap.',
  {
    milestone_id: UUID_OR_LEGACY_ID_SCHEMA,
    assigned_to: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe('UUID del usuario o agente asignado'),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['planned', 'in_progress', 'completed', 'at_risk']).optional(),
    due_date: z.string().nullable().optional(),
  },
  async ({ milestone_id, ...updates }) => {
    const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase
      .from('milestones')
      .update(fields)
      .eq('id', milestone_id)
      .select()
      .single();
    if (error) return err(error.message);
    if (!data) return err(`Hito ${milestone_id} no encontrado.`);
    return ok({ updated: true, milestone: data });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN GLOBAL
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  'get_dashboard',
  'Obtiene un resumen global del estado de todos los proyectos: contadores de tareas, progreso y próximos hitos.',
  {},
  async () => {
    const [{ data: projects }, { data: tasks }, { data: milestones }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, status, progress, color')
        .order('created_at', { ascending: false }),
      supabase.from('tasks').select('project_id, status, priority, due_date'),
      supabase
        .from('milestones')
        .select('project_id, title, status, due_date')
        .order('due_date', { ascending: true }),
    ]);

    const today = new Date();
    const dashboard = (projects || []).map((p) => {
      const ptasks = tasks?.filter((t) => t.project_id === p.id) || [];
      const pms = milestones?.filter((m) => m.project_id === p.id) || [];
      return {
        ...p,
        tasks: {
          total: ptasks.length,
          completed: ptasks.filter((t) => t.status === 'completed').length,
          in_progress: ptasks.filter((t) => t.status === 'in_progress').length,
          blocked: ptasks.filter((t) => t.status === 'blocked').length,
          overdue: ptasks.filter(
            (t) => t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
          ).length,
        },
        next_milestone: pms.find((m) => m.status !== 'completed') || null,
      };
    });

    return ok({
      total_projects: projects?.length || 0,
      active_projects: projects?.filter((p) => p.status === 'active').length || 0,
      dashboard,
    });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// PLANNING IA — Contexto y estado de planificación
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  'get_project_context',
  'Lee el contexto completo de planificación de un proyecto: planning_prompt y todos los archivos subidos por el usuario. Usar ANTES de generar un plan exhaustivo.',
  { project_id: z.string().uuid().describe('UUID del proyecto a planificar') },
  async ({ project_id }) => {
    const [projRes, filesRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, description, planning_prompt, planning_status, created_at')
        .eq('id', project_id)
        .single(),
      supabase
        .from('project_files')
        .select('id, file_name, file_type, content, size_chars, created_at')
        .eq('project_id', project_id)
        .order('created_at', { ascending: true }),
    ]);
    if (projRes.error) return err(projRes.error.message);
    const files = filesRes.data || [];
    const totalChars = files.reduce((acc, f) => acc + (f.size_chars || f.content?.length || 0), 0);
    return ok({
      project: {
        id: projRes.data.id,
        name: projRes.data.name,
        description: projRes.data.description,
        planning_prompt: projRes.data.planning_prompt,
        planning_status: projRes.data.planning_status,
        created_at: projRes.data.created_at,
      },
      files: files.map((f) => ({
        id: f.id,
        file_name: f.file_name,
        file_type: f.file_type,
        size_chars: f.size_chars || f.content?.length || 0,
        content: f.content,
      })),
      summary: {
        total_files: files.length,
        total_chars: totalChars,
        has_planning_prompt: !!projRes.data.planning_prompt,
        planning_status: projRes.data.planning_status,
      },
    });
  }
);

// ─── Swarm v2 Tools ────────────────────────────────────────────────────────

server.tool(
  'register_agent',
  'Registra un agente Worker en el swarm o actualiza su estado. Debe llamarse al iniciar o reanudar el agente.',
  {
    agent_id: z.string().describe('Identificador único del agente, ej. worker-claude-1'),
    project_id: z.string().uuid().describe('UUID del proyecto al que se asigna'),
    nombre: z.string().describe('Nombre descriptivo del agente'),
    modelo_llm: z.string().optional().describe('Modelo LLM a utilizar'),
  },
  async ({ agent_id, project_id, nombre, modelo_llm }) => {
    try {
      await cleanupExpiredLeases(project_id, agent_id);
    } catch (e) {
      return err(e.message);
    }
    const { data, error } = await supabase
      .from('agent_registry')
      .upsert(
        {
          agent_id,
          project_id,
          nombre,
          modelo_llm,
          status: 'idle',
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: 'agent_id' }
      )
      .select()
      .single();
    if (error) return err(error.message);
    return ok({ success: true, agent: data });
  }
);

server.tool(
  'heartbeat_agent',
  'Renueva la señal de vida del agente. Si no se llama cada 1 minuto, el job de limpieza lo marcará como error.',
  {
    agent_id: z.string().describe('ID del agente registrado'),
  },
  async ({ agent_id }) => {
    try {
      await cleanupExpiredLeases(null, agent_id);
    } catch (e) {
      return err(e.message);
    }
    const timestamp = new Date().toISOString();
    const activeTask =
      DB_DRIVER === 'supabase'
        ? await getAgentActiveTask(null, agent_id, Date.now()).catch(() => null)
        : null;
    const updatePayload = { last_heartbeat: timestamp };
    if (activeTask) {
      updatePayload.status = 'working';
      updatePayload.current_task_id = activeTask.id;
    }
    const { data, error } = await supabase
      .from('agent_registry')
      .update(updatePayload)
      .eq('agent_id', agent_id)
      .select()
      .single();
    if (error) return err(error.message);
    if (!data) return err(`Agente ${agent_id} no encontrado en registry.`);
    return ok({ success: true, agent: data });
  }
);

server.tool(
  'unregister_agent',
  'Elimina un agente del registry, liberando su tarea actual si la tuviera.',
  {
    agent_id: z.string().describe('ID del agente a desvincular'),
  },
  async ({ agent_id }) => {
    try {
      if (DB_DRIVER === 'supabase') {
        await cleanupExpiredLeases(null, agent_id);
        const { data: activeTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', agent_id)
          .eq('status', 'in_progress');
        if (tasksError) return err(tasksError.message);
        for (const task of activeTasks || []) {
          if (task.claim_token) {
            const releaseResult = await (async () => {
              const { data, error } = await supabase
                .from('tasks')
                .update(buildReleaseFields('abandoned'))
                .eq('id', task.id)
                .eq('assigned_to', agent_id)
                .eq('claim_token', task.claim_token)
                .eq('status', 'in_progress')
                .select()
                .single();
              return { data, error };
            })();
            if (releaseResult.error) return err(releaseResult.error.message);
          }
        }
      } else {
        const db = localDb.getDb();
        const timestamp = nowIso();
        db.prepare(
          `UPDATE tasks
           SET status = 'pending', assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
               claim_token = NULL, completed_at = NULL, updated_at = ?
           WHERE assigned_to = ? AND status = 'in_progress'`
        ).run(timestamp, agent_id);
      }
    } catch (e) {
      return err(e.message);
    }
    const { error } = await supabase.from('agent_registry').delete().eq('agent_id', agent_id);
    if (error) return err(error.message);
    return ok({ success: true, message: `Agente ${agent_id} eliminado de registry.` });
  }
);

server.tool(
  'update_agent_status',
  'Actualiza el estado del agente (visible en el Kanban de DevHub).',
  {
    agent_id: z.string().describe('Tu identificador único de agente asignado'),
    status: z.enum([
      'working',
      'running',
      'active',
      'thinking',
      'asking_questions',
      'completed',
      'failed',
      'idle',
      'error',
    ]),
    task_description: z.string().optional().describe('Qué estás haciendo ahora mismo (corto)'),
  },
  async ({ agent_id, status, task_description }) => {
    const statusMap = {
      working: 'working',
      running: 'working',
      active: 'working',
      thinking: 'working',
      asking_questions: 'working',
      completed: 'idle',
      idle: 'idle',
      failed: 'error',
      error: 'error',
    };

    const updateData = {
      status: statusMap[status] || 'working',
      last_heartbeat: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('agent_registry')
      .update(updateData)
      .eq('agent_id', agent_id)
      .select()
      .single();

    if (error) return err(error.message);
    if (!data) return err(`Agente ${agent_id} no encontrado en registry.`);
    return ok({ success: true, message: 'Estado actualizado en la UI', agent: data });
  }
);

// ─── Start server ──────────────────────────────────────────────────────────

// Node can exit immediately in stdio test harnesses before the first client
// message arrives because `process.stdin` alone is not always a ref'ed handle.
// Keep the event loop alive while stdin is open; release it on EOF/termination.
const keepAlive = setInterval(() => {}, 2_147_483_647);
const stopKeepAlive = () => clearInterval(keepAlive);
process.stdin.on('end', () => setTimeout(stopKeepAlive, 250));
process.on('SIGTERM', () => {
  stopKeepAlive();
  process.exit(0);
});
process.on('SIGINT', () => {
  stopKeepAlive();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('✅ DevHub MCP Server iniciado (stdio)\n');

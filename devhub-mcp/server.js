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
import { appendFileSync } from 'fs';

// Cargar .env.local desde la raíz del proyecto
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const require = createRequire(import.meta.url);
const localDb = require('../src/lib/db/localDb.js');
const {
  parseGitCheckpointComment,
  validateCheckpointHandoff,
} = require('../src/lib/gitCheckpointHandoff.js');
const { evaluateSupervisorSnapshot } = require('../src/lib/swarm/supervisorLoop.js');
const { createTeamTell } = require('../src/lib/swarm/teamTell.js');
const { createOpencodeTargetResolver } = require('../src/lib/swarm/opencodeTargetResolver.js');
const { createOpencodeDeliveryAdapter } = require('../src/lib/swarm/opencodeDeliveryAdapter.js');
const {
  AGENT_RUN_STATUSES,
  TERMINAL_AGENT_RUN_STATUSES,
  AGENT_ARTIFACT_PHASES,
  AGENT_ARTIFACT_PRODUCERS,
  AGENT_ARTIFACT_KINDS,
  isAgentRunStatus,
  isTerminalAgentRunStatus,
  normalizeEvidenceRef,
  parseEvidenceRef,
  validateAgentArtifactInput,
} = require('../src/lib/db/agentRunArtifacts.js');

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

function parseRecordTimeMs(
  record,
  keys = ['updated_at', 'created_at', 'requested_at', 'started_at']
) {
  for (const key of keys) {
    const ms = parseIsoMs(record?.[key]);
    if (ms !== null) return ms;
  }
  return Number.NEGATIVE_INFINITY;
}

function pickLatestRecord(...records) {
  return (
    records
      .filter(Boolean)
      .sort((left, right) => parseRecordTimeMs(right) - parseRecordTimeMs(left))[0] || null
  );
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

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      task_id TEXT,
      agent_id TEXT NOT NULL,
      requested_base_ref TEXT NOT NULL,
      baseline_commit TEXT NOT NULL,
      observed_start_branch TEXT,
      observed_start_head TEXT,
      observed_start_dirty TEXT,
      observed_start_path TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      predecessor_run_id TEXT,
      recovery_group_id TEXT,
      terminal_reason_class TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      phase TEXT NOT NULL,
      kind TEXT NOT NULL,
      producer TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      evidence_kind TEXT,
      evidence_locator TEXT,
      evidence_version TEXT,
      parent_artifact_id TEXT,
      supersedes_artifact_id TEXT,
      content_digest TEXT,
      locator_version TEXT,
      observed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(run_id, seq)
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
    CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace ON agent_runs(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_seq ON agent_artifacts(run_id, seq ASC);
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

async function listTaskComments(taskId) {
  if (!taskId) return [];
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return db
      .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(taskId);
  }

  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function getLatestGitCheckpointComment(taskId) {
  const comments = await listTaskComments(taskId);
  for (const comment of comments) {
    const checkpoint = parseGitCheckpointComment(comment.content);
    if (checkpoint) {
      return { comment, checkpoint };
    }
  }
  return { comment: null, checkpoint: null };
}

async function enforceTaskCheckpointGate(
  task,
  { handoffKind = 'completed', minCreatedAt = null } = {}
) {
  const { comment, checkpoint } = await getLatestGitCheckpointComment(task?.id);
  return validateCheckpointHandoff({
    task,
    checkpoint,
    latestComment: comment,
    handoffKind,
    minCreatedAt,
  });
}

const TELEGRAM_ADAPTER_ACTIONS = [
  'status.query',
  'task.detail',
  'workspace.detail',
  'approval.respond',
  'notification.retry',
  'subscription.set',
];
const TELEGRAM_FORBIDDEN_SURFACE_PATTERN =
  /\b(git|checkout|merge|worktree|filesystem|queue|lease)\b/i;
const TEAM_TELL_ACTIVE_PARTICIPANT_STATUSES = new Set(['invited', 'active', 'paused']);

function ensureTelegramAdapterActionAllowed(action, requestedVerb = '') {
  if (!TELEGRAM_ADAPTER_ACTIONS.includes(action)) {
    throw new Error(`Telegram adapter action out of scope: ${action}`);
  }
  if (requestedVerb && TELEGRAM_FORBIDDEN_SURFACE_PATTERN.test(requestedVerb)) {
    throw new Error(`Telegram adapter action out of scope: ${requestedVerb}`);
  }
}

function getTeamTellTransportOverride() {
  if (process.env.DEVHUB_MCP_TEAM_TELL_FAKE_TRANSPORT !== '1') return null;
  const transportLogPath = process.env.DEVHUB_MCP_TEAM_TELL_TRANSPORT_LOG_PATH || null;

  return async (_sessionId, opencodeSessionId) => {
    if (transportLogPath) {
      appendFileSync(transportLogPath, `${String(opencodeSessionId)}\n`, 'utf8');
    }

    if (String(opencodeSessionId).includes('stale')) {
      throw new Error(
        `Failed to send message to OpenCode session ${opencodeSessionId}: 404 session missing`
      );
    }

    return {
      delivery_ref: `delivery-ref:${opencodeSessionId}`,
      evidence_ref: `evidence-ref:${opencodeSessionId}`,
    };
  };
}

function validateTeamTellMembership(db, { mission_id, sender_agent_id, recipients }) {
  const mission = localDb.getSwarmMissionById(db, mission_id);
  if (!mission) {
    throw new Error(`Misión ${mission_id} no encontrada.`);
  }

  const participants = localDb
    .listMissionParticipants(db, mission_id)
    .filter((participant) => TEAM_TELL_ACTIVE_PARTICIPANT_STATUSES.has(participant.status));
  const participantIds = new Set(participants.map((participant) => participant.agent_id));

  if (!participantIds.has(sender_agent_id)) {
    throw new Error(`sender_agent_id no pertenece a la misión ${mission_id}.`);
  }

  const invalidRecipient = (recipients || []).find((recipient) => !participantIds.has(recipient));
  if (invalidRecipient) {
    throw new Error(
      `recipient_agent_id no pertenece a la misión ${mission_id}: ${invalidRecipient}`
    );
  }

  return mission;
}

function toCompactTeamTellResult(result) {
  return {
    accepted: true,
    message: {
      message_id: result.message.message_id,
      mission_id: result.message.mission_id,
      message_kind: result.message.message_kind,
      created_at: result.message.created_at,
    },
    outcomes: result.outcomes.map((outcome) => ({
      recipient_agent_id: outcome.recipient_agent_id,
      status: outcome.status,
      reason: outcome.reason,
      delivery_id: outcome.delivery_id,
      delivery_ref: outcome.delivery_ref || null,
      evidence_ref: outcome.evidence_ref || null,
    })),
  };
}

async function getTelegramChannelSnapshot(filters = {}) {
  if (DB_DRIVER !== 'supabase') {
    return localDb.getLatestTelegramChannelSnapshot(filters);
  }

  const taskId = filters.task_id || null;
  const snapshot = taskId ? await getSupervisorSnapshot(taskId) : null;
  const workspace = snapshot?.workspace_id
    ? await getAgentWorkspaceById(snapshot.workspace_id)
    : null;
  const run = snapshot?.run_id ? await getAgentRunById(snapshot.run_id) : null;
  const latestArtifact = run?.run_id ? await getLatestAgentArtifactForRun(run.run_id) : null;
  const approval = snapshot?.approval_checkpoint_key
    ? await getSupervisorApprovalCheckpoint(snapshot.approval_checkpoint_key)
    : null;

  return {
    task_id: snapshot?.task_id || null,
    supervisor_state: snapshot?.supervisor_state || null,
    outcome: snapshot?.outcome || null,
    reason_class: snapshot?.reason_class || null,
    workspace_id: snapshot?.workspace_id || workspace?.id || null,
    run_id: snapshot?.run_id || run?.run_id || null,
    evidence_ref:
      snapshot?.evidence_ref || latestArtifact?.evidence_ref || workspace?.evidence_ref || null,
    workspace_status: workspace?.status || null,
    run_status: run?.status || null,
    terminal_reason_class: run?.terminal_reason_class || null,
    latest_artifact_kind: latestArtifact?.kind || null,
    latest_artifact_evidence_ref: latestArtifact?.evidence_ref || null,
    artifact_count: latestArtifact ? 1 : 0,
    approval: approval
      ? {
          id: approval.checkpoint_key,
          status: approval.status,
          expires_at: approval.expires_at || null,
        }
      : null,
    delivery: null,
    degraded: false,
  };
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
const AGENT_WORKSPACE_STATUSES = [
  'planned',
  'provisioning',
  'ready',
  'active',
  'paused',
  'conflicted',
  'cleanup_pending',
  'completed',
  'failed',
  'orphaned',
];
const AGENT_WORKSPACE_TERMINAL = new Set(['completed', 'failed']);
const AGENT_WORKSPACE_LOCKED = new Set([
  'planned',
  'provisioning',
  'ready',
  'active',
  'paused',
  'cleanup_pending',
  'orphaned',
]);
const AGENT_WORKSPACE_OBSERVED_DIRTY = new Set(['clean', 'dirty', 'dirty-excluded']);
const AGENT_WORKSPACE_BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';
const SW_2_1_FROZEN_CHECKPOINT = '02d82361449a09e93e5880a08e35e3043617002d';
const SW_3_1_FROZEN_CHECKPOINT = '4b1e344dcd202c911498af17236fcb86a2a2cb1e';
const PREPARE_WORKSPACE_ERROR_CLASS_TO_STATUS = {
  base_drift: 'conflicted',
  ownership_collision: 'conflicted',
  executor_lost: 'orphaned',
  prepare_failed: 'failed',
};
const SUPERVISOR_STATES = [
  'idle',
  'dispatch_pending',
  'lease_active',
  'awaiting_evidence',
  'retry_pending',
  'blocked',
  'awaiting_approval',
  'recovering_orphan',
  'closed',
];
const SUPERVISOR_OUTCOMES = [
  'wait',
  'dispatch',
  'retry',
  'block',
  'recover_orphan',
  'request_approval',
  'close',
];
const SUPERVISOR_REASON_CLASSES = [
  'blocked',
  'approval_required',
  'approval_rejected',
  'stale_lease',
  'orphaned_workspace',
  'orphaned_run',
  'dirty_excluded_observed',
  'recoverable_failure',
  'blocked_dependency',
  'unchanged_failure',
  'completed',
];
const SUPERVISOR_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

function isAgentWorkspaceStatus(value) {
  return AGENT_WORKSPACE_STATUSES.includes(value);
}

function isAgentWorkspaceReadyState(value) {
  return value === 'ready' || value === 'active';
}

function isAgentWorkspaceLocked(value) {
  return AGENT_WORKSPACE_LOCKED.has(value);
}

function normalizeWorkspaceRecord(row) {
  if (!row) return null;
  return {
    ...row,
    workspace_id: row.workspace_id || row.id,
  };
}

function normalizeAgentRunRecord(row) {
  return row || null;
}

function normalizeAgentArtifactRecord(row) {
  return row || null;
}

function buildPrepareWorkspaceId(taskId, agentId) {
  return `workspace-${taskId}-${agentId}`;
}

function validatePrepareWorkspaceIdentity({ workspace_id, task_id, agent_id, correlation_id }) {
  const hasWorkspaceId = Boolean(workspace_id);
  const hasTaskIdentity = Boolean(task_id || agent_id);
  const hasCompleteTaskIdentity = Boolean(task_id && agent_id);

  if (!correlation_id) {
    throw new Error('correlation_id es requerido.');
  }

  if (!hasWorkspaceId && hasTaskIdentity && !hasCompleteTaskIdentity) {
    throw new Error('task_id y agent_id deben enviarse juntos.');
  }

  if (!hasWorkspaceId && !hasCompleteTaskIdentity) {
    throw new Error('Se requiere exactamente una identidad: workspace_id o task_id + agent_id.');
  }

  if (hasWorkspaceId && hasTaskIdentity) {
    throw new Error('workspace_id no puede combinarse con task_id o agent_id.');
  }
}

function buildPrepareAgentWorkspaceAck(workspace) {
  return {
    workspace_id: workspace.id,
    task_id: workspace.current_task_id,
    agent_id: workspace.agent_id,
    requested_base_ref: workspace.base_commit,
    reservation_token: workspace.reservation_token,
    correlation_id: workspace.correlation_id,
    status: workspace.status,
    accepted_at: workspace.accepted_at || workspace.updated_at || workspace.created_at || null,
  };
}

async function resolveWorkspaceProjectId(taskId) {
  if (!taskId) return 'control-plane-pending';

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1').get(taskId);
    return task?.project_id || 'control-plane-pending';
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data?.project_id || 'control-plane-pending';
}

async function prepareAgentWorkspaceLease(input = {}) {
  validatePrepareWorkspaceIdentity(input);

  const timestamp = nowIso();
  const requestedBaseRef = input.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT;
  let workspace = null;
  let workspaceId = input.workspace_id || null;
  let taskId = input.task_id || null;
  let agentId = input.agent_id || null;

  if (workspaceId) {
    workspace = await getAgentWorkspaceById(workspaceId);
    if (!workspace) throw new Error(`Workspace ${workspaceId} no encontrado.`);
    taskId = workspace.current_task_id;
    agentId = workspace.agent_id;
  } else {
    workspaceId = buildPrepareWorkspaceId(taskId, agentId);
    if (DB_DRIVER !== 'supabase') {
      const db = localDb.getDb();
      workspace = normalizeWorkspaceRecord(
        db
          .prepare(
            'SELECT * FROM agent_workspaces WHERE current_task_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1'
          )
          .get(taskId, agentId)
      );
    } else {
      const { data, error } = await supabase
        .from('agent_workspaces')
        .select('*')
        .eq('current_task_id', taskId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      workspace = normalizeWorkspaceRecord(data || null);
    }
  }

  if (workspace && workspace.correlation_id === input.correlation_id) {
    return {
      created: false,
      reused: true,
      workspace,
      ack: buildPrepareAgentWorkspaceAck(workspace),
    };
  }

  const reservationToken =
    input.reservation_token || workspace?.reservation_token || `rsv-${randomUUID()}`;
  const projectId = workspace?.project_id || (await resolveWorkspaceProjectId(taskId));
  const workspacePath =
    workspace?.workspace_path || input.workspace_path || `workspace://${projectId}/${workspaceId}`;

  if (!workspace) {
    const payload = validateAgentWorkspacePayload({
      id: workspaceId,
      project_id: projectId,
      agent_id: agentId,
      current_task_id: taskId,
      run_id_or_session_id: null,
      repo_root: process.cwd(),
      workspace_path: workspacePath,
      worktree_path: null,
      base_branch: 'main',
      base_commit: requestedBaseRef,
      branch_name: null,
      status: 'provisioning',
      observed_branch: null,
      observed_head: null,
      observed_dirty: null,
      last_error: null,
      recovery_reason: null,
      evidence_ref: null,
      reservation_token: reservationToken,
      correlation_id: input.correlation_id,
      accepted_at: timestamp,
      claimed_at: null,
      started_at: null,
      completed_at: null,
    });

    const created = await insertAgentWorkspace({
      ...payload,
      last_error_class: null,
      updated_at: timestamp,
    });

    return {
      created: true,
      reused: false,
      workspace: created,
      ack: buildPrepareAgentWorkspaceAck(created),
    };
  }

  const updates = {
    base_commit: requestedBaseRef,
    status: AGENT_WORKSPACE_TERMINAL.has(workspace.status) ? workspace.status : 'provisioning',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    reservation_token: reservationToken,
    correlation_id: input.correlation_id,
    accepted_at: timestamp,
    updated_at: timestamp,
  };
  const updated = await updateAgentWorkspaceRow(workspace.id, updates);
  return {
    created: false,
    reused: false,
    workspace: updated,
    ack: buildPrepareAgentWorkspaceAck(updated),
  };
}

function workspaceStatusPlaceholder(statuses = []) {
  return statuses.map(() => '?').join(', ');
}

async function listAgentWorkspaces({ projectId = null, status = null } = {}) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const clauses = [];
    const params = [];
    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (status && status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM agent_workspaces ${whereSql} ORDER BY created_at ASC, id ASC`)
      .all(...params);
    return rows.map(normalizeWorkspaceRecord);
  }

  let query = supabase
    .from('agent_workspaces')
    .select('*')
    .order('created_at', { ascending: true });
  if (projectId) query = query.eq('project_id', projectId);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeWorkspaceRecord);
}

async function getAgentWorkspaceById(workspaceId) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return normalizeWorkspaceRecord(
      db.prepare('SELECT * FROM agent_workspaces WHERE id = ?').get(workspaceId)
    );
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeWorkspaceRecord(data || null);
}

async function insertAgentWorkspace(row) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const keys = Object.keys(row);
    const values = keys.map((key) => row[key] ?? null);
    db.prepare(
      `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...values);
    return getAgentWorkspaceById(row.id);
  }

  const { data, error } = await supabase.from('agent_workspaces').insert(row).select().single();
  if (error) throw new Error(error.message);
  return normalizeWorkspaceRecord(data);
}

async function updateAgentWorkspaceRow(workspaceId, updates) {
  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) return getAgentWorkspaceById(workspaceId);
    db.prepare(
      `UPDATE agent_workspaces SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`
    ).run(...keys.map((key) => updates[key] ?? null), workspaceId);
    return getAgentWorkspaceById(workspaceId);
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizeWorkspaceRecord(data);
}

async function getAgentRunById(runId) {
  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.getAgentRunById(runId));
  }

  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeAgentRunRecord(data || null);
}

async function listAgentRuns({
  workspaceId = null,
  taskId = null,
  agentId = null,
  limit = null,
} = {}) {
  if (DB_DRIVER !== 'supabase') {
    return localDb.listAgentRuns({
      workspace_id: workspaceId,
      task_id: taskId,
      agent_id: agentId,
      limit,
    });
  }

  let query = supabase.from('agent_runs').select('*').order('created_at', { ascending: false });
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  if (taskId) query = query.eq('task_id', taskId);
  if (agentId) query = query.eq('agent_id', agentId);
  if (Number.isInteger(limit)) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeAgentRunRecord);
}

async function getLatestAgentRunForWorkspace(workspaceId) {
  const runs = await listAgentRuns({ workspaceId, limit: 1 });
  return runs[0] || null;
}

async function getLatestAgentRunForTask(taskId) {
  const runs = await listAgentRuns({ taskId, limit: 1 });
  return runs[0] || null;
}

async function getLatestAgentWorkspaceForTask(taskId) {
  if (!taskId) return null;

  if (DB_DRIVER !== 'supabase') {
    const db = localDb.getDb();
    return normalizeWorkspaceRecord(
      db
        .prepare(
          'SELECT * FROM agent_workspaces WHERE current_task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
        )
        .get(taskId)
    );
  }

  const { data, error } = await supabase
    .from('agent_workspaces')
    .select('*')
    .eq('current_task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return normalizeWorkspaceRecord(data || null);
}

async function getRunFactsForTask(taskId) {
  const runs = await listAgentRuns({ taskId });
  if (!runs.length) return [];

  const facts = await Promise.all(
    runs.map(async (run) => {
      const latestArtifact = await getLatestAgentArtifactForRun(run.run_id);
      return {
        run_id: run.run_id,
        workspace_id: run.workspace_id,
        status: run.status,
        terminal_reason_class: run.terminal_reason_class || null,
        evidence_ref: latestArtifact?.evidence_ref || null,
      };
    })
  );

  return facts;
}

async function createAgentRunRow(input = {}) {
  if (!isAgentRunStatus(input.status || 'planned')) {
    throw new Error(`Agent run status inválido: ${input.status}`);
  }

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.createAgentRun(input));
  }

  const timestamp = input.started_at || nowIso();
  const payload = {
    run_id: input.run_id || randomUUID(),
    workspace_id: input.workspace_id,
    task_id: input.task_id || null,
    agent_id: input.agent_id,
    requested_base_ref: input.requested_base_ref,
    baseline_commit: input.baseline_commit,
    observed_start_branch: input.observed_start?.branch || null,
    observed_start_head: input.observed_start?.head || null,
    observed_start_dirty: input.observed_start?.dirty || null,
    observed_start_path: input.observed_start?.path || null,
    status: input.status || 'planned',
    predecessor_run_id: input.predecessor_run_id || null,
    recovery_group_id: input.recovery_group_id || null,
    terminal_reason_class: input.terminal_reason_class || null,
    started_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await supabase.from('agent_runs').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return normalizeAgentRunRecord(data);
}

async function updateAgentRunTerminalRow(runId, updates = {}) {
  const status = updates.status;
  if (!isTerminalAgentRunStatus(status)) {
    throw new Error(`Estado terminal inválido para agent_run: ${status}`);
  }

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentRunRecord(localDb.updateAgentRunTerminal(runId, updates));
  }

  const payload = {
    status,
    terminal_reason_class: updates.terminal_reason_class || null,
    completed_at: updates.completed_at || nowIso(),
    updated_at: updates.updated_at || nowIso(),
  };

  const { data, error } = await supabase
    .from('agent_runs')
    .update(payload)
    .eq('run_id', runId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizeAgentRunRecord(data);
}

async function listAgentArtifacts(runId) {
  if (DB_DRIVER !== 'supabase') {
    return localDb.listAgentArtifacts(runId);
  }

  const { data, error } = await supabase
    .from('agent_artifacts')
    .select('*')
    .eq('run_id', runId)
    .order('seq', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeAgentArtifactRecord);
}

async function getLatestAgentArtifactForRun(runId) {
  const artifacts = await listAgentArtifacts(runId);
  return artifacts.at(-1) || null;
}

async function appendAgentArtifactRow(input = {}) {
  validateAgentArtifactInput(input);
  const evidenceRef = normalizeEvidenceRef(input.evidence_ref);
  const parsedEvidenceRef = parseEvidenceRef(evidenceRef);

  if (DB_DRIVER !== 'supabase') {
    return normalizeAgentArtifactRecord(
      localDb.appendAgentArtifact({
        ...input,
        evidence_ref: evidenceRef,
      })
    );
  }

  const artifacts = await listAgentArtifacts(input.run_id);
  const nextSeq = input.seq || (artifacts.at(-1)?.seq || 0) + 1;
  const payload = {
    artifact_id: input.artifact_id || randomUUID(),
    run_id: input.run_id,
    seq: nextSeq,
    phase: input.phase,
    kind: input.kind,
    producer: input.producer,
    summary: input.summary,
    evidence_ref: evidenceRef,
    evidence_kind: parsedEvidenceRef.kind,
    evidence_locator: parsedEvidenceRef.locator,
    evidence_version: parsedEvidenceRef.version,
    parent_artifact_id: input.parent_artifact_id || null,
    supersedes_artifact_id: input.supersedes_artifact_id || null,
    content_digest: input.content_digest || input.integrity?.content_digest || null,
    locator_version: input.locator_version || input.integrity?.locator_version || null,
    observed_at: input.observed_at || input.integrity?.observed_at || nowIso(),
  };

  const { data, error } = await supabase.from('agent_artifacts').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return normalizeAgentArtifactRecord(data);
}

async function getWorkspaceEvidence(workspaceId) {
  const workspace = await getAgentWorkspaceById(workspaceId);
  if (!workspace) return null;
  const latestRun = await getLatestAgentRunForWorkspace(workspaceId);
  const latestArtifact = latestRun ? await getLatestAgentArtifactForRun(latestRun.run_id) : null;
  return {
    workspace,
    latest_run: latestRun,
    latest_artifact: latestArtifact,
  };
}

async function getSupervisorSnapshot(taskId) {
  if (!taskId) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.getSupervisorSnapshot(taskId);
  }

  const { data, error } = await supabase
    .from('supervisor_snapshots')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function getSupervisorApprovalCheckpoint(checkpointKey) {
  if (!checkpointKey) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.getSupervisorApprovalCheckpoint(checkpointKey);
  }

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .select('*')
    .eq('checkpoint_key', checkpointKey)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function getLatestSupervisorApprovalCheckpointForTask(taskId) {
  if (!taskId) return null;
  if (DB_DRIVER !== 'supabase') {
    return localDb.listSupervisorApprovalCheckpoints({ task_id: taskId, limit: 1 })[0] || null;
  }

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .select('*')
    .eq('task_id', taskId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function upsertSupervisorSnapshotRow(input = {}) {
  if (DB_DRIVER !== 'supabase') {
    return localDb.upsertSupervisorSnapshot(input);
  }

  const existing = await getSupervisorSnapshot(input.task_id);
  const timestamp = input.updated_at || nowIso();
  const payload = {
    task_id: input.task_id,
    supervisor_state: input.supervisor_state,
    outcome: input.outcome || null,
    reason_class: input.reason_class || null,
    task_retry_count: Number(input.task_retry_count || 0),
    attempt_count: Number(input.attempt_count || 0),
    unchanged_failure_count: Number(input.unchanged_failure_count || 0),
    approval_request_count: Number(input.approval_request_count || 0),
    orphan_recovery_count: Number(input.orphan_recovery_count || 0),
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    evidence_ref: input.evidence_ref || null,
    approval_checkpoint_key: input.approval_checkpoint_key || null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await supabase
    .from('supervisor_snapshots')
    .upsert(payload, { onConflict: 'task_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertSupervisorApprovalCheckpointRow(input = {}) {
  if (DB_DRIVER !== 'supabase') {
    return localDb.upsertSupervisorApprovalCheckpoint(input);
  }

  const checkpointKey = input.checkpoint_key || localDb.buildSupervisorApprovalCheckpointKey(input);
  const existing = await getSupervisorApprovalCheckpoint(checkpointKey);
  const timestamp = input.updated_at || nowIso();
  const payload = {
    checkpoint_key: checkpointKey,
    task_id: input.task_id,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    reason_class: input.reason_class,
    evidence_ref: input.evidence_ref || null,
    status: input.status || 'pending',
    requested_at: existing?.requested_at || input.requested_at || timestamp,
    decided_at: input.decided_at ?? existing?.decided_at ?? null,
    decision_note: input.decision_note ?? existing?.decision_note ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await supabase
    .from('supervisor_approval_checkpoints')
    .upsert(payload, { onConflict: 'checkpoint_key' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function evaluateSupervisorForTask(task, { staleLeaseObserved = false } = {}) {
  if (!task?.id) return null;

  const existingSnapshot = await getSupervisorSnapshot(task.id);
  const latestWorkspaceForTask = await getLatestAgentWorkspaceForTask(task.id);
  const snapshotWorkspace = existingSnapshot?.workspace_id
    ? await getAgentWorkspaceById(existingSnapshot.workspace_id)
    : null;
  const workspace = pickLatestRecord(latestWorkspaceForTask, snapshotWorkspace);
  const latestRun = workspace?.id
    ? await getLatestAgentRunForWorkspace(workspace.id)
    : await getLatestAgentRunForTask(task.id);
  const latestArtifact = latestRun ? await getLatestAgentArtifactForRun(latestRun.run_id) : null;
  const runFacts = await getRunFactsForTask(task.id);
  const snapshotApprovalCheckpoint = existingSnapshot?.approval_checkpoint_key
    ? await getSupervisorApprovalCheckpoint(existingSnapshot.approval_checkpoint_key)
    : null;
  const latestApprovalCheckpoint = await getLatestSupervisorApprovalCheckpointForTask(task.id);
  const approvalCheckpoint = pickLatestRecord(latestApprovalCheckpoint, snapshotApprovalCheckpoint);

  const snapshotInput = evaluateSupervisorSnapshot({
    task,
    workspace,
    latestRun,
    latestArtifact,
    runFacts,
    existingSnapshot,
    approvalCheckpoint,
    staleLeaseObserved,
  });

  const snapshot = await upsertSupervisorSnapshotRow(snapshotInput);
  const hydratedApprovalCheckpoint = snapshot.approval_checkpoint_key
    ? await getSupervisorApprovalCheckpoint(snapshot.approval_checkpoint_key)
    : null;

  return {
    ...snapshot,
    approval_checkpoint: hydratedApprovalCheckpoint,
  };
}

async function attachSupervisorToTask(task, options = {}) {
  if (!task) return task;
  const supervisor = await evaluateSupervisorForTask(task, options);
  return {
    ...task,
    supervisor,
    supervisor_snapshot: supervisor,
  };
}

async function getAgentWorkspaceCollisions({
  projectId,
  workspaceId,
  branchName,
  worktreePath,
  agentId,
  currentTaskId,
}) {
  const workspaces = await listAgentWorkspaces({ projectId, status: 'all' });
  return workspaces.filter((workspace) => {
    if (workspace.id === workspaceId) return false;
    if (!isAgentWorkspaceLocked(workspace.status)) return false;
    if (branchName && workspace.branch_name === branchName) return true;
    if (worktreePath && workspace.worktree_path === worktreePath) return true;
    if (
      agentId &&
      currentTaskId &&
      workspace.agent_id === agentId &&
      workspace.current_task_id === currentTaskId
    ) {
      return true;
    }
    return false;
  });
}

function deriveWorkspaceCollisionReason(
  { branchName, worktreePath, agentId, currentTaskId },
  collisions = []
) {
  if (!collisions.length) return null;
  if (branchName && collisions.some((workspace) => workspace.branch_name === branchName)) {
    return 'branch_name';
  }
  if (worktreePath && collisions.some((workspace) => workspace.worktree_path === worktreePath)) {
    return 'worktree_path';
  }
  if (
    agentId &&
    currentTaskId &&
    collisions.some(
      (workspace) => workspace.agent_id === agentId && workspace.current_task_id === currentTaskId
    )
  ) {
    return 'agent_task_owner';
  }
  return 'reservation';
}

function validateAgentWorkspacePayload(payload, existingWorkspace = null) {
  const merged = { ...existingWorkspace, ...payload };
  const status = merged.status;

  if (!isAgentWorkspaceStatus(status)) {
    throw new Error(`Estado de workspace inválido: ${status}`);
  }
  if (!merged.id) throw new Error('workspace_id es requerido.');
  if (!merged.project_id) throw new Error('project_id es requerido.');
  if (!merged.agent_id) throw new Error('agent_id es requerido.');
  if (!merged.repo_root) throw new Error('repo_root es requerido.');
  if (!merged.workspace_path) throw new Error('workspace_path es requerido.');
  if (!merged.base_branch) throw new Error('base_branch es requerido.');
  if (!merged.base_commit) throw new Error('base_commit es requerido.');
  if (payload.observed_dirty && !AGENT_WORKSPACE_OBSERVED_DIRTY.has(payload.observed_dirty)) {
    throw new Error(`observed_dirty inválido: ${payload.observed_dirty}`);
  }
  if (isAgentWorkspaceReadyState(status)) {
    if (
      !merged.branch_name ||
      !merged.worktree_path ||
      !merged.observed_branch ||
      !merged.observed_head
    ) {
      throw new Error(
        'ready|active requieren branch_name, worktree_path, observed_branch y observed_head.'
      );
    }
  }
  if (status === 'orphaned' && !merged.recovery_reason) {
    throw new Error('orphaned requiere recovery_reason.');
  }

  return merged;
}

function deriveWorkspaceTransition(existingWorkspace, updates, { allowTerminal = true } = {}) {
  if (!existingWorkspace) throw new Error('Workspace no encontrado.');
  if (AGENT_WORKSPACE_TERMINAL.has(existingWorkspace.status)) {
    throw new Error('agent_workspaces_terminal_immutable');
  }

  const merged = validateAgentWorkspacePayload(
    {
      ...updates,
      id: existingWorkspace.id,
      project_id: existingWorkspace.project_id,
      agent_id: existingWorkspace.agent_id,
      repo_root: existingWorkspace.repo_root,
      workspace_path: existingWorkspace.workspace_path,
      base_branch: updates.base_branch ?? existingWorkspace.base_branch,
      base_commit: updates.base_commit ?? existingWorkspace.base_commit,
      status: updates.status || existingWorkspace.status,
    },
    existingWorkspace
  );

  if (!allowTerminal && AGENT_WORKSPACE_TERMINAL.has(merged.status)) {
    throw new Error('Esta operación no permite estados terminales.');
  }

  const next = {
    ...updates,
    updated_at: nowIso(),
  };

  if (merged.status === 'active' && !existingWorkspace.started_at) {
    next.started_at = existingWorkspace.started_at || nowIso();
  }
  if (AGENT_WORKSPACE_TERMINAL.has(merged.status)) {
    next.completed_at = updates.completed_at || nowIso();
  }

  return { merged, next };
}

function detectWorkspaceDrift(existingWorkspace, mergedWorkspace) {
  if (!existingWorkspace) return null;
  const mismatches = [];
  if (
    existingWorkspace.branch_name &&
    mergedWorkspace.observed_branch &&
    existingWorkspace.branch_name !== mergedWorkspace.observed_branch
  ) {
    mismatches.push(
      `reserved branch ${existingWorkspace.branch_name} != observed ${mergedWorkspace.observed_branch}`
    );
  }
  if (
    existingWorkspace.worktree_path &&
    mergedWorkspace.worktree_path &&
    existingWorkspace.worktree_path !== mergedWorkspace.worktree_path
  ) {
    mismatches.push(
      `reserved worktree ${existingWorkspace.worktree_path} != observed ${mergedWorkspace.worktree_path}`
    );
  }
  return mismatches.length ? `workspace drift: ${mismatches.join('; ')}` : null;
}

function derivePrepareWorkspaceOutcome(existingWorkspace, report = {}) {
  const { error_class: errorClass = null, ...restReport } = report;
  const status =
    PREPARE_WORKSPACE_ERROR_CLASS_TO_STATUS[errorClass] ||
    report.status ||
    existingWorkspace.status;

  return {
    ...restReport,
    status,
    branch_name:
      restReport.branch_name ?? existingWorkspace.branch_name ?? restReport.observed_branch ?? null,
    last_error_class: errorClass,
  };
}

function isPrepareWorkspaceReportNoOp(existingWorkspace, report = {}, nextStatus) {
  return Boolean(
    report.correlation_id &&
    existingWorkspace.correlation_id === report.correlation_id &&
    existingWorkspace.status === nextStatus &&
    (report.evidence_ref ?? existingWorkspace.evidence_ref ?? null) ===
      (existingWorkspace.evidence_ref ?? null) &&
    (report.last_error ?? existingWorkspace.last_error ?? null) ===
      (existingWorkspace.last_error ?? null) &&
    (report.last_error_class ?? existingWorkspace.last_error_class ?? null) ===
      (existingWorkspace.last_error_class ?? null) &&
    (report.recovery_reason ?? existingWorkspace.recovery_reason ?? null) ===
      (existingWorkspace.recovery_reason ?? null) &&
    (report.worktree_path ?? existingWorkspace.worktree_path ?? null) ===
      (existingWorkspace.worktree_path ?? null) &&
    (report.observed_branch ?? existingWorkspace.observed_branch ?? null) ===
      (existingWorkspace.observed_branch ?? null) &&
    (report.observed_head ?? existingWorkspace.observed_head ?? null) ===
      (existingWorkspace.observed_head ?? null) &&
    (report.observed_dirty ?? existingWorkspace.observed_dirty ?? null) ===
      (existingWorkspace.observed_dirty ?? null)
  );
}

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
        retry_count: task.retry_count ?? 0,
        due_date: task.due_date,
        milestone_id: task.milestone_id,
        assigned_to: task.assigned_to,
        business_value: task.business_value ?? 5,
        blocked,
        blocking_dependencies: blockingDeps.map((d) => d.depends_on),
        blocked_reason: blocked ? blockingDeps[0]?.depends_on || null : null,
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
  if (DB_DRIVER !== 'supabase') {
    const staleTasks = await cleanupExpiredLeases(projectId);
    const staleTaskIds = new Set((staleTasks || []).map((task) => task.id));
    const db = localDb.getDb();
    const tasks = db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
      )
      .all(projectId);
    const allTasks = db.prepare('SELECT id, status FROM tasks WHERE project_id = ?').all(projectId);
    const deps = db.prepare('SELECT * FROM task_dependencies').all();
    const queue = buildQueue(tasks || [], deps || [], allTasks || [], { includeBlocked }).slice(
      0,
      limit
    );
    return Promise.all(
      queue.map((task) =>
        attachSupervisorToTask(task, { staleLeaseObserved: staleTaskIds.has(task.id) })
      )
    );
  }

  const staleTasks = await cleanupExpiredLeases(projectId);
  const staleTaskIds = new Set((staleTasks || []).map((task) => task.id));
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
  const queue = buildQueue(tasks || [], deps || [], allTasks || [], { includeBlocked }).slice(
    0,
    limit
  );
  return Promise.all(
    queue.map((task) =>
      attachSupervisorToTask(task, { staleLeaseObserved: staleTaskIds.has(task.id) })
    )
  );
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
    let existingTask = null;
    if (status === 'completed') {
      const { data: currentTask, error: currentTaskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();
      if (currentTaskError) return err(currentTaskError.message);
      if (!currentTask) return err(`Tarea ${task_id} no encontrada.`);
      existingTask = currentTask;

      const checkpointGate = await enforceTaskCheckpointGate(existingTask, {
        handoffKind: 'completed',
      });
      if (!checkpointGate.ok)
        return err(`${checkpointGate.message} ${checkpointGate.remediation || ''}`.trim());
    }

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

    let checkpointGate = null;
    if (status === 'completed') {
      checkpointGate = await enforceTaskCheckpointGate(existingTask || data, {
        handoffKind: 'completed',
      });
    }

    return ok({
      updated: true,
      task: { ...data, ...(checkpointGate ? { checkpoint_gate: checkpointGate } : {}) },
    });
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

      return ok({
        task: await attachSupervisorToTask(claimed.task),
        message: 'Tarea asignada al agente.',
      });
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
        return ok(
          claimed.task ? { ...claimed, task: await attachSupervisorToTask(claimed.task) } : claimed
        );
      }

      const claimed = await claimNextTaskSupabase(project_id, agent_id);
      if (claimed?.error) return err(claimed.error);
      return ok(
        claimed.task ? { ...claimed, task: await attachSupervisorToTask(claimed.task) } : claimed
      );
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'request_supervisor_approval',
  'Crea o actualiza un approval checkpoint y snapshot supervisor keyed por task/workspace/run/evidence.',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA,
    workspace_id: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    reason_class: z.enum(SUPERVISOR_REASON_CLASSES),
    evidence_ref: z.string().min(1).optional(),
    supervisor_state: z.enum(SUPERVISOR_STATES).optional().default('awaiting_approval'),
    outcome: z.enum(SUPERVISOR_OUTCOMES).optional().default('request_approval'),
    task_retry_count: z.number().int().min(0).optional().default(0),
    attempt_count: z.number().int().min(0).optional().default(0),
    unchanged_failure_count: z.number().int().min(0).optional().default(0),
    approval_request_count: z.number().int().min(0).optional().default(1),
    orphan_recovery_count: z.number().int().min(0).optional().default(0),
    status: z.enum(SUPERVISOR_APPROVAL_STATUSES).optional().default('pending'),
    decision_note: z.string().optional(),
  },
  async ({
    task_id,
    workspace_id,
    run_id,
    reason_class,
    evidence_ref,
    supervisor_state,
    outcome,
    task_retry_count,
    attempt_count,
    unchanged_failure_count,
    approval_request_count,
    orphan_recovery_count,
    status,
    decision_note,
  }) => {
    try {
      const checkpoint = await upsertSupervisorApprovalCheckpointRow({
        task_id,
        workspace_id,
        run_id,
        reason_class,
        evidence_ref,
        status,
        decision_note,
        decided_at: status === 'pending' ? null : nowIso(),
      });
      const snapshot = await upsertSupervisorSnapshotRow({
        task_id,
        workspace_id,
        run_id,
        evidence_ref,
        supervisor_state,
        outcome,
        reason_class,
        task_retry_count,
        attempt_count,
        unchanged_failure_count,
        approval_request_count,
        orphan_recovery_count,
        approval_checkpoint_key: checkpoint.checkpoint_key,
      });
      return ok({
        created: true,
        checkpoint,
        snapshot: {
          ...snapshot,
          approval_checkpoint: checkpoint,
        },
      });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'record_telegram_adapter_intent',
  'Registra un intent bounded de Telegram contra el control plane durable.',
  {
    actor_id: z.string().min(1),
    chat_id: z.string().min(1),
    message_id: z.string().optional(),
    update_id: z.string().optional(),
    action: z.string().min(1),
    requested_verb: z.string().optional(),
    target_ref: z
      .object({
        task_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
        workspace_id: z.string().min(1).optional(),
        run_id: z.string().min(1).optional(),
        approval_id: z.string().min(1).optional(),
      })
      .optional(),
    payload: z.record(z.any()).optional(),
    status: z.enum(['accepted', 'pending_approval', 'denied']).optional().default('accepted'),
    audit_status: z.string().optional(),
  },
  async ({
    actor_id,
    chat_id,
    message_id,
    update_id,
    action,
    requested_verb,
    target_ref,
    payload,
    status,
    audit_status,
  }) => {
    try {
      ensureTelegramAdapterActionAllowed(action, requested_verb);
      const intent = localDb.recordTelegramIntentEnvelope({
        actor_id,
        chat_id,
        message_id,
        update_id,
        action,
        target_ref: target_ref || {},
        payload: payload || null,
        status,
        audit_status: audit_status || status,
      });
      return ok({ accepted: status !== 'denied', replayed: Boolean(intent.replayed), intent });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'record_telegram_delivery',
  'Registra delivery receipts bounded para Telegram sin alterar la verdad durable.',
  {
    telegram_chat_id: z.string().min(1),
    task_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
    workspace_id: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    intent_id: z.string().min(1).optional(),
    status: z.enum(['sent', 'failed', 'retry_pending']),
    attempts_count: z.number().int().min(1).optional().default(1),
    last_error: z.string().optional(),
  },
  async ({
    telegram_chat_id,
    task_id,
    workspace_id,
    run_id,
    intent_id,
    status,
    attempts_count,
    last_error,
  }) => {
    try {
      const delivery = localDb.upsertTelegramDeliveryReceipt({
        telegram_chat_id,
        task_id,
        workspace_id,
        run_id,
        intent_id,
        status,
        attempts_count,
        last_error,
        last_attempt_at: nowIso(),
      });
      return ok({ recorded: true, delivery });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'set_telegram_subscription',
  'Actualiza subscriptions bounded de Telegram para task/workspace/run.',
  {
    actor_id: z.string().min(1).optional(),
    telegram_chat_id: z.string().min(1),
    task_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
    workspace_id: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    status: z.enum(['mute', 'unmute']),
  },
  async ({ actor_id, telegram_chat_id, task_id, workspace_id, run_id, status }) => {
    try {
      const subscription = localDb.upsertTelegramSubscription({
        actor_id: actor_id || null,
        telegram_chat_id,
        task_id,
        workspace_id,
        run_id,
        status,
      });
      return ok({ updated: true, subscription });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'respond_telegram_approval',
  'Responde un approval checkpoint desde Telegram sin introducir surface de orquestación.',
  {
    actor_id: z.string().min(1),
    chat_id: z.string().min(1),
    approval_id: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    message_id: z.string().optional(),
    update_id: z.string().optional(),
  },
  async ({ actor_id, chat_id, approval_id, decision, message_id, update_id }) => {
    try {
      const checkpoint = localDb.getSupervisorApprovalCheckpoint(approval_id);
      if (!checkpoint) {
        throw new Error(`Approval checkpoint no encontrado: ${approval_id}`);
      }
      const nextStatus = decision === 'reject' ? 'rejected' : 'approved';
      const updatedCheckpoint = localDb.upsertSupervisorApprovalCheckpoint({
        checkpoint_key: approval_id,
        task_id: checkpoint.task_id,
        workspace_id: checkpoint.workspace_id,
        run_id: checkpoint.run_id,
        reason_class: checkpoint.reason_class,
        evidence_ref: checkpoint.evidence_ref,
        status: nextStatus,
        decision_note: `telegram:${actor_id}:${nextStatus}`,
        decided_at: nowIso(),
      });
      const intent = localDb.recordTelegramIntentEnvelope({
        actor_id,
        chat_id,
        message_id,
        update_id,
        action: 'approval.respond',
        target_ref: {
          task_id: checkpoint.task_id,
          workspace_id: checkpoint.workspace_id,
          run_id: checkpoint.run_id,
          approval_id,
        },
        payload: { decision },
        status: 'accepted',
        audit_status: nextStatus,
      });
      return ok({ accepted: true, checkpoint: updatedCheckpoint, intent });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'get_telegram_channel_snapshot',
  'Lee el snapshot durable compartido para Telegram/UI/MCP.',
  {
    task_id: UUID_OR_LEGACY_ID_SCHEMA.optional(),
  },
  async ({ task_id }) => {
    try {
      const snapshot = await getTelegramChannelSnapshot({ task_id: task_id || null });
      return ok({ snapshot: snapshot || null });
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
        await cleanupExpiredLeases(null, agent_id, nowMs);
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
// AGENT WORKSPACES (control plane only)
// ────────────────────────────────────────────────────────────────────────────

const agentWorkspaceStatusSchema = z.enum(AGENT_WORKSPACE_STATUSES);

server.tool(
  'prepare_agent_workspace',
  'Acepta intención narrow de preparación de workspace y devuelve ack idempotente sin exponer verbos git/worktree.',
  {
    workspace_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    agent_id: z.string().min(1).optional(),
    requested_base_ref: z.string().min(1).optional(),
    correlation_id: z.string().min(1),
    reservation_token: z.string().min(1).optional(),
  },
  async ({
    workspace_id,
    task_id,
    agent_id,
    requested_base_ref,
    correlation_id,
    reservation_token,
  }) => {
    try {
      const prepared = await prepareAgentWorkspaceLease({
        workspace_id,
        task_id,
        agent_id,
        requested_base_ref,
        correlation_id,
        reservation_token,
      });

      return ok({
        accepted: true,
        created: prepared.created,
        reused: prepared.reused,
        ack: prepared.ack,
        contract: {
          frozen_base_commit: AGENT_WORKSPACE_BASE_COMMIT,
          sw_2_1_checkpoint: SW_2_1_FROZEN_CHECKPOINT,
          sw_3_1_checkpoint: SW_3_1_FROZEN_CHECKPOINT,
        },
        message: prepared.reused
          ? 'Workspace preparation ya aceptada para ese correlation_id.'
          : 'Workspace preparation aceptada en modo control-plane.',
      });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'list_agent_workspaces',
  'Lista workspaces de agentes registrados en el control plane, sin exponer comandos git/worktree.',
  {
    project_id: z.string().uuid(),
    status: z
      .enum([...AGENT_WORKSPACE_STATUSES, 'all'])
      .optional()
      .default('all'),
  },
  async ({ project_id, status }) => {
    try {
      const workspaces = await listAgentWorkspaces({ projectId: project_id, status });
      return ok({ total: workspaces.length, workspaces });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'get_agent_workspace',
  'Obtiene un workspace específico del control plane por workspace_id.',
  {
    workspace_id: z.string().min(1),
  },
  async ({ workspace_id }) => {
    try {
      const workspace = await getAgentWorkspaceById(workspace_id);
      if (!workspace) return err(`Workspace ${workspace_id} no encontrado.`);
      return ok({ workspace });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'create_agent_workspace',
  'Crea una reserva planned para un workspace de agente. Solo guarda metadata durable; no ejecuta git/worktree.',
  {
    workspace_id: z.string().min(1),
    project_id: z.string().uuid(),
    agent_id: z.string().min(1),
    current_task_id: z.string().min(1).optional(),
    run_id_or_session_id: z.string().min(1).optional(),
    repo_root: z.string().min(1),
    workspace_path: z.string().min(1),
    worktree_path: z.string().optional(),
    base_branch: z.string().min(1),
    base_commit: z.string().min(1).optional(),
    branch_name: z.string().min(1).optional(),
    status: agentWorkspaceStatusSchema.optional().default('planned'),
    observed_branch: z.string().optional(),
    observed_head: z.string().optional(),
    observed_dirty: z.enum(['clean', 'dirty', 'dirty-excluded']).optional(),
    last_error: z.string().optional(),
    recovery_reason: z.string().optional(),
    evidence_ref: z.string().optional(),
    claimed_at: z.string().optional(),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
  },
  async ({ workspace_id, ...input }) => {
    try {
      const existing = await getAgentWorkspaceById(workspace_id);
      if (existing) {
        return ok({
          created: false,
          collision_reason: 'workspace_id',
          workspace: existing,
          message: 'Workspace ya existe.',
        });
      }

      const payload = validateAgentWorkspacePayload({
        id: workspace_id,
        project_id: input.project_id,
        agent_id: input.agent_id,
        current_task_id: input.current_task_id || null,
        run_id_or_session_id: input.run_id_or_session_id || null,
        repo_root: input.repo_root,
        workspace_path: input.workspace_path,
        worktree_path: input.worktree_path || null,
        base_branch: input.base_branch,
        base_commit: input.base_commit || AGENT_WORKSPACE_BASE_COMMIT,
        branch_name: input.branch_name || null,
        status: input.status || 'planned',
        observed_branch: input.observed_branch || null,
        observed_head: input.observed_head || null,
        observed_dirty: input.observed_dirty || null,
        last_error: input.last_error || null,
        recovery_reason: input.recovery_reason || null,
        evidence_ref: input.evidence_ref || null,
        claimed_at: input.claimed_at || null,
        started_at: input.started_at || null,
        updated_at: nowIso(),
        completed_at: input.completed_at || null,
      });

      const collisions = await getAgentWorkspaceCollisions({
        projectId: payload.project_id,
        workspaceId: payload.id,
        branchName: payload.branch_name,
        worktreePath: payload.worktree_path,
        agentId: payload.agent_id,
        currentTaskId: payload.current_task_id,
      });

      if (collisions.length > 0) {
        const collisionReason = deriveWorkspaceCollisionReason(
          {
            branchName: payload.branch_name,
            worktreePath: payload.worktree_path,
            agentId: payload.agent_id,
            currentTaskId: payload.current_task_id,
          },
          collisions
        );
        const conflict = await insertAgentWorkspace({
          ...payload,
          status: 'conflicted',
          last_error: `Reservation collision on ${collisionReason}`,
          evidence_ref: payload.evidence_ref || null,
        }).catch(async (error) => {
          const fallback = {
            ...payload,
            branch_name: null,
            worktree_path: null,
            status: 'conflicted',
            last_error: `Reservation collision: ${error.message}`,
          };
          return insertAgentWorkspace(fallback);
        });
        return ok({
          created: false,
          workspace: conflict,
          collision_reason: collisionReason,
          collisions: collisions.map((workspace) => ({
            workspace_id: workspace.id,
            branch_name: workspace.branch_name,
            worktree_path: workspace.worktree_path,
            current_task_id: workspace.current_task_id,
          })),
          message: 'Workspace reservado como conflicted por colisión.',
        });
      }

      const workspace = await insertAgentWorkspace(payload);
      return ok({
        created: true,
        collision_reason: null,
        workspace,
        message: 'Workspace creado en estado planned.',
      });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'update_agent_workspace',
  'Actualiza metadata/lifecycle de un workspace ya reservado. No ejecuta git/worktree.',
  {
    workspace_id: z.string().min(1),
    status: agentWorkspaceStatusSchema.optional(),
    current_task_id: z.string().nullable().optional(),
    run_id_or_session_id: z.string().nullable().optional(),
    worktree_path: z.string().nullable().optional(),
    branch_name: z.string().nullable().optional(),
    observed_branch: z.string().nullable().optional(),
    observed_head: z.string().nullable().optional(),
    observed_dirty: z.enum(['clean', 'dirty', 'dirty-excluded']).nullable().optional(),
    last_error: z.string().nullable().optional(),
    recovery_reason: z.string().nullable().optional(),
    evidence_ref: z.string().nullable().optional(),
    claimed_at: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
  },
  async ({ workspace_id, ...updates }) => {
    try {
      const existing = await getAgentWorkspaceById(workspace_id);
      if (!existing) return err(`Workspace ${workspace_id} no encontrado.`);

      const { merged, next } = deriveWorkspaceTransition(existing, updates, {
        allowTerminal: false,
      });
      const collisions = await getAgentWorkspaceCollisions({
        projectId: existing.project_id,
        workspaceId: existing.id,
        branchName: merged.branch_name,
        worktreePath: merged.worktree_path,
        agentId: merged.agent_id,
        currentTaskId: merged.current_task_id,
      });

      if (collisions.length > 0) {
        next.status = 'conflicted';
        next.last_error = `Reservation collision: ${collisions.map((workspace) => workspace.id).join(', ')}`;
      }

      const workspace = await updateAgentWorkspaceRow(workspace_id, next);
      return ok({ updated: true, workspace, message: 'Workspace actualizado.' });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'report_agent_workspace',
  'Registra observed state reportado por el ejecutor para un workspace. Solo metadata; nunca comandos git/worktree.',
  {
    workspace_id: z.string().min(1),
    correlation_id: z.string().min(1).optional(),
    status: agentWorkspaceStatusSchema,
    worktree_path: z.string().optional(),
    observed_branch: z.string().optional(),
    observed_head: z.string().optional(),
    observed_dirty: z.enum(['clean', 'dirty', 'dirty-excluded']).optional(),
    evidence_ref: z.string().optional(),
    error_class: z
      .enum(['base_drift', 'ownership_collision', 'executor_lost', 'prepare_failed'])
      .optional(),
    last_error: z.string().optional(),
    recovery_reason: z.string().optional(),
  },
  async ({ workspace_id, ...report }) => {
    try {
      const existing = await getAgentWorkspaceById(workspace_id);
      if (!existing) return err(`Workspace ${workspace_id} no encontrado.`);

      if (report.correlation_id && existing.correlation_id !== report.correlation_id) {
        return err(
          `correlation_id no coincide con el intento activo del workspace ${workspace_id}.`
        );
      }

      const normalizedReport = derivePrepareWorkspaceOutcome(existing, report);
      if (isPrepareWorkspaceReportNoOp(existing, normalizedReport, normalizedReport.status)) {
        return ok({
          updated: false,
          no_op: true,
          workspace: existing,
          message: 'Observed state duplicado para el correlation_id activo.',
        });
      }

      const updates = {
        ...normalizedReport,
      };
      const { merged, next } = deriveWorkspaceTransition(existing, updates, {
        allowTerminal: true,
      });

      const driftError = detectWorkspaceDrift(existing, merged);
      if (driftError) {
        next.status = 'conflicted';
        next.last_error = report.last_error || driftError;
        next.last_error_class = report.error_class || 'base_drift';
      }

      const collisions = await getAgentWorkspaceCollisions({
        projectId: existing.project_id,
        workspaceId: existing.id,
        branchName: merged.branch_name,
        worktreePath: merged.worktree_path,
        agentId: merged.agent_id,
        currentTaskId: merged.current_task_id,
      });
      if (collisions.length > 0) {
        next.status = 'conflicted';
        next.last_error =
          report.last_error ||
          `Reservation collision: ${collisions.map((workspace) => workspace.id).join(', ')}`;
        next.last_error_class = report.error_class || 'ownership_collision';
      }

      if (next.status === 'ready' && !next.last_error_class) {
        next.last_error = null;
        next.recovery_reason = null;
      }

      const workspace = await updateAgentWorkspaceRow(workspace_id, next);
      return ok({ updated: true, no_op: false, workspace, message: 'Observed state registrado.' });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'create_agent_run',
  'Crea un header durable en agent_runs sin convertir git/worktree en verbos MCP.',
  {
    run_id: z.string().min(1).optional(),
    workspace_id: z.string().min(1),
    task_id: z.string().min(1).optional(),
    agent_id: z.string().min(1),
    requested_base_ref: z.string().min(1),
    baseline_commit: z.string().min(1),
    observed_start_branch: z.string().optional(),
    observed_start_head: z.string().optional(),
    observed_start_dirty: z.enum(['clean', 'dirty', 'dirty-excluded']).optional(),
    observed_start_path: z.string().optional(),
    status: z.enum(AGENT_RUN_STATUSES).optional().default('planned'),
    predecessor_run_id: z.string().min(1).optional(),
    recovery_group_id: z.string().min(1).optional(),
  },
  async ({
    run_id,
    workspace_id,
    task_id,
    agent_id,
    requested_base_ref,
    baseline_commit,
    observed_start_branch,
    observed_start_head,
    observed_start_dirty,
    observed_start_path,
    status,
    predecessor_run_id,
    recovery_group_id,
  }) => {
    try {
      const run = await createAgentRunRow({
        run_id,
        workspace_id,
        task_id,
        agent_id,
        requested_base_ref,
        baseline_commit,
        observed_start: {
          branch: observed_start_branch || null,
          head: observed_start_head || null,
          dirty: observed_start_dirty || null,
          path: observed_start_path || null,
        },
        status,
        predecessor_run_id,
        recovery_group_id,
      });

      return ok({ created: true, run });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'get_agent_run',
  'Obtiene un agent_run durable por run_id.',
  {
    run_id: z.string().min(1),
  },
  async ({ run_id }) => {
    try {
      const run = await getAgentRunById(run_id);
      if (!run) return err(`agent_run ${run_id} no encontrado.`);
      return ok({ run });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'list_agent_runs',
  'Lista runs durables por workspace/task/agent.',
  {
    workspace_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    agent_id: z.string().min(1).optional(),
    limit: z.number().int().positive().max(100).optional(),
  },
  async ({ workspace_id, task_id, agent_id, limit }) => {
    try {
      const runs = await listAgentRuns({
        workspaceId: workspace_id || null,
        taskId: task_id || null,
        agentId: agent_id || null,
        limit: limit || null,
      });
      return ok({ total: runs.length, runs });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'complete_agent_run',
  'Cierra un agent_run con metadata terminal sin reescribir procedencia.',
  {
    run_id: z.string().min(1),
    status: z.enum(TERMINAL_AGENT_RUN_STATUSES),
    terminal_reason_class: z.string().min(1).optional(),
    completed_at: z.string().min(1).optional(),
  },
  async ({ run_id, status, terminal_reason_class, completed_at }) => {
    try {
      const run = await updateAgentRunTerminalRow(run_id, {
        status,
        terminal_reason_class,
        completed_at,
      });
      return ok({ updated: true, run });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'append_agent_artifact',
  'Agrega evidencia append-only para un run durable.',
  {
    artifact_id: z.string().min(1).optional(),
    run_id: z.string().min(1),
    phase: z.enum(AGENT_ARTIFACT_PHASES),
    kind: z.enum(AGENT_ARTIFACT_KINDS),
    producer: z.enum(AGENT_ARTIFACT_PRODUCERS),
    summary: z.string().min(1),
    evidence_ref: z.union([
      z.string().min(1),
      z.object({
        kind: z.string().min(1),
        locator: z.string().min(1),
        version: z.string().min(1).optional(),
      }),
    ]),
    parent_artifact_id: z.string().min(1).optional(),
    supersedes_artifact_id: z.string().min(1).optional(),
    content_digest: z.string().min(1).optional(),
    locator_version: z.string().min(1).optional(),
    observed_at: z.string().min(1).optional(),
  },
  async ({
    artifact_id,
    run_id,
    phase,
    kind,
    producer,
    summary,
    evidence_ref,
    parent_artifact_id,
    supersedes_artifact_id,
    content_digest,
    locator_version,
    observed_at,
  }) => {
    try {
      const artifact = await appendAgentArtifactRow({
        artifact_id,
        run_id,
        phase,
        kind,
        producer,
        summary,
        evidence_ref,
        parent_artifact_id,
        supersedes_artifact_id,
        content_digest,
        locator_version,
        observed_at,
      });
      return ok({ created: true, artifact });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'list_agent_artifacts',
  'Lista artifacts append-only ordenados por seq para un run.',
  {
    run_id: z.string().min(1),
  },
  async ({ run_id }) => {
    try {
      const artifacts = await listAgentArtifacts(run_id);
      return ok({ total: artifacts.length, artifacts });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'get_workspace_evidence',
  'Devuelve workspace + latest run + latest artifact para consumers downstream.',
  {
    workspace_id: z.string().min(1),
  },
  async ({ workspace_id }) => {
    try {
      const evidence = await getWorkspaceEvidence(workspace_id);
      if (!evidence) return err(`Workspace ${workspace_id} no encontrado.`);
      return ok(evidence);
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
  'team_tell',
  'Envía una directiva durable por misión a uno o más participantes usando persist-first y OpenCode sólo para bindings verificables.',
  {
    mission_id: z.string().min(1),
    sender_agent_id: z.string().min(1),
    body_summary: z.string().min(1),
    recipients: z.array(z.string().min(1)).min(1).max(50),
    message_kind: z
      .enum([
        'directive',
        'status',
        'handoff',
        'decision',
        'risk',
        'approval_request',
        'approval_result',
      ])
      .optional()
      .default('directive'),
    evidence_ref: z.string().optional(),
  },
  async ({ mission_id, sender_agent_id, body_summary, recipients, message_kind, evidence_ref }) => {
    try {
      const db = localDb.getDb();
      validateTeamTellMembership(db, { mission_id, sender_agent_id, recipients });

      const resolveTargetBinding = createOpencodeTargetResolver({ db });
      const transportSendMessage = getTeamTellTransportOverride();
      const sendToVerifiedSession = createOpencodeDeliveryAdapter(
        transportSendMessage ? { transportSendMessage } : {}
      );
      const teamTell = createTeamTell({ db, resolveTargetBinding, sendToVerifiedSession });

      const result = await teamTell({
        mission_id,
        sender_agent_id,
        body_summary,
        recipients,
        message_kind,
        evidence_ref: evidence_ref || null,
      });

      return ok(toCompactTeamTellResult(result));
    } catch (e) {
      return err(e.message);
    }
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

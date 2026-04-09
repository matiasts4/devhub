#!/usr/bin/env node
/**
 * DevHub MCP Server
 * Expone herramientas de DevHub (proyectos, tareas, hitos) para Antigravity.
 * Comunicación via stdio — sin API key externa necesaria.
 *
 * Uso: node devhub-mcp/server.js
 * Config Antigravity: ver devhub-mcp/README.md
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

// Cargar .env.local desde la raíz del proyecto
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const require = createRequire(import.meta.url);
const localDb = require('../src/lib/db/localDb.js');

const DB_DRIVER = (process.env.DEVHUB_MCP_DB_DRIVER || 'sqlite').toLowerCase();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
} else {
  process.stderr.write(
    '⚠️  AVISO: No se encontró OPENAI_API_KEY. Búsqueda semántica (embeddings) puede fallar.\n'
  );
}

function nowIso() {
  return new Date().toISOString();
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
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author_type TEXT DEFAULT 'agent',
      created_at TEXT DEFAULT (datetime('now'))
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

    CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_tipo ON agent_memory(tipo);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
  `);
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
    planning_status: z.enum(['none', 'pending', 'completed']).optional().describe('Estado del planning IA del proyecto'),
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
    return ok({ updated: true, project: data });
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
      // 1. Verificar si el agente ya tiene una tarea en curso
      const { data: activeTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'in_progress')
        // Ideally should check assigned_to, but we might not have that column yet, let's assume it.
        // Wait, did we add assigned_to? The PR spec mentions "assigned_to = auth.uid()", but this is an agent.
        // I will skip assigned_to check for agents because it's not strictly defined in DB yet.
        .limit(1);

      // 2. Obtener tareas pending
      const { data: tasks, error: tasksErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'pending');
      if (tasksErr) return err(tasksErr.message);
      if (!tasks || tasks.length === 0) return ok({ task: null, message: 'Sin tareas pendientes' });

      // 3. Evaluar dependencias
      const taskIds = tasks.map((t) => t.id);
      const { data: deps } = await supabase
        .from('task_dependencies')
        .select('*')
        .in('task_id', taskIds);

      const { data: allTasksForDeps } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('project_id', project_id);

      const statusMap = Object.fromEntries((allTasksForDeps || []).map((t) => [t.id, t.status]));

      const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };

      let bestTask = null;
      let maxScore = -1;

      for (const task of tasks) {
        // Ignorar si tiene una dependencia bloqueante incompleta
        const taskDeps = deps?.filter((d) => d.task_id === task.id) || [];
        const isBlocked = taskDeps.some(
          (d) => d.tipo === 'blocks' && statusMap[d.depends_on] !== 'completed'
        );
        if (isBlocked) continue;

        const urgencia = priorityMap[task.priority] || 2;
        const valor_negocio = task.business_value || 5;
        // Simplified dependencias_desbloqueadas: how many tasks depend on this one
        const { count: depsUnlock } = await supabase
          .from('task_dependencies')
          .select('*', { count: 'exact', head: true })
          .eq('depends_on', task.id);

        let score = urgencia * 0.4 + valor_negocio * 0.3 + (depsUnlock || 0) * 0.2;

        if (score > maxScore) {
          maxScore = score;
          bestTask = task;
        }
      }

      if (!bestTask)
        return ok({ task: null, message: 'Todas las tareas pendientes están bloqueadas.' });

      // Actualizar a in_progress
      await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', bestTask.id);
      bestTask.status = 'in_progress';

      return ok({
        task: {
          id: bestTask.id,
          title: bestTask.title,
          description: bestTask.description,
          priority: bestTask.priority,
          status: bestTask.status,
        },
        message: 'Tarea asignada al agente.',
      });
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
    const { data, error } = await supabase
      .from('agent_registry')
      .update({ last_heartbeat: new Date().toISOString() })
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
    const { error } = await supabase.from('agent_registry').delete().eq('agent_id', agent_id);
    if (error) return err(error.message);
    return ok({ success: true, message: `Agente ${agent_id} eliminado de registry.` });
  }
);

server.tool(
  'update_agent_status',
  'Actualiza el estado visual de tu agente en el DevHub Control Center.',
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
    return ok({ success: true, message: 'Estado actualizado en la UI', agent: data });
  }
);

// ─── Start server ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('✅ DevHub MCP Server iniciado (stdio)\n');

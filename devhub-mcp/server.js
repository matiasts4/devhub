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
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

import { registerProjectTools } from './tools/projects.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerWorkspaceTools } from './tools/workspaces.js';
import { registerAgentTools } from './tools/agents.js';
import { registerInboxTools } from './tools/inbox.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const require = createRequire(import.meta.url);
const fromWorkspaceRoot = (relativePath) => resolve(__dirname, '..', relativePath);

const localDb = require(fromWorkspaceRoot('src/lib/db/localDb.js'));
const {
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
} = require(fromWorkspaceRoot('src/lib/db/compactReads.js'));
const { parseGitCheckpointComment, validateCheckpointHandoff } = require(
  fromWorkspaceRoot('src/lib/gitCheckpointHandoff.js')
);
const { evaluateSupervisorSnapshot } = require(
  fromWorkspaceRoot('src/lib/swarm/supervisorLoop.js')
);
const { createTeamTell } = require(fromWorkspaceRoot('src/lib/swarm/teamTell.js'));
const { createOpencodeTargetResolver } = require(
  fromWorkspaceRoot('src/lib/swarm/opencodeTargetResolver.js')
);
const { createOpencodeDeliveryAdapter } = require(
  fromWorkspaceRoot('src/lib/swarm/opencodeDeliveryAdapter.js')
);
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
} = require(fromWorkspaceRoot('src/lib/db/agentRunArtifacts.js'));

const DB_DRIVER = (process.env.DEVHUB_MCP_DB_DRIVER || 'sqlite').toLowerCase();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const UUID_REQUIRED_TABLES = new Set(['projects', 'tasks', 'milestones']);
const AUTO_ID_TABLES = new Set([
  'projects',
  'tasks',
  'milestones',
  'task_comments',
  'agent_memory',
  'mcp_connections',
]);

function nowIso() {
  return new Date().toISOString();
}

function generateLegacyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generatePrimaryIdForTable(tableName) {
  if (UUID_REQUIRED_TABLES.has(tableName)) return randomUUID();
  return generateLegacyId(tableName.replace(/s$/, ''));
}

class SqliteQueryAdapter {
  constructor(dbLayer, table) {
    this.dbLayer = dbLayer;
    this.table = table;
    this.filters = [];
    this.orderBy = [];
    this.limitValue = null;
    this.selectFields = '*';
    this.action = 'select';
    this.payload = null;
    this.upsertOptions = null;
    this.expectSingle = false;
  }

  select(fields = '*') {
    if (typeof fields === 'string' && fields.trim()) {
      this.selectFields = fields;
    }
    return this;
  }

  eq(column, value) {
    this.filters.push([column, '=', value]);
    return this;
  }

  in(column, values) {
    if (!Array.isArray(values) || values.length === 0) {
      this.filters.push(['1', '=', '0']);
      return this;
    }
    this.filters.push([column, `IN (${values.map(() => '?').join(', ')})`, values]);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.orderBy.push([column, ascending ? 'ASC' : 'DESC']);
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.expectSingle = true;
    return this;
  }

  maybeSingle() {
    this.expectSingle = true;
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload, options = {}) {
    this.action = 'upsert';
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  get tableOps() {
    const tableOps = this.dbLayer.tables?.[this.table];
    if (!tableOps) {
      throw new Error(`Table ${this.table} not found`);
    }
    return tableOps;
  }

  selectRows() {
    return this.tableOps.select({
      select: this.selectFields,
      where: this.filters,
      orderBy: this.orderBy,
      limit: this.limitValue,
    });
  }

  upsertRow(row) {
    const conflictColumn = this.upsertOptions?.onConflict || 'id';
    const db = this.dbLayer.getDb();
    const columns = Object.keys(row || {});
    if (columns.length === 0) {
      throw new Error(`Cannot upsert empty row into ${this.table}`);
    }
    const values = columns.map((column) => row[column] ?? null);
    const updateColumns = columns.filter((column) => column !== conflictColumn);
    const updateSql =
      updateColumns.length > 0
        ? updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')
        : `${conflictColumn} = excluded.${conflictColumn}`;

    db.prepare(
      `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updateSql}`
    ).run(...values);

    return db
      .prepare(`SELECT * FROM ${this.table} WHERE ${conflictColumn} = ? LIMIT 1`)
      .get(row[conflictColumn]);
  }

  async execute() {
    try {
      if (this.action === 'select') {
        const rows = this.selectRows();
        return { data: this.expectSingle ? rows[0] || null : rows, error: null };
      }

      if (this.action === 'insert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => {
          const payload = { ...(row || {}) };
          if (payload.id === undefined && AUTO_ID_TABLES.has(this.table)) {
            payload.id = generatePrimaryIdForTable(this.table);
          }
          if (payload.created_at === undefined) {
            payload.created_at = nowIso();
          }
          if (
            payload.updated_at === undefined &&
            ['projects', 'tasks', 'milestones', 'agent_registry'].includes(this.table)
          ) {
            payload.updated_at = nowIso();
          }
          return this.tableOps.insert(payload);
        });
        return { data: this.expectSingle ? rows[0] || null : rows, error: null };
      }

      if (this.action === 'update') {
        const row = this.tableOps.update(this.payload || {}, this.filters);
        return { data: this.expectSingle ? row || null : row ? [row] : [], error: null };
      }

      if (this.action === 'upsert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) =>
          this.upsertRow(row)
        );
        return { data: this.expectSingle ? rows[0] || null : rows, error: null };
      }

      if (this.action === 'delete') {
        this.tableOps.delete(this.filters);
        return { data: null, error: null };
      }

      return { data: null, error: { message: `Unsupported action: ${this.action}` } };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function createSqliteClient(dbLayer) {
  dbLayer.getDb();
  return {
    from(table) {
      return new SqliteQueryAdapter(dbLayer, table);
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
  supabase = createSqliteClient(localDb);
  process.stderr.write('ℹ️  DevHub MCP usando driver SQLite local (local-first)\n');
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message) {
  return { content: [{ type: 'text', text: `ERROR: ${message}` }], isError: true };
}

const deps = {
  DB_DRIVER,
  localDb,
  supabase,
  ok,
  err,
  randomUUID,
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
  parseGitCheckpointComment,
  validateCheckpointHandoff,
  evaluateSupervisorSnapshot,
  createTeamTell,
  createOpencodeTargetResolver,
  createOpencodeDeliveryAdapter,
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
};

const server = new McpServer({ name: 'devhub', version: '1.0.0' });

registerProjectTools(server, deps);
registerTaskTools(server, deps);
registerWorkspaceTools(server, deps);
registerAgentTools(server, deps);
registerInboxTools(server, deps);

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

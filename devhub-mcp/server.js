#!/usr/bin/env node
/**
 * DevHub MCP Server
 * Expone herramientas de DevHub (proyectos, tareas, hitos) para OpenCode.
 * Comunicación via stdio — sin API key externa necesaria.
 *
 * Uso: node devhub-mcp/server.js
 * Config OpenCode: ver devhub-mcp/README.md
 */

// === MCP stdio hygiene (critical) ===
// The MCP stdio transport owns stdout for JSON-RPC frames only.
// The app code we require (localDb, shared.js, walCheckpoint, swarm/*, etc.)
// liberally uses console.log / console.info for diagnostics. Any stdout write
// from them corrupts the protocol and produces "serde error expected value at line 1 column 2"
// on the client (Grok / other MCP hosts).
// Redirect the noisy ones to stderr early, before any requires of src/lib/*.
const _origLog = console.log;
const _origInfo = console.info;
const _origWarn = console.warn;
function toSafeStr(v) {
  if (v == null) return String(v);
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return Object.prototype.toString.call(v);
    }
  }
  return String(v);
}
console.log = (...args) => process.stderr.write('[log] ' + args.map(toSafeStr).join(' ') + '\n');
console.info = console.log;
console.warn = (...args) => process.stderr.write('[warn] ' + args.map(toSafeStr).join(' ') + '\n');
// console.error is intentionally left alone — the MCP server itself uses process.stderr.write
// and some libs use console.error for real errors (which belong on stderr).

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
import { registerInboxTools } from './tools/inbox.js';
import { registerOperateTools } from './tools/operate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const require = createRequire(import.meta.url);
const fromWorkspaceRoot = (relativePath) => resolve(__dirname, '..', relativePath);

const localDb = require(fromWorkspaceRoot('src/lib/db/localDb.js'));
const { getDbDriver } = require(fromWorkspaceRoot('src/lib/db/driver-selector.js'));
const localAuth = require(fromWorkspaceRoot('src/lib/auth/providers/local.js'));
const { getAuthProvider } = require(fromWorkspaceRoot('src/lib/auth/provider.js'));
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

// devhub-cloud-foundation (PR 4): wire the postgres-generic driver into
// the existing DB_DRIVER switch using the selector (no policy changes).
// Selector handles validation and creation for sqlite | supabase | postgres-generic.
let postgresGenericDriver = null;
const activeDbDriver = getDbDriver({
  DEVHUB_DB_DRIVER: DB_DRIVER,
  DATABASE_URL: process.env.DATABASE_URL,
});
if (activeDbDriver.kind === 'postgres-generic') {
  postgresGenericDriver = activeDbDriver;
  process.stderr.write(
    'ℹ️  DevHub MCP usando driver postgres-generic (DEVHUB_MCP_DB_DRIVER=postgres-generic)\n'
  );
} else if (DB_DRIVER === 'postgres-generic') {
  process.stderr.write('❌ ERROR: DEVHUB_MCP_DB_DRIVER=postgres-generic requires DATABASE_URL\n');
  process.exit(1);
}

// devhub-cloud-foundation migration (user-approved full activation):
// Load the hexagonal AuthProvider port. When DEVHUB_AUTH_PROVIDER=supabase
// (or DEVHUB_OPERATION_MODE=cloud) this returns the real supabase adapter.
// Local mode falls back to synthetic local-user exactly as before.
const authProvider = getAuthProvider();
process.stderr.write(`ℹ️  DevHub MCP auth provider: ${authProvider.kind || 'local'}\n`);

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
  process.stderr.write(
    'ℹ️  DevHub MCP usando driver Supabase (DEVHUB_MCP_DB_DRIVER=supabase) — cloud-foundation tenancy active when DEVHUB_AUTH_PROVIDER=supabase\n'
  );
} else {
  supabase = createSqliteClient(localDb);
  process.stderr.write('ℹ️  DevHub MCP usando driver SQLite local (local-first)\n');
}
process.stderr.write('ℹ️  [breadcrumb-1] after driver selection, before ok/err/defs\n');

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
  localUserId: localAuth.SYNTHETIC_SESSION.user.id,
  // Cloud foundation: prefer real actor from AuthProvider when in cloud mode.
  // Falls back to synthetic local-user for local-dev / no-auth regression budget.
  getActor: async () => {
    try {
      const session = await authProvider.getSession();
      if (session && session.user && session.user.id) {
        return {
          user: session.user,
          workspaceMemberships: session.workspaceMemberships || [],
          projectMemberships: session.projectMemberships || [],
        };
      }
    } catch {
      // ignore and fall through to local synthetic
    }
    return { user: { id: localAuth.SYNTHETIC_SESSION.user.id }, projectMemberships: [] };
  },
  authProvider, // the port instance (local | supabase). Tools can use for verifyToken etc.
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
  parseGitCheckpointComment,
  validateCheckpointHandoff,
  evaluateSupervisorSnapshot,
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
process.stderr.write(
  'ℹ️  [breadcrumb-2] after agentRunArtifacts etc requires, before deps object\n'
);

// Provide a no-op for writeAuditLog early (some tool registers destructure it from deps at call time).
// This was missing in the original deps object (see projects.js destructuring).
deps.writeAuditLog =
  deps.writeAuditLog ||
  ((action, details) => {
    process.stderr.write(
      `[audit] ${action} ${details ? JSON.stringify(details).slice(0, 200) : ''}\n`
    );
  });
process.stderr.write('ℹ️  [breadcrumb-3] after writeAuditLog shim, before new McpServer\n');

try {
  const server = new McpServer({ name: 'devhub', version: '1.0.0' });

  // Register all tools (this is where most side effects from deps and tool schemas happen)
  process.stderr.write('ℹ️  DevHub MCP registrando tools...\n');
  registerProjectTools(server, deps);
  registerTaskTools(server, deps);
  registerWorkspaceTools(server, deps);
  registerInboxTools(server, deps);
  registerOperateTools(server, deps);

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
  process.stderr.write('ℹ️  DevHub MCP conectando transporte stdio...\n');
  await server.connect(transport);

  // Success log goes to stderr so it never pollutes the MCP JSON-RPC stdout channel
  process.stderr.write('✅ DevHub MCP Server iniciado (stdio)\n');
} catch (err) {
  process.stderr.write('❌ FATAL: DevHub MCP initialization failed\n');
  process.stderr.write(String(err?.stack || err) + '\n');
  process.exit(1);
}

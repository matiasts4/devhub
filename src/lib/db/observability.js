/**
 * @module observability
 * Traces, sessions, messages, session hierarchy, swarm config/processes, agent counts.
 */

'use strict';

const crypto = require('crypto');
const { getDb } = require('./shared');

// Helper to resolve db-first or input-first calling convention
function resolveDbArgs(dbOrInput, maybeInput) {
  const hasDb = dbOrInput && typeof dbOrInput.prepare === 'function';
  return {
    db: hasDb ? dbOrInput : getDb(),
    input: hasDb ? maybeInput : dbOrInput,
  };
}

// ============================================================
// Agent Traces ORM
// ============================================================

function insertTrace(dbOrTrace, maybeTrace) {
  const { db, input: trace } = resolveDbArgs(dbOrTrace, maybeTrace);
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

function getTracesBySession(dbOrSessionId, maybeSessionId, options = {}) {
  const hasDb = dbOrSessionId && typeof dbOrSessionId.prepare === 'function';
  const db = hasDb ? dbOrSessionId : getDb();
  const sessionId = hasDb ? maybeSessionId : dbOrSessionId;
  const opts = hasDb ? options || {} : maybeSessionId || {};
  let query = 'SELECT * FROM agent_traces WHERE session_id = ?';
  const params = [sessionId];

  if (opts.message_id) {
    query += ' AND message_id = ?';
    params.push(opts.message_id);
  }
  if (opts.trace_type) {
    query += ' AND trace_type = ?';
    params.push(opts.trace_type);
  }
  if (opts.tool_name) {
    query += ' AND tool_name = ?';
    params.push(opts.tool_name);
  }
  if (opts.tool_status) {
    query += ' AND tool_status = ?';
    params.push(opts.tool_status);
  }

  query += ' ORDER BY created_at ASC';

  if (opts.limit) {
    query += ' LIMIT ?';
    params.push(opts.limit);
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
 */
function sanitizeFtsQuery(term) {
  if (!term || typeof term !== 'string') return '';
  const escaped = term.replace(/"/g, '""');
  return `"${escaped}"`;
}

function searchTraces(dbOrSessionId, maybeSessionIdOrTerm, maybeTermOrOptions, maybeOptions) {
  const hasDb = dbOrSessionId && typeof dbOrSessionId.prepare === 'function';
  const db = hasDb ? dbOrSessionId : getDb();
  const sessionId = hasDb ? maybeSessionIdOrTerm : dbOrSessionId;
  const searchTerm = hasDb ? maybeTermOrOptions : maybeSessionIdOrTerm;
  const opts = hasDb
    ? maybeOptions || {}
    : maybeTermOrOptions && typeof maybeTermOrOptions === 'object'
      ? maybeTermOrOptions
      : {};
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
  const rows = db.prepare(query).all(sessionId, safeTerm, opts.limit || 50);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function updateTrace(dbOrId, maybeId, updates = {}) {
  const { db, input } = resolveDbArgs(dbOrId, maybeId);
  const id = typeof input === 'string' ? input : input?.id;
  const upd =
    typeof updates === 'object' && Object.keys(updates).length > 0
      ? updates
      : typeof input === 'object'
        ? input
        : {};
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(upd)) {
    if (key === 'tool_input' || key === 'metadata') {
      setClauses.push(`${key} = ?`);
      params.push(value ? JSON.stringify(value) : null);
    } else {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  setClauses.push('id = agent_traces.id');
  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  const query = `UPDATE agent_traces SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(query).run(...params);
}

function upsertTrace(dbOrTrace, maybeTrace) {
  const { db, input: trace } = resolveDbArgs(dbOrTrace, maybeTrace);
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

function upsertSessionUsage(dbOrData, maybeData) {
  const { db, input: data } = resolveDbArgs(dbOrData, maybeData);
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

function getSessionUsage(dbOrSessionId, maybeSessionId) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
  return db.prepare('SELECT * FROM agent_session_usage WHERE session_id = ?').get(sessionId);
}

// ============================================================
// Telegram Session Map ORM
// ============================================================

function getTelegramSession(dbOrChatId, maybeChatId) {
  const { db, input } = resolveDbArgs(dbOrChatId, maybeChatId);
  const chatId = typeof input === 'string' ? input : input?.chat_id;
  return db
    .prepare('SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1')
    .get(chatId);
}

function createTelegramSession(dbOrChatId, maybeChatId, maybeSessionId, maybeProjectId) {
  const hasDb = dbOrChatId && typeof dbOrChatId.prepare === 'function';
  const db = hasDb ? dbOrChatId : getDb();
  const chatId = hasDb ? maybeChatId : dbOrChatId;
  const sessionId = hasDb ? maybeSessionId : maybeChatId;
  const projectId = hasDb ? maybeProjectId : maybeSessionId;
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

function insertMessage(dbOrData, maybeData) {
  const { db, input: data } = resolveDbArgs(dbOrData, maybeData);
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

function getMessagesBySession(dbOrSessionId, maybeSessionId, options = {}) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
  const opts = typeof input === 'object' && !maybeSessionId ? input : options;
  let query = 'SELECT * FROM agent_hub_messages WHERE session_id = ?';
  const params = [sessionId];

  if (opts.role) {
    query += ' AND role = ?';
    params.push(opts.role);
  }
  if (opts.source) {
    query += ' AND source = ?';
    params.push(opts.source);
  }

  query += ' ORDER BY created_at ASC';

  if (opts.limit) {
    query += ' LIMIT ?';
    params.push(opts.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}

function getToolTracesBySession(dbOrSessionId, maybeSessionId, options = {}) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
  const opts = typeof input === 'object' && !maybeSessionId ? input : options;
  let query = 'SELECT * FROM agent_traces WHERE session_id = ? AND trace_type LIKE ?';
  const params = [sessionId, 'tool%'];

  if (opts.tool_status) {
    query += ' AND tool_status = ?';
    params.push(opts.tool_status);
  }
  if (opts.tool_name) {
    query += ' AND tool_name = ?';
    params.push(opts.tool_name);
  }

  query += ' ORDER BY created_at ASC';

  if (opts.limit) {
    query += ' LIMIT ?';
    params.push(opts.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

// ============================================================
// Session Queries
// ============================================================

function getSessionsByProject(dbOrProjectId, maybeProjectId, options = {}) {
  const { db, input } = resolveDbArgs(dbOrProjectId, maybeProjectId);
  const projectId = typeof input === 'string' ? input : input?.project_id;
  const opts = typeof input === 'object' && !maybeProjectId ? input : options;
  const { includeHidden } = opts;

  let whereClause = 'WHERE s.project_id = ?';
  const params = [projectId];

  if (includeHidden === 'active') {
    whereClause += " AND s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    whereClause += " AND s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
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

function getRecentSessions(dbOrLimit, maybeLimit, options = {}) {
  const { db, input } = resolveDbArgs(dbOrLimit, maybeLimit);
  const limit = typeof input === 'number' ? input : input?.limit || 20;
  const opts = typeof input === 'object' && typeof input !== 'number' ? input : options;
  const { includeHidden } = opts;

  let whereClause = '';
  const params = [limit];

  if (includeHidden === 'active') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
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

function getSessionsByTelegramChat(dbOrChatId, maybeChatId, maybeLimit = 20) {
  const { db, input } = resolveDbArgs(dbOrChatId, maybeChatId);
  const chatId = typeof input === 'string' ? input : input?.chat_id;
  const limit = typeof maybeChatId === 'number' ? maybeChatId : maybeLimit;
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

// ============================================================
// Session Updates
// ============================================================

function updateSessionStatus(dbOrSessionId, maybeSessionId, maybeStatus) {
  const hasDb = dbOrSessionId && typeof dbOrSessionId.prepare === 'function';
  const db = hasDb ? dbOrSessionId : getDb();
  const sessionId = hasDb ? maybeSessionId : dbOrSessionId;
  const status = hasDb ? maybeStatus : maybeSessionId;
  return db
    .prepare("UPDATE agent_hub_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, sessionId);
}

function updateSessionError(dbOrSessionId, maybeSessionId, maybeErrorMessage) {
  const hasDb = dbOrSessionId && typeof dbOrSessionId.prepare === 'function';
  const db = hasDb ? dbOrSessionId : getDb();
  const sessionId = hasDb ? maybeSessionId : dbOrSessionId;
  const errorMessage = hasDb ? maybeErrorMessage : maybeSessionId;
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(errorMessage || 'Unknown error', sessionId);
}

function updateSessionOpenCodeId(dbOrSessionId, maybeSessionId, maybeOpencodeSessionId) {
  const hasDb = dbOrSessionId && typeof dbOrSessionId.prepare === 'function';
  const db = hasDb ? dbOrSessionId : getDb();
  const sessionId = hasDb ? maybeSessionId : dbOrSessionId;
  const opencodeSessionId = hasDb ? maybeOpencodeSessionId : maybeSessionId;
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(opencodeSessionId, sessionId);
}

function cleanupStaleAgentSessions(dbOrNone) {
  const db = dbOrNone && typeof dbOrNone.prepare === 'function' ? dbOrNone : getDb();
  return db.transaction(() => {
    const sessions = db
      .prepare(
        `UPDATE agent_hub_sessions
         SET status = 'completed', updated_at = datetime('now')
         WHERE status IN ('active', 'working', 'running', 'thinking', 'busy')`
      )
      .run();

    const runs = db
      .prepare(
        `UPDATE agent_runs
         SET status = 'aborted',
             terminal_reason_class = 'orphaned_run',
             completed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE status = 'running'`
      )
      .run();

    const workspaces = db
      .prepare(
        `UPDATE agent_workspaces
         SET status = 'orphaned',
             last_error = 'stale OpenCode session cleanup',
             recovery_reason = 'cleanup-stale-session',
             updated_at = datetime('now')
         WHERE status IN ('active', 'ready', 'provisioning', 'paused', 'cleanup_pending')`
      )
      .run();

    return {
      sessions: sessions.changes,
      runs: runs.changes,
      workspaces: workspaces.changes,
    };
  })();
}

// ============================================================
// Swarm Config Helpers
// ============================================================

function getSwarmConfig(dbOrNone) {
  const db = dbOrNone && typeof dbOrNone.prepare === 'function' ? dbOrNone : getDb();
  const rows = db.prepare('SELECT key, value FROM swarm_config').all();
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

function setSwarmConfig(dbOrKey, maybeKey, maybeValue) {
  const hasDb = dbOrKey && typeof dbOrKey.prepare === 'function';
  const db = hasDb ? dbOrKey : getDb();
  const key = hasDb ? maybeKey : dbOrKey;
  const value = hasDb ? maybeValue : maybeKey;
  db.prepare(
    "INSERT INTO swarm_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(key, String(value));
}

// ============================================================
// Swarm Process Helpers
// ============================================================

function registerSwarmProcess(dbOrData, maybeData) {
  const { db, input: data } = resolveDbArgs(dbOrData, maybeData);
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

function updateSwarmProcess(dbOrId, maybeId, updates = {}) {
  const { db, input } = resolveDbArgs(dbOrId, maybeId);
  const id = typeof input === 'string' ? input : input?.id;
  const upd =
    typeof updates === 'object' && Object.keys(updates).length > 0
      ? updates
      : typeof input === 'object'
        ? input
        : {};
  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(upd)) {
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

function getSwarmProcesses(dbOrNone) {
  const db = dbOrNone && typeof dbOrNone.prepare === 'function' ? dbOrNone : getDb();
  const rows = db.prepare('SELECT * FROM swarm_processes ORDER BY started_at DESC').all();
  return rows.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function removeSwarmProcess(dbOrId, maybeId) {
  const { db, input } = resolveDbArgs(dbOrId, maybeId);
  const id = typeof input === 'string' ? input : input?.id;
  return db.prepare('DELETE FROM swarm_processes WHERE id = ?').run(id);
}

function getActiveSwarmCount(dbOrNone) {
  const db = dbOrNone && typeof dbOrNone.prepare === 'function' ? dbOrNone : getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM swarm_processes WHERE status IN ('running', 'starting')"
    )
    .get();
  return row.count;
}

function getActiveAgentCount(dbOrNone) {
  const db = dbOrNone && typeof dbOrNone.prepare === 'function' ? dbOrNone : getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM agent_hub_sessions WHERE status = 'active'")
    .get();
  return row.count;
}

// ============================================================
// Session Hierarchy (parent/child navigation)
// ============================================================

function getSessionWithParent(dbOrSessionId, maybeSessionId) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
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

function getChildSessions(dbOrParentId, maybeParentId) {
  const { db, input } = resolveDbArgs(dbOrParentId, maybeParentId);
  const parentId = typeof input === 'string' ? input : input?.parent_id;
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

function getSessionChain(dbOrSessionId, maybeSessionId) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
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

function getSiblingSessions(dbOrSessionId, maybeSessionId) {
  const { db, input } = resolveDbArgs(dbOrSessionId, maybeSessionId);
  const sessionId = typeof input === 'string' ? input : input?.session_id;
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

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Traces
  insertTrace,
  getTracesBySession,
  sanitizeFtsQuery,
  searchTraces,
  updateTrace,
  upsertTrace,
  // Session Usage
  upsertSessionUsage,
  getSessionUsage,
  // Telegram Session
  getTelegramSession,
  createTelegramSession,
  // Messages
  insertMessage,
  getMessagesBySession,
  getToolTracesBySession,
  // Session Queries
  getSessionsByProject,
  getRecentSessions,
  getSessionsByTelegramChat,
  // Session Updates
  updateSessionStatus,
  updateSessionError,
  updateSessionOpenCodeId,
  cleanupStaleAgentSessions,
  // Swarm Config
  getSwarmConfig,
  setSwarmConfig,
  // Swarm Processes
  registerSwarmProcess,
  updateSwarmProcess,
  getSwarmProcesses,
  removeSwarmProcess,
  getActiveSwarmCount,
  getActiveAgentCount,
  // Session Hierarchy
  getSessionWithParent,
  getChildSessions,
  getSessionChain,
  getSiblingSessions,
};

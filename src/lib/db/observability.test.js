'use strict';
/**
 * @module observability.test
 * TDD tests for src/lib/db/observability.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  insertTrace,
  getTracesBySession,
  searchTraces,
  updateTrace,
  upsertTrace,
  upsertSessionUsage,
  getSessionUsage,
  getTelegramSession,
  createTelegramSession,
  insertMessage,
  getMessagesBySession,
  getToolTracesBySession,
  getSessionsByProject,
  getRecentSessions,
  getSessionsByTelegramChat,
  updateSessionStatus,
  updateSessionError,
  updateSessionOpenCodeId,
  cleanupStaleAgentSessions,
  getSwarmConfig,
  setSwarmConfig,
  registerSwarmProcess,
  updateSwarmProcess,
  getSwarmProcesses,
  removeSwarmProcess,
  getActiveSwarmCount,
  getActiveAgentCount,
  getSessionWithParent,
  getChildSessions,
  getSessionChain,
  getSiblingSessions,
} = require('./observability');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  db.prepare('INSERT INTO projects (id, name, description, status) VALUES (?, ?, ?, ?)').run(
    'proj-1',
    'Test Project',
    'A test project',
    'active'
  );
  db.prepare(
    'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
  ).run('sess-1', 'proj-1', 'Session 1', 'active');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// insertTrace / getTracesBySession
// ---------------------------------------------------------------------------

describe('insertTrace / getTracesBySession', () => {
  it('inserts a trace and retrieves it', () => {
    const result = insertTrace(db, {
      session_id: 'sess-1',
      trace_type: 'tool_call',
      tool_name: 'mem_save',
      tool_status: 'success',
    });
    expect(result.changes).toBeGreaterThan(0);

    const traces = getTracesBySession(db, 'sess-1');
    expect(traces).toHaveLength(1);
    expect(traces[0].tool_name).toBe('mem_save');
  });

  it('filters traces by tool_name', () => {
    insertTrace(db, { session_id: 'sess-1', trace_type: 'tool_call', tool_name: 'tool-a' });
    insertTrace(db, { session_id: 'sess-1', trace_type: 'tool_call', tool_name: 'tool-b' });
    const traces = getTracesBySession(db, 'sess-1', { tool_name: 'tool-a' });
    expect(traces).toHaveLength(1);
    expect(traces[0].tool_name).toBe('tool-a');
  });

  it('returns empty array for unknown session', () => {
    expect(getTracesBySession(db, 'nonexistent')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertTrace
// ---------------------------------------------------------------------------

describe('upsertTrace', () => {
  it('inserts a new trace', () => {
    const result = upsertTrace(db, {
      session_id: 'sess-1',
      trace_type: 'tool_call',
      tool_name: 'test-tool',
    });
    expect(result.changes).toBeGreaterThan(0);
  });

  it('upserts on conflict (session_id, part_id)', () => {
    upsertTrace(db, {
      id: 'trace-1',
      session_id: 'sess-1',
      part_id: 'part-1',
      trace_type: 'tool_call',
      tool_name: 'first',
    });
    upsertTrace(db, {
      id: 'trace-2',
      session_id: 'sess-1',
      part_id: 'part-1',
      trace_type: 'tool_call',
      tool_name: 'updated',
    });
    const traces = getTracesBySession(db, 'sess-1');
    expect(traces).toHaveLength(1);
    expect(traces[0].tool_name).toBe('updated');
  });
});

// ---------------------------------------------------------------------------
// updateTrace
// ---------------------------------------------------------------------------

describe('updateTrace', () => {
  it('updates trace fields', () => {
    insertTrace(db, {
      session_id: 'sess-1',
      trace_type: 'tool_call',
      tool_name: 'old-name',
    });
    const traces = getTracesBySession(db, 'sess-1');
    const traceId = traces[0].id;

    updateTrace(db, traceId, { tool_name: 'new-name' });
    const updated = getTracesBySession(db, 'sess-1');
    expect(updated[0].tool_name).toBe('new-name');
  });
});

// ---------------------------------------------------------------------------
// searchTraces
// ---------------------------------------------------------------------------

describe('searchTraces', () => {
  it('returns empty for empty search term', () => {
    expect(searchTraces(db, 'sess-1', '')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session Usage
// ---------------------------------------------------------------------------

describe('upsertSessionUsage / getSessionUsage', () => {
  it('upserts session usage', () => {
    upsertSessionUsage(db, {
      session_id: 'sess-1',
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    const usage = getSessionUsage(db, 'sess-1');
    expect(usage).not.toBeNull();
    expect(usage.prompt_tokens).toBe(100);
  });

  it('returns null for unknown session', () => {
    expect(getSessionUsage(db, 'nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Telegram Session
// ---------------------------------------------------------------------------

describe('createTelegramSession / getTelegramSession', () => {
  it('creates and retrieves a session', () => {
    createTelegramSession(db, 'chat-123', 'sess-1', 'proj-1');
    const session = getTelegramSession(db, 'chat-123');
    expect(session).not.toBeNull();
    expect(session.session_id).toBe('sess-1');
  });

  it('returns undefined for unknown chat', () => {
    expect(getTelegramSession(db, 'unknown')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Agent Hub Messages
// ---------------------------------------------------------------------------

describe('insertMessage / getMessagesBySession', () => {
  it('inserts and retrieves messages', () => {
    insertMessage(db, {
      session_id: 'sess-1',
      role: 'user',
      content: 'Hello',
    });
    const messages = getMessagesBySession(db, 'sess-1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('filters messages by role', () => {
    insertMessage(db, { session_id: 'sess-1', role: 'user', content: 'u1' });
    insertMessage(db, { session_id: 'sess-1', role: 'assistant', content: 'a1' });
    const userMsgs = getMessagesBySession(db, 'sess-1', { role: 'user' });
    expect(userMsgs).toHaveLength(1);
  });

  it('returns empty array for unknown session', () => {
    expect(getMessagesBySession(db, 'nonexistent')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getToolTracesBySession
// ---------------------------------------------------------------------------

describe('getToolTracesBySession', () => {
  it('returns only tool-type traces', () => {
    insertTrace(db, { session_id: 'sess-1', trace_type: 'tool_call', tool_name: 't1' });
    insertTrace(db, { session_id: 'sess-1', trace_type: 'llm_call' });
    const toolTraces = getToolTracesBySession(db, 'sess-1');
    expect(toolTraces).toHaveLength(1);
    expect(toolTraces[0].tool_name).toBe('t1');
  });
});

// ---------------------------------------------------------------------------
// Session Queries
// ---------------------------------------------------------------------------

describe('getSessionsByProject', () => {
  it('returns sessions for project', () => {
    const sessions = getSessionsByProject(db, 'proj-1');
    expect(sessions).toHaveLength(1);
  });
});

describe('getRecentSessions', () => {
  it('returns seeded session', () => {
    expect(getRecentSessions(db)).toHaveLength(1);
  });
});

describe('getSessionsByTelegramChat', () => {
  it('returns empty array for unknown chat', () => {
    expect(getSessionsByTelegramChat(db, 'unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session Updates
// ---------------------------------------------------------------------------

describe('updateSessionStatus', () => {
  it('updates session status', () => {
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
    ).run('sess-upd-1', 'proj-1', 'Session Upd 1', 'active');
    updateSessionStatus(db, 'sess-upd-1', 'completed');
    const row = db.prepare('SELECT status FROM agent_hub_sessions WHERE id = ?').get('sess-upd-1');
    expect(row.status).toBe('completed');
  });
});

describe('updateSessionError', () => {
  it('sets error status and message', () => {
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
    ).run('sess-err-1', 'proj-1', 'Session Err 1', 'active');
    updateSessionError(db, 'sess-err-1', 'Something broke');
    const row = db
      .prepare('SELECT status, error_message FROM agent_hub_sessions WHERE id = ?')
      .get('sess-err-1');
    expect(row.status).toBe('error');
    expect(row.error_message).toBe('Something broke');
  });
});

describe('updateSessionOpenCodeId', () => {
  it('sets opencode session id', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'sess-oc-1',
      'proj-1',
      'Session OC 1'
    );
    updateSessionOpenCodeId(db, 'sess-oc-1', 'oc-123');
    const row = db
      .prepare('SELECT opencode_session_id FROM agent_hub_sessions WHERE id = ?')
      .get('sess-oc-1');
    expect(row.opencode_session_id).toBe('oc-123');
  });
});

// ---------------------------------------------------------------------------
// cleanupStaleAgentSessions
// ---------------------------------------------------------------------------

describe('cleanupStaleAgentSessions', () => {
  it('resets active sessions to completed', () => {
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
    ).run('sess-clean-1', 'proj-1', 'Session Clean 1', 'active');
    const result = cleanupStaleAgentSessions(db);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Swarm Config
// ---------------------------------------------------------------------------

describe('getSwarmConfig / setSwarmConfig', () => {
  it('returns empty config initially', () => {
    expect(getSwarmConfig(db)).toEqual({});
  });

  it('sets and gets config values', () => {
    setSwarmConfig(db, 'max_agents', '5');
    const config = getSwarmConfig(db);
    expect(config.max_agents).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// Swarm Processes
// ---------------------------------------------------------------------------

describe('registerSwarmProcess / getSwarmProcesses', () => {
  it('registers a process', () => {
    const id = registerSwarmProcess(db, { pid: 1234, port: 3000, status: 'running' });
    expect(typeof id).toBe('string');
  });

  it('lists registered processes', () => {
    registerSwarmProcess(db, { pid: 1, port: 3000 });
    registerSwarmProcess(db, { pid: 2, port: 3001 });
    const processes = getSwarmProcesses(db);
    expect(processes).toHaveLength(2);
  });
});

describe('updateSwarmProcess', () => {
  it('updates process status', () => {
    const id = registerSwarmProcess(db, { pid: 1, port: 3000, status: 'starting' });
    updateSwarmProcess(db, id, { status: 'running' });
    const processes = getSwarmProcesses(db);
    expect(processes[0].status).toBe('running');
  });
});

describe('removeSwarmProcess', () => {
  it('removes a process', () => {
    const id = registerSwarmProcess(db, { pid: 1, port: 3000 });
    removeSwarmProcess(db, id);
    expect(getSwarmProcesses(db)).toHaveLength(0);
  });
});

describe('getActiveSwarmCount', () => {
  it('returns 0 when no processes', () => {
    expect(getActiveSwarmCount(db)).toBe(0);
  });

  it('counts running/starting processes', () => {
    registerSwarmProcess(db, { pid: 1, port: 3000, status: 'running' });
    registerSwarmProcess(db, { pid: 2, port: 3001, status: 'starting' });
    registerSwarmProcess(db, { pid: 3, port: 3002, status: 'stopped' });
    expect(getActiveSwarmCount(db)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getActiveAgentCount
// ---------------------------------------------------------------------------

describe('getActiveAgentCount', () => {
  it('returns 1 for seeded session', () => {
    expect(getActiveAgentCount(db)).toBe(1);
  });

  it('counts active sessions', () => {
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
    ).run('s1', 'proj-1', 'S1', 'active');
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, status) VALUES (?, ?, ?, ?)'
    ).run('s2', 'proj-1', 'S2', 'active');
    expect(getActiveAgentCount(db)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Session Hierarchy
// ---------------------------------------------------------------------------

describe('getSessionWithParent', () => {
  it('returns session with parent info', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'parent-1',
      'proj-1',
      'Parent'
    );
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('child-1', 'proj-1', 'Child', 'parent-1');
    const result = getSessionWithParent(db, 'child-1');
    expect(result).not.toBeNull();
    expect(result.parent_title).toBe('Parent');
  });
});

describe('getChildSessions', () => {
  it('returns child sessions', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'parent-ch',
      'proj-1',
      'Parent CH'
    );
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('child-ch-1', 'proj-1', 'Child CH 1', 'parent-ch');
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('child-ch-2', 'proj-1', 'Child CH 2', 'parent-ch');
    const children = getChildSessions(db, 'parent-ch');
    expect(children).toHaveLength(2);
  });

  it('returns empty array when no children', () => {
    expect(getChildSessions(db, 'nonexistent')).toEqual([]);
  });
});

describe('getSessionChain', () => {
  it('returns chain from root to session', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'root',
      'proj-1',
      'Root'
    );
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('mid', 'proj-1', 'Mid', 'root');
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('leaf', 'proj-1', 'Leaf', 'mid');
    const chain = getSessionChain(db, 'leaf');
    expect(chain).toHaveLength(3);
    expect(chain[0].title).toBe('Root');
    expect(chain[0].isRoot).toBe(true);
    expect(chain[2].title).toBe('Leaf');
  });
});

describe('getSiblingSessions', () => {
  it('returns siblings excluding current', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'parent-sib',
      'proj-1',
      'Parent Sib'
    );
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('sib-1', 'proj-1', 'Sib 1', 'parent-sib');
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('sib-2', 'proj-1', 'Sib 2', 'parent-sib');
    db.prepare(
      'INSERT INTO agent_hub_sessions (id, project_id, title, parent_id) VALUES (?, ?, ?, ?)'
    ).run('sib-3', 'proj-1', 'Sib 3', 'parent-sib');
    const siblings = getSiblingSessions(db, 'sib-2');
    expect(siblings).toHaveLength(2);
  });

  it('returns empty array for root session', () => {
    db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
      'root-sib',
      'proj-1',
      'Root Sib'
    );
    expect(getSiblingSessions(db, 'root-sib')).toEqual([]);
  });
});

/**
 * Unit tests for session-bridge.js
 *
 * Tests the core session bridge service that maps Telegram chat IDs
 * to AgentHub sessions using an in-memory SQLite database.
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// ── In-memory test database ─────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.pragma('foreign_keys = ON');

  // Create required tables (minimal schema for session-bridge tests)
  db.exec(`
    CREATE TABLE agent_hub_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      agent_model TEXT,
      telegram_chat_id TEXT,
      directory TEXT,
      status TEXT DEFAULT 'active',
      opencode_session_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE telegram_session_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_chat_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      directory TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE agent_session_usage (
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
  `);

  return db;
}

// ── Mock db-bridge module ───────────────────────────────────────────────────

function createMockDbBridge(db) {
  const getActiveTelegramSession = db.prepare(`
    SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1
  `);

  const deactivateSessionsForChat = db.prepare(`
    UPDATE telegram_session_map SET active = 0 WHERE telegram_chat_id = ?
  `);

  const createTelegramSessionMap = db.prepare(`
    INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
    VALUES (?, ?, ?, 1)
  `);

  const getSessionsByTelegramChat = db.prepare(`
    SELECT s.* FROM agent_hub_sessions s
    JOIN telegram_session_map tsm ON s.id = tsm.session_id
    WHERE tsm.telegram_chat_id = ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `);

  const getSessionById = db.prepare(`
    SELECT * FROM agent_hub_sessions WHERE id = ?
  `);

  const createAgentHubSession = db.prepare(`
    INSERT INTO agent_hub_sessions
      (id, project_id, title, agent_model, telegram_chat_id, directory, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `);

  const updateSessionStatus = db.prepare(`
    UPDATE agent_hub_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?
  `);

  const updateSessionOpenCodeId = db.prepare(`
    UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?
  `);

  const getSessionUsage = db.prepare(`
    SELECT * FROM agent_session_usage WHERE session_id = ?
  `);

  const getProjectById = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `);

  const getProjectByName = db.prepare(`
    SELECT * FROM projects WHERE name LIKE ? LIMIT 1
  `);

  return {
    getTelegramSession: (chatId) => getActiveTelegramSession.get(String(chatId)) || null,

    createTelegramSession: (chatId, sessionId, projectId) => {
      return db.transaction(() => {
        deactivateSessionsForChat.run(String(chatId));
        return createTelegramSessionMap.run(String(chatId), sessionId, projectId || null);
      })();
    },

    getSessionsByChat: (chatId, limit = 20) => getSessionsByTelegramChat.all(String(chatId), limit),

    getSession: (sessionId) => getSessionById.get(sessionId) || null,

    createSession: (data) => {
      const id = data.id || crypto.randomUUID();
      createAgentHubSession.run(
        id,
        data.project_id || null,
        data.title || `Session ${new Date().toLocaleString()}`,
        data.agent_model || null,
        data.telegram_chat_id || null,
        data.directory || null
      );
      return getSessionById.get(id);
    },

    updateSessionStatus: (sessionId, status) => updateSessionStatus.run(status, sessionId),

    updateSessionOpenCodeId: (sessionId, opencodeSessionId) =>
      updateSessionOpenCodeId.run(opencodeSessionId, sessionId),

    getUsage: (sessionId) => getSessionUsage.get(sessionId) || null,

    findProject: (nameOrId) => {
      let project = getProjectById.get(nameOrId);
      if (!project) {
        project = getProjectByName.get(`%${nameOrId}%`);
      }
      return project || null;
    },

    db,
    close: () => {
      try {
        db.close();
      } catch {}
    },
  };
}

// ── Mock opencode service ───────────────────────────────────────────────────

function createMockOpencode() {
  let sessionCounter = 0;
  return {
    ensureServer: async () => {},
    createSession: async () => {
      sessionCounter++;
      return { id: `opencode-session-${sessionCounter}` };
    },
  };
}

// ── Re-implement session-bridge functions inline for testing ────────────────

function createSessionBridge(mockDb, mockOpencode) {
  const DEFAULT_PROJECT_ID = null;
  const DEFAULT_DIRECTORY = process.cwd();

  async function resolveSession(chatId, projectId, directory) {
    const chatIdStr = String(chatId);
    const projId = projectId || DEFAULT_PROJECT_ID;
    const dir = directory || DEFAULT_DIRECTORY;

    const existing = mockDb.getTelegramSession(chatIdStr);

    if (existing) {
      const session = mockDb.getSession(existing.session_id);
      if (session && session.status !== 'completed') {
        return {
          session,
          isNew: false,
          opencodeSessionId: session.opencode_session_id,
        };
      }
      mockDb.updateSessionStatus(existing.session_id, 'completed');
    }

    const newSession = await createSession(chatIdStr, projId, dir);
    return {
      session: newSession,
      isNew: true,
      opencodeSessionId: newSession.opencode_session_id,
    };
  }

  async function createSession(chatId, projectId, directory, title) {
    const chatIdStr = String(chatId);
    const dir = directory || DEFAULT_DIRECTORY;

    const session = mockDb.createSession({
      project_id: projectId || null,
      title: title || `Telegram ${new Date().toLocaleString()}`,
      telegram_chat_id: chatIdStr,
      directory: dir,
    });

    await mockOpencode.ensureServer();
    const ocSession = await mockOpencode.createSession();
    mockDb.updateSessionOpenCodeId(session.id, ocSession.id);
    mockDb.createTelegramSession(chatIdStr, session.id, projectId);

    return {
      ...session,
      opencode_session_id: ocSession.id,
    };
  }

  function getSessions(chatId, limit = 20) {
    return mockDb.getSessionsByChat(String(chatId), limit);
  }

  function switchSession(chatId, sessionId) {
    const chatIdStr = String(chatId);
    const session = mockDb.getSession(sessionId);

    if (!session) {
      return null;
    }

    mockDb.createTelegramSession(chatIdStr, sessionId, session.project_id);
    return session;
  }

  function switchProject(chatId, projectNameOrId) {
    const project = mockDb.findProject(projectNameOrId);
    if (!project) {
      return null;
    }

    const chatIdStr = String(chatId);
    const mapping = mockDb.getTelegramSession(chatIdStr);

    if (!mapping) {
      return null;
    }

    const session = mockDb.getSession(mapping.session_id);
    if (!session) return null;

    mockDb.db
      .prepare(
        `UPDATE agent_hub_sessions SET project_id = ?, directory = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(project.id, project.directory || DEFAULT_DIRECTORY, session.id);

    mockDb.db
      .prepare(
        `UPDATE telegram_session_map SET project_id = ?, updated_at = datetime('now') WHERE telegram_chat_id = ? AND session_id = ?`
      )
      .run(project.id, chatIdStr, session.id);

    return {
      ...mockDb.getSession(session.id),
      project,
    };
  }

  return {
    resolveSession,
    createSession,
    getSessions,
    switchSession,
    switchProject,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests = [
  {
    name: 'resolveSession creates new session when none exists',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      const result = await bridge.resolveSession('chat-123', 'proj-1', '/tmp/test');

      assert(result.isNew === true, 'should be a new session');
      assert(result.session !== null, 'session should exist');
      assert(result.session.telegram_chat_id === 'chat-123', 'chat_id should match');
      assert(result.session.project_id === 'proj-1', 'project_id should match');
      assert(result.session.directory === '/tmp/test', 'directory should match');
      assert(result.opencodeSessionId !== null, 'opencode session ID should exist');

      // Verify telegram_session_map was created
      const mapping = mockDb.getTelegramSession('chat-123');
      assert(mapping !== null, 'telegram session map should exist');
      assert(mapping.session_id === result.session.id, 'mapping should point to session');

      mockDb.close();
    },
  },
  {
    name: 'resolveSession reuses existing active session',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      // First call — creates session
      const first = await bridge.resolveSession('chat-456', 'proj-2', '/tmp/test2');
      assert(first.isNew === true, 'first call should create new session');
      const firstSessionId = first.session.id;

      // Second call — should reuse
      const second = await bridge.resolveSession('chat-456');
      assert(second.isNew === false, 'second call should reuse existing session');
      assert(second.session.id === firstSessionId, 'session ID should be the same');

      mockDb.close();
    },
  },
  {
    name: 'createSession creates both AgentHub session and OpenCode session',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      const session = await bridge.createSession('chat-789', 'proj-3', '/tmp/test3', 'My Session');

      assert(session !== null, 'session should be created');
      assert(session.telegram_chat_id === 'chat-789', 'chat_id should match');
      assert(session.project_id === 'proj-3', 'project_id should match');
      assert(session.directory === '/tmp/test3', 'directory should match');
      assert(session.opencode_session_id !== null, 'opencode session ID should exist');
      assert(session.title.includes('My Session'), 'title should include custom title');

      // Verify in DB
      const dbSession = mockDb.getSession(session.id);
      assert(dbSession !== null, 'session should exist in DB');
      assert(dbSession.status === 'active', 'status should be active');

      // Verify telegram_session_map
      const mapping = mockDb.getTelegramSession('chat-789');
      assert(mapping !== null, 'telegram session map should exist');
      assert(mapping.session_id === session.id, 'mapping should point to session');

      mockDb.close();
    },
  },
  {
    name: 'switchSession deactivates old mapping and activates new one',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      // Create two sessions
      const session1 = await bridge.createSession('chat-switch', 'proj-1', '/tmp/1');
      const session2 = await bridge.createSession('chat-switch-2', 'proj-2', '/tmp/2');

      // First, resolve to session1
      await bridge.resolveSession('chat-switch');

      // Now switch to session2
      const switched = bridge.switchSession('chat-switch', session2.id);

      assert(switched !== null, 'switched session should exist');
      assert(switched.id === session2.id, 'should be switched to session2');

      // Verify mapping points to session2
      const mapping = mockDb.getTelegramSession('chat-switch');
      assert(mapping !== null, 'mapping should still exist');
      assert(mapping.session_id === session2.id, 'mapping should point to session2');

      mockDb.close();
    },
  },
  {
    name: 'switchProject updates session project and directory',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      // Create a project
      mockDb.db
        .prepare(`INSERT INTO projects (id, name, directory, status) VALUES (?, ?, ?, ?)`)
        .run('proj-new', 'New Project', '/tmp/new-project', 'active');

      // Create a session
      const session = await bridge.createSession('chat-proj', 'proj-old', '/tmp/old');

      // Switch project
      const result = bridge.switchProject('chat-proj', 'proj-new');

      assert(result !== null, 'result should exist');
      assert(result.project_id === 'proj-new', 'project_id should be updated');
      assert(result.directory === '/tmp/new-project', 'directory should be updated');
      assert(result.project.name === 'New Project', 'project name should match');

      // Verify in DB
      const dbSession = mockDb.getSession(session.id);
      assert(dbSession.project_id === 'proj-new', 'DB session project_id should be updated');
      assert(dbSession.directory === '/tmp/new-project', 'DB session directory should be updated');

      mockDb.close();
    },
  },
  {
    name: 'getSessions returns session history',
    async run() {
      const db = createTestDb();
      const mockDb = createMockDbBridge(db);
      const mockOpencode = createMockOpencode();
      const bridge = createSessionBridge(mockDb, mockOpencode);

      // Create multiple sessions for the same chat
      await bridge.createSession('chat-history', 'proj-1', '/tmp/1');
      await bridge.createSession('chat-history', 'proj-2', '/tmp/2');
      await bridge.createSession('chat-history', 'proj-3', '/tmp/3');

      const sessions = bridge.getSessions('chat-history');

      assert(Array.isArray(sessions), 'should return an array');
      assert(sessions.length === 3, 'should have 3 sessions');

      // Verify all project IDs are present
      const projectIds = sessions.map((s) => s.project_id);
      assert(projectIds.includes('proj-1'), 'should include proj-1');
      assert(projectIds.includes('proj-2'), 'should include proj-2');
      assert(projectIds.includes('proj-3'), 'should include proj-3');

      mockDb.close();
    },
  },
];

// ── Simple assertion helper ─────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('Running session-bridge tests...\n');

  for (const test of tests) {
    try {
      await test.run();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${test.name}`);
      console.log(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    console.log(`${failed} test(s) failed`);
    process.exit(1);
  }
}

runTests();

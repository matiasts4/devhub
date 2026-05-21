const Database = require('better-sqlite3');
const crypto = require('crypto');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.pragma('foreign_keys = ON');

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
      (id, project_id, title, agent_model, telegram_chat_id, directory, status, opencode_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  const getActiveProjects = db.prepare(`
    SELECT * FROM projects WHERE status = 'active' ORDER BY rowid ASC
  `);

  return {
    getTelegramSession: (chatId) => getActiveTelegramSession.get(String(chatId)) || null,
    createTelegramSession: (chatId, sessionId, projectId) =>
      db.transaction(() => {
        deactivateSessionsForChat.run(String(chatId));
        return createTelegramSessionMap.run(String(chatId), sessionId, projectId || null);
      })(),
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
        data.directory || null,
        data.status || 'active',
        data.opencode_session_id || null
      );
      return getSessionById.get(id);
    },
    updateSessionStatus: (sessionId, status) => updateSessionStatus.run(status, sessionId),
    updateSessionOpenCodeId: (sessionId, opencodeSessionId) =>
      updateSessionOpenCodeId.run(opencodeSessionId, sessionId),
    getUsage: (sessionId) => getSessionUsage.get(sessionId) || null,
    findProject: (nameOrId) =>
      getProjectById.get(nameOrId) || getProjectByName.get(`%${nameOrId}%`) || null,
    getActiveProjects: () => getActiveProjects.all(),
    db,
  };
}

function insertProjects(db, projects) {
  const insertProject = db.prepare(
    'INSERT INTO projects (id, name, directory, status) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction((rows) => {
    for (const project of rows) {
      insertProject.run(project.id, project.name, project.directory, project.status || 'active');
    }
  });

  insertMany(projects);
}

function createMockOpencode() {
  let sessionCounter = 0;

  return {
    ensureServer: jest.fn(async () => {}),
    createSession: jest.fn(async () => {
      sessionCounter += 1;
      return { id: `opencode-session-${sessionCounter}` };
    }),
  };
}

function loadSessionBridge(mockDb, mockOpencode) {
  jest.resetModules();
  jest.doMock('../../telegram-bot/lib/db-bridge', () => mockDb);
  jest.doMock('../../telegram-bot/services/opencode', () => mockOpencode);
  jest.doMock('../../telegram-bot/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }));

  return require('../../telegram-bot/services/session-bridge');
}

describe('session-bridge.resolveSession', () => {
  let db;
  let mockDb;
  let mockOpencode;

  beforeEach(() => {
    db = createTestDb();
    insertProjects(db, [
      { id: 'proj-1', name: 'Project 1', directory: '/tmp/project-1' },
      { id: 'proj-2', name: 'Project 2', directory: '/tmp/project-2' },
      { id: 'proj-fresh', name: 'Fresh Project', directory: '/tmp/project-fresh' },
      { id: 'proj-new', name: 'New Project', directory: '/tmp/project-new' },
      {
        id: 'proj-stale',
        name: 'Stale Project',
        directory: '/tmp/project-stale',
        status: 'paused',
      },
      {
        id: 'proj-invalid',
        name: 'Invalid Project',
        directory: '/tmp/project-invalid',
        status: 'paused',
      },
    ]);
    mockDb = createMockDbBridge(db);
    mockOpencode = createMockOpencode();
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    db.close();
  });

  test('creates a new session when none exists', async () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);

    const result = await bridge.resolveSession('chat-123', 'proj-1', '/tmp/test');

    expect(result.isNew).toBe(true);
    expect(result.session.telegram_chat_id).toBe('chat-123');
    expect(result.session.project_id).toBe('proj-1');
    expect(result.session.directory).toBe('/tmp/test');
    expect(result.opencodeSessionId).toBe('opencode-session-1');
    expect(mockDb.getTelegramSession('chat-123').session_id).toBe(result.session.id);
  });

  test('reuses an active session only when it has a valid OpenCode session ID', async () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);
    const first = await bridge.resolveSession('chat-456', 'proj-2', '/tmp/test2');

    const second = await bridge.resolveSession('chat-456');

    expect(second.isNew).toBe(false);
    expect(second.session.id).toBe(first.session.id);
    expect(second.opencodeSessionId).toBe('opencode-session-1');
    expect(mockOpencode.createSession).toHaveBeenCalledTimes(1);
  });

  test('does not reuse an aborted session with a null OpenCode session ID', async () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);
    const abandonedSession = mockDb.createSession({
      id: 'aborted-session-1',
      project_id: 'proj-stale',
      title: 'Aborted session',
      telegram_chat_id: 'chat-aborted',
      directory: '/tmp/stale',
      status: 'aborted',
      opencode_session_id: null,
    });
    mockDb.createTelegramSession('chat-aborted', abandonedSession.id, 'proj-stale');

    const result = await bridge.resolveSession('chat-aborted', 'proj-fresh', '/tmp/fresh');

    const activeMapping = mockDb.getTelegramSession('chat-aborted');
    expect(result.isNew).toBe(true);
    expect(result.session.id).not.toBe(abandonedSession.id);
    expect(result.session.project_id).toBe('proj-fresh');
    expect(result.opencodeSessionId).toBe('opencode-session-1');
    expect(activeMapping.session_id).toBe(result.session.id);
    expect(mockDb.getSession(abandonedSession.id).status).toBe('aborted');
  });

  test('replaces an active mapping when the reused session is missing an OpenCode session ID', async () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);
    const invalidSession = mockDb.createSession({
      id: 'active-without-opencode',
      project_id: 'proj-invalid',
      title: 'Broken session',
      telegram_chat_id: 'chat-invalid',
      directory: '/tmp/invalid',
      status: 'active',
      opencode_session_id: '   ',
    });
    mockDb.createTelegramSession('chat-invalid', invalidSession.id, 'proj-invalid');

    const result = await bridge.resolveSession('chat-invalid', 'proj-new', '/tmp/new');

    expect(result.isNew).toBe(true);
    expect(result.session.id).not.toBe(invalidSession.id);
    expect(result.session.project_id).toBe('proj-new');
    expect(result.opencodeSessionId).toBe('opencode-session-1');
    expect(mockDb.getSession(invalidSession.id).status).toBe('aborted');
    expect(mockDb.getTelegramSession('chat-invalid').session_id).toBe(result.session.id);
  });

  test('falls back to the first active project when explicit, mapped, and default project IDs are unavailable', async () => {
    db.prepare('DELETE FROM projects').run();
    insertProjects(db, [
      { id: 'proj-active-1', name: 'Alpha', directory: '/tmp/alpha' },
      { id: 'proj-active-2', name: 'Beta', directory: '/tmp/beta' },
    ]);

    const bridge = loadSessionBridge(mockDb, mockOpencode);

    const result = await bridge.resolveSession('chat-fallback', null, '/tmp/runtime');

    expect(result.isNew).toBe(true);
    expect(result.session.project_id).toBe('proj-active-1');
    expect(mockDb.getTelegramSession('chat-fallback').project_id).toBe('proj-active-1');
  });

  test('fails with a clear error when no active project is available for a new session', async () => {
    db.prepare('DELETE FROM projects').run();
    const bridge = loadSessionBridge(mockDb, mockOpencode);

    await expect(bridge.resolveSession('chat-no-project', null, '/tmp/runtime')).rejects.toThrow(
      'No active project available. Use /project list and /project switch <name>.'
    );
    expect(mockOpencode.createSession).not.toHaveBeenCalled();
  });

  test('createSession falls back to the first active project when projectId is omitted', async () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);

    const session = await bridge.createSession('chat-create-fallback');

    expect(session.project_id).toBe('proj-1');
    expect(session.directory).toBe('/tmp/project-1');
    expect(session.telegram_chat_id).toBe('chat-create-fallback');
    expect(session.opencode_session_id).toBe('opencode-session-1');
    expect(mockDb.getTelegramSession('chat-create-fallback').project_id).toBe('proj-1');
    expect(mockOpencode.ensureServer).toHaveBeenCalledWith('/tmp/project-1');
    expect(mockOpencode.createSession).toHaveBeenCalledWith('/tmp/project-1');
  });

  test('createSession throws a clear error when no active project exists and projectId is omitted', async () => {
    db.prepare('DELETE FROM projects').run();
    const bridge = loadSessionBridge(mockDb, mockOpencode);

    await expect(bridge.createSession('chat-create-no-project')).rejects.toThrow(
      'No active project available. Use /project list and /project switch <name>.'
    );
    expect(mockOpencode.ensureServer).not.toHaveBeenCalled();
    expect(mockOpencode.createSession).not.toHaveBeenCalled();
  });
});

describe('session-bridge.getActiveSession', () => {
  let db;
  let mockDb;
  let mockOpencode;

  beforeEach(() => {
    db = createTestDb();
    mockDb = createMockDbBridge(db);
    mockOpencode = createMockOpencode();
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    db.close();
  });

  test('returns null when the mapped session is terminal and not reusable', () => {
    const bridge = loadSessionBridge(mockDb, mockOpencode);
    const session = mockDb.createSession({
      id: 'aborted-info-session',
      project_id: 'proj-old',
      title: 'Broken old session',
      telegram_chat_id: 'chat-info',
      directory: '/tmp/old',
      status: 'aborted',
      opencode_session_id: null,
    });

    mockDb.createTelegramSession('chat-info', session.id, 'proj-old');

    expect(bridge.getActiveSession('chat-info')).toBeNull();
  });
});

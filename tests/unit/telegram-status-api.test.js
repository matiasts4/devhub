const Database = require('better-sqlite3');

const mockGetDb = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  __esModule: true,
  default: {
    getDb: mockGetDb,
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

const { GET } = require('../../src/app/api/telegram/status/route');

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE telegram_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE telegram_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      event_type TEXT,
      direction TEXT,
      source TEXT,
      status TEXT DEFAULT 'ok',
      content_preview TEXT,
      metadata TEXT,
      command TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      agent_name TEXT,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      status TEXT DEFAULT 'ok',
      message TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertAgentLog(db, { eventType, toolName = null, secsAgo = 0 }) {
  db.prepare(
    `
      INSERT INTO agent_logs (event_type, tool_name, created_at)
      VALUES (?, ?, datetime('now', ? || ' seconds'))
    `
  ).run(eventType, toolName, String(-secsAgo));
}

describe('GET /api/telegram/status', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    mockGetDb.mockReset();
    db.close();
  });

  it('returns additive busy fields without breaking legacy fields', async () => {
    insertAgentLog(db, { eventType: 'session_busy', secsAgo: 5 });
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'bash', secsAgo: 2 });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      bot_connected: false,
      active_chats: 0,
      total_sessions: 0,
      last_activity: null,
      last_event_type: null,
      recent_errors: 0,
      is_busy: true,
      current_tool: 'bash',
    });
  });

  it('returns idle status and null current_tool when no recent busy logs exist', async () => {
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'bash', secsAgo: 60 });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe('bash');
  });

  it('returns HTTP 200 with false/null when agent_logs is empty', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe(null);
  });

  it('returns the most recent tool_name when multiple tool events exist', async () => {
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'old_tool', secsAgo: 30 });
    insertAgentLog(db, { eventType: 'tool_start', toolName: 'new_tool', secsAgo: 1 });

    const response = await GET();
    const body = await response.json();

    expect(body.current_tool).toBe('new_tool');
    expect(body.is_busy).toBe(true);
  });
});

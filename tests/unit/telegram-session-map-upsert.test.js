const ActualDatabase = require('better-sqlite3');
const crypto = require('crypto');

function uniqueId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function insertSession(db, sessionId, projectId) {
  db.prepare('INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)').run(
    sessionId,
    projectId,
    `Session ${sessionId}`
  );
}

function loadLocalDbModule() {
  let localDb;

  jest.resetModules();
  jest.doMock('better-sqlite3', () => {
    return jest.fn(() => {
      const db = new ActualDatabase(':memory:');
      db.pragma('journal_mode = MEMORY');
      db.pragma('foreign_keys = ON');
      return db;
    });
  });

  jest.isolateModules(() => {
    localDb = require('../../src/lib/db/localDb');
  });

  return { localDb, db: localDb.getDb() };
}

function loadTelegramDbBridge() {
  let bridge;

  jest.resetModules();
  jest.doMock('better-sqlite3', () => {
    return jest.fn(() => {
      const db = new ActualDatabase(':memory:');
      db.pragma('journal_mode = MEMORY');
      db.pragma('foreign_keys = ON');
      return db;
    });
  });

  jest.isolateModules(() => {
    bridge = require('../../telegram-bot/lib/db-bridge');
  });

  return { bridge, db: bridge.db };
}

describe('telegram session map upsert behavior', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('better-sqlite3');
  });

  test('localDb.createTelegramSession reuses the single chat row when switching sessions', () => {
    const { localDb, db } = loadLocalDbModule();
    const firstSessionId = uniqueId('session-local-1');
    const secondSessionId = uniqueId('session-local-2');

    insertSession(db, firstSessionId, 'proj-local-1');
    insertSession(db, secondSessionId, 'proj-local-2');

    localDb.createTelegramSession('chat-local', firstSessionId, 'proj-local-1');
    db.prepare(
      "UPDATE telegram_session_map SET active = 0, updated_at = '2000-01-01 00:00:00' WHERE telegram_chat_id = ?"
    ).run('chat-local');

    expect(() =>
      localDb.createTelegramSession('chat-local', secondSessionId, 'proj-local-2')
    ).not.toThrow();

    const rows = db
      .prepare(
        'SELECT telegram_chat_id, session_id, project_id, active, updated_at FROM telegram_session_map WHERE telegram_chat_id = ?'
      )
      .all('chat-local');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      telegram_chat_id: 'chat-local',
      session_id: secondSessionId,
      project_id: 'proj-local-2',
      active: 1,
    });
    expect(rows[0].updated_at).not.toBe('2000-01-01 00:00:00');
    expect(localDb.getTelegramSession('chat-local').session_id).toBe(secondSessionId);

    localDb.closeDb();
  });

  test('telegram bot db-bridge createTelegramSession overwrites the active mapping for the same chat', () => {
    const { bridge, db } = loadTelegramDbBridge();
    const firstSessionId = uniqueId('session-bridge-1');
    const secondSessionId = uniqueId('session-bridge-2');

    insertSession(db, firstSessionId, 'proj-bridge-1');
    insertSession(db, secondSessionId, 'proj-bridge-2');

    bridge.createTelegramSession('chat-bridge', firstSessionId, 'proj-bridge-1');
    db.prepare(
      "UPDATE telegram_session_map SET active = 0, updated_at = '2000-01-01 00:00:00' WHERE telegram_chat_id = ?"
    ).run('chat-bridge');

    expect(() =>
      bridge.createTelegramSession('chat-bridge', secondSessionId, 'proj-bridge-2')
    ).not.toThrow();

    const rows = db
      .prepare(
        'SELECT telegram_chat_id, session_id, project_id, active, updated_at FROM telegram_session_map WHERE telegram_chat_id = ?'
      )
      .all('chat-bridge');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      telegram_chat_id: 'chat-bridge',
      session_id: secondSessionId,
      project_id: 'proj-bridge-2',
      active: 1,
    });
    expect(rows[0].updated_at).not.toBe('2000-01-01 00:00:00');
    expect(bridge.getTelegramSession('chat-bridge').session_id).toBe(secondSessionId);

    bridge.close();
  });
});

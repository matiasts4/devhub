/* eslint-env node */

const {
  formatDirectiveForInjection,
  deliverInboxRow,
  waitForOpencodeReady,
} = require('../inboxConsume.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

describe('inboxConsume', () => {
  test('formatDirectiveForInjection expands delegate JSON', () => {
    const body = JSON.stringify({
      kind: 'delegate',
      change: 'terminal-fix',
      task_id: 'task-1',
      instruction: 'Fix glyph corruption',
    });
    const out = formatDirectiveForInjection(body, 'zed', 'sdd_worker_1');
    expect(out).toContain('[zed → sdd_worker_1]');
    expect(out).toContain('Change: terminal-fix');
    expect(out).toContain('Task: task-1');
    expect(out).toContain('Fix glyph corruption');
    expect(out).toContain('/sdd-continue');
    expect(out).toContain('_devhub_chat --to zed');
    expect(out).toContain('B3, V3, C1, D2');
  });

  test('formatDirectiveForInjection passes through plain text', () => {
    expect(formatDirectiveForInjection('ping test', 'zed', 'sdd_worker_2')).toBe(
      '[zed → sdd_worker_2] ping test'
    );
  });

  test('waitForOpencodeReady returns true when marker exists', () => {
    const session = `test-ready-${Date.now()}`;
    const marker = `/tmp/devhub-opencode-ready-${session}`;
    fs.writeFileSync(marker, '1');
    try {
      expect(waitForOpencodeReady(session, 2000)).toBe(true);
    } finally {
      fs.rmSync(marker, { force: true });
    }
  });

  test('waitForOpencodeReady accepts viewport-ready marker as fallback', () => {
    const session = `test-viewport-${Date.now()}`;
    const marker = `/tmp/devhub-viewport-ready-${session}`;
    fs.writeFileSync(marker, '{"cols":120,"rows":32}');
    try {
      expect(waitForOpencodeReady(session, 2000)).toBe(true);
    } finally {
      fs.rmSync(marker, { force: true });
    }
  });

  test('deliverInboxRow defers when TUI not ready', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-deliver-'));
    const dbPath = path.join(dir, 'test.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE team_inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        to_role TEXT NOT NULL,
        from_role TEXT,
        body TEXT NOT NULL,
        body_hash TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE team_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        source_role TEXT NOT NULL,
        kind TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        payload_json TEXT
      );
      CREATE TABLE team_chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        from_role TEXT NOT NULL,
        to_role TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        body_hash TEXT NOT NULL,
        client_event_id TEXT
      );
    `);
    db.prepare(
      `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
       VALUES (?, ?, ?, ?, ?)`
    ).run('m1', 'sdd_worker_1', 'zed', 'hello', 'hash1');

    const row = db
      .prepare('SELECT * FROM team_inbox WHERE mission_id = ? AND to_role = ?')
      .get('m1', 'sdd_worker_1');

    const result = deliverInboxRow({
      db,
      withBusyRetry: (fn) => fn(),
      row,
      targetSession: 'missing-session-no-ready-marker',
      missionId: 'm1',
      toRole: 'sdd_worker_1',
      tuiWaitMs: 300,
      skipTuiWait: false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('tui_not_ready');
    const after = db.prepare('SELECT consumed_at FROM team_inbox WHERE id = ?').get(row.id);
    expect(after.consumed_at).toBeNull();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

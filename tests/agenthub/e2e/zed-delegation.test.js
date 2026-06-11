/**
 * E2E-style integration: ZED delegate → inbox delivery → ACK/event trail.
 */
/* eslint-env node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  formatDirectiveForInjection,
  deliverInboxRow,
} = require('../../../src/lib/bus/inboxConsume.js');

describe('ZED delegation pipeline (bus layer)', () => {
  test('delegate JSON formats to actionable worker prompt', () => {
    const body = JSON.stringify({
      kind: 'delegate',
      change: 'terminal-fix',
      task_id: 'task-42',
      instruction: 'Investigate glyph corruption',
    });
    const formatted = formatDirectiveForInjection(body, 'zed', 'sdd_worker_1');
    expect(formatted).toContain('Change: terminal-fix');
    expect(formatted).toContain('Task: task-42');
    expect(formatted).toContain('Investigate glyph corruption');
  });

  test('deliverInboxRow writes inbox_delivered event and ACK on success', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-delegation-'));
    const dbPath = path.join(dir, 'bus.db');
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
    ).run(
      'launch-e2e',
      'sdd_worker_1',
      'zed',
      JSON.stringify({ kind: 'delegate', change: 'e2e-change', instruction: 'run sdd' }),
      'hash-e2e'
    );
    const row = db.prepare('SELECT * FROM team_inbox WHERE mission_id = ?').get('launch-e2e');

    const targetSession = 'devhub-swarm-launch-e2e-sdd_worker_1';
    fs.writeFileSync(`/tmp/devhub-opencode-ready-${targetSession}`, '1');

    const result = deliverInboxRow({
      db,
      withBusyRetry: (fn) => fn(),
      row,
      targetSession,
      missionId: 'launch-e2e',
      toRole: 'sdd_worker_1',
      skipTuiWait: true,
    });

    expect(result.ok).toBe(true);
    const event = db
      .prepare("SELECT kind FROM team_events WHERE mission_id = ? AND kind = 'inbox_delivered'")
      .get('launch-e2e');
    expect(event?.kind).toBe('inbox_delivered');
    const ack = db
      .prepare("SELECT kind, to_role FROM team_chat WHERE mission_id = ? AND kind = 'ack'")
      .get('launch-e2e');
    expect(ack?.to_role).toBe('zed');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(`/tmp/devhub-opencode-ready-${targetSession}`, { force: true });
  });
});

/* eslint-env node, jest */
/**
 * T-013a — TCT-DELTA mirror helper tests.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/team-chat-targeting/spec.md
 *   - TCT-DELTA-S7: DEVHUB_INBOX_SHIM_DISABLED env var bypasses the shim
 *   - TCT-DELTA-S4: _devhub_chat mirror to pending_deliveries
 *
 * The shim mirror logic that used to live INLINE in devhub-bus.js's
 * `cmdChatWrite` is now centralized in `tct.mirrorChatToLegacy(db, env, msg)`.
 * This test exercises the helper in isolation:
 *
 *   1. mirrorChatToLegacy({DEVHUB_INBOX_SHIM_DISABLED='true'}) → skipped
 *   2. mission not in swarm_missions → skipped (no FK error)
 *   3. mission in swarm_missions AND legacy tables present → writes rows
 *   4. legacy tables missing → skipped (graceful no-op)
 *   5. toRole='all' → recipient_agent_id is "<missionId>-broadcast"
 *
 * Returns never throw. Always a result object.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tct = require('../../bus/shim/tct.js');

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-tct-mirror-'));
  const dbPath = path.join(dir, 'm.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  // Minimal legacy schema (no FK to swarm_missions in this fixture)
  db.exec(`
    CREATE TABLE IF NOT EXISTS mission_messages (
      message_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL,
      sender_agent_id TEXT NOT NULL, message_kind TEXT NOT NULL,
      body_summary TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS message_deliveries (
      delivery_id TEXT PRIMARY KEY, message_id TEXT NOT NULL,
      recipient_agent_id TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL, delivery_ref TEXT, evidence_ref TEXT,
      last_error TEXT, attempt_count INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT, acked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return { dir, dbPath, db };
}

const BASE_MSG = {
  missionId: 'm1',
  fromRole: 'auditor',
  toRole: 'worker',
  body: 'hello',
  bodyHash: 'h-1',
  kind: 'chat',
};

describe('T-013a — TCT mirrorChatToLegacy helper', () => {
  test('skipped=shim_disabled when DEVHUB_INBOX_SHIM_DISABLED=true; no inserts', () => {
    const { dir, db } = makeTempDb();
    try {
      const out = tct.mirrorChatToLegacy(db, { DEVHUB_INBOX_SHIM_DISABLED: 'true' }, BASE_MSG);
      expect(out).toEqual({ skipped: 'shim_disabled' });
      const cnt = db.prepare('SELECT count(*) AS n FROM mission_messages').get().n;
      expect(cnt).toBe(0);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skipped=mission_not_registered when swarm_missions lacks the mission; no inserts; no FK error thrown', () => {
    const { dir, db } = makeTempDb();
    try {
      // swarm_missions exists but does NOT contain 'm1'
      db.exec(`CREATE TABLE swarm_missions (mission_id TEXT PRIMARY KEY, status TEXT)`);
      const out = tct.mirrorChatToLegacy(db, {}, BASE_MSG);
      expect(out).toEqual({ skipped: 'mission_not_registered' });
      const msgCount = db.prepare('SELECT count(*) AS n FROM mission_messages').get().n;
      const delivCount = db.prepare('SELECT count(*) AS n FROM message_deliveries').get().n;
      expect(msgCount).toBe(0);
      expect(delivCount).toBe(0);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('success: writes mission_messages + message_deliveries when mission is registered', () => {
    const { dir, db } = makeTempDb();
    try {
      db.exec(`CREATE TABLE swarm_missions (mission_id TEXT PRIMARY KEY, status TEXT)`);
      db.prepare('INSERT INTO swarm_missions (mission_id, status) VALUES (?, ?)').run(
        'm1',
        'active'
      );
      const out = tct.mirrorChatToLegacy(db, {}, BASE_MSG);
      expect(out.skipped).toBeUndefined();
      expect(typeof out.message_id).toBe('string');
      expect(out.message_id).toMatch(/^mm-/);
      expect(out.delivery_id).toMatch(/^del-/);
      expect(out.recipient_agent_id).toBe('worker');

      // Rows are durable
      const msg = db
        .prepare('SELECT * FROM mission_messages WHERE message_id = ?')
        .get(out.message_id);
      expect(msg).toBeDefined();
      expect(msg.body_summary).toBe('hello');
      expect(msg.sender_agent_id).toBe('auditor');
      expect(msg.message_kind).toBe('chat');

      const deliv = db
        .prepare('SELECT * FROM message_deliveries WHERE delivery_id = ?')
        .get(out.delivery_id);
      expect(deliv).toBeDefined();
      expect(deliv.recipient_agent_id).toBe('worker');
      expect(deliv.status).toBe('pending');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skipped=no_legacy_tables when mission_messages/message_deliveries missing; never throws', () => {
    const { dir, db } = makeTempDb();
    try {
      // Drop legacy tables
      db.exec(`DROP TABLE mission_messages; DROP TABLE message_deliveries;`);
      const out = tct.mirrorChatToLegacy(db, {}, BASE_MSG);
      expect(out).toEqual({ skipped: 'no_legacy_tables' });
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('toRole=all → recipient_agent_id is "<missionId>-broadcast" (broadcast projection)', () => {
    const { dir, db } = makeTempDb();
    try {
      db.exec(`CREATE TABLE swarm_missions (mission_id TEXT PRIMARY KEY, status TEXT)`);
      db.prepare('INSERT INTO swarm_missions (mission_id, status) VALUES (?, ?)').run(
        'm1',
        'active'
      );
      const out = tct.mirrorChatToLegacy(db, {}, { ...BASE_MSG, toRole: 'all', body: 'broadcast' });
      expect(out.skipped).toBeUndefined();
      expect(out.recipient_agent_id).toBe('m1-broadcast');
      const deliv = db
        .prepare('SELECT * FROM message_deliveries WHERE delivery_id = ?')
        .get(out.delivery_id);
      expect(deliv.recipient_agent_id).toBe('m1-broadcast');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

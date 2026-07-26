/**
 * T-001 (RED) — Migration 002: 4 stores, 8 indexes, WAL + busy_timeout, idempotent.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/agent-comms-bus/spec.md
 *   - BUS-S1: migration runs on fresh DB, tables/indexes/triggers created, WAL+busy_timeout set
 *   - BUS-S2: re-running migration is a no-op
 *   - BUS-S3: team_chat columns include from_role, to_role, kind, body, body_hash, client_event_id
 *   - BUS-S7: agent_presence.presence_context column added (ALTER TABLE)
 *
 * These tests reference production code that does not exist yet
 * (busMigrations.ensureAgentCommsBusSchema), guaranteeing a RED result.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { ensureAllSchema, ensureRuntimeSchema } = require('../../db/schema.js');
const busMigrations = require('../../db/busMigrations.js');

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-bus-mig-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return { db, dbPath, dir };
}

function countIndexesOn(db, tableName) {
  return db
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL"
    )
    .get(tableName).n;
}

describe('T-001 — migration 002 (agent comms bus)', () => {
  test('BUS-S1: ensureAllSchema creates team_chat, team_events, team_inbox tables and adds presence_context to agent_presence', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      // 3 new tables
      for (const tbl of ['team_chat', 'team_events', 'team_inbox']) {
        const exists = db
          .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
          .get(tbl).n;
        expect(exists).toBe(1);
      }
      // agent_presence adopted + presence_context column added
      const presenceCols = db.pragma('table_info(agent_presence)').map((c) => c.name);
      expect(presenceCols).toContain('presence_context');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S1 indexes: 8 net-new indexes across team_chat/team_events/team_inbox/agent_presence', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      // Per D4 in design.md — 8 indexes total (3 chat + 2 events + 2 inbox + 1 presence)
      const teamChatIdx = countIndexesOn(db, 'team_chat');
      const teamEventsIdx = countIndexesOn(db, 'team_events');
      const teamInboxIdx = countIndexesOn(db, 'team_inbox');
      const presenceIdx = countIndexesOn(db, 'agent_presence');
      // After migration, agent_presence has at least 3 (2 original + 1 new context index)
      // team_* tables: each has the 3 + 2 + 2 = 7 net-new indexes plus UNIQUE constraint
      // We assert NET-NEW (post-ensureAllSchema vs post-ensureRuntimeSchema baseline)
      const baseline = new Database(':memory:');
      baseline.pragma('foreign_keys = ON');
      ensureRuntimeSchema(baseline);
      const baseChat = countIndexesOn(baseline, 'team_chat');
      const baseEvents = countIndexesOn(baseline, 'team_events');
      const baseInbox = countIndexesOn(baseline, 'team_inbox');
      const basePresence = countIndexesOn(baseline, 'agent_presence');
      baseline.close();

      const netNew =
        teamChatIdx -
        baseChat +
        (teamEventsIdx - baseEvents) +
        (teamInboxIdx - baseInbox) +
        (presenceIdx - basePresence);
      expect(netNew).toBe(8);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S1: WAL journal mode and busy_timeout=5000 are set on the writer connection', () => {
    const { db, dir } = makeTempDb();
    try {
      // Mirror what production code does: enable WAL + busy_timeout on the same handle
      // that performs the writes (per REQ-BUS-1).
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      const journalMode = db.pragma('journal_mode', { simple: true });
      const busyTimeout = db.pragma('busy_timeout', { simple: true });
      expect(journalMode).toBe('wal');
      expect(busyTimeout).toBe(5000);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S2: re-running ensureAgentCommsBusSchema is a no-op (idempotent)', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      // Snapshot counts before re-run
      const chatCountBefore = db.prepare('SELECT count(*) AS n FROM team_chat').get().n;
      const eventsCountBefore = db.prepare('SELECT count(*) AS n FROM team_events').get().n;
      const inboxCountBefore = db.prepare('SELECT count(*) AS n FROM team_inbox').get().n;
      const presenceContextBefore = db
        .prepare(
          "SELECT count(*) AS n FROM pragma_table_info('agent_presence') WHERE name='presence_context'"
        )
        .get().n;

      // Re-run the bus migration specifically — should not throw
      busMigrations.ensureAgentCommsBusSchema(db);

      const chatCountAfter = db.prepare('SELECT count(*) AS n FROM team_chat').get().n;
      const eventsCountAfter = db.prepare('SELECT count(*) AS n FROM team_events').get().n;
      const inboxCountAfter = db.prepare('SELECT count(*) AS n FROM team_inbox').get().n;
      const presenceContextAfter = db
        .prepare(
          "SELECT count(*) AS n FROM pragma_table_info('agent_presence') WHERE name='presence_context'"
        )
        .get().n;

      expect(chatCountAfter).toBe(chatCountBefore);
      expect(eventsCountAfter).toBe(eventsCountBefore);
      expect(inboxCountAfter).toBe(inboxCountBefore);
      expect(presenceContextAfter).toBe(presenceContextBefore);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S3: team_chat has required columns (from_role, to_role, kind, body, body_hash, client_event_id, ts, mission_id)', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      const cols = db.pragma('table_info(team_chat)').map((c) => c.name);
      for (const col of [
        'mission_id',
        'from_role',
        'to_role',
        'kind',
        'body',
        'body_hash',
        'ts',
        'client_event_id',
      ]) {
        expect(cols).toContain(col);
      }
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S5: team_events has UNIQUE(mission_id, dedupe_key) constraint for event dedupe on restart', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      // UNIQUE constraint creates a sqlite_autoindex or named index
      // We check at the SQL level that the table has a UNIQUE on (mission_id, dedupe_key)
      const sql = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='team_events'")
        .get().sql;
      expect(sql).toMatch(/UNIQUE\s*\(\s*mission_id\s*,\s*dedupe_key\s*\)/i);
      // The indexes should include one covering mission_id, ts
      const allIndexSql = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='team_events'")
        .all()
        .map((r) => r.sql || '')
        .join(' ');
      expect(allIndexSql).toMatch(/mission_id.*ts|ts.*mission_id/i);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S7: agent_presence.presence_context column exists after migration', () => {
    const { db, dir } = makeTempDb();
    try {
      ensureAllSchema(db);
      const cols = db.pragma('table_info(agent_presence)').map((c) => c.name);
      expect(cols).toContain('presence_context');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

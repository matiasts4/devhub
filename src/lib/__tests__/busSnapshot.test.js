/* eslint-env node, jest */
/**
 * T-009 (RED) — getMissionBusSnapshot tests.
 *
 * Spec: openspec/changes/agent-comms-redesign/design.md (D4)
 *   - Single SQL with 4 json_group_array subqueries
 *   - Returns {chat_recent, events_recent, inbox_pending, presence_active}
 *   - Empty mission returns [] not null (COALESCE)
 *   - mission_id path-traversal protection (^[a-zA-Z0-9_-]{1,64}$)
 *   - Mission isolation
 *
 * Tests reference production code that does not exist yet
 * (getMissionBusSnapshot in src/lib/db/swarmMissions.js).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const swarmMissions = require('../db/swarmMissions.js');

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-snap-'));
  const dbPath = path.join(dir, 'snap.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      from_role TEXT NOT NULL, to_role TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('chat','report','alert','ack')),
      body TEXT NOT NULL, body_hash TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')), client_event_id TEXT
    );
    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      source_role TEXT NOT NULL, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL,
      payload_json TEXT, ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS team_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      to_role TEXT NOT NULL, from_role TEXT NOT NULL, body TEXT NOT NULL,
      body_hash TEXT NOT NULL, client_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), consumed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_presence (
      presence_id TEXT PRIMARY KEY, mission_id TEXT, agent_id TEXT NOT NULL,
      runtime_surface TEXT NOT NULL,
      presence_state TEXT NOT NULL CHECK(presence_state IN ('online','busy','idle','waiting','offline','booting','crashed')),
      presence_context TEXT, status_summary TEXT, evidence_ref TEXT,
      last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT NOT NULL,
      UNIQUE(agent_id, mission_id, runtime_surface)
    );
  `);
  return { dir, dbPath, db };
}

function seedMission(db, missionId) {
  // Seed 4 rows in each table for a single mission
  for (let i = 0; i < 4; i++) {
    db.prepare(
      `INSERT INTO team_chat (mission_id, from_role, to_role, kind, body, body_hash) VALUES (?,?,?,?,?,?)`
    ).run(missionId, 'auditor', 'director', 'chat', `chat-${i}`, `ch-${i}`);
    db.prepare(
      `INSERT INTO team_events (mission_id, source_role, kind, dedupe_key, payload_json) VALUES (?,?,?,?,?)`
    ).run(missionId, 'worker', 'task_completed', `dk-${i}`, JSON.stringify({ i }));
    db.prepare(
      `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash) VALUES (?,?,?,?,?)`
    ).run(missionId, 'worker', 'director', `directive-${i}`, `ib-${i}`);
    const now = new Date().toISOString();
    const exp = new Date(Date.now() + 3600 * 1000).toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO agent_presence
      (presence_id, mission_id, agent_id, runtime_surface, presence_state, status_summary, last_seen_at, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`p-${i}`, missionId, `agent-${i}`, 'shell', 'busy', `doing-${i}`, now, exp, now);
  }
}

describe('T-009 — getMissionBusSnapshot', () => {
  test('returns 4 arrays, one per table, with seeded data', () => {
    const { dir, db } = makeTempDb();
    try {
      seedMission(db, 'missionA');
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionA');
      expect(snap.mission_id).toBe('missionA');
      expect(snap.chat_recent).toHaveLength(4);
      expect(snap.events_recent).toHaveLength(4);
      expect(snap.inbox_pending).toHaveLength(4);
      expect(snap.presence_active).toHaveLength(4);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('empty mission returns [] for all 4 arrays (not null)', () => {
    const { dir, db } = makeTempDb();
    try {
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionEmpty');
      expect(snap.chat_recent).toEqual([]);
      expect(snap.events_recent).toEqual([]);
      expect(snap.inbox_pending).toEqual([]);
      expect(snap.presence_active).toEqual([]);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mission isolation: chat in missionA is not in missionB snapshot', () => {
    const { dir, db } = makeTempDb();
    try {
      seedMission(db, 'missionA');
      seedMission(db, 'missionB');
      const snapA = swarmMissions.getMissionBusSnapshot(db, 'missionA');
      const snapB = swarmMissions.getMissionBusSnapshot(db, 'missionB');
      expect(snapA.chat_recent).toHaveLength(4);
      expect(snapB.chat_recent).toHaveLength(4);
      // All snapA chat bodies should mention chat-, all snapB chat bodies should too — but
      // they share the same template. The IDs (and thus ts) are different.
      const aIds = snapA.chat_recent.map((c) => c.id).sort();
      const bIds = snapB.chat_recent.map((c) => c.id).sort();
      expect(aIds).not.toEqual(bIds);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('inbox_recent_consumed shows latest delivered rows', () => {
    const { dir, db } = makeTempDb();
    try {
      const older = new Date(Date.now() - 60_000).toISOString();
      const newer = new Date().toISOString();
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash, consumed_at) VALUES (?,?,?,?,?,?)`
      ).run('missionC2', 'sdd_worker_1', 'zed', 'older', 'h1', older);
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash, consumed_at) VALUES (?,?,?,?,?,?)`
      ).run('missionC2', 'sdd_worker_1', 'zed', 'newer', 'h2', newer);
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionC2');
      expect(snap.inbox_recent_consumed).toHaveLength(2);
      expect(snap.inbox_recent_consumed[0].body).toBe('newer');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('inbox_pending only shows unconsumed rows', () => {
    const { dir, db } = makeTempDb();
    try {
      // Seed: 1 consumed, 1 pending
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash, consumed_at) VALUES (?,?,?,?,?,?)`
      ).run('missionC', 'worker', 'director', 'consumed-one', 'h1', new Date().toISOString());
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash) VALUES (?,?,?,?,?)`
      ).run('missionC', 'worker', 'director', 'pending-one', 'h2');
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionC');
      expect(snap.inbox_pending).toHaveLength(1);
      expect(snap.inbox_pending[0].body).toBe('pending-one');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence_active only shows rows whose expires_at > now', () => {
    const { dir, db } = makeTempDb();
    try {
      // 1 active (future expiry), 1 expired
      const now = new Date().toISOString();
      const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
      const pastExp = new Date(Date.now() - 3600 * 1000).toISOString();
      db.prepare(
        `INSERT OR REPLACE INTO agent_presence
        (presence_id, mission_id, agent_id, runtime_surface, presence_state, last_seen_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('p-active', 'missionD', 'agent-1', 'shell', 'busy', now, futureExp, now);
      db.prepare(
        `INSERT OR REPLACE INTO agent_presence
        (presence_id, mission_id, agent_id, runtime_surface, presence_state, last_seen_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('p-expired', 'missionD', 'agent-2', 'shell', 'offline', now, pastExp, now);
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionD');
      expect(snap.presence_active).toHaveLength(1);
      expect(snap.presence_active[0].agent_id).toBe('agent-1');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mission_id=../etc throws TypeError (path traversal protection)', () => {
    const { dir, db } = makeTempDb();
    try {
      expect(() => swarmMissions.getMissionBusSnapshot(db, '../etc')).toThrow(TypeError);
      expect(() => swarmMissions.getMissionBusSnapshot(db, '')).toThrow(TypeError);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('snapshot_at is a valid ISO 8601 timestamp', () => {
    const { dir, db } = makeTempDb();
    try {
      const snap = swarmMissions.getMissionBusSnapshot(db, 'missionE');
      expect(snap.snapshot_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

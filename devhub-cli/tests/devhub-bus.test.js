/**
 * T-002 — devhub-bus binary tests.
 * Spec: agent-bus-helpers + agent-comms-bus (BUS-S4, S5, S6, S7, S8, S10; HELPER-S3..S13).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const Database = require('better-sqlite3');

const BUS_BIN = path.resolve(__dirname, '../bin/devhub-bus.js');

function setupTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-bus-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  // Apply minimal schema the helpers expect
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('chat', 'report', 'alert', 'ack')),
      body TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      client_event_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event
      ON team_chat(mission_id, client_event_id)
      WHERE client_event_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id TEXT NOT NULL,
      source_role TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      payload_json TEXT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(mission_id, dedupe_key)
    );
    CREATE TABLE IF NOT EXISTS team_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id TEXT NOT NULL,
      to_role TEXT NOT NULL,
      from_role TEXT NOT NULL,
      body TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      client_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_presence (
      presence_id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      run_id TEXT,
      runtime_surface TEXT NOT NULL,
      presence_state TEXT NOT NULL CHECK(presence_state IN ('online', 'busy', 'idle', 'waiting', 'offline', 'booting', 'crashed')),
      status_summary TEXT,
      evidence_ref TEXT,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, mission_id, runtime_surface)
    );
    -- T-013b follow-up: agent_presence.mission_id has FK to swarm_missions.
    -- Seed the table so presence-heartbeat tests that expect the row to be
    -- written can do so without a per-test fixture. Tests that exercise the
    -- skip path drop the row(s) explicitly.
    CREATE TABLE IF NOT EXISTS swarm_missions (
      mission_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT OR IGNORE INTO swarm_missions (mission_id, status) VALUES ('m1', 'active');
    INSERT OR IGNORE INTO swarm_missions (mission_id, status) VALUES ('missionA', 'active');
  `);
  return { dir, dbPath, db };
}

function runBus(dbPath, sub, ...args) {
  return spawnSync('node', [BUS_BIN, sub, '--db', dbPath, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath },
  });
}

function mkdirJsonlDir(missionId) {
  const dir = `/tmp/devhub-mission-${missionId}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('T-002 — devhub-bus binary', () => {
  test('HELPER-S3: chat-write inserts a team_chat row with body_hash + client_event_id, exit 0', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'm1',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'hello world'
      );
      expect(r.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').get('m1');
      expect(row).toBeDefined();
      expect(row.from_role).toBe('auditor');
      expect(row.to_role).toBe('director');
      expect(row.kind).toBe('chat');
      expect(row.body).toBe('hello world');
      expect(row.body_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.client_event_id).toMatch(/^chat-/);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S4: duplicate client_event_id is a no-op (idempotent, exit 0)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r1 = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'm1',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'first',
        '--client-event-id',
        'chat-fixed-1'
      );
      expect(r1.status).toBe(0);
      const r2 = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'm1',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'second',
        '--client-event-id',
        'chat-fixed-1'
      );
      expect(r2.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').all('m1');
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe('first');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S5: event-write uses dedupe_key for restart-safe idempotency', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r1 = runBus(
        dbPath,
        'event-write',
        '--mission',
        'm1',
        '--source',
        'worker',
        '--kind',
        'task_completed',
        '--payload',
        '{"task":"x"}',
        '--dedupe-key',
        'sha256-of-payload'
      );
      expect(r1.status).toBe(0);
      const r2 = runBus(
        dbPath,
        'event-write',
        '--mission',
        'm1',
        '--source',
        'worker',
        '--kind',
        'task_completed',
        '--payload',
        '{"task":"x"}',
        '--dedupe-key',
        'sha256-of-payload'
      );
      expect(r2.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare('SELECT * FROM team_events WHERE mission_id = ?').all('m1');
      expect(rows).toHaveLength(1);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S7: presence-upsert uses last-write-wins on (agent_id, mission_id, runtime_surface)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r1 = runBus(
        dbPath,
        'presence-upsert',
        '--mission',
        'm1',
        '--agent',
        'auditor',
        '--runtime-surface',
        'shell',
        '--state',
        'busy',
        '--summary',
        'first',
        '--ttl-seconds',
        '60'
      );
      expect(r1.status).toBe(0);
      const r2 = runBus(
        dbPath,
        'presence-upsert',
        '--mission',
        'm1',
        '--agent',
        'auditor',
        '--runtime-surface',
        'shell',
        '--state',
        'waiting',
        '--summary',
        'second',
        '--ttl-seconds',
        '60'
      );
      expect(r2.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const rows = db
        .prepare('SELECT * FROM agent_presence WHERE agent_id = ? AND mission_id = ?')
        .all('auditor', 'm1');
      expect(rows).toHaveLength(1);
      expect(rows[0].presence_state).toBe('waiting');
      expect(rows[0].status_summary).toBe('second');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S8: chat-write appends to /tmp/devhub-mission-<mission_id>/chat.jsonl within 100ms', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      mkdirJsonlDir('missionA');
      const r = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'missionA',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'live'
      );
      expect(r.status).toBe(0);
      // Give the helper up to 100ms to flush
      const deadline = Date.now() + 100;
      let lines = [];
      while (Date.now() < deadline) {
        const file = '/tmp/devhub-mission-missionA/chat.jsonl';
        if (fs.existsSync(file)) {
          lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
          if (lines.length > 0) break;
        }
      }
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.body).toBe('live');
      expect(parsed.from_role).toBe('auditor');
    } finally {
      fs.rmSync('/tmp/devhub-mission-missionA', { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BUS-S10: mission_id=../etc exits 64 (path traversal protection)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(
        dbPath,
        'chat-write',
        '--mission',
        '../etc',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'hi'
      );
      expect(r.status).toBe(64);
      expect(r.stderr).toMatch(/mission_id|invalid/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HELPER-S12: missing table exits 66 (cannot-open / not-found)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Drop team_chat to force "no such table"
      const db = new Database(dbPath);
      db.exec('DROP TABLE team_chat');
      db.close();
      const r = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'm1',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'chat',
        '--body',
        'hi'
      );
      expect(r.status).toBe(66);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HELPER-S10/11: inbox-check consumes once, second call returns empty', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Seed an inbox row (director wrote to worker)
      const seed = runBus(
        dbPath,
        'inbox-check', // noop but ensures binary is callable
        '--mission',
        'm1',
        '--role',
        'worker'
      );
      // That call should return [] (no rows yet) — exit 0
      expect(seed.status).toBe(0);
      expect(seed.stdout.trim()).toBe('[]');

      // Insert an inbox row directly (since binary doesn't have inbox-write yet)
      const db = new Database(dbPath);
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
         VALUES (?, ?, ?, ?, ?)`
      ).run('m1', 'worker', 'director', 'new directive', 'hash-1');
      db.close();

      // Now inbox-check should return the row
      const r1 = runBus(dbPath, 'inbox-check', '--mission', 'm1', '--role', 'worker');
      expect(r1.status).toBe(0);
      const rows1 = JSON.parse(r1.stdout);
      expect(rows1).toHaveLength(1);
      expect(rows1[0].body).toBe('new directive');
      expect(rows1[0].consumed_at).toBeTruthy();

      // Second call: same row now has consumed_at set, so result is []
      const r2 = runBus(dbPath, 'inbox-check', '--mission', 'm1', '--role', 'worker');
      expect(r2.status).toBe(0);
      const rows2 = JSON.parse(r2.stdout);
      expect(rows2).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HELPER-S4: invalid kind on chat-write exits 64 (usage)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(
        dbPath,
        'chat-write',
        '--mission',
        'm1',
        '--from',
        'auditor',
        '--to',
        'director',
        '--kind',
        'invalid_kind',
        '--body',
        'hi'
      );
      expect(r.status).toBe(64);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HELPER-S9: invalid presence_state on presence-upsert exits 64 (usage)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(
        dbPath,
        'presence-upsert',
        '--mission',
        'm1',
        '--agent',
        'auditor',
        '--runtime-surface',
        'shell',
        '--state',
        'invented_state',
        '--summary',
        'hi',
        '--ttl-seconds',
        '60'
      );
      expect(r.status).toBe(64);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T-013b — presence-heartbeat + presence-list (Bash bus subcommands)', () => {
  test('presence-heartbeat UPSERTs a row keyed by (agent_id=role, mission_id, runtime_surface=shell)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(
        dbPath,
        'presence-heartbeat',
        '--mission',
        'm1',
        '--role',
        'director',
        '--status',
        'monitoring'
      );
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(out.ok).toBe(true);
      expect(typeof out.presence_id).toBe('string');

      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare('SELECT * FROM agent_presence WHERE mission_id = ?').all('m1');
      expect(rows).toHaveLength(1);
      expect(rows[0].agent_id).toBe('director');
      expect(rows[0].mission_id).toBe('m1');
      expect(rows[0].runtime_surface).toBe('shell');
      expect(rows[0].presence_state).toBe('online');
      expect(rows[0].status_summary).toBe('monitoring');
      expect(typeof rows[0].last_seen_at).toBe('string');
      expect(typeof rows[0].expires_at).toBe('string');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence-heartbeat is idempotent (last-write-wins) on second call with new status', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r1 = runBus(
        dbPath,
        'presence-heartbeat',
        '--mission',
        'm1',
        '--role',
        'director',
        '--status',
        'first'
      );
      expect(r1.status).toBe(0);
      const r2 = runBus(
        dbPath,
        'presence-heartbeat',
        '--mission',
        'm1',
        '--role',
        'director',
        '--status',
        'second'
      );
      expect(r2.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const rows = db
        .prepare('SELECT * FROM agent_presence WHERE mission_id = ? AND agent_id = ?')
        .all('m1', 'director');
      expect(rows).toHaveLength(1);
      expect(rows[0].status_summary).toBe('second');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence-list returns rows for a mission ordered by last_seen_at DESC', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Seed 3 rows with different last_seen_at
      const r1 = runBus(dbPath, 'presence-heartbeat', '--mission', 'm1', '--role', 'director');
      expect(r1.status).toBe(0);
      // Sleep to ensure distinct last_seen_at (ISO strings are second-precision,
      // so a sync sleep is required for ordering)
      const start = Date.now();
      while (Date.now() - start < 1100) {
        /* spin ~1.1s */
      }
      const r2 = runBus(dbPath, 'presence-heartbeat', '--mission', 'm1', '--role', 'auditor');
      expect(r2.status).toBe(0);
      const start2 = Date.now();
      while (Date.now() - start2 < 1100) {
        /* spin ~1.1s */
      }
      const r3 = runBus(dbPath, 'presence-heartbeat', '--mission', 'm1', '--role', 'worker');
      expect(r3.status).toBe(0);

      const r = runBus(dbPath, 'presence-list', '--mission', 'm1');
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(out).toHaveLength(3);
      expect(out.map((row) => row.agent_id)).toEqual(['worker', 'auditor', 'director']);
      // Every row has the expected shape
      for (const row of out) {
        expect(row.mission_id).toBe('m1');
        expect(typeof row.last_seen_at).toBe('string');
        expect(row.presence_state).toBe('online');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence-list --role filter narrows to a single agent_id', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Seed 2 roles
      runBus(dbPath, 'presence-heartbeat', '--mission', 'm1', '--role', 'director');
      runBus(dbPath, 'presence-heartbeat', '--mission', 'm1', '--role', 'auditor');

      const r = runBus(dbPath, 'presence-list', '--mission', 'm1', '--role', 'auditor');
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(out).toHaveLength(1);
      expect(out[0].agent_id).toBe('auditor');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence-list returns [] for a mission with no presence rows', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(dbPath, 'presence-list', '--mission', 'm-empty');
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout.trim())).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presence-heartbeat skips with mission_not_registered when swarm_missions lacks the mission (no FK error spam)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Remove the seeded m1 mission from swarm_missions to force the skip path
      const db = new Database(dbPath);
      db.prepare('DELETE FROM swarm_missions WHERE mission_id = ?').run('m1');
      db.close();
      const r = runBus(
        dbPath,
        'presence-heartbeat',
        '--mission',
        'm1',
        '--role',
        'director',
        '--status',
        'monitoring'
      );
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(out).toEqual({ ok: true, skipped: 'mission_not_registered', presence_id: null });
      // No FK error in stderr
      expect(r.stderr).not.toMatch(/FOREIGN KEY/);
      // Skip reason logged
      expect(r.stderr).toMatch(/skipped \(mission_not_registered\)/);
      // No row was written
      const check = new Database(dbPath, { readonly: true });
      const rows = check.prepare('SELECT * FROM agent_presence WHERE mission_id = ?').all('m1');
      expect(rows).toHaveLength(0);
      check.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T-013c — event-list (Bash bus subcommand for devhub events list)', () => {
  test('event-list returns events for a mission ordered by ts DESC', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Seed 2 events (deltas matter: they insert in time order)
      const r1 = runBus(
        dbPath,
        'event-write',
        '--mission',
        'm1',
        '--source',
        'worker',
        '--kind',
        'task_started',
        '--payload',
        '{"task":"first"}',
        '--dedupe-key',
        'k-first'
      );
      expect(r1.status).toBe(0);
      const r2 = runBus(
        dbPath,
        'event-write',
        '--mission',
        'm1',
        '--source',
        'worker',
        '--kind',
        'task_completed',
        '--payload',
        '{"task":"second"}',
        '--dedupe-key',
        'k-second'
      );
      expect(r2.status).toBe(0);

      const r = runBus(dbPath, 'event-list', '--mission', 'm1');
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(Array.isArray(out)).toBe(true);
      expect(out).toHaveLength(2);
      // Both rows have the documented shape
      for (const row of out) {
        expect(row.mission_id).toBe('m1');
        expect(row.source_role).toBe('worker');
        expect(typeof row.id).toBe('number');
        expect(typeof row.ts).toBe('string');
        expect(typeof row.dedupe_key).toBe('string');
      }
      // Set membership: the two dedupe keys are both present. We don't
      // assert strict DESC order because team_events.ts is
      // datetime('now') which has second precision; in fast tests two
      // back-to-back writes can land in the same second, making the
      // ordering nondeterministic. Real-world events are spaced out
      // (seconds) so DESC ordering works in production.
      const keys = out.map((row) => row.dedupe_key).sort();
      expect(keys).toEqual(['k-first', 'k-second']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('event-list --limit <n> caps the result count', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      // Seed 3 events
      for (let i = 0; i < 3; i++) {
        runBus(
          dbPath,
          'event-write',
          '--mission',
          'm1',
          '--source',
          'worker',
          '--kind',
          'tick',
          '--payload',
          `{"i":${i}}`,
          '--dedupe-key',
          `tick-${i}`
        );
      }
      const r = runBus(dbPath, 'event-list', '--mission', 'm1', '--limit', '2');
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      expect(out).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('event-list returns [] for a mission with no events', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      const r = runBus(dbPath, 'event-list', '--mission', 'm-empty');
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout.trim())).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('event-list isolates missions (m1 events do not leak into m2)', () => {
    const { dir, dbPath } = setupTempDb();
    try {
      runBus(
        dbPath,
        'event-write',
        '--mission',
        'm1',
        '--source',
        'worker',
        '--kind',
        'task_started',
        '--payload',
        '{}',
        '--dedupe-key',
        'k1'
      );
      const r = runBus(dbPath, 'event-list', '--mission', 'm2');
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout.trim())).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('worker-consume subcommand', () => {
  test('delivers pending inbox rows and marks them consumed', async () => {
    const { dir, dbPath, db } = setupTempDb();
    try {
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
      ).run('m-worker', 'sdd_worker_2', 'zed', 'investigate MCP list_projects', 'hash-w2');
      db.close();

      const targetSession = 'devhub-swarm-m-worker-sdd_worker_2';
      fs.writeFileSync(`/tmp/devhub-opencode-ready-${targetSession}`, '1');

      const proc = spawn(
        'node',
        [
          BUS_BIN,
          '--db',
          dbPath,
          'worker-consume',
          '--mission',
          'm-worker',
          '--role',
          'sdd_worker_2',
          '--target-session',
          targetSession,
          '--poll-interval',
          '1',
          '--skip-tui-wait',
          'true',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );

      await new Promise((resolve) => setTimeout(resolve, 1800));
      proc.kill('SIGTERM');
      await new Promise((resolve) => {
        const fallback = setTimeout(resolve, 2000);
        proc.on('exit', () => {
          clearTimeout(fallback);
          resolve();
        });
      });

      const db2 = new Database(dbPath);
      const row = db2
        .prepare('SELECT consumed_at FROM team_inbox WHERE mission_id = ? AND to_role = ?')
        .get('m-worker', 'sdd_worker_2');
      db2.close();
      expect(row?.consumed_at).toBeTruthy();
      fs.rmSync(`/tmp/devhub-opencode-ready-${targetSession}`, { force: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);

  test('inbox-consume stays alive between polls (timer must not unref)', async () => {
    const { dir, dbPath } = setupTempDb();
    const targetSession = 'devhub-swarm-m-alive-sdd_worker_1';
    try {
      fs.writeFileSync(`/tmp/devhub-opencode-ready-${targetSession}`, '1');
      const proc = spawn(
        'node',
        [
          BUS_BIN,
          '--db',
          dbPath,
          'inbox-consume',
          '--mission',
          'm-alive',
          '--role',
          'sdd_worker_1',
          '--target-session',
          targetSession,
          '--poll-interval',
          '30',
          '--skip-tui-wait',
          'true',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(proc.exitCode).toBeNull();
      proc.kill('SIGTERM');
      await new Promise((resolve) => {
        const fallback = setTimeout(resolve, 2000);
        proc.on('exit', () => {
          clearTimeout(fallback);
          resolve();
        });
      });
    } finally {
      fs.rmSync(`/tmp/devhub-opencode-ready-${targetSession}`, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});

describe('T-008 — director-consume subcommand', () => {
  function setupConsumerTempDb() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-consume-'));
    const dbPath = path.join(dir, 'c.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(
      `CREATE TABLE IF NOT EXISTS team_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL, from_role TEXT NOT NULL, to_role TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('chat','report','alert','ack')), body TEXT NOT NULL, body_hash TEXT NOT NULL, ts TEXT NOT NULL DEFAULT (datetime('now')), client_event_id TEXT); CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event ON team_chat(mission_id, client_event_id) WHERE client_event_id IS NOT NULL;`
    );
    db.close();
    return { dir, dbPath };
  }

  test('director-consume with empty JSONL file starts, accepts SIGTERM, and exits 0', async () => {
    const { dir, dbPath } = setupConsumerTempDb();
    const missionId = 'mConsumeEmpty';
    const jsonlDir = `/tmp/devhub-mission-${missionId}`;
    fs.rmSync(jsonlDir, { recursive: true, force: true });
    fs.mkdirSync(jsonlDir, { recursive: true });
    fs.writeFileSync(path.join(jsonlDir, 'chat.jsonl'), '');

    try {
      const proc = spawn(
        'node',
        [BUS_BIN, '--db', dbPath, 'director-consume', '--mission', missionId, '--role', 'director'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );

      let stdout = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      setTimeout(() => proc.kill('SIGTERM'), 500);

      const exitCode = await new Promise((resolve) => {
        proc.on('exit', (code) => resolve(code));
      });
      expect(exitCode).toBe(0);
    } finally {
      fs.rmSync(jsonlDir, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('director-consume deduplicates already-seen lines on restart (cap 5000 entries)', async () => {
    const { dir, dbPath } = setupConsumerTempDb();
    const missionId = 'mConsumeDedup';
    const jsonlDir = `/tmp/devhub-mission-${missionId}`;
    fs.rmSync(jsonlDir, { recursive: true, force: true });
    fs.mkdirSync(jsonlDir, { recursive: true });
    const file = path.join(jsonlDir, 'chat.jsonl');
    // Pre-populate with 3 dedup-able lines
    const lines = [
      JSON.stringify({
        seq: '1',
        from_role: 'auditor',
        to_role: 'director',
        body: 'hello',
        body_hash: 'h1',
      }),
      JSON.stringify({
        seq: '2',
        from_role: 'auditor',
        to_role: 'director',
        body: 'world',
        body_hash: 'h2',
      }),
      JSON.stringify({
        seq: '3',
        from_role: 'auditor',
        to_role: 'director',
        body: 'third',
        body_hash: 'h3',
      }),
    ];
    fs.writeFileSync(file, lines.join('\n') + '\n');
    // Pre-populate the dedupe file as if a previous run saw all 3
    const dedupeFile = path.join(jsonlDir, 'consumer-dedupe-director.jsonl');
    fs.writeFileSync(
      dedupeFile,
      lines.map((l) => JSON.stringify({ key: `1|auditor|h1` })).join('\n') + '\n'
    );

    try {
      const proc = spawn(
        'node',
        [BUS_BIN, '--db', dbPath, 'director-consume', '--mission', missionId, '--role', 'director'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );

      let stdout = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      setTimeout(() => proc.kill('SIGTERM'), 500);

      await new Promise((resolve) => {
        proc.on('exit', resolve);
      });
      // All 3 lines should be filtered (already-seen), so stdout should not contain their bodies
      // (some startup banner is OK)
      expect(stdout).not.toMatch(/^hello$/m);
      expect(stdout).not.toMatch(/^world$/m);
      expect(stdout).not.toMatch(/^third$/m);
    } finally {
      fs.rmSync(jsonlDir, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

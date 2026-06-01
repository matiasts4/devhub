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

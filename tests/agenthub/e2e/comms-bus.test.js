/* eslint-env node, jest */
/**
 * T-010 — E2E reproduction of the launch-e743667a comms failure pattern.
 *
 * The original failure: the auditor called _devhub_tell_director twice and
 * neither message reached the director (HMAC-signed POST to /api/agenthub/events
 * was silently dropped because the route was retiring in the same release).
 *
 * This test exercises the full bus path with the new implementation:
 *   1. Auditor writes to team_chat via devhub-bus chat-write
 *      → row in team_chat, JSONL projection at /tmp/devhub-mission-<id>/chat.jsonl
 *   2. Director consumer (devhub-bus director-consume) reads the line via tail -F,
 *      dedupes across a simulated restart (kill + spawn)
 *   3. Bootstrap injection lock state machine: pending → injecting → injected
 *      advances cleanly via the wrapper's advanceInjectionLock export
 *   4. Director → worker delivery via team_inbox: row written, _devhub_inbox_check
 *      returns it and sets consumed_at, second call returns []
 *
 * Uses a temp dir + temp DB for isolation. No mocks of the DB or the binary.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/agent-comms-bus/spec.md
 *       openspec/changes/agent-comms-redesign/tasks.md (T-010)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const wrapper = require('../../../src/lib/agentLaunchWrapper.js');

const BUS_BIN = path.resolve(__dirname, '../../../devhub-cli/bin/devhub-bus.js');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runBus(dbPath, sub, ...args) {
  return spawnSync('node', [BUS_BIN, sub, '--db', dbPath, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath },
  });
}

function runBusAndAssert(dbPath, sub, ...args) {
  const r = runBus(dbPath, sub, ...args);
  if (r.status !== 0) {
    throw new Error(
      `devhub-bus ${sub} failed (status=${r.status}):\nstdout=${r.stdout}\nstderr=${r.stderr}`
    );
  }
  return r;
}

function setupMissionDb() {
  const dir = makeTmpDir('devhub-e2e-');
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  // Inline migration 002 — same shape as data/migrations/002_agent_comms_bus.sql
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      from_role TEXT NOT NULL, to_role TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('chat','report','alert','ack')),
      body TEXT NOT NULL, body_hash TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')), client_event_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event
      ON team_chat(mission_id, client_event_id)
      WHERE client_event_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      source_role TEXT NOT NULL, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL,
      payload_json TEXT, ts TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(mission_id, dedupe_key)
    );
    CREATE TABLE IF NOT EXISTS team_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT NOT NULL,
      to_role TEXT NOT NULL, from_role TEXT NOT NULL, body TEXT NOT NULL,
      body_hash TEXT NOT NULL, client_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_team_inbox_mission_to_consumed
      ON team_inbox(mission_id, to_role, consumed_at);
    CREATE TABLE IF NOT EXISTS agent_presence (
      presence_id TEXT PRIMARY KEY, mission_id TEXT, agent_id TEXT NOT NULL,
      runtime_surface TEXT NOT NULL,
      presence_state TEXT NOT NULL
        CHECK(presence_state IN ('online','busy','idle','waiting','offline','booting','crashed')),
      presence_context TEXT, status_summary TEXT, evidence_ref TEXT,
      last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT NOT NULL,
      UNIQUE(agent_id, mission_id, runtime_surface)
    );
  `);
  return { dir, dbPath, db };
}

function waitForFile(filePath, deadlineMs, predicate = () => true) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        if (predicate(data)) return data;
      }
    } catch {
      /* retry */
    }
  }
  return null;
}

function collectLines(buf) {
  return buf.join('').split('\n').filter(Boolean);
}

describe('T-010 — E2E launch-e743667a comms repro', () => {
  // Single end-to-end scenario. Times out generously to avoid flakiness on slow CI.
  jest.setTimeout(20000);

  test('full bus path: chat-write → JSONL → consumer dedupe → lock → inbox consume', async () => {
    const { dir, dbPath, db } = setupMissionDb();
    const missionId = 'm1';
    const jsonlDir = `/tmp/devhub-mission-${missionId}`;
    const dedupeFile = path.join(jsonlDir, `consumer-dedupe-director.jsonl`);
    const chatJsonl = path.join(jsonlDir, 'chat.jsonl');
    const lockDir = makeTmpDir('devhub-lock-');

    // Clean up any stale state from prior runs (jsonlDir only — lockDir is fresh)
    fs.rmSync(jsonlDir, { recursive: true, force: true });

    const cleanup = () => {
      try { db.close(); } catch { /* ignore */ }
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(jsonlDir, { recursive: true, force: true });
      fs.rmSync(lockDir, { recursive: true, force: true });
    };

    try {
      // ── STEP 1: auditor writes chat message ──────────────────────────────
      // (this is the call that failed silently in launch-e743667a)
      const writeA = runBusAndAssert(
        dbPath,
        'chat-write',
        '--mission', missionId,
        '--from', 'auditor',
        '--to', 'director',
        '--kind', 'chat',
        '--body', 'task_done: X'
      );
      const ackA = JSON.parse(writeA.stdout.trim());
      expect(ackA.ok).toBe(true);
      expect(ackA.client_event_id).toMatch(/^chat-/);
      expect(ackA.body_hash).toMatch(/^[a-f0-9]{64}$/);

      // ── STEP 2: row in team_chat, JSONL projection within 2s ─────────────
      const chatRow = db
        .prepare('SELECT * FROM team_chat WHERE mission_id = ? ORDER BY id DESC LIMIT 1')
        .get(missionId);
      expect(chatRow).toBeDefined();
      expect(chatRow.from_role).toBe('auditor');
      expect(chatRow.to_role).toBe('director');
      expect(chatRow.body).toBe('task_done: X');

      const jsonlContent = waitForFile(chatJsonl, 2000, (data) =>
        data.split('\n').filter(Boolean).length >= 1
      );
      expect(jsonlContent).not.toBeNull();
      const linesA = jsonlContent.trim().split('\n').filter(Boolean);
      const firstLine = JSON.parse(linesA[0]);
      expect(firstLine.body).toBe('task_done: X');
      expect(firstLine.from_role).toBe('auditor');
      expect(firstLine.body_hash).toBe(ackA.body_hash);

      // ── STEP 3: bootstrap injection lock state machine ───────────────────
      // (per design D4 / T-004) — pending → injecting → injected
      const lockFile = path.join(lockDir, `devhub-injection-launch-001-director.lock`);
      const lockCreated = wrapper.createInjectionLock({
        lockDir,
        launchId: 'launch-001',
        role: 'director',
        missionId,
      });
      expect(lockCreated.state).toBe('pending');
      expect(fs.existsSync(lockFile)).toBe(true);

      const adv1 = wrapper.advanceInjectionLock({
        lockDir,
        launchId: 'launch-001',
        role: 'director',
        from: 'pending',
        to: 'injecting',
      });
      expect(adv1.ok).toBe(true);
      expect(adv1.state).toBe('injecting');

      const adv2 = wrapper.advanceInjectionLock({
        lockDir,
        launchId: 'launch-001',
        role: 'director',
        from: 'injecting',
        to: 'injected',
      });
      expect(adv2.ok).toBe(true);
      expect(adv2.state).toBe('injected');

      // Skip-step rejection: pending → injected is forbidden
      const skip = wrapper.advanceInjectionLock({
        lockDir,
        launchId: 'launch-001',
        role: 'director',
        from: 'pending',
        to: 'injected',
      });
      expect(skip.ok).toBe(false);
      expect(skip.reason).toMatch(/invalid transition/);

      // ── STEP 4: director consumer reads the JSONL line ───────────────────
      const consumer1 = spawn(
        'node',
        [BUS_BIN, 'director-consume', '--db', dbPath, '--mission', missionId, '--role', 'director'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const out1 = [];
      consumer1.stdout.on('data', (chunk) => out1.push(chunk.toString()));
      consumer1.stderr.on('data', (chunk) => process.stderr.write(chunk));

      // Give consumer1 a beat to start up and read chat.jsonl from the start.
      // Then write a SECOND message — consumer1 should receive it via tail -F.
      await new Promise((r) => setTimeout(r, 1000));

      const writeB = runBusAndAssert(
        dbPath,
        'chat-write',
        '--mission', missionId,
        '--from', 'auditor',
        '--to', 'director',
        '--kind', 'chat',
        '--body', 'message B (live tail)'
      );
      expect(JSON.parse(writeB.stdout).ok).toBe(true);

      // Wait for consumer1 to receive both lines
      await new Promise((r) => setTimeout(r, 1500));

      // Send SIGTERM to flush the dedupe file
      consumer1.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1500));

      // consumer1 should have emitted BOTH the initial line (read on startup)
      // and the live line (received via tail)
      const lines1 = collectLines(out1);
      expect(lines1.length).toBeGreaterThanOrEqual(2);
      const a1 = JSON.parse(lines1.find((l) => l.includes('task_done: X')) || '{}');
      const b1 = JSON.parse(
        lines1.find((l) => l.includes('message B (live tail)')) || '{}'
      );
      expect(a1.body).toBe('task_done: X');
      expect(b1.body).toBe('message B (live tail)');

      // The dedupe file should exist and contain the keys for both messages
      expect(fs.existsSync(dedupeFile)).toBe(true);

      // ── STEP 5: restart consumer — first message MUST NOT re-emit ──────
      // (the launch-e743667a fix: the dedupe file IS the durability boundary)
      const consumer2 = spawn(
        'node',
        [BUS_BIN, 'director-consume', '--db', dbPath, '--mission', missionId, '--role', 'director'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const out2 = [];
      consumer2.stdout.on('data', (chunk) => out2.push(chunk.toString()));
      consumer2.stderr.on('data', (chunk) => process.stderr.write(chunk));

      // Wait long enough for consumer2 to read chat.jsonl from the start and
      // apply dedupe. Both keys are in the dedupe file → no emission.
      await new Promise((r) => setTimeout(r, 2000));

      consumer2.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));

      const lines2 = collectLines(out2);
      // CRITICAL: the first message MUST NOT re-emit. The second message
      // is also in the dedupe file (it was flushed on consumer1's SIGTERM),
      // so it also doesn't re-emit. Total emission: 0.
      const reEmittedA = lines2.find((l) => l.includes('task_done: X'));
      expect(reEmittedA).toBeUndefined();
      const reEmittedB = lines2.find((l) => l.includes('message B (live tail)'));
      expect(reEmittedB).toBeUndefined();

      // ── STEP 6: inbox delivery (director → worker) ──────────────────────
      // In production, the _devhub_chat bash wrapper fans out to team_inbox
      // when the recipient is a worker. For this E2E we seed team_inbox
      // directly to simulate that fan-out (same pattern as the existing
      // T-002 inbox-check test).
      db.prepare(
        `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
         VALUES (?, ?, ?, ?, ?)`
      ).run(missionId, 'worker', 'director', 'new directive: ship it', 'directive-hash-1');
      db.close();

      // Worker bootstrap calls _devhub_inbox_check
      const inbox1 = runBusAndAssert(
        dbPath,
        'inbox-check',
        '--mission', missionId,
        '--role', 'worker'
      );
      const inbox1Rows = JSON.parse(inbox1.stdout.trim());
      expect(inbox1Rows).toHaveLength(1);
      expect(inbox1Rows[0].body).toBe('new directive: ship it');
      expect(inbox1Rows[0].consumed_at).toBeTruthy();

      // Second call: row was consumed → empty
      const inbox2 = runBusAndAssert(
        dbPath,
        'inbox-check',
        '--mission', missionId,
        '--role', 'worker'
      );
      const inbox2Rows = JSON.parse(inbox2.stdout.trim());
      expect(inbox2Rows).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

/* eslint-env node, jest */
/**
 * T-012 — TCT-DELTA shim tests (9 scenarios).
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/team-chat-targeting/spec.md
 *   - TCT-DELTA-S1..S3: Health endpoint inbox_source selection
 *   - TCT-DELTA-S4: _devhub_chat mirror to pending_deliveries
 *   - TCT-DELTA-S5: Worker offline re-inject on bootstrap
 *   - TCT-DELTA-S6: Shim warning logged once per request
 *   - TCT-DELTA-S7: Feature flag DEVHUB_INBOX_SHIM_DISABLED
 *   - TCT-DELTA-S8: team_tell MCP tool signature stable
 *   - TCT-DELTA-S9: Regression test for shim removal
 *
 * These tests reference the new TCT shim module
 * (src/lib/bus/shim/tct.js) and the extended devhub-bus binary, which
 * do not yet exist. They will be RED until the production code is added.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const tct = require('../../bus/shim/tct.js');

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-tct-'));
  const dbPath = path.join(dir, 't.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  // Migration 002 + legacy message_deliveries/mission_messages tables
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
    -- T-013a: the mirror now requires the mission to be registered
    -- in swarm_missions to satisfy the FK (production schema has it
    -- with ON DELETE CASCADE). Seed it for tests that expect the
    -- mirror write to succeed.
    CREATE TABLE IF NOT EXISTS swarm_missions (
      mission_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);
  return { dir, dbPath, db };
}

const BUS_BIN = path.resolve(process.cwd(), 'devhub-cli/bin/devhub-bus.js');

function runBus(dbPath, sub, args, env) {
  return spawnSync('node', [BUS_BIN, sub, '--db', dbPath, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...(env || {}) },
  });
}

describe('T-012 — TCT-DELTA shim', () => {
  describe('TCT-DELTA-S1: team_inbox is the primary inbox source', () => {
    test('returns team_inbox rows when present; inbox_source="team_inbox"; no shim_warning', () => {
      const { dir, db } = makeTempDb();
      try {
        db.prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
        ).run('m1', 'worker', 'director', 'directive-1', 'h1');
        db.prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
        ).run('m1', 'worker', 'director', 'directive-2', 'h2');
        db.prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
        ).run('m1', 'worker', 'director', 'directive-3', 'h3');
        // Also seed legacy message_deliveries to make sure they are NOT read
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-1', 'm1', 'director', 'directive', 'legacy-1');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-1',
          'msg-1',
          'launch-x-worker',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );

        const out = tct.resolveInboxForRole(db, 'm1', 'worker', {});
        expect(out.inbox_source).toBe('team_inbox');
        expect(out.shim_warning).toBeUndefined();
        expect(out.rows).toHaveLength(3);
        expect(out.rows.map((r) => r.body).sort()).toEqual([
          'directive-1',
          'directive-2',
          'directive-3',
        ]);
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S2: shim falls back to pending_deliveries when team_inbox is empty', () => {
    test('returns legacy rows; inbox_source="pending_deliveries_legacy"; shim_warning set', () => {
      const { dir, db } = makeTempDb();
      try {
        // Seed legacy mission_messages + message_deliveries
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-1', 'm1', 'director', 'directive', 'legacy-1');
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-2', 'm1', 'director', 'directive', 'legacy-2');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-1',
          'msg-1',
          'worker-A',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-2',
          'msg-2',
          'worker-A',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );

        const out = tct.resolveInboxForRole(db, 'm1', 'worker-A', {});
        expect(out.inbox_source).toBe('pending_deliveries_legacy');
        expect(out.shim_warning).toMatch(/pending_deliveries fallback active/);
        expect(out.rows.length).toBeGreaterThanOrEqual(1);
        const bodies = out.rows.map((r) => r.body_summary || r.body).sort();
        expect(bodies).toContain('legacy-1');
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S3: mixed rows prefer team_inbox', () => {
    test('when both have rows, team_inbox wins; inbox_source="team_inbox"; no shim_warning', () => {
      const { dir, db } = makeTempDb();
      try {
        // 1 team_inbox row
        db.prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
        ).run('m1', 'worker', 'director', 'new-row', 'h-new');
        // 2 legacy rows
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-1', 'm1', 'director', 'directive', 'legacy-1');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-1',
          'msg-1',
          'worker',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-2', 'm1', 'director', 'directive', 'legacy-2');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-2',
          'msg-2',
          'worker',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );

        const out = tct.resolveInboxForRole(db, 'm1', 'worker', {});
        expect(out.inbox_source).toBe('team_inbox');
        expect(out.shim_warning).toBeUndefined();
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].body).toBe('new-row');
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S4: _devhub_chat mirror to pending_deliveries', () => {
    test('devhub-bus chat-write writes to team_inbox AND message_deliveries (legacy mirror) when shim is active', () => {
      const { dir, db, dbPath } = makeTempDb();
      try {
        // T-013a: register the mission in swarm_missions so the mirror
        // helper can write to mission_messages (which has FK to swarm_missions).
        db.prepare('INSERT INTO swarm_missions (mission_id, status) VALUES (?, ?)').run(
          'm1',
          'active'
        );
        const r = runBus(
          dbPath,
          'chat-write',
          [
            '--mission',
            'm1',
            '--from',
            'director',
            '--to',
            'worker',
            '--kind',
            'chat',
            '--body',
            'mirror-1',
          ],
          {} // shim active
        );
        if (r.status !== 0) {
          process.stderr.write(`chat-write STDOUT=${r.stdout}\nSTDERR=${r.stderr}\n`);
        }
        expect(r.status).toBe(0);

        // team_inbox has the row (the new bus path)
        const inboxRow = db.prepare('SELECT * FROM team_inbox WHERE mission_id = ?').get('m1');
        expect(inboxRow).toBeDefined();
        expect(inboxRow.from_role).toBe('director');
        expect(inboxRow.to_role).toBe('worker');
        expect(inboxRow.body).toBe('mirror-1');

        // mission_messages + message_deliveries (legacy mirror) have rows
        const msgRow = db.prepare('SELECT * FROM mission_messages WHERE mission_id = ?').get('m1');
        expect(msgRow).toBeDefined();
        expect(msgRow.body_summary).toBe('mirror-1');
        const delivRow = db
          .prepare('SELECT * FROM message_deliveries WHERE message_id = ?')
          .get(msgRow.message_id);
        expect(delivRow).toBeDefined();
        expect(delivRow.recipient_agent_id).toBe('worker');
        expect(delivRow.status).toBe('pending');
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S5: worker offline re-inject on bootstrap', () => {
    test('_devhub_inbox_check returns unconsumed team_inbox rows and sets consumed_at', () => {
      const { dir, db, dbPath } = makeTempDb();
      try {
        db.prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash)
           VALUES (?, ?, ?, ?, ?)`
        ).run('m1', 'worker', 'director', 'bootstrap-directive', 'h-bs');

        const r = runBus(dbPath, 'inbox-check', ['--mission', 'm1', '--role', 'worker'], {});
        expect(r.status).toBe(0);
        const rows = JSON.parse(r.stdout.trim());
        expect(rows).toHaveLength(1);
        expect(rows[0].body).toBe('bootstrap-directive');
        expect(rows[0].consumed_at).toBeTruthy();

        // Second call: row was consumed, empty result
        const r2 = runBus(dbPath, 'inbox-check', ['--mission', 'm1', '--role', 'worker'], {});
        const rows2 = JSON.parse(r2.stdout.trim());
        expect(rows2).toHaveLength(0);
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S6: shim warning is set when fallback is used', () => {
    test('resolveInboxForRole returns shim_warning string on legacy fallback', () => {
      const { dir, db } = makeTempDb();
      try {
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-1', 'm1', 'director', 'directive', 'legacy-1');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-1',
          'msg-1',
          'worker',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );

        const out = tct.resolveInboxForRole(db, 'm1', 'worker', {});
        expect(out.shim_warning).toMatch(/shim/);
        expect(out.shim_warning).toMatch(/mission=m1/);
        expect(out.shim_warning).toMatch(/role=worker/);
        expect(out.shim_warning).toMatch(/remove after release/);
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S7: feature flag DEVHUB_INBOX_SHIM_DISABLED bypasses the shim', () => {
    test('DEVHUB_INBOX_SHIM_DISABLED=true → devhub-bus chat-write does NOT write to message_deliveries', () => {
      const { dir, db, dbPath } = makeTempDb();
      try {
        const r = runBus(
          dbPath,
          'chat-write',
          [
            '--mission',
            'm1',
            '--from',
            'director',
            '--to',
            'worker',
            '--kind',
            'chat',
            '--body',
            'no-mirror',
          ],
          { DEVHUB_INBOX_SHIM_DISABLED: 'true' }
        );
        if (r.status !== 0) {
          process.stderr.write(
            `chat-write (shim disabled) STDOUT=${r.stdout}\nSTDERR=${r.stderr}\n`
          );
        }
        expect(r.status).toBe(0);

        // team_inbox still gets the row
        const inboxRow = db.prepare('SELECT * FROM team_inbox WHERE mission_id = ?').get('m1');
        expect(inboxRow).toBeDefined();
        expect(inboxRow.body).toBe('no-mirror');

        // message_deliveries does NOT
        const delivCount = db.prepare('SELECT count(*) AS n FROM message_deliveries').get().n;
        expect(delivCount).toBe(0);

        // And the shim-disabled INFO log line is present
        // (the binary prefixes stderr with the subcommand name)
        expect(r.stderr).toMatch(/devhub-helper: chat-write: shim disabled via env flag/);
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('resolveInboxForRole with DEVHUB_INBOX_SHIM_DISABLED=true does NOT fall back to legacy', () => {
      const { dir, db } = makeTempDb();
      try {
        db.prepare(
          `INSERT INTO mission_messages (message_id, mission_id, sender_agent_id, message_kind, body_summary)
           VALUES (?, ?, ?, ?, ?)`
        ).run('msg-1', 'm1', 'director', 'directive', 'legacy-1');
        db.prepare(
          `INSERT INTO message_deliveries (delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          'd-1',
          'msg-1',
          'worker',
          'local_snapshot',
          'pending',
          new Date().toISOString(),
          new Date().toISOString()
        );

        const out = tct.resolveInboxForRole(db, 'm1', 'worker', {
          DEVHUB_INBOX_SHIM_DISABLED: 'true',
        });
        expect(out.inbox_source).toBe('team_inbox'); // even when empty, do not fall back
        expect(out.rows).toHaveLength(0);
        expect(out.shim_warning).toBeUndefined();
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('TCT-DELTA-S8: team_tell MCP tool signature is stable (documented contract)', () => {
    test('team_tell documented contract: signature, return type, and team_inbox write behavior', () => {
      // The team_tell MCP tool is documented in the spec as having a stable
      // external contract. It does not currently exist in devhub-mcp (it is
      // listed as UNSUPPORTED in tests/integration/tools-list.test.js).
      // This test captures the documented contract so a future re-introduction
      // is forced to match it.
      //
      // Expected external contract:
      //   signature: team_tell({ recipients, target_role, mission_id, body })
      //   return:    { delivered: Array<{recipient_agent_id, status}>, errors: Array<...> }
      //   errors:    { code, message } on validation failure
      //   behavior:  writes to team_inbox (NEW) AND message_deliveries (legacy, when shim active)
      //
      // Since the tool is not implemented in this codebase, this test
      // asserts the contract via the contract-helper exported by the shim.
      const contract = tct.getTeamTellContract();
      expect(contract.signature.params.sort()).toEqual(
        ['body', 'mission_id', 'recipients', 'target_role'].sort()
      );
      expect(contract.returnShape.delivered).toBe('Array<{recipient_agent_id, status}>');
      expect(contract.returnShape.errors).toBe('Array<{code, message}>');
      expect(contract.writesTo).toEqual(expect.arrayContaining(['team_inbox']));
    });
  });

  describe('TCT-DELTA-S9: regression test for shim removal (grep guard)', () => {
    test('mirror logic is centralized in tct.js and not inlined in devhub-bus.js', () => {
      // Per T-013a: the mirror write to mission_messages + message_deliveries
      // is owned by src/lib/bus/shim/tct.js (function: mirrorChatToLegacy).
      // The devhub-bus binary delegates to it; it MUST NOT inline the
      // mirror SQL. This guards against future drift back to inline
      // mirrors (which is what caused the smoke-test FK error spam).
      const shimSrc = fs.readFileSync(path.join(__dirname, '../../bus/shim/tct.js'), 'utf8');
      // The shim now owns the mirror write.
      expect(shimSrc).toMatch(/function\s+mirrorChatToLegacy/);
      expect(shimSrc).toMatch(/INSERT\s+(OR\s+IGNORE\s+)?INTO\s+message_deliveries/i);
      expect(shimSrc).toMatch(/INSERT\s+(OR\s+IGNORE\s+)?INTO\s+mission_messages/i);

      // And devhub-bus must delegate (no inline mirror SQL).
      const busSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../../devhub-cli/bin/devhub-bus.js'),
        'utf8'
      );
      expect(busSrc).toMatch(/require\(['"]\.\.\/\.\.\/src\/lib\/bus\/shim\/tct/);
      // The inline mirror must be gone — no INSERT into message_deliveries
      // in devhub-bus anymore.
      expect(busSrc).not.toMatch(/INSERT\s+(OR\s+IGNORE\s+)?INTO\s+message_deliveries/i);
      expect(busSrc).not.toMatch(/function\s+writePendingDeliveriesMirror/);
    });
  });
});

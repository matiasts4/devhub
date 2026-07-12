/* eslint-env node, jest */
/**
 * T-006 — _devhub_tell_director HMAC → bus-call shim tests.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/agent-bus-helpers/spec.md
 *   - Shim emits WARN to stderr ("_devhub_tell_director is deprecated; use _devhub_chat")
 *   - Shim writes the message to team_chat (no HMAC, no HTTP, no circuit breaker)
 *   - DEVHUB_INBOX_SHIM_DISABLED=true → shim does nothing (emergency cutover)
 *
 * Per tasks.md, the shim REPLACES the 78-line HMAC body of buildDirectorTmuxInjection
 * and REMOVES the _devhub_pending_deliveries_loop (68 lines).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const wrapper = require('../agentLaunchWrapper.js');
const { hasBash, bashSyntaxCheck } = require('../../test-support/bashTestUtils');
const BUS_BIN = path.resolve(process.cwd(), 'devhub-cli/bin/devhub-bus.js');

const testWithBash = hasBash ? test : test.skip;
// Executes node + better-sqlite3 inside bash — not portable to WSL/Git Bash.
const testBashExec = process.platform === 'win32' ? test.skip : test;

function makeTmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-shim-'));
  const dbPath = path.join(dir, 't.db');
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
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event
      ON team_chat(mission_id, client_event_id) WHERE client_event_id IS NOT NULL;
  `);
  db.close();
  return { dir, dbPath };
}

function makeTmpScript(extra) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-shim-ws-'));
}

describe('T-006 — _devhub_tell_director shim', () => {
  test('rendered wrapper contains _devhub_tell_director with WARN deprecation message', () => {
    const wrapper_str = wrapper.buildAgentLaunchWrapper({
      agentId: 'launch-abc-auditor',
      missionId: 'launch-abc',
      role: 'auditor',
      workspacePath: '/tmp/ws',
      directorTmuxSession: 'devhub-swarm-abc-director',
      innerCommand: 'sleep 1',
      busBinaryPath: BUS_BIN,
      dbPath: '/tmp/x.db',
    });
    expect(wrapper_str).toMatch(/_devhub_tell_director\(\)/);
    expect(wrapper_str).toMatch(/WARN/i);
    expect(wrapper_str).toMatch(/deprecated/i);
    expect(wrapper_str).toMatch(/_devhub_chat/i);
  });

  test('rendered wrapper does NOT contain HMAC code (openssl dgst -hmac, _circuit_file)', () => {
    const wrapper_str = wrapper.buildAgentLaunchWrapper({
      agentId: 'launch-abc-auditor',
      missionId: 'launch-abc',
      role: 'auditor',
      workspacePath: '/tmp/ws',
      directorTmuxSession: 'devhub-swarm-abc-director',
      innerCommand: 'sleep 1',
      busBinaryPath: BUS_BIN,
      dbPath: '/tmp/x.db',
    });
    // HMAC body markers that should be GONE:
    expect(wrapper_str).not.toMatch(/openssl dgst -sha256 -hmac/);
    expect(wrapper_str).not.toMatch(/_circuit_file/);
    expect(wrapper_str).not.toMatch(/Circuit OPEN/i);
  });

  test('rendered wrapper does NOT contain _devhub_pending_deliveries_loop (T-006 removes it)', () => {
    const wrapper_str = wrapper.buildAgentLaunchWrapper({
      agentId: 'launch-abc-auditor',
      missionId: 'launch-abc',
      role: 'auditor',
      workspacePath: '/tmp/ws',
      directorTmuxSession: 'devhub-swarm-abc-director',
      innerCommand: 'sleep 1',
      busBinaryPath: BUS_BIN,
      dbPath: '/tmp/x.db',
    });
    expect(wrapper_str).not.toMatch(/_devhub_pending_deliveries_loop/);
  });

  testWithBash('rendered wrapper passes bash -n syntax check', () => {
    const wrapper_str = wrapper.buildAgentLaunchWrapper({
      agentId: 'launch-abc-auditor',
      missionId: 'launch-abc',
      role: 'auditor',
      workspacePath: '/tmp/ws',
      directorTmuxSession: 'devhub-swarm-abc-director',
      innerCommand: 'sleep 1',
      busBinaryPath: BUS_BIN,
      dbPath: '/tmp/x.db',
    });
    const tmp = path.join(makeTmpScript(), 'wrapper.sh');
    fs.writeFileSync(tmp, wrapper_str, { mode: 0o644 });
    const r = bashSyntaxCheck(tmp);
    expect(r.status).toBe(0);
  });

  testBashExec(
    'calling rendered _devhub_tell_director inserts a team_chat row (regression: existing call sites)',
    () => {
      const { dir, dbPath } = makeTmpDb();
      const ws = makeTmpScript();
      const workspacePath = path.join(ws, 'workspace');
      fs.mkdirSync(workspacePath, { recursive: true });
      try {
        // Use the innerCommand to invoke _devhub_tell_director — the auto-restart loop
        // runs the inner command and exits on success, so the script terminates after
        // the shim runs once.
        const wrapper_str = wrapper.buildAgentLaunchWrapper({
          agentId: 'launch-abc-auditor',
          missionId: 'launch-abc',
          role: 'auditor',
          workspacePath,
          directorTmuxSession: 'devhub-swarm-abc-director',
          innerCommand: '_devhub_tell_director "task done: <X>"',
          busBinaryPath: BUS_BIN,
          dbPath,
        });
        const script = path.join(ws, 'run.sh');
        fs.writeFileSync(
          script,
          [
            '#!/usr/bin/env bash',
            'export DEVHUB_MISSION_ID="launch-abc"',
            'export DEVHUB_ROLE="auditor"',
            'export DEVHUB_AGENT_ID="launch-abc-auditor"',
            'export DEVHUB_DB_PATH="' + dbPath + '"',
            'export PATH="' + path.dirname(BUS_BIN) + ':$PATH"',
            wrapper_str,
          ].join('\n'),
          { mode: 0o755 }
        );
        const r = spawnSync('bash', [script], { encoding: 'utf-8' });
        if (r.status !== 0) {
          process.stderr.write(`shim script STDOUT=${r.stdout}\nSTDERR=${r.stderr}\n`);
        }
        expect(r.status).toBe(0);
        // Verify the row was inserted
        const db = new Database(dbPath, { readonly: true });
        const allRows = db.prepare('SELECT * FROM team_chat').all();
        process.stderr.write(`DBG all rows: ${JSON.stringify(allRows)}\n`);
        const rows = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').all('launch-abc');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        // The shim writes to chat.jsonl via the binary — body should be present
        const match = rows.find((r) => String(r.body).includes('task done'));
        expect(match).toBeDefined();
        db.close();
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});

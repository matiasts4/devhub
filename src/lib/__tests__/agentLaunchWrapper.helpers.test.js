/* eslint-env node, jest */
/**
 * T-003 — wrapper bus helpers tests.
 * Spec: agent-bus-helpers + agent-comms-bus (BUS-S4, S5, S6, S7, S8, S10; HELPER-S3..S13).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync: _execFileSync, spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const wrapper = require('../agentLaunchWrapper.js');
const { hasBash, bashSyntaxCheck } = require('../../test-support/bashTestUtils');

// Syntax checks only need any working bash. Execution tests run node +
// better-sqlite3 from inside bash: on Windows the only bash is WSL/Git Bash,
// whose node cannot load the Windows-built native module — skip there.
const testWithBash = hasBash ? test : test.skip;
const testBashExec = process.platform === 'win32' ? test.skip : test;

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-wrapper-'));
}

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-wrapper-db-'));
  const dbPath = path.join(dir, 't.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id TEXT NOT NULL, from_role TEXT NOT NULL, to_role TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('chat','report','alert','ack')),
      body TEXT NOT NULL, body_hash TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')), client_event_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event
      ON team_chat(mission_id, client_event_id) WHERE client_event_id IS NOT NULL;
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
    CREATE TABLE IF NOT EXISTS agent_presence (
      presence_id TEXT PRIMARY KEY, mission_id TEXT, agent_id TEXT NOT NULL,
      workspace_id TEXT, run_id TEXT, runtime_surface TEXT NOT NULL,
      presence_state TEXT NOT NULL CHECK(presence_state IN ('online','busy','idle','waiting','offline','booting','crashed')),
      status_summary TEXT, evidence_ref TEXT,
      last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT NOT NULL,
      UNIQUE(agent_id, mission_id, runtime_surface)
    );
  `);
  db.close();
  return { dir, dbPath };
}

// Use process.cwd() (project root when jest runs) for robust path resolution.
// `__dirname` inside jest doesn't reliably match the test file's location.
const BUS_BIN = path.resolve(process.cwd(), 'devhub-cli/bin/devhub-bus.js');

describe('T-003 — wrapper bus helpers', () => {
  test('buildBusHelpersBlock exists and produces a non-empty bash block', () => {
    expect(typeof wrapper.buildBusHelpersBlock).toBe('function');
    const block = wrapper.buildBusHelpersBlock({ busBinaryPath: BUS_BIN, dbPath: '/tmp/x.db' });
    expect(block).toContain('_devhub_chat()');
    expect(block).toContain('_devhub_event()');
    expect(block).toContain('_devhub_presence()');
    expect(block).toContain('_devhub_inbox_check()');
    expect(block).toContain('_devhub_provision_worker()');
  });

  testWithBash('buildBusHelpersBlock output passes bash -n syntax check', () => {
    const block = wrapper.buildBusHelpersBlock({ busBinaryPath: BUS_BIN, dbPath: '/tmp/x.db' });
    const tmp = path.join(makeTempWorkspace(), 'helpers.sh');
    fs.writeFileSync(tmp, block, { mode: 0o644 });
    const r = bashSyntaxCheck(tmp);
    expect(r.status).toBe(0);
  });

  testBashExec(
    'HELPER-S14: _devhub_chat is callable inside a bash subshell and inserts a team_chat row',
    () => {
      const { dbPath, dir: dbDir } = makeTempDb();
      const ws = makeTempWorkspace();
      try {
        const block = wrapper.buildBusHelpersBlock({ busBinaryPath: BUS_BIN, dbPath });
        const script = path.join(ws, 'with-helpers.sh');
        fs.writeFileSync(
          script,
          [
            '#!/usr/bin/env bash',
            'set -e',
            'export DEVHUB_MISSION_ID="m1"',
            'export DEVHUB_ROLE="auditor"',
            'export DEVHUB_LAUNCH_ID="l-abc"',
            'export DEVHUB_DB_PATH="' + dbPath + '"',
            'export PATH="' + path.dirname(BUS_BIN) + ':$PATH"',
            block,
            '_devhub_chat "hello" --to director --kind chat',
          ].join('\n'),
          { mode: 0o755 }
        );
        const r = spawnSync('bash', [script], { encoding: 'utf-8' });
        if (r.status !== 0) {
          process.stderr.write(`STDOUT: ${r.stdout}\nSTDERR: ${r.stderr}\n`);
        }
        expect(r.status).toBe(0);
        const db = new Database(dbPath, { readonly: true });
        const row = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').get('m1');
        expect(row).toBeDefined();
        expect(row.from_role).toBe('auditor');
        expect(row.to_role).toBe('director');
        expect(row.body).toBe('hello');
        db.close();
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        fs.rmSync(dbDir, { recursive: true, force: true });
      }
    }
  );

  testBashExec('HELPER-S1: _devhub_chat reads body from --message-file', () => {
    const { dbPath, dir: dbDir } = makeTempDb();
    const ws = makeTempWorkspace();
    try {
      const bodyFile = path.join(ws, 'msg.txt');
      fs.writeFileSync(bodyFile, 'body from file');
      const block = wrapper.buildBusHelpersBlock({ busBinaryPath: BUS_BIN, dbPath });
      const script = path.join(ws, 'with-helpers.sh');
      fs.writeFileSync(
        script,
        [
          '#!/usr/bin/env bash',
          'set -e',
          'export DEVHUB_MISSION_ID="m2"',
          'export DEVHUB_ROLE="auditor"',
          'export DEVHUB_DB_PATH="' + dbPath + '"',
          'export PATH="' + path.dirname(BUS_BIN) + ':$PATH"',
          block,
          `_devhub_chat --message-file "${bodyFile}" --to director`,
        ].join('\n'),
        { mode: 0o755 }
      );
      const r = spawnSync('bash', [script], { encoding: 'utf-8' });
      expect(r.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').get('m2');
      expect(row).toBeDefined();
      expect(row.body).toBe('body from file');
      db.close();
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  });

  testBashExec('HELPER-S10/11: _devhub_inbox_check consumes once and second call is empty', () => {
    const { dbPath, dir: dbDir } = makeTempDb();
    const ws = makeTempWorkspace();
    try {
      // Seed an inbox row
      const seed = new Database(dbPath);
      seed
        .prepare(
          `INSERT INTO team_inbox (mission_id, to_role, from_role, body, body_hash) VALUES (?, ?, ?, ?, ?)`
        )
        .run('m3', 'worker', 'director', 'a directive', 'h1');
      seed.close();

      const block = wrapper.buildBusHelpersBlock({ busBinaryPath: BUS_BIN, dbPath });
      const script = path.join(ws, 'inbox-twice.sh');
      fs.writeFileSync(
        script,
        [
          '#!/usr/bin/env bash',
          'set -e',
          'export DEVHUB_MISSION_ID="m3"',
          'export DEVHUB_ROLE="worker"',
          'export DEVHUB_DB_PATH="' + dbPath + '"',
          'export PATH="' + path.dirname(BUS_BIN) + ':$PATH"',
          block,
          '_devhub_inbox_check > /tmp/inbox-out-1.json',
          'COUNT1=$(grep -o \'"id":\\s*[0-9]*\' /tmp/inbox-out-1.json | wc -l)',
          '_devhub_inbox_check > /tmp/inbox-out-2.json',
          'COUNT2=$(grep -o \'"id":\\s*[0-9]*\' /tmp/inbox-out-2.json | wc -l)',
          'echo "FIRST=$COUNT1 SECOND=$COUNT2"',
        ].join('\n'),
        { mode: 0o755 }
      );
      const r = spawnSync('bash', [script], { encoding: 'utf-8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/FIRST=1 SECOND=0/);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  });

  testBashExec('HELPER-S14c: PATH shims make helpers callable when BASH_ENV is unset', () => {
    const { dbPath, dir: dbDir } = makeTempDb();
    const ws = makeTempWorkspace();
    try {
      const persist = wrapper.buildBusHelpersPersistBlock({
        missionId: 'launch-path-shim',
        busBinaryPath: BUS_BIN,
        dbPath,
      });
      const shims = wrapper.buildBusHelpersShimBlock({ missionId: 'launch-path-shim' });
      const script = path.join(ws, 'path-shim.sh');
      fs.writeFileSync(
        script,
        [
          '#!/usr/bin/env bash',
          'set -e',
          'export DEVHUB_MISSION_ID="launch-path-shim"',
          'export DEVHUB_ROLE="coder"',
          'export DEVHUB_DB_PATH="' + dbPath + '"',
          'unset BASH_ENV',
          persist,
          shims,
          '_devhub_chat "via path shim" --to director --kind chat',
        ].join('\n'),
        { mode: 0o755 }
      );
      const r = spawnSync('bash', [script], { encoding: 'utf-8' });
      if (r.status !== 0) {
        process.stderr.write(`STDOUT: ${r.stdout}\nSTDERR: ${r.stderr}\n`);
      }
      expect(r.status).toBe(0);
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT * FROM team_chat WHERE mission_id = ?')
        .get('launch-path-shim');
      expect(row?.body).toBe('via path shim');
      db.close();
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  });

  testBashExec(
    'HELPER-S14b: persisted BASH_ENV makes helpers callable from bash -c subshells',
    () => {
      const { dbPath, dir: dbDir } = makeTempDb();
      const ws = makeTempWorkspace();
      try {
        const persist = wrapper.buildBusHelpersPersistBlock({
          missionId: 'launch-bash-env',
          busBinaryPath: BUS_BIN,
          dbPath,
        });
        const script = path.join(ws, 'bash-env.sh');
        fs.writeFileSync(
          script,
          [
            '#!/usr/bin/env bash',
            'set -e',
            'export DEVHUB_MISSION_ID="launch-bash-env"',
            'export DEVHUB_ROLE="auditor"',
            'export DEVHUB_DB_PATH="' + dbPath + '"',
            persist,
            `BASH_ENV="$DEVHUB_BUS_HELPERS_FILE" bash -c '_devhub_chat "via bash env" --to director --kind chat'`,
          ].join('\n'),
          { mode: 0o755 }
        );
        const r = spawnSync('bash', [script], { encoding: 'utf-8' });
        if (r.status !== 0) {
          process.stderr.write(`STDOUT: ${r.stdout}\nSTDERR: ${r.stderr}\n`);
        }
        expect(r.status).toBe(0);
        const db = new Database(dbPath, { readonly: true });
        const row = db
          .prepare('SELECT * FROM team_chat WHERE mission_id = ?')
          .get('launch-bash-env');
        expect(row?.body).toBe('via bash env');
        db.close();
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        fs.rmSync(dbDir, { recursive: true, force: true });
      }
    }
  );

  test('DEVHUB_DB_PATH is exported in buildAgentEnvExports', () => {
    const params = {
      agentId: 'launch-abc-auditor',
      missionId: 'launch-abc',
      role: 'auditor',
      workspacePath: '/tmp/ws',
      workspaceId: 'ws-1',
      runId: 'run-1',
      supervisorUrl: 'http://localhost:3000',
      tmuxSessionName: 't1',
      directorSessionName: 'd1',
      modelProvider: 'minimax',
      dbPath: '/abs/path/to/devhub.db',
    };
    const result = wrapper.buildAgentEnvExports(params);
    // DEVHUB_DB_PATH is resolved through _devhub_to_bash_path at runtime so
    // Windows host paths map to /mnt/<drive>/... under WSL.
    expect(result).toContain(
      `export DEVHUB_DB_PATH="$(_devhub_to_bash_path '/abs/path/to/devhub.db' 2>/dev/null || printf '%s' '/abs/path/to/devhub.db')"`
    );
    expect(result).toContain('export BASH_ENV="/tmp/devhub-mission-launch-abc/bus-helpers.sh"');
  });
});

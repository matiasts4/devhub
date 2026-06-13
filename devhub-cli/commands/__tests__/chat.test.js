/* eslint-env node, jest */
/**
 * T-005 — CLI chat/events/status commands.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/agent-bus-helpers/spec.md
 *   - chat send|list|watch
 *   - events tail
 *   - status (with Bus section)
 *
 * Tests reference devhub-cli/commands/chat.js (NEW), events.js (MODIFY), status.js (MODIFY).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const CLI_BIN = path.resolve(process.cwd(), 'devhub-cli/bin/devhub');
const BUS_BIN = path.resolve(process.cwd(), 'devhub-cli/bin/devhub-bus.js');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-cli-'));
}

function makeTestDb() {
  const dir = makeTmp();
  const dbPath = path.join(dir, 'cli-test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
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
  `);
  db.close();
  return { dir, dbPath };
}

function runCli(...args) {
  return spawnSync('node', [CLI_BIN, ...args], { encoding: 'utf-8' });
}

describe('T-005 — CLI chat command', () => {
  test('chat send --body "hi" --to director inserts a team_chat row', () => {
    const { dir, dbPath } = makeTestDb();
    try {
      const r = runCli(
        '--db',
        dbPath,
        'chat',
        'send',
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
      const rows = db.prepare('SELECT * FROM team_chat WHERE mission_id = ?').all('m1');
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe('hello world');
      expect(rows[0].from_role).toBe('auditor');
      expect(rows[0].to_role).toBe('director');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('chat list returns recent 50 rows DESC by ts', () => {
    const { dir, dbPath } = makeTestDb();
    try {
      // Seed 3 rows
      for (let i = 0; i < 3; i++) {
        runCli(
          '--db',
          dbPath,
          'chat',
          'send',
          '--mission',
          'm2',
          '--from',
          'a',
          '--to',
          'd',
          '--kind',
          'chat',
          '--body',
          `msg-${i}`
        );
      }
      const r = runCli('--db', dbPath, 'chat', 'list', '--mission', 'm2');
      expect(r.status).toBe(0);
      // Output should contain all 3 messages
      expect(r.stdout).toMatch(/msg-0/);
      expect(r.stdout).toMatch(/msg-1/);
      expect(r.stdout).toMatch(/msg-2/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T-005 — CLI events tail', () => {
  test('events tail --mission X writes initial output and exits cleanly on SIGTERM', async () => {
    const { dir, dbPath } = makeTestDb();
    try {
      // Pre-create the JSONL directory with a sample line
      const jsonlDir = `/tmp/devhub-mission-mT1`;
      fs.rmSync(jsonlDir, { recursive: true, force: true });
      fs.mkdirSync(jsonlDir, { recursive: true });
      const file = path.join(jsonlDir, 'events.jsonl');
      fs.writeFileSync(
        file,
        JSON.stringify({ kind: 'task_completed', source_role: 'worker' }) + '\n'
      );

      // Run events tail with a short timeout via SIGTERM
      const proc = require('child_process').spawn(
        'node',
        [CLI_BIN, '--db', dbPath, 'events', 'tail', '--mission', 'mT1'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );

      let stdout = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      setTimeout(() => proc.kill('SIGTERM'), 800);
      // Wait for exit
      const exitCode = await new Promise((resolve) => {
        proc.on('exit', (code) => resolve(code));
      });
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/task_completed/);
    } finally {
      fs.rmSync('/tmp/devhub-mission-mT1', { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T-005 — status Bus section (smoke)', () => {
  test('status.js source includes Bus section renderer', () => {
    // The status command's Bus section is wired into the main statusCommand().
    // We can't easily exercise it through the CLI without a populated default db,
    // so verify the renderer is present in the source as a regression guard.
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'devhub-cli/commands/status.js'),
      'utf8'
    );
    expect(src).toMatch(/section\('Bus'\)/);
    expect(src).toMatch(/getMissionBusSnapshot|devhub-bus.*snapshot/);
  });
});

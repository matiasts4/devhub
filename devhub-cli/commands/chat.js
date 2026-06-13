'use strict';

/**
 * devhub chat — inter-agent chat bus CLI.
 * Subcommands: send, list, watch.
 * Reads/writes through devhub-bus binary.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const BUS_BIN = path.resolve(__dirname, '../bin/devhub-bus.js');

function resolveDbPath(opts) {
  return opts.db || process.env.DEVHUB_DB_PATH || null;
}

function chatSend(opts) {
  const { mission, from, to, kind, body, 'client-event-id': clientEventId, db } = opts;
  if (!mission || !from || !to) {
    process.stderr.write('error: chat send requires --mission, --from, --to.\n');
    process.exit(64);
  }
  if (!body) {
    process.stderr.write('error: chat send requires --body.\n');
    process.exit(64);
  }
  const args = [
    BUS_BIN,
    '--db',
    resolveDbPath({ db }),
    'chat-write',
    '--mission',
    mission,
    '--from',
    from,
    '--to',
    to,
    '--kind',
    kind || 'chat',
    '--body',
    body,
  ];
  if (clientEventId) args.push('--client-event-id', clientEventId);
  const r = require('child_process').spawnSync('node', args, { stdio: 'inherit' });
  process.exit(r.status || 0);
}

function chatList(opts) {
  const { mission, limit, db } = opts;
  if (!mission) {
    process.stderr.write('error: chat list requires --mission.\n');
    process.exit(64);
  }
  const dbPath = resolveDbPath({ db });
  if (!dbPath) {
    process.stderr.write('error: chat list requires --db or DEVHUB_DB_PATH.\n');
    process.exit(64);
  }
  const dbHandle = new Database(dbPath, { readonly: true });
  const rows = dbHandle
    .prepare(
      `SELECT id, ts, from_role, to_role, kind, body
       FROM team_chat
       WHERE mission_id = ?
       ORDER BY ts DESC
       LIMIT ?`
    )
    .all(mission, Number(limit) || 50);
  dbHandle.close();
  if (rows.length === 0) {
    process.stdout.write('(no chat messages)\n');
    return;
  }
  for (const r of rows) {
    process.stdout.write(
      `#${r.id}  ${r.ts}  ${r.from_role} → ${r.to_role}  [${r.kind}]  ${r.body}\n`
    );
  }
}

function chatWatch(opts) {
  const { mission, db } = opts;
  if (!mission) {
    process.stderr.write('error: chat watch requires --mission.\n');
    process.exit(64);
  }
  const dir = `/tmp/devhub-mission-${mission}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'chat.jsonl');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  const tail = spawn('tail', ['-F', '--retry', '-n', '+1', file], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  tail.stdout.on('data', (chunk) => process.stdout.write(chunk));
  process.on('SIGINT', () => {
    tail.kill('SIGTERM');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    tail.kill('SIGTERM');
    process.exit(0);
  });
}

module.exports = function chatCommand(sub, opts) {
  switch (sub) {
    case 'send':
      return chatSend(opts);
    case 'list':
      return chatList(opts);
    case 'watch':
      return chatWatch(opts);
    default:
      process.stderr.write(`error: unknown chat subcommand '${sub}'. Use send|list|watch.\n`);
      process.exit(64);
  }
};

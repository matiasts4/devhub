#!/usr/bin/env node

/**
 * devhub-bus — single binary that mediates ALL writes to the agent comms bus.
 *
 * Subcommands: chat-write, event-write, presence-upsert, inbox-check,
 *   snapshot, rotate, director-consume.
 * Exit codes: 0 success, 64 usage, 65 data, 66 no-such-table, 73 cannot-create.
 * Stdout: single-line JSON on success. Stderr: devhub-helper: <name>: <code>: <msg>.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_DATA = 65;
const EXIT_NO_TABLE = 66;
const EXIT_CANNOT_CREATE = 73;
const MISSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function failExit(code, msg) {
  const tag =
    code === EXIT_USAGE
      ? 'usage'
      : code === EXIT_DATA
        ? 'data'
        : code === EXIT_NO_TABLE
          ? 'no-table'
          : code === EXIT_CANNOT_CREATE
            ? 'cannot-create'
            : 'error';
  process.stderr.write(`devhub-helper: ${process.argv[2] || 'unknown'}: ${tag}: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  // Find subcommand: first non-flag arg after argv[0..1] (node + script)
  let sub = null;
  let subIdx = -1;
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) {
      sub = argv[i];
      subIdx = i;
      break;
    }
  }
  const out = { _: sub };
  for (let i = 2; i < argv.length; i++) {
    if (i === subIdx) continue;
    const a = argv[i];
    if (a && a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      out[k] = v;
      i++;
    }
  }
  return out;
}

function openDb(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    failExit(EXIT_USAGE, `database not found: ${dbPath}`);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

function withBusyRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (e) {
      if (String(e.code) === 'SQLITE_BUSY' && i < attempts - 1) {
        // Brief linear backoff (100ms)
        const until = Date.now() + 100;
        (function busyWait() {
          while (Date.now() < until) {
            /* spin */
          }
        })();
        continue;
      }
      throw e;
    }
  }
}

function checkTableExists(db, tableName) {
  const r = db
    .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName);
  if (!r.n) {
    failExit(EXIT_NO_TABLE, `table ${tableName} does not exist — run migration 002 first`);
  }
}

function validateMissionId(mid) {
  if (!mid || !MISSION_ID_REGEX.test(mid)) {
    failExit(EXIT_USAGE, `mission_id must match ${MISSION_ID_REGEX}`);
  }
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function jsonlProjectionDir(missionId) {
  return `/tmp/devhub-mission-${missionId}`;
}

function appendJsonl(missionId, kind, payload) {
  try {
    const dir = jsonlProjectionDir(missionId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${kind}.jsonl`);
    const line = JSON.stringify({ ...payload, _projected_at: new Date().toISOString() });
    fs.appendFileSync(file, line + '\n', 'utf8');
  } catch (e) {
    // Per D1: best-effort; row is already durable, JSONL failure is logged but
    // the row still stands. Caller exits 0 because the durable insert succeeded.
    process.stderr.write(`devhub-helper: jsonl-projection: warn: ${e.message}\n`);
  }
}

function cmdChatWrite(db, args) {
  const { mission: missionId, from: fromRole, to: toRole, kind, body } = args;
  const clientEventId =
    args['client-event-id'] ||
    `chat-${sha256Hex(`${missionId}|${fromRole}|${Date.now()}|${Math.random()}`).slice(0, 16)}`;
  validateMissionId(missionId);
  if (!fromRole || !toRole) failExit(EXIT_USAGE, '--from and --to required');
  if (!['chat', 'report', 'alert', 'ack'].includes(kind))
    failExit(EXIT_USAGE, '--kind must be chat|report|alert|ack');
  if (!body) failExit(EXIT_USAGE, '--body required');
  checkTableExists(db, 'team_chat');

  const bodyHash = sha256Hex(body);
  withBusyRetry(() => {
    db.prepare(
      `INSERT OR IGNORE INTO team_chat
        (mission_id, from_role, to_role, kind, body, body_hash, client_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(missionId, fromRole, toRole, kind, body, bodyHash, clientEventId);
  });

  appendJsonl(missionId, 'chat', {
    seq: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mission_id: missionId,
    from_role: fromRole,
    to_role: toRole,
    kind,
    body,
    body_hash: bodyHash,
    client_event_id: clientEventId,
  });
  process.stdout.write(
    JSON.stringify({ ok: true, client_event_id: clientEventId, body_hash: bodyHash }) + '\n'
  );
  process.exit(EXIT_OK);
}

function cmdEventWrite(db, args) {
  const { mission: missionId, source: sourceRole, kind, payload } = args;
  const dedupeKey = args['dedupe-key'] || sha256Hex(`${kind}\n${payload || ''}`);
  validateMissionId(missionId);
  if (!sourceRole) failExit(EXIT_USAGE, '--source required');
  if (!kind) failExit(EXIT_USAGE, '--kind required');
  if (payload && !safeJsonParse(payload)) failExit(EXIT_DATA, '--payload must be valid JSON');
  checkTableExists(db, 'team_events');

  withBusyRetry(() => {
    db.prepare(
      `INSERT OR IGNORE INTO team_events
        (mission_id, source_role, kind, dedupe_key, payload_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(missionId, sourceRole, kind, dedupeKey, payload || null);
  });

  appendJsonl(missionId, 'events', {
    seq: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mission_id: missionId,
    source_role: sourceRole,
    kind,
    dedupe_key: dedupeKey,
    payload_json: payload,
  });
  process.stdout.write(JSON.stringify({ ok: true, dedupe_key: dedupeKey }) + '\n');
  process.exit(EXIT_OK);
}

function safeJsonParse(s) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

function cmdPresenceUpsert(db, args) {
  const { mission: missionId, agent: agentId, 'runtime-surface': runtimeSurface } = args;
  const { state, summary, 'ttl-seconds': ttlSeconds } = args;
  validateMissionId(missionId);
  if (!agentId) failExit(EXIT_USAGE, '--agent required');
  if (!runtimeSurface) failExit(EXIT_USAGE, '--runtime-surface required');
  const VALID = ['online', 'busy', 'idle', 'waiting', 'offline', 'booting', 'crashed'];
  if (!VALID.includes(state)) failExit(EXIT_USAGE, `--state must be one of ${VALID.join('|')}`);
  const ttl = Number(ttlSeconds) || 120;
  checkTableExists(db, 'agent_presence');

  const now = new Date().toISOString();
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  const presenceId = `${missionId || '_'}-${agentId}-${runtimeSurface}`;

  withBusyRetry(() => {
    db.prepare(
      `INSERT INTO agent_presence
        (presence_id, mission_id, agent_id, runtime_surface, presence_state, status_summary, last_seen_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, mission_id, runtime_surface) DO UPDATE SET
         presence_state = excluded.presence_state,
         status_summary = excluded.status_summary,
         last_seen_at = excluded.last_seen_at,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    ).run(
      presenceId,
      missionId,
      agentId,
      runtimeSurface,
      state,
      summary || null,
      now,
      expires,
      now
    );
  });

  if (missionId) {
    appendJsonl(missionId, 'presence', {
      seq: `pres-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mission_id: missionId,
      agent_id: agentId,
      runtime_surface: runtimeSurface,
      state,
      summary,
    });
  }
  process.stdout.write(JSON.stringify({ ok: true, presence_id: presenceId }) + '\n');
  process.exit(EXIT_OK);
}

function cmdInboxCheck(db, args) {
  const { mission: missionId, role: toRole } = args;
  validateMissionId(missionId);
  if (!toRole) failExit(EXIT_USAGE, '--role required');
  checkTableExists(db, 'team_inbox');

  const consumedAt = new Date().toISOString();
  const rows = withBusyRetry(() => {
    // UPSERT consumed_at for rows that don't have one yet, then return them.
    // We use INSERT ... ON CONFLICT to mark the consumed_at in one statement.
    // First read pending rows:
    const pending = db
      .prepare(
        `SELECT id, mission_id, to_role, from_role, body, body_hash, client_event_id, created_at
         FROM team_inbox
         WHERE mission_id = ? AND to_role = ? AND consumed_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(missionId, toRole);
    if (pending.length === 0) return [];
    const update = db.prepare(
      'UPDATE team_inbox SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL'
    );
    const tx = db.transaction((items) => {
      for (const r of items) update.run(consumedAt, r.id);
    });
    tx(pending);
    return pending.map((r) => ({ ...r, consumed_at: consumedAt }));
  });

  process.stdout.write(JSON.stringify(rows) + '\n');
  process.exit(EXIT_OK);
}

function cmdSnapshot(db, args) {
  const { mission: missionId } = args;
  validateMissionId(missionId);
  if (!db.pragma) failExit(EXIT_USAGE, 'snapshot requires a real db handle');

  const sql = `
    SELECT
      COALESCE((
        SELECT json_group_array(json_object('id', id, 'from_role', from_role, 'to_role', to_role,
                                            'kind', kind, 'body', body, 'body_hash', body_hash, 'ts', ts))
        FROM (SELECT * FROM team_chat WHERE mission_id = @mid ORDER BY ts DESC LIMIT 50)
      ), '[]') AS chat_recent,
      COALESCE((
        SELECT json_group_array(json_object('id', id, 'source_role', source_role, 'kind', kind,
                                            'dedupe_key', dedupe_key, 'payload_json', payload_json, 'ts', ts))
        FROM (SELECT * FROM team_events WHERE mission_id = @mid ORDER BY ts DESC LIMIT 50)
      ), '[]') AS events_recent,
      COALESCE((
        SELECT json_group_array(json_object('id', id, 'from_role', from_role, 'body', body, 'created_at', created_at))
        FROM team_inbox WHERE mission_id = @mid AND consumed_at IS NULL
      ), '[]') AS inbox_pending,
      COALESCE((
        SELECT json_group_array(json_object('agent_id', agent_id, 'state', presence_state,
                                            'summary', status_summary, 'last_seen_at', last_seen_at))
        FROM agent_presence WHERE mission_id = @mid AND datetime(expires_at) > datetime('now')
      ), '[]') AS presence_active
  `;
  let row;
  try {
    row = db.prepare(sql).get({ mid: missionId });
  } catch (e) {
    if (String(e.message).includes('no such table')) {
      failExit(EXIT_NO_TABLE, e.message);
    }
    throw e;
  }
  process.stdout.write(
    JSON.stringify({
      mission_id: missionId,
      snapshot_at: new Date().toISOString(),
      chat_recent: JSON.parse(row.chat_recent || '[]'),
      events_recent: JSON.parse(row.events_recent || '[]'),
      inbox_pending: JSON.parse(row.inbox_pending || '[]'),
      presence_active: JSON.parse(row.presence_active || '[]'),
    }) + '\n'
  );
  process.exit(EXIT_OK);
}

function cmdRotate(_db, args) {
  const { mission: missionId } = args;
  validateMissionId(missionId);
  const dir = jsonlProjectionDir(missionId);
  if (!fs.existsSync(dir)) {
    process.stdout.write(JSON.stringify({ ok: true, rotated: 0 }) + '\n');
    process.exit(EXIT_OK);
  }
  const archiveDir = path.join(dir, 'archive', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(archiveDir, { recursive: true });
  let count = 0;
  for (const f of ['chat', 'events', 'presence', 'inbox']) {
    const src = path.join(dir, `${f}.jsonl`);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(archiveDir, `${f}.jsonl`));
      count++;
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, rotated: count, archive: archiveDir }) + '\n');
  process.exit(EXIT_OK);
}

function cmdDirectorConsume(_db, args) {
  // T-008 — full implementation lands in that task. Stub for now.
  const { mission: missionId, role } = args;
  validateMissionId(missionId);
  if (!role) failExit(EXIT_USAGE, '--role required');
  failExit(EXIT_DATA, 'director-consume is implemented in T-008');
}

function main() {
  const argv = process.argv;
  const sub = argv[2];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write(
      'Usage: devhub-bus <subcommand> [--db <path>] [--mission <id>] [...]\n' +
        'Subcommands: chat-write, event-write, presence-upsert, inbox-check, snapshot, rotate, director-consume\n'
    );
    process.exit(EXIT_USAGE);
  }

  const args = parseArgs(argv);
  const dbPath = args.db || process.env.DEVHUB_DB_PATH;
  if (!dbPath) failExit(EXIT_USAGE, '--db or DEVHUB_DB_PATH required');

  let db;
  try {
    db = openDb(dbPath);
  } catch (e) {
    if (String(e.code) === 'SQLITE_CANTOPEN') {
      failExit(EXIT_CANNOT_CREATE, `cannot open ${dbPath}: ${e.message}`);
    }
    failExit(EXIT_CANNOT_CREATE, e.message);
  }

  try {
    switch (sub) {
      case 'chat-write':
        return cmdChatWrite(db, args);
      case 'event-write':
        return cmdEventWrite(db, args);
      case 'presence-upsert':
        return cmdPresenceUpsert(db, args);
      case 'inbox-check':
        return cmdInboxCheck(db, args);
      case 'snapshot':
        return cmdSnapshot(db, args);
      case 'rotate':
        return cmdRotate(db, args);
      case 'director-consume':
        return cmdDirectorConsume(db, args);
      default:
        failExit(EXIT_USAGE, `unknown subcommand: ${sub}`);
    }
  } catch (e) {
    if (String(e.code) === 'SQLITE_BUSY') {
      failExit(EXIT_CANNOT_CREATE, `busy after retries: ${e.message}`);
    }
    if (String(e.message).includes('no such table')) {
      failExit(EXIT_NO_TABLE, e.message);
    }
    process.stderr.write(`devhub-helper: ${sub}: error: ${e.message}\n`);
    process.exit(EXIT_DATA);
  }
}

main();

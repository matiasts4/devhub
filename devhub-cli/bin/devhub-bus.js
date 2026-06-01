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
const tct = require('../../src/lib/bus/shim/tct.js');

const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_DATA = 65;
const EXIT_NO_TABLE = 66;
const EXIT_CANNOT_CREATE = 73;
const MISSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const KNOWN_SUBCOMMANDS = new Set([
  'chat-write',
  'event-write',
  'presence-upsert',
  'inbox-check',
  'snapshot',
  'rotate',
  'director-consume',
]);

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
  // Find subcommand: scan argv[2..] for the first arg whose value matches
  // a known subcommand. This lets callers pass flags before or after the
  // subcommand (e.g. `devhub-bus --db <path> chat-write ...` or
  // `devhub-bus chat-write --db <path> ...`).
  let sub = null;
  let subIdx = -1;
  for (let i = 2; i < argv.length; i++) {
    if (KNOWN_SUBCOMMANDS.has(argv[i])) {
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
  // T-012 — DEVHUB_INBOX_SHIM_DISABLED bypasses the legacy mirror write.
  // When active, the binary writes only to the new bus (team_chat +
  // team_inbox) and logs an INFO line. Emergency cutover switch.
  const shimDisabled = process.env.DEVHUB_INBOX_SHIM_DISABLED === 'true';
  if (shimDisabled) {
    process.stderr.write('devhub-helper: chat-write: shim disabled via env flag\n');
  }

  withBusyRetry(() => {
    db.prepare(
      `INSERT OR IGNORE INTO team_chat
        (mission_id, from_role, to_role, kind, body, body_hash, client_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(missionId, fromRole, toRole, kind, body, bodyHash, clientEventId);
  });

  // T-012 — also write to team_inbox so the worker can read it via
  // _devhub_inbox_check. Only when --to is a specific role (not "all",
  // which would be a broadcast). team_inbox is the durable bus; team_chat
  // is the audit log.
  let inboxRowId = null;
  if (toRole && toRole !== 'all' && tableExists(db, 'team_inbox')) {
    try {
      withBusyRetry(() => {
        const r = db
          .prepare(
            `INSERT INTO team_inbox
              (mission_id, to_role, from_role, body, body_hash, client_event_id)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(missionId, toRole, fromRole, body, bodyHash, clientEventId);
        inboxRowId = r.lastInsertRowid;
      });
    } catch (e) {
      // best-effort; team_chat is the audit log and stays durable
      process.stderr.write(`devhub-helper: chat-write: team_inbox insert: ${e.message}\n`);
    }
  }

  // T-013a — shim mirror: delegate the legacy `pending_deliveries` write
  // to tct.mirrorChatToLegacy. The helper OWNS the mirror logic and is
  // responsible for the env flag, the swarm_missions FK check, and the
  // mission_not_registered skip. We never throw; we just log a single
  // line on skip/error.
  let mirrorInfo = null;
  const mirrorResult = tct.mirrorChatToLegacy(db, process.env, {
    missionId,
    fromRole,
    toRole,
    body,
    bodyHash,
    kind,
  });
  if (mirrorResult.skipped) {
    // debug-level log; shim_disabled is expected when the env flag is on
    if (mirrorResult.skipped === 'shim_disabled') {
      // already logged above as the "shim disabled via env flag" INFO line
    } else {
      process.stderr.write(
        `devhub-helper: chat-write: mirror skipped (${mirrorResult.skipped}` +
          (mirrorResult.error ? `: ${mirrorResult.error}` : '') +
          ')\n'
      );
    }
  } else {
    mirrorInfo = {
      message_id: mirrorResult.message_id,
      delivery_id: mirrorResult.delivery_id,
      recipient_agent_id: mirrorResult.recipient_agent_id,
    };
  }

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
    JSON.stringify({
      ok: true,
      client_event_id: clientEventId,
      body_hash: bodyHash,
      inbox_row_id: inboxRowId,
      mirror: mirrorInfo,
    }) + '\n'
  );
  process.exit(EXIT_OK);
}

function tableExists(db, name) {
  try {
    const r = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name);
    return Boolean(r && r.n);
  } catch (e) {
    return false;
  }
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
  // T-008 — tail the JSONL projection for a mission with persistent dedupe.
  //   - Reads /tmp/devhub-mission-<id>/{chat,events,presence,inbox}.jsonl via tail -F
  //   - Dedupe key: `${seq}|${from_role}|${body_hash}` rebuilt from
  //     consumer-dedupe-<role>.jsonl on startup, capped at 5000 entries (LRU)
  //   - Emits unique lines to stdout (NDJSON) for director tmux consumer
  //   - On SIGTERM/SIGINT: flushes dedupe buffer, exits 0
  const { mission: missionId, role } = args;
  validateMissionId(missionId);
  if (!role) failExit(EXIT_USAGE, '--role required');

  const dir = jsonlProjectionDir(missionId);
  fs.mkdirSync(dir, { recursive: true });
  const dedupeFile = path.join(dir, `consumer-dedupe-${role}.jsonl`);
  if (!fs.existsSync(dedupeFile)) fs.writeFileSync(dedupeFile, '');

  // Load existing dedupe keys into a Set
  const seen = new Set();
  try {
    const lines = fs.readFileSync(dedupeFile, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const { key } = JSON.parse(line);
        if (key) seen.add(key);
      } catch {
        /* skip corrupt line */
      }
    }
  } catch {
    /* empty file is fine */
  }

  // Cap at 5000
  if (seen.size > 5000) {
    const arr = Array.from(seen).slice(-5000);
    seen.clear();
    for (const k of arr) seen.add(k);
  }

  // Spawn tail -F on chat.jsonl (primary chat feed for the director)
  const file = path.join(dir, 'chat.jsonl');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');

  // Truncate dedupe file to current seen keys (LRU trim)
  try {
    const buf = [];
    for (const k of seen) buf.push(JSON.stringify({ key: k }));
    fs.writeFileSync(dedupeFile, buf.join('\n') + (buf.length ? '\n' : ''));
  } catch {
    /* best effort */
  }

  const tail = spawnSafe('tail', ['-F', '--retry', '-n', '+1', file]);
  if (!tail) failExit(EXIT_CANNOT_CREATE, 'cannot spawn tail — is coreutils installed?');

  let flushed = false;
  function flushAndExit(sig) {
    if (flushed) return;
    flushed = true;
    try {
      // Truncate dedupe file to current seen keys (LRU trim on shutdown)
      const arr = Array.from(seen);
      const buf = arr.map((k) => JSON.stringify({ key: k }));
      fs.writeFileSync(dedupeFile, buf.join('\n') + (buf.length ? '\n' : ''));
    } catch {
      /* best effort */
    }
    try {
      tail.kill('SIGTERM');
    } catch {
      /* already dead */
    }
    process.exit(sig === 'SIGTERM' ? 0 : 0);
  }

  process.on('SIGTERM', () => flushAndExit('SIGTERM'));
  process.on('SIGINT', () => flushAndExit('SIGINT'));

  // Buffer for partial lines
  let lineBuf = '';
  tail.stdout.on('data', (chunk) => {
    lineBuf += chunk.toString();
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let key = null;
      let payload = null;
      try {
        payload = JSON.parse(line);
        const seq = payload.seq || '';
        const fromRole = payload.from_role || '';
        const bodyHash = payload.body_hash || '';
        key = `${seq}|${fromRole}|${bodyHash}`;
      } catch {
        /* non-JSON line: skip */
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // Emit to stdout
      process.stdout.write(line + '\n');
    }
  });
  tail.stderr.on('data', (chunk) => process.stderr.write(chunk));
  tail.on('exit', (code) => {
    flushAndExit('SIGTERM');
  });
}

function spawnSafe(cmd, args) {
  try {
    const { spawn } = require('child_process');
    return spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return null;
  }
}

function main() {
  const argv = process.argv;
  const args = parseArgs(argv);
  const sub = args._;
  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write(
      'Usage: devhub-bus <subcommand> [--db <path>] [--mission <id>] [...]\n' +
        'Subcommands: chat-write, event-write, presence-upsert, inbox-check, snapshot, rotate, director-consume\n'
    );
    process.exit(EXIT_USAGE);
  }

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

/* eslint-env node */
/* eslint-disable no-undef -- CommonJS module used by devhub-bus and tests */
'use strict';

/**
 * Shared inbox delivery logic for devhub-bus inbox-consume / worker-consume.
 * Polls team_inbox, waits for OpenCode TUI readiness, injects formatted
 * directives into tmux, then marks rows consumed and emits delivery events.
 */

const fs = require('fs');
const crypto = require('crypto');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/**
 * Expand JSON delegate payloads into actionable OpenCode prompt text.
 * @param {string} body
 * @param {string|null} fromRole
 * @param {string} toRole
 * @returns {string}
 */
function formatDirectiveForInjection(body, fromRole, toRole) {
  const raw = String(body || '').trim();
  if (!raw) return '';
  const from = fromRole || 'orchestrator';
  let parsed = null;
  if (raw.startsWith('{')) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const isDelegate =
      parsed.kind === 'delegate' || parsed.change || parsed.task_id || parsed.instruction;
    if (isDelegate) {
      const lines = [`[${from} → ${toRole}] Nueva directiva`];
      if (/^sdd_worker_\d+$/.test(String(toRole || '').trim())) {
        lines.push(
          'Comms: reporta a ZED con `_devhub_chat --to zed`; directivas por inbox-consume; ACK con `_devhub_chat --to zed --kind ack`.'
        );
      }
      if (parsed.change) lines.push(`Change: ${parsed.change}`);
      if (parsed.task_id) lines.push(`Task: ${parsed.task_id}`);
      const instruction = parsed.instruction || parsed.message || parsed.body;
      if (instruction) lines.push(String(instruction));
      lines.push('Ejecuta el flujo SDD estandar (/sdd-continue o /sdd-new segun corresponda).');
      if (parsed.kickoff_sdd) lines.push(String(parsed.kickoff_sdd));
      if (/^sdd_worker_\d+$/.test(String(toRole || '').trim())) {
        const {
          formatOperatorPresetsForWorkerDirective,
        } = require('../operations/zedOperatorPresets.cjs');
        lines.push(formatOperatorPresetsForWorkerDirective());
      }
      return lines.join('\n');
    }
  }
  return `[${from} → ${toRole}] ${raw}`;
}

/**
 * Wait for the opencode-ready marker written by the launch sidecar.
 * @param {string} sessionName
 * @param {number} [maxWaitMs]
 * @returns {boolean}
 */
function resolveReadyMarkerPath(prefix, sessionName) {
  const safe = String(sessionName || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-${prefix}-${safe}`;
}

function isTuiReadyForInjection(sessionName) {
  const opencodeReady = resolveReadyMarkerPath('opencode-ready', sessionName);
  const viewportReady = resolveReadyMarkerPath('viewport-ready', sessionName);
  try {
    if (opencodeReady && fs.existsSync(opencodeReady)) return true;
    // Client attached and rendered the pane — OpenCode is already running in tmux.
    if (viewportReady && fs.existsSync(viewportReady)) return true;
  } catch {
    /* best effort */
  }
  return false;
}

function waitForOpencodeReady(sessionName, maxWaitMs = 30000) {
  const target = String(sessionName || '').trim();
  if (!target) return false;
  const deadline = Date.now() + Math.max(500, Number(maxWaitMs) || 30000);
  while (Date.now() < deadline) {
    if (isTuiReadyForInjection(target)) return true;
    const until = Date.now() + 200;
    while (Date.now() < until) {
      /* brief spin */
    }
  }
  return false;
}

/**
 * Inject multi-line text into a tmux pane via literal send-keys.
 * @param {string} sessionName
 * @param {string} text
 * @returns {boolean}
 */
function injectTextToTmuxSession(sessionName, text) {
  const { spawnSync } = require('child_process');
  const target = String(sessionName || '').trim();
  if (!target) return false;
  const payload = String(text || '').trim();
  if (!payload) return false;

  const header = `[DevHub directive ${new Date().toISOString()}]`;
  spawnSync('tmux', ['send-keys', '-t', target, '-l', header], { stdio: 'ignore' });
  spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });

  const lines = payload.split('\n');
  for (const line of lines) {
    const chunks = [];
    const chunkSize = 400;
    for (let index = 0; index < line.length; index += chunkSize) {
      chunks.push(line.slice(index, index + chunkSize));
    }
    if (chunks.length === 0) {
      spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });
      continue;
    }
    for (const chunk of chunks) {
      spawnSync('tmux', ['send-keys', '-t', target, '-l', chunk], { stdio: 'ignore' });
    }
    spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });
  }
  return true;
}

function tableExists(db, name) {
  try {
    const r = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name);
    return Boolean(r && r.n);
  } catch {
    return false;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Function} withBusyRetry
 * @param {string} missionId
 * @param {string} toRole
 * @param {object} row
 * @param {string} consumedAt
 */
function writeInboxDeliveredEvent(db, withBusyRetry, missionId, toRole, row, consumedAt) {
  if (!tableExists(db, 'team_events')) return;
  const payload = JSON.stringify({
    inbox_id: row.id,
    to_role: toRole,
    from_role: row.from_role,
    delivered_at: consumedAt,
    body_hash: row.body_hash,
  });
  const dedupeKey = sha256Hex(`inbox_delivered|${missionId}|${row.id}`);
  try {
    withBusyRetry(() => {
      db.prepare(
        `INSERT OR IGNORE INTO team_events
          (mission_id, source_role, kind, dedupe_key, payload_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(missionId, toRole, 'inbox_delivered', dedupeKey, payload);
    });
  } catch {
    /* best effort */
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Function} withBusyRetry
 * @param {string} missionId
 * @param {string} toRole
 * @param {string|null} fromRole
 * @param {number|string} inboxId
 */
function writeDeliveryAck(db, withBusyRetry, missionId, toRole, fromRole, inboxId) {
  if (!tableExists(db, 'team_chat')) return;
  const ackTarget = fromRole && fromRole !== 'all' ? fromRole : 'director';
  const body = `ACK inbox#${inboxId} delivered and injected`;
  const clientEventId = `ack-inbox-${inboxId}-${Date.now()}`;
  const bodyHash = sha256Hex(body);
  try {
    withBusyRetry(() => {
      db.prepare(
        `INSERT OR IGNORE INTO team_chat
          (mission_id, from_role, to_role, kind, body, body_hash, client_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(missionId, toRole, ackTarget, 'ack', body, bodyHash, clientEventId);
    });
  } catch {
    /* best effort */
  }
}

/**
 * Deliver one pending inbox row. Does not mark consumed until inject succeeds.
 * @param {object} params
 * @param {import('better-sqlite3').Database} params.db
 * @param {Function} params.withBusyRetry
 * @param {object} params.row
 * @param {string} params.targetSession
 * @param {string} params.missionId
 * @param {string} params.toRole
 * @param {number} [params.tuiWaitMs]
 * @param {boolean} [params.skipTuiWait]
 * @returns {{ ok: boolean, reason?: string, inboxId?: number|string, consumedAt?: string }}
 */
function deliverInboxRow({
  db,
  withBusyRetry,
  row,
  targetSession,
  missionId,
  toRole,
  tuiWaitMs = 30000,
  skipTuiWait = false,
}) {
  if (!skipTuiWait && !waitForOpencodeReady(targetSession, tuiWaitMs)) {
    return { ok: false, reason: 'tui_not_ready', inboxId: row.id };
  }

  const text = formatDirectiveForInjection(row.body, row.from_role, toRole);
  const injected = injectTextToTmuxSession(targetSession, text);
  if (!injected) {
    return { ok: false, reason: 'tmux_inject_failed', inboxId: row.id };
  }

  const consumedAt = new Date().toISOString();
  const markConsumed = db.prepare(
    'UPDATE team_inbox SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL'
  );
  const updated = withBusyRetry(() => markConsumed.run(consumedAt, row.id));
  if (!updated.changes) {
    return { ok: false, reason: 'already_consumed', inboxId: row.id };
  }

  writeInboxDeliveredEvent(db, withBusyRetry, missionId, toRole, row, consumedAt);
  writeDeliveryAck(db, withBusyRetry, missionId, toRole, row.from_role, row.id);

  return { ok: true, consumedAt, inboxId: row.id };
}

module.exports = {
  formatDirectiveForInjection,
  waitForOpencodeReady,
  injectTextToTmuxSession,
  deliverInboxRow,
  writeInboxDeliveredEvent,
  writeDeliveryAck,
};

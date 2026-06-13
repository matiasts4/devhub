/* eslint-env node */
/**
 * T-012 — TCT-DELTA shim module.
 *
 * Implements the one-release compatibility shim so that consumers of the
 * legacy `pending_deliveries` table continue to work while `team_inbox`
 * becomes the durable director-to-worker path.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/team-chat-targeting/spec.md
 *   - TCT-DELTA-S1..S3: inbox_source selection (team_inbox → pending_deliveries fallback)
 *   - TCT-DELTA-S6: shim_warning is set on fallback
 *   - TCT-DELTA-S7: DEVHUB_INBOX_SHIM_DISABLED env var bypasses the shim
 *   - TCT-DELTA-S8: team_tell contract documentation
 *
 * The mirror WRITE (chat-write → message_deliveries) is implemented in
 * devhub-cli/bin/devhub-bus.js because that is the single entry point for
 * bash-side writes; this shim only owns the READ path.
 */

'use strict';

const crypto = require('crypto');

const SHIM_WARNING_TEMPLATE =
  'shim: pending_deliveries fallback active for mission=<id> role=<role>; remove after release X';

function isShimDisabled(env) {
  return env && env.DEVHUB_INBOX_SHIM_DISABLED === 'true';
}

function _tableExists(db, name) {
  try {
    const r = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name);
    return Boolean(r && r.n);
  } catch (e) {
    return false;
  }
}

function _sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/**
 * TCT-DELTA-S1/S2/S3/S6: Resolve the inbox for a (mission, role) pair.
 *
 *   1. Read `team_inbox` for (mission_id, to_role)
 *   2. If empty AND shim is active, fall back to `message_deliveries`
 *      joined with `mission_messages` for the mission (the legacy
 *      "pending_deliveries" projection)
 *   3. Set inbox_source + shim_warning accordingly
 *   4. If shim is disabled (DEVHUB_INBOX_SHIM_DISABLED=true), NEVER fall back
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} missionId
 * @param {string} toRole
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ rows: object[], inbox_source: 'team_inbox' | 'pending_deliveries_legacy' | 'team_inbox', shim_warning?: string }}
 */
function resolveInboxForRole(db, missionId, toRole, env) {
  if (!db || !missionId || !toRole) {
    return { rows: [], inbox_source: 'team_inbox' };
  }
  const shimDisabled = isShimDisabled(env);
  // 1) Read team_inbox
  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT id, mission_id, to_role, from_role, body, body_hash, client_event_id, created_at, consumed_at
         FROM team_inbox
         WHERE mission_id = ? AND to_role = ?
         ORDER BY created_at ASC`
      )
      .all(missionId, toRole);
  } catch (e) {
    // table missing → treat as empty, do not crash
    legacyRows = [];
  }
  if (rows.length > 0) {
    return { rows, inbox_source: 'team_inbox' };
  }
  if (shimDisabled) {
    return { rows: [], inbox_source: 'team_inbox' };
  }
  // 2) Fall back to legacy message_deliveries joined with mission_messages
  //    The legacy "pending_deliveries" projection is:
  //      mission_messages.message_id = message_deliveries.message_id
  //    filtered by mission_id, recipient_agent_id == toRole (best-effort
  //    — historically recipient_agent_id was the agent_id, but in this
  //    transition window we also accept to_role as the recipient).
  let legacyRows = [];
  try {
    legacyRows = db
      .prepare(
        `SELECT d.delivery_id, d.message_id, m.body_summary, d.status, d.updated_at, d.created_at
         FROM message_deliveries d
         JOIN mission_messages m ON m.message_id = d.message_id
         WHERE m.mission_id = ?
           AND (d.recipient_agent_id = ? OR d.recipient_agent_id LIKE ?)
           AND d.status IN ('pending', 'retry_pending')
         ORDER BY d.updated_at DESC
         LIMIT 50`
      )
      .all(missionId, toRole, `%${toRole}%`);
  } catch (e) {
    legacyRows = [];
  }
  if (legacyRows.length === 0) {
    return { rows: [], inbox_source: 'team_inbox' };
  }
  // 3) shim_warning is set on fallback
  return {
    rows: legacyRows.map((r) => ({
      delivery_id: r.delivery_id,
      body: r.body_summary,
      body_summary: r.body_summary,
      status: r.status,
      updated_at: r.updated_at,
      created_at: r.created_at,
    })),
    inbox_source: 'pending_deliveries_legacy',
    shim_warning: SHIM_WARNING_TEMPLATE.replace('<id>', missionId).replace('<role>', toRole),
  };
}

/**
 * TCT-DELTA-S8: team_tell MCP tool's documented external contract.
 *
 * The tool does not currently exist in devhub-mcp (it is listed in
 * tests/integration/tools-list.test.js as UNSUPPORTED), but the spec
 * requires that any future re-introduction preserves the contract.
 *
 * Returning the contract from a helper here lets the regression test
 * assert the contract mechanically. A future implementer would
 * re-register the tool in devhub-mcp using the same signature.
 *
 * @returns {{
 *   signature: { params: string[] },
 *   returnShape: Record<string, string>,
 *   writesTo: string[]
 * }}
 */
function getTeamTellContract() {
  return {
    signature: {
      params: ['recipients', 'target_role', 'mission_id', 'body'],
    },
    returnShape: {
      delivered: 'Array<{recipient_agent_id, status}>',
      errors: 'Array<{code, message}>',
    },
    writesTo: ['team_inbox', 'message_deliveries'],
  };
}

/**
 * T-013a — Mirror a chat-write to the legacy mission_messages +
 * message_deliveries tables so consumers of `pending_deliveries`
 * continue to work for one release window. This helper OWNS the
 * mirror write; the devhub-bus binary delegates here instead of
 * inlining the SQL.
 *
 * Behavior:
 *   1. env.DEVHUB_INBOX_SHIM_DISABLED === 'true' → { skipped: 'shim_disabled' }
 *      (the new bus team_inbox is the source of truth; the legacy projection is retired)
 *   2. Legacy tables missing → { skipped: 'no_legacy_tables' } (graceful no-op)
 *   3. swarm_missions exists AND does not contain missionId → { skipped: 'mission_not_registered' }
 *      (avoids FOREIGN KEY constraint failed; mission row is not auto-created
 *      because the spec is one-release compat, not a write-replicator)
 *   4. Otherwise: INSERT OR IGNORE into mission_messages + message_deliveries
 *      and return { message_id, delivery_id, recipient_agent_id }
 *
 * The helper NEVER throws. On unexpected SQL error it returns
 * { skipped: '<reason>', error: '<message>' } so the caller can log
 * a single WARN line instead of the prior FK error spam.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   missionId: string,
 *   fromRole: string,
 *   toRole: string,
 *   body: string,
 *   bodyHash: string,
 *   kind?: string
 * }} msg
 * @returns {{ skipped?: string, error?: string, message_id?: string, delivery_id?: string, recipient_agent_id?: string }}
 */
function mirrorChatToLegacy(db, env, msg) {
  if (!db || !msg) {
    return { skipped: 'invalid_args' };
  }
  if (isShimDisabled(env)) {
    return { skipped: 'shim_disabled' };
  }
  if (!_tableExists(db, 'mission_messages') || !_tableExists(db, 'message_deliveries')) {
    return { skipped: 'no_legacy_tables' };
  }
  // Mission must be registered in swarm_missions to satisfy the FK
  // (mission_messages.mission_id REFERENCES swarm_missions.mission_id).
  if (!_tableExists(db, 'swarm_missions')) {
    return { skipped: 'no_legacy_tables' };
  }
  try {
    const exists = db
      .prepare('SELECT 1 AS x FROM swarm_missions WHERE mission_id = ?')
      .get(msg.missionId);
    if (!exists) {
      return { skipped: 'mission_not_registered' };
    }
  } catch (e) {
    return { skipped: 'mission_lookup_failed', error: e.message };
  }

  const now = new Date().toISOString();
  const messageId = `mm-${_sha256Hex(`${msg.missionId}|${msg.fromRole}|${msg.bodyHash}|${now}`).slice(0, 16)}`;
  try {
    db.prepare(
      `INSERT OR IGNORE INTO mission_messages
        (message_id, mission_id, sender_agent_id, message_kind, body_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      messageId,
      msg.missionId,
      msg.fromRole,
      msg.kind || 'directive',
      msg.body || '',
      now,
      now
    );
  } catch (e) {
    return { skipped: 'mission_messages_insert_failed', error: e.message };
  }

  const recipientAgentId =
    msg.toRole && msg.toRole !== 'all' ? msg.toRole : `${msg.missionId}-broadcast`;
  const deliveryId = `del-${_sha256Hex(`${messageId}|${recipientAgentId}`).slice(0, 16)}`;
  try {
    db.prepare(
      `INSERT OR IGNORE INTO message_deliveries
        (delivery_id, message_id, recipient_agent_id, channel, status, attempt_count, last_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(deliveryId, messageId, recipientAgentId, 'local_snapshot', 'pending', 1, now, now, now);
  } catch (e) {
    return { skipped: 'message_deliveries_insert_failed', error: e.message };
  }
  return {
    message_id: messageId,
    delivery_id: deliveryId,
    recipient_agent_id: recipientAgentId,
  };
}

module.exports = {
  isShimDisabled,
  resolveInboxForRole,
  getTeamTellContract,
  mirrorChatToLegacy,
  SHIM_WARNING_TEMPLATE,
};

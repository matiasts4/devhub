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

const SHIM_WARNING_TEMPLATE =
  'shim: pending_deliveries fallback active for mission=<id> role=<role>; remove after release X';

function isShimDisabled(env) {
  return env && env.DEVHUB_INBOX_SHIM_DISABLED === 'true';
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

module.exports = {
  isShimDisabled,
  resolveInboxForRole,
  getTeamTellContract,
  SHIM_WARNING_TEMPLATE,
};

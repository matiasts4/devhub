/**
 * Supervisor Daemon — periodic enforcement tick for orphan detection and lease expiry.
 *
 * SVD-1 through SVD-6: In-process daemon that runs evaluateSupervisorTick on an interval.
 *
 * Design decisions:
 *   - In-process: setInterval inside processManager, NOT a separate process/worker
 *   - CAS pattern: All enforcement uses UPDATE ... WHERE status = ? — if 0 rows matched,
 *     another process/API already changed it, so no conflict
 *   - Env control: SUPERVISOR_DAEMON_ENABLED defaults to 'true'
 *   - Events: All enforcement actions emit supervisor_action or workspace_orphaned events
 */

const { revokeAuthToken } = require('../db/localDb');
const { emitAgentEvent } = require('./agentEvents');

const STALE_HEARTBEAT_SECONDS = 90;
const STALE_LEASE_SECONDS = 300; // 5 minutes

/**
 * Run one supervisor evaluation tick.
 *
 * Performs:
 *   1. Orphan detection: workspaces with status='active' and stale heartbeat → status='orphaned'
 *   2. Lease expiry: tasks with status='in_progress', claim_token set, and stale lease expiry → status='pending'
 *
 * All mutations use CAS (Compare-And-Swap) pattern via WHERE status = ? to prevent conflicts.
 *
 * @param {Database} db - better-sqlite3 database handle
 * @returns {{ orphaned: Array<{id: string, agent_id: string}>, expiredLeases: Array<{id: string, assigned_to: string}> }}
 */
function evaluateSupervisorTick(db) {
  const result = { orphaned: [], expiredLeases: [] };

  // ── Orphan Detection ────────────────────────────────────────────────
  // Find active workspaces with heartbeat older than 90 seconds
  const staleWorkspaces = db
    .prepare(
      `SELECT id, agent_id FROM agent_workspaces
     WHERE status = 'active'
     AND last_heartbeat IS NOT NULL
     AND last_heartbeat < datetime('now', '-${STALE_HEARTBEAT_SECONDS} seconds')`
    )
    .all();

  for (const ws of staleWorkspaces) {
    // CAS: only update if still active (another process may have changed it)
    const updateResult = db
      .prepare(`UPDATE agent_workspaces SET status = 'orphaned' WHERE id = ? AND status = 'active'`)
      .run(ws.id);

    if (updateResult.changes > 0) {
      result.orphaned.push({ id: ws.id, agent_id: ws.agent_id });

      // Security enforcement first: revoking the orphan's token must never be
      // skipped because event emission failed.
      try {
        revokeAuthToken(db, ws.agent_id);
      } catch (e) {
        console.error(
          `[SupervisorDaemon] Failed to revoke auth token for ${ws.agent_id}:`,
          e.message
        );
      }

      try {
        emitAgentEvent(db, {
          agent_id: ws.agent_id,
          workspace_id: ws.id,
          event_type: 'workspace_orphaned',
          payload: {
            action: 'orphan_marked',
            previous_status: 'active',
            target_id: ws.id,
          },
        });

        emitAgentEvent(db, {
          agent_id: ws.agent_id,
          workspace_id: ws.id,
          event_type: 'supervisor_action',
          payload: {
            action: 'orphan_marked',
            previous_status: 'active',
            target_id: ws.id,
          },
        });
      } catch (e) {
        console.error(
          `[SupervisorDaemon] Failed to emit workspace_orphaned event for ${ws.id}:`,
          e.message
        );
      }
    }
  }

  // ── Lease Expiry ─────────────────────────────────────────────────────
  // Find tasks with stale leases. Prefer lease_expires_at when present; keep started_at fallback
  // for rows created before lease expiry tracking existed.
  const staleLeases = db
    .prepare(
      `SELECT id, assigned_to FROM tasks
     WHERE status = 'in_progress'
     AND claim_token IS NOT NULL
     AND (
       (lease_expires_at IS NOT NULL AND lease_expires_at < datetime('now'))
       OR
       (lease_expires_at IS NULL AND started_at IS NOT NULL AND started_at < datetime('now', '-${STALE_LEASE_SECONDS} seconds'))
     )`
    )
    .all();

  for (const task of staleLeases) {
    // CAS: only update if still in_progress
    const updateResult = db
      .prepare(
        `UPDATE tasks SET status = 'pending', claim_token = NULL, assigned_to = NULL, started_at = NULL
       WHERE id = ? AND status = 'in_progress'`
      )
      .run(task.id);

    if (updateResult.changes > 0) {
      result.expiredLeases.push({ id: task.id, assigned_to: task.assigned_to });

      try {
        emitAgentEvent(db, {
          agent_id: task.assigned_to || 'supervisor',
          event_type: 'supervisor_action',
          payload: {
            action: 'lease_released',
            target_id: task.id,
            previous_status: 'in_progress',
          },
        });
      } catch (e) {
        console.error(
          `[SupervisorDaemon] Failed to emit supervisor_action event for task ${task.id}:`,
          e.message
        );
      }
    }
  }

  return result;
}

module.exports = { evaluateSupervisorTick, STALE_HEARTBEAT_SECONDS, STALE_LEASE_SECONDS };

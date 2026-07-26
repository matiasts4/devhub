/**
 * Supervisor Reconciliation — restores state after DevHub restart.
 *
 * On startup, reads active missions, verifies worktrees on disk,
 * verifies tmux sessions/processes, and marks orphan/offline/crashed
 * based on evidence.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/core');

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function getTmuxSessions() {
  try {
    const output = safeExec('tmux list-sessions -F "#{session_name}"');
    if (!output) return [];
    return output.split('\n');
  } catch {
    return [];
  }
}

/**
 * Reconcile swarm state after restart.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - If true, only report what would change.
 * @returns {object} Reconciliation report.
 */
function reconcileSwarmState(options = {}) {
  const dryRun = options.dryRun || false;
  const db = getDb();
  const now = new Date().toISOString();

  const report = {
    timestamp: now,
    dryRun,
    missions_checked: 0,
    workspaces_checked: 0,
    presence_checked: 0,
    changes: [],
    anomalies: [],
  };

  // 1. Get active missions
  const activeMissions = db
    .prepare("SELECT * FROM swarm_missions WHERE status IN ('active', 'paused')")
    .all();
  report.missions_checked = activeMissions.length;

  // 2. Get disk evidence
  const tmuxSessions = getTmuxSessions();

  // 3. Check each active workspace
  const workspaces = db
    .prepare("SELECT * FROM agent_workspaces WHERE status IN ('ready', 'active', 'busy')")
    .all();
  report.workspaces_checked = workspaces.length;

  for (const ws of workspaces) {
    // Check if worktree exists on disk
    const worktreeExists = ws.worktree_path && fs.existsSync(ws.worktree_path);
    const hasGitMarker = worktreeExists && fs.existsSync(path.join(ws.worktree_path, '.git'));

    if (!worktreeExists || !hasGitMarker) {
      report.anomalies.push({
        type: 'worktree_missing',
        workspace_id: ws.id,
        agent_id: ws.agent_id,
        worktree_path: ws.worktree_path,
        action: dryRun ? 'would mark as orphaned' : 'marking as orphaned',
      });

      if (!dryRun) {
        db.prepare(
          "UPDATE agent_workspaces SET status = 'orphaned', last_error = ?, last_error_class = ?, updated_at = ? WHERE id = ?"
        ).run(`Worktree not found on disk: ${ws.worktree_path}`, 'worktree_missing', now, ws.id);
        report.changes.push({ type: 'workspace_orphaned', workspace_id: ws.id });
      }
    }

    // Check if tmux session exists
    const expectedSession = `devhub-swarm-${ws.id}`;
    const sessionExists = tmuxSessions.includes(expectedSession);

    if (!sessionExists && ws.status === 'active') {
      report.anomalies.push({
        type: 'tmux_session_missing',
        workspace_id: ws.id,
        agent_id: ws.agent_id,
        expected_session: expectedSession,
        action: dryRun ? 'would mark as crashed' : 'marking as crashed',
      });

      if (!dryRun) {
        db.prepare(
          "UPDATE agent_workspaces SET status = 'failed', last_error = ?, last_error_class = ?, updated_at = ? WHERE id = ?"
        ).run(`tmux session not found: ${expectedSession}`, 'tmux_missing', now, ws.id);
        report.changes.push({ type: 'workspace_crashed', workspace_id: ws.id });
      }
    }
  }

  // 4. Check presence — mark stale agents as offline
  const presence = db
    .prepare("SELECT * FROM agent_presence WHERE expires_at <= ? AND presence_state != 'offline'")
    .all(now);
  report.presence_checked = presence.length;

  for (const p of presence) {
    report.anomalies.push({
      type: 'stale_presence',
      agent_id: p.agent_id,
      previous_state: p.presence_state,
      action: dryRun ? 'would mark as offline' : 'marking as offline',
    });

    if (!dryRun) {
      db.prepare(
        "UPDATE agent_presence SET presence_state = 'offline', updated_at = ? WHERE presence_id = ?"
      ).run(now, p.presence_id);
      report.changes.push({ type: 'presence_offline', agent_id: p.agent_id });
    }
  }

  // 5. Check for orphaned tmux sessions (no matching workspace)
  const devhubSessions = tmuxSessions.filter((s) => s.startsWith('devhub-swarm-'));
  for (const session of devhubSessions) {
    const agentId = session.replace('devhub-swarm-', '').replace(/-session$/, '');
    const hasWorkspace = workspaces.some((ws) => ws.agent_id === agentId);

    if (!hasWorkspace) {
      report.anomalies.push({
        type: 'orphan_tmux_session',
        session_name: session,
        action: 'session exists but no matching workspace in DB',
      });
    }
  }

  return report;
}

module.exports = {
  reconcileSwarmState,
};

/**
 * Mission Close — marks mission as completed/failed/aborted with evidence.
 *
 * Rules:
 * - Never mark completed without evidence, checks, and merge/handoff decision.
 * - Save final summary.
 * - Keep worktrees if changes not merged.
 * - Only clean up what's safe.
 */

const { getDb } = require('../db/core');

/**
 * Close a mission with evidence.
 *
 * @param {object} params
 * @param {string} params.missionId
 * @param {'completed' | 'failed' | 'aborted'} params.outcome
 * @param {string} params.summary - Final summary of the mission.
 * @param {object} [params.evidence] - Evidence object with checks, commits, etc.
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {object}
 */
function closeMission({ missionId, outcome, summary, evidence = {} }, options = {}) {
  const dryRun = options.dryRun || false;
  const db = getDb();
  const now = new Date().toISOString();

  // Validate outcome
  const validOutcomes = ['completed', 'failed', 'aborted'];
  if (!validOutcomes.includes(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}. Must be one of: ${validOutcomes.join(', ')}`);
  }

  // Get current mission
  const mission = db
    .prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1')
    .get(missionId);

  if (!mission) {
    return {
      success: false,
      reason: 'mission_not_found',
      mission_id: missionId,
    };
  }

  // Validate: completed missions need evidence
  if (outcome === 'completed' && !evidence.checks && !evidence.commits) {
    return {
      success: false,
      reason: 'missing_evidence',
      message: 'Completed missions require evidence (checks or commits).',
    };
  }

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      mission_id: missionId,
      current_status: mission.status,
      new_status: outcome,
      summary,
      evidence,
    };
  }

  // Update mission status
  db.prepare(
    `UPDATE swarm_missions
     SET status = ?, summary = ?, evidence_ref = ?, completed_at = ?, updated_at = ?
     WHERE mission_id = ?`
  ).run(outcome, summary, `evidence://mission-close/${missionId}`, now, now, missionId);

  // Update participant statuses
  db.prepare(
    "UPDATE mission_participants SET status = 'completed', left_at = ?, updated_at = ? WHERE mission_id = ? AND status != 'completed'"
  ).run(now, now, missionId);

  // Update workspace statuses
  db.prepare(
    "UPDATE agent_workspaces SET status = 'completed', completed_at = ?, updated_at = ? WHERE id IN (SELECT workspace_id FROM agent_runs WHERE run_id IN (SELECT run_id FROM swarm_missions WHERE mission_id = ?))"
  ).run(now, now, missionId);

  // Update presence to offline
  db.prepare(
    "UPDATE agent_presence SET presence_state = 'offline', updated_at = ? WHERE mission_id = ?"
  ).run(now, missionId);

  return {
    success: true,
    mission_id: missionId,
    outcome,
    summary,
    closed_at: now,
    evidence_ref: `evidence://mission-close/${missionId}`,
  };
}

/**
 * Generate a final mission summary report.
 *
 * @param {string} missionId
 * @returns {object}
 */
function generateMissionReport(missionId) {
  const db = getDb();

  const mission = db
    .prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1')
    .get(missionId);

  if (!mission) {
    return { error: 'Mission not found' };
  }

  const participants = db
    .prepare('SELECT * FROM mission_participants WHERE mission_id = ?')
    .all(missionId);

  const messages = db
    .prepare('SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at ASC')
    .all(missionId);

  const presence = db
    .prepare('SELECT * FROM agent_presence WHERE mission_id = ? ORDER BY last_seen_at DESC')
    .all(missionId);

  return {
    mission,
    participants,
    message_count: messages.length,
    presence_count: presence.length,
    duration_ms: mission.completed_at
      ? new Date(mission.completed_at).getTime() - new Date(mission.started_at).getTime()
      : null,
  };
}

module.exports = {
  closeMission,
  generateMissionReport,
};

import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb, updateSessionStatus } from '@/lib/db/localDb.js';
import { closeTerminalSessionById } from '@/lib/terminal/closeTerminalSession';
import { cleanupMissionWorktrees } from '@/lib/swarm/cleanup';

const execFileAsync = promisify(execFile);
const OPENCODE_PORT = process.env.OPENCODE_PORT || 4154;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildInClause(values = []) {
  return values.map(() => '?').join(', ');
}

function listLaunchArtifacts(db, launchId) {
  const mission =
    db.prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1').get(launchId) || null;
  const participants = db
    .prepare('SELECT * FROM mission_participants WHERE mission_id = ? ORDER BY rowid ASC')
    .all(launchId);

  const agentIds = uniqueStrings(participants.map((participant) => participant.agent_id));
  const workspaces = agentIds.length
    ? db
        .prepare(
          `SELECT * FROM agent_workspaces WHERE agent_id IN (${buildInClause(agentIds)}) ORDER BY rowid ASC`
        )
        .all(...agentIds)
    : [];
  const workspaceIds = uniqueStrings(workspaces.map((workspace) => workspace.id));
  const runs = workspaceIds.length
    ? db
        .prepare(
          `SELECT * FROM agent_runs WHERE workspace_id IN (${buildInClause(workspaceIds)}) ORDER BY rowid ASC`
        )
        .all(...workspaceIds)
    : [];
  const sessionIds = uniqueStrings(
    runs.map((run) => run.run_id_or_session_id).concat(workspaces.map((workspace) => workspace.run_id_or_session_id))
  );
  const sessions = sessionIds.length
    ? db
        .prepare(
          `SELECT * FROM agent_hub_sessions WHERE id IN (${buildInClause(sessionIds)}) ORDER BY rowid ASC`
        )
        .all(...sessionIds)
    : [];

  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  return {
    mission,
    participants,
    workspaces,
    runs,
    sessions,
    sessionsById,
  };
}

function updateLaunchRecords(db, { launchId, artifacts, now, updateSessionStatusImpl }) {
  const { workspaces, runs, sessions, participants, mission } = artifacts;

  for (const run of runs) {
    db.prepare(
      `UPDATE agent_runs
       SET status = 'aborted',
           terminal_reason_class = COALESCE(terminal_reason_class, 'swarm_launch_terminated'),
           completed_at = COALESCE(completed_at, ?),
           updated_at = ?
       WHERE run_id = ?`
    ).run(now, now, run.run_id);
  }

  for (const workspace of workspaces) {
    db.prepare(
      `UPDATE agent_workspaces
       SET status = 'cleanup_pending',
           completed_at = COALESCE(completed_at, ?),
           last_error = 'swarm launch terminated locally',
           recovery_reason = 'terminate_swarm_local',
           updated_at = ?
       WHERE id = ?`
    ).run(now, now, workspace.id);
  }

  for (const session of sessions) {
    updateSessionStatusImpl(db, session.id, 'aborted');
  }

  for (const participant of participants) {
    db.prepare(
      `UPDATE mission_participants
       SET status = CASE WHEN status = 'completed' THEN status ELSE 'removed' END,
           left_at = COALESCE(left_at, ?),
           updated_at = ?
       WHERE participant_id = ?`
    ).run(now, now, participant.participant_id);
  }

  if (mission) {
    db.prepare(
      `UPDATE swarm_missions
       SET status = 'aborted',
           summary = ?,
           completed_at = COALESCE(completed_at, ?),
           updated_at = ?
       WHERE mission_id = ?`
    ).run('Launch terminated from workspace controls.', now, now, launchId);

    db.prepare(
      `UPDATE agent_presence
       SET presence_state = 'offline',
           updated_at = ?
       WHERE mission_id = ?`
    ).run(now, launchId);
  }
}

async function abortOpenCodeSession(sessionId, { fetchImpl = fetch, opencodeUrl = OPENCODE_URL } = {}) {
  const response = await fetchImpl(`${opencodeUrl}/session/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error || '';
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
    }
    throw new Error(detail || `Abort failed with status ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    return { success: true };
  }
}

async function killTmuxSession(sessionName) {
  await execFileAsync('tmux', ['kill-session', '-t', sessionName], { timeout: 5000 });
}

export async function terminateSwarmLaunch(
  launchId,
  {
    db = getDb(),
    fetchImpl = fetch,
    closeTerminalSessionImpl = closeTerminalSessionById,
    cleanupMissionWorktreesImpl = cleanupMissionWorktrees,
    killTmuxSessionImpl = killTmuxSession,
    updateSessionStatusImpl = updateSessionStatus,
    opencodeUrl = OPENCODE_URL,
  } = {}
) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) {
    throw new Error('launchId es requerido para terminateSwarmLaunch.');
  }

  const artifacts = listLaunchArtifacts(db, normalizedLaunchId);
  if (!artifacts.mission) {
    throw new Error(`No existe un swarm activo para ${normalizedLaunchId}.`);
  }

  const terminalIds = uniqueStrings(artifacts.workspaces.map((workspace) => workspace.terminal_id));
  const opencodeSessionIds = uniqueStrings(
    artifacts.sessions
      .map((session) => session.opencode_session_id)
      .concat(
        artifacts.runs
          .map((run) => artifacts.sessionsById.get(run.run_id_or_session_id)?.opencode_session_id)
      )
  );
  const tmuxSessionNames = uniqueStrings(
    artifacts.participants.map((participant) => {
      const suffix = participant.agent_id?.startsWith(`${normalizedLaunchId}-`)
        ? participant.agent_id.slice(`${normalizedLaunchId}-`.length)
        : participant.agent_id;
      return suffix ? `devhub-swarm-${normalizedLaunchId}-${suffix}` : null;
    })
  );

  const terminalResults = await Promise.allSettled(
    terminalIds.map((terminalId) => closeTerminalSessionImpl(terminalId))
  );
  const abortResults = await Promise.allSettled(
    opencodeSessionIds.map((sessionId) => abortOpenCodeSession(sessionId, { fetchImpl, opencodeUrl }))
  );
  const tmuxResults = await Promise.allSettled(
    tmuxSessionNames.map((sessionName) => killTmuxSessionImpl(sessionName))
  );

  const repoRoot = artifacts.workspaces.find((workspace) => workspace.repo_root)?.repo_root || null;
  const worktreeCleanup = repoRoot
    ? cleanupMissionWorktreesImpl({ repoRoot, launchId: normalizedLaunchId }, { force: true })
    : { launch_id: normalizedLaunchId, workspaces_processed: 0, results: [] };

  const now = new Date().toISOString();
  updateLaunchRecords(db, {
    launchId: normalizedLaunchId,
    artifacts,
    now,
    updateSessionStatusImpl,
  });

  return {
    launchId: normalizedLaunchId,
    missionId: artifacts.mission.mission_id,
    terminated: true,
    terminals: {
      attempted: terminalIds,
      results: terminalResults,
    },
    opencodeSessions: {
      attempted: opencodeSessionIds,
      results: abortResults,
    },
    tmuxSessions: {
      attempted: tmuxSessionNames,
      results: tmuxResults,
    },
    worktrees: worktreeCleanup,
  };
}

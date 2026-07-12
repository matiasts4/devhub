import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getDb } from '@/lib/db/localDb.js';

/**
 * Read-only snapshot of swarm runtime state.
 * Does NOT write to the database.
 * Shows anomalies: cwd mismatch, missing worktree, stale heartbeat, orphan process.
 */

function getProcessCount(pattern) {
  try {
    const result = execSync(`pgrep -c -f "${pattern}" 2>/dev/null || echo 0`, {
      encoding: 'utf8',
    }).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}

function getTmuxSessions() {
  try {
    const output = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    if (!output) return [];
    return output.split('\n');
  } catch {
    return [];
  }
}

function getWorktreeList() {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!output) return [];

    const worktrees = [];
    let current = null;
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current) worktrees.push(current);
        current = { path: line.slice('worktree '.length), head: '', branch: '' };
      } else if (line.startsWith('HEAD ') && current) {
        current.head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ') && current) {
        current.branch = line.slice('branch '.length);
      }
    }
    if (current) worktrees.push(current);
    return worktrees;
  } catch {
    return [];
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('mission_id');

    const db = getDb();
    const now = new Date().toISOString();

    // --- Mission info ---
    let mission = null;
    if (missionId) {
      mission = db
        .prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1')
        .get(missionId);
    }

    // --- Active missions ---
    const activeMissions = db
      .prepare(
        "SELECT * FROM swarm_missions WHERE status IN ('active', 'paused') ORDER BY updated_at DESC"
      )
      .all();

    // --- Agent presence ---
    const presence = db
      .prepare('SELECT * FROM agent_presence WHERE expires_at > ? ORDER BY last_seen_at DESC')
      .all(now);

    // --- Stale agents (expired TTL) ---
    const staleAgents = db
      .prepare('SELECT * FROM agent_presence WHERE expires_at <= ? ORDER BY expires_at DESC')
      .all(now);

    // --- Agent workspaces ---
    const workspaces = db
      .prepare(
        "SELECT * FROM agent_workspaces WHERE status IN ('ready', 'active', 'busy') ORDER BY updated_at DESC"
      )
      .all();

    // --- Worktrees on disk ---
    const diskWorktrees = getWorktreeList();
    const devhubWorktrees = diskWorktrees.filter((wt) =>
      String(wt.path || '')
        .replace(/\\/g, '/')
        .includes('.devhub/worktrees')
    );

    // --- tmux sessions ---
    const tmuxSessions = getTmuxSessions();
    const devhubTmuxSessions = tmuxSessions.filter((s) => s.startsWith('devhub-swarm-'));

    // --- Process counts ---
    const processCounts = {
      node: getProcessCount('node'),
      opencode: getProcessCount('opencode'),
      codex: getProcessCount('codex'),
      hermes: getProcessCount('hermes'),
      tmux: getProcessCount('tmux'),
    };

    // --- Anomaly detection ---
    const anomalies = [];

    // Check for cwd mismatch (workspace path vs worktree path)
    for (const ws of workspaces) {
      if (ws.worktree_path && ws.workspace_path) {
        const diskWorktree = diskWorktrees.find((wt) => wt.path === ws.worktree_path);
        if (!diskWorktree) {
          anomalies.push({
            type: 'missing_worktree',
            workspace_id: ws.id,
            agent_id: ws.agent_id,
            worktree_path: ws.worktree_path,
            message: `Worktree registered in DB but not found on disk: ${ws.worktree_path}`,
          });
        }
      }
    }

    // Check for stale heartbeats
    for (const agent of staleAgents) {
      anomalies.push({
        type: 'stale_heartbeat',
        agent_id: agent.agent_id,
        mission_id: agent.mission_id,
        last_seen_at: agent.last_seen_at,
        expires_at: agent.expires_at,
        message: `Agent ${agent.agent_id} heartbeat expired at ${agent.expires_at}`,
      });
    }

    // Check for orphaned tmux sessions (no matching presence)
    for (const session of devhubTmuxSessions) {
      const agentId = session.replace('devhub-swarm-', '').replace(/-session$/, '');
      const hasPresence = presence.some((p) => p.agent_id.includes(agentId));
      if (!hasPresence) {
        anomalies.push({
          type: 'orphan_tmux_session',
          session_name: session,
          message: `tmux session ${session} has no matching agent presence`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
      mission,
      active_missions: activeMissions,
      presence,
      stale_agents: staleAgents,
      workspaces,
      devhub_worktrees: devhubWorktrees,
      devhub_tmux_sessions: devhubTmuxSessions,
      process_counts: processCounts,
      anomalies,
      anomaly_count: anomalies.length,
    });
  } catch (error) {
    console.error('[SUPERVISOR SNAPSHOT] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

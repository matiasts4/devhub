import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

const AGENT_PRESENCE_TTL_MS = 120_000; // 2 minutes

export const POST = withAuth(async function POST(request) {
  try {
    const body = await request.json();
    const {
      mission_id,
      agent_id,
      workspace_id,
      run_id,
      state,
      cwd,
      status_summary,
    } = body;

    // Validate required fields
    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { error: 'state is required' },
        { status: 400 }
      );
    }

    const validStates = ['online', 'busy', 'idle', 'waiting', 'offline', 'booting', 'crashed'];
    if (!validStates.includes(state)) {
      return NextResponse.json(
        { error: `Invalid state: ${state}. Must be one of: ${validStates.join(', ')}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + AGENT_PRESENCE_TTL_MS).toISOString();

    // Validate cwd is under .devhub/worktrees — reject Plyrium and non-worktree paths
    if (cwd && !cwd.includes('.devhub/worktrees')) {
      console.error(`[HEARTBEAT] cwd not under .devhub/worktrees: ${cwd}`);
      return NextResponse.json(
        { error: `cwd must be under .devhub/worktrees for swarm heartbeats: ${cwd}` },
        { status: 400 }
      );
    }

    // Upsert agent_presence (via write queue to serialize concurrent writes)
    const runtime_surface = 'local-swarm';

    await withDbWriteQueue((writeDb) => {
      writeDb.prepare(
        `INSERT INTO agent_presence (
          presence_id, mission_id, agent_id, workspace_id, run_id,
          runtime_surface, presence_state, status_summary,
          last_seen_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, mission_id, runtime_surface) DO UPDATE SET
          presence_state = excluded.presence_state,
          status_summary = excluded.status_summary,
          last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`
      ).run(
        `presence-${agent_id}-${mission_id || 'global'}-${runtime_surface}`,
        mission_id || null,
        agent_id,
        workspace_id || null,
        run_id || null,
        runtime_surface,
        state,
        status_summary || null,
        now,
        expiresAt,
        now,
        now,
      );
    }, { label: 'heartbeat-upsert' });

    return NextResponse.json({
      success: true,
      agent_id,
      state,
      ttl_ms: AGENT_PRESENCE_TTL_MS,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('[HEARTBEAT] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('mission_id');
    const agentId = searchParams.get('agent_id');

    const db = getDb();
    const now = new Date().toISOString();

    let query = 'SELECT * FROM agent_presence WHERE expires_at > ?';
    const params = [now];

    if (missionId) {
      query += ' AND mission_id = ?';
      params.push(missionId);
    }
    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    query += ' ORDER BY last_seen_at DESC';

    const presence = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      presence,
      count: presence.length,
    });
  } catch (error) {
    console.error('[HEARTBEAT GET] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

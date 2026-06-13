/**
 * @module swarmPhaseEvents
 * SSE endpoint for real-time SDD phase status updates.
 * Streams phase_transition, agent_status, and artifact_saved events
 * to subscribed DevHub UI clients.
 */

import { getDb } from '@/lib/db/localDb.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

// ---------------------------------------------------------------------------
// SSE event types for phase tracking
// ---------------------------------------------------------------------------

const PHASE_EVENT_TYPES = [
  'phase_transition',
  'agent_status',
  'artifact_saved',
];

// ---------------------------------------------------------------------------
// SSE clients registry (in-memory)
// ---------------------------------------------------------------------------

/** @type {Set<{id: string, controller: ReadableStreamDefaultController, missionId?: string}>} */
const clients = new Set();

let clientIdCounter = 0;

function broadcastEvent(eventType, data, missionIdFilter = null) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    // If client has a mission filter, only send matching events
    if (missionIdFilter && client.missionId && client.missionId !== missionIdFilter) {
      return;
    }
    try {
      client.controller.enqueue(new TextEncoder().encode(payload));
    } catch {
      // Client disconnected — will be cleaned up on next check
    }
  });
}

// Periodic cleanup of dead clients
setInterval(() => {
  clients.forEach((client) => {
    try {
      // Send a comment to check if client is still alive
      client.controller.enqueue(new TextEncoder().encode(': ping\n\n'));
    } catch {
      clients.delete(client);
    }
  });
}, 30000);

// ---------------------------------------------------------------------------
// Database query helpers for phase events
// ---------------------------------------------------------------------------

function querySwarmSessions({ missionId, agentId, status } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM swarm_sessions WHERE 1=1';
  const params = [];

  if (missionId) {
    query += ' AND mission_id = ?';
    params.push(missionId);
  }
  if (agentId) {
    query += ' AND agent_id = ?';
    params.push(agentId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC LIMIT 100';
  return db.prepare(query).all(...params);
}

function queryPhaseArtifacts({ missionId, phase } = {}) {
  const db = getDb();
  let query = `
    SELECT
      artifact_id as id,
      mission_id,
      artifact_type as type,
      artifact_phase as phase,
      content_summary as summary,
      created_at,
      updated_at
    FROM sdd_artifacts
    WHERE 1=1
  `;
  const params = [];

  if (missionId) {
    query += ' AND mission_id = ?';
    params.push(missionId);
  }
  if (phase) {
    query += ' AND artifact_phase = ?';
    params.push(phase);
  }

  query += ' ORDER BY created_at DESC LIMIT 50';
  return db.prepare(query).all(...params);
}

function queryPhaseBranchMap({ missionId } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM phase_branch_map WHERE 1=1';
  const params = [];

  if (missionId) {
    query += ' AND mission_id = ?';
    params.push(missionId);
  }

  query += ' ORDER BY created_at ASC';
  return db.prepare(query).all(...params);
}

// ---------------------------------------------------------------------------
// GET — SSE stream for phase events
// ---------------------------------------------------------------------------

export const GET = withAuth(async function GET(request) {
  const { searchParams } = new URL(request.url);
  const missionId = searchParams.get('mission_id') || null;

  const clientId = `sse-${++clientIdCounter}`;
  const client = { id: clientId, controller: null, missionId };

  const stream = new ReadableStream({
    start(controller) {
      client.controller = controller;

      // Register client
      clients.add(client);

      // Send initial connection confirmation
      const connectMsg = `event: connected\ndata: ${JSON.stringify({
        clientId,
        missionId,
        message: 'SSE connection established',
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMsg));

      // Send current state snapshot
      try {
        const sessions = querySwarmSessions({ missionId });
        const snapshot = {
          type: 'snapshot',
          sessions: sessions.map((s) => ({
            sessionId: s.session_id,
            agentId: s.agent_id,
            missionId: s.mission_id,
            phase: s.phase,
            status: s.status,
            checkpoint: s.checkpoint,
            updatedAt: s.updated_at,
          })),
          timestamp: new Date().toISOString(),
        };
        const snapshotMsg = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
        controller.enqueue(new TextEncoder().encode(snapshotMsg));
      } catch {
        // Non-fatal — client still connected
      }
    },
    cancel() {
      clients.delete(client);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
});

// ---------------------------------------------------------------------------
// POST — Emit a phase event (used by agents/DevHub to push updates)
// ---------------------------------------------------------------------------

export const POST = withAuth(async function POST(request) {
  try {
    const body = await request.json();
    const { mission_id, agent_id, event_type, payload } = body;

    if (!event_type || !PHASE_EVENT_TYPES.includes(event_type)) {
      return new Response(
        JSON.stringify({
          error: `Invalid event_type. Must be one of: ${PHASE_EVENT_TYPES.join(', ')}`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    const eventId = `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const event = {
      id: eventId,
      event_type,
      mission_id: mission_id || null,
      agent_id: agent_id || null,
      payload: payload || {},
      timestamp: now,
    };

    // Persist phase event to database
    await persistPhaseEvent(event);

    // Broadcast to SSE clients
    broadcastEvent(event_type, event, mission_id);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: eventId,
        event_type,
        timestamp: now,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[swarm-phase-events POST] Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// Persist a phase event to database
// ---------------------------------------------------------------------------

async function persistPhaseEvent(event) {
  const db = getDb();
  const { getDb: getSharedDb } = await import('@/lib/db/shared');
  const writeDb = getSharedDb();

  // Ensure phase_events table exists
  writeDb.exec(`
    CREATE TABLE IF NOT EXISTS phase_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      mission_id TEXT,
      agent_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_phase_events_mission ON phase_events(mission_id);
    CREATE INDEX IF NOT EXISTS idx_phase_events_type ON phase_events(event_type);
  `);

  writeDb
    .prepare(
      `INSERT INTO phase_events (id, event_type, mission_id, agent_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.id,
      event.event_type,
      event.mission_id,
      event.agent_id,
      JSON.stringify(event.payload),
      event.timestamp
    );
}

// ---------------------------------------------------------------------------
// Export broadcast for use by other modules
// ---------------------------------------------------------------------------

export { broadcastEvent };
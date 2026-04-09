import { NextResponse } from 'next/server';
import { tables, updateSessionStatus, getDb } from '@/lib/db/localDb.js';

const OPENCODE_PORT = process.env.OPENCODE_PORT || 4154;
const IN_PROGRESS_DB_STATUSES = new Set(['active', 'working', 'running', 'thinking', 'busy']);

/**
 * Queries OpenCode's /session/status endpoint directly.
 * Returns 'idle' if the session is completed or absent, 'busy' if still running.
 */
async function checkOpenCodeSessionStatus(opencodeSessionId) {
  try {
    const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/session/status`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ocStatus = data[opencodeSessionId];
    // If session is absent from the map, it's idle/completed
    if (!ocStatus) return 'idle';
    return ocStatus.type || 'busy';
  } catch {
    return null; // OpenCode unreachable — fall back to DB status
  }
}

/**
 * Fetches the latest meaningful text output from agent_traces for a given session.
 * Text traces are upserted (not appended), so the longest one holds the final content.
 */
function getTextOutput(opencodeSessionId) {
  try {
    const db = getDb();
    // Get the longest text trace — that's the agent's response (not the user prompt)
    const row = db
      .prepare(
        `SELECT content FROM agent_traces
         WHERE session_id = ? AND trace_type = 'text' AND length(content) > 50
         ORDER BY length(content) DESC LIMIT 1`
      )
      .get(opencodeSessionId);
    return row?.content || null;
  } catch {
    return null;
  }
}

export async function PUT(req, { params }) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const validStatuses = [
      'active',
      'working',
      'running',
      'thinking',
      'completed',
      'error',
      'aborted',
      'idle',
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = tables.agent_hub_sessions.update(
      { status, updated_at: new Date().toISOString() },
      [['id', '=', sessionId]]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating session status:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(_req, { params }) {
  try {
    const { sessionId } = await params;
    const session = tables.agent_hub_sessions.single({ where: [['id', '=', sessionId]] });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let dbStatus = session.status || 'active';

    // Fast-path: if DB already shows a terminal status, return it directly
    if (!IN_PROGRESS_DB_STATUSES.has(dbStatus)) {
      const opencodeSessionIdFast = session.opencode_session_id || session.id;
      return NextResponse.json({
        sessionId: session.id,
        status: dbStatus,
        error_message: session.error_message || null,
        text_output: getTextOutput(opencodeSessionIdFast),
        opencodeSessionId: session.opencode_session_id || null,
        updated_at: session.updated_at,
      });
    }

    // DB still shows in-progress — ask OpenCode directly for source-of-truth
    const opencodeSessionId = session.opencode_session_id || session.id;
    const ocStatus = await checkOpenCodeSessionStatus(opencodeSessionId);

    if (ocStatus === 'idle') {
      // OpenCode says done — persist immediately so next poll is instant
      updateSessionStatus(session.id, 'completed');
      dbStatus = 'completed';
    }

    return NextResponse.json({
      sessionId: session.id,
      status: dbStatus,
      text_output: dbStatus !== 'active' && dbStatus !== 'working' && dbStatus !== 'running'
        ? getTextOutput(opencodeSessionId)
        : null,
      opencodeSessionId: session.opencode_session_id || null,
      updated_at: session.updated_at,
    });
  } catch (err) {
    console.error('Error loading session status:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

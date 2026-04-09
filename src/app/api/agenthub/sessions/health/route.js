import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');
const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { providers: {} };
  }
}

async function getOpenCodeSessions() {
  try {
    await loadConfig();

    const res = await fetch(`${SERVER_URL}/session`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const { getRecentSessions, updateSessionStatus } = await import('@/lib/db/localDb');

    // Get all recently active sessions from DB
    const dbSessions = getRecentSessions(100);

    // Filter to only those that might be running
    const potentiallyRunning = dbSessions.filter(
      (s) => s.status === 'active' || s.status === 'busy' || s.status === 'running'
    );

    if (potentiallyRunning.length === 0) {
      return NextResponse.json({
        stale_sessions: [],
        aborted_count: 0,
        checked_at: new Date().toISOString(),
      });
    }

    // Get live OpenCode sessions
    const liveSessions = await getOpenCodeSessions();
    if (!liveSessions) {
      return NextResponse.json({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: false,
        checked_at: new Date().toISOString(),
      });
    }

    const liveIds = new Set(liveSessions.map((s) => s.id || s.sessionId));
    const activeSessions = liveSessions
      .map((s) => ({
        session_id: s.id || s.sessionId,
        title: s.title || null,
        updated_at: s?.time?.updated ? new Date(s.time.updated).toISOString() : null,
        is_stale: false,
      }))
      .filter((s) => !!s.session_id);

    // Find stale sessions: in DB as running but not in OpenCode
    const staleSessions = [];
    let abortedCount = 0;

    for (const session of potentiallyRunning) {
      if (!session.opencode_session_id) continue;

      const isAlive = liveIds.has(session.opencode_session_id);

      if (!isAlive) {
        // Mark as aborted in DB
        try {
          updateSessionStatus(session.id, 'aborted');
        } catch (err) {
          console.error(`Failed to update session ${session.id}:`, err.message);
        }

        staleSessions.push({
          session_id: session.id,
          opencode_session_id: session.opencode_session_id,
          title: session.title,
          status: session.status,
          last_activity: session.updated_at,
        });
        abortedCount++;
      }
    }

    return NextResponse.json({
      active_sessions: activeSessions,
      stale_sessions: staleSessions,
      aborted_count: abortedCount,
      live_check_available: true,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check error:', err);
    return NextResponse.json(
      {
        error: err.message,
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: false,
        checked_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

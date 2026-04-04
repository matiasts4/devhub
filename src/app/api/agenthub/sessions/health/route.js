import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');
const SERVER_PORT = 4153;
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
    const config = await loadConfig();
    // Check if OpenCode is enabled
    const hasOpenCode =
      config.providers?.copilot || config.providers?.openrouter || config.providers?.direct;
    if (!hasOpenCode) return [];

    const res = await fetch(`${SERVER_URL}/sessions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
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
    const liveIds = new Set(liveSessions.map((s) => s.id || s.sessionId));

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
      stale_sessions: staleSessions,
      aborted_count: abortedCount,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check error:', err);
    return NextResponse.json(
      {
        error: err.message,
        stale_sessions: [],
        aborted_count: 0,
        checked_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

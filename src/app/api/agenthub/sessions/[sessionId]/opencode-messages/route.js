import { NextResponse } from 'next/server';
import { tables } from '@/lib/db/localDb.js';

const OPENCODE_PORT = process.env.OPENCODE_PORT || 4154;

/**
 * GET /api/agenthub/sessions/[sessionId]/opencode-messages
 *
 * Proxy: reads messages for the corresponding OpenCode session ID.
 * Returns the full message list from OpenCode's internal HTTP API.
 * Used by the AgentHub "Live" panel to render Markdown-formatted output
 * matching what the OpenCode TUI displays.
 */
export async function GET(_req, { params }) {
  try {
    const { sessionId } = await params;

    const session = tables.agent_hub_sessions.single({ where: [['id', '=', sessionId]] });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const opencodeSessionId = session.opencode_session_id;
    if (!opencodeSessionId) {
      return NextResponse.json({ messages: [], status: session.status });
    }

    const res = await fetch(
      `http://127.0.0.1:${OPENCODE_PORT}/session/${opencodeSessionId}/message`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      return NextResponse.json(
        { messages: [], status: session.status, error: `OpenCode returned ${res.status}` },
        { status: 200 }
      );
    }

    const messages = await res.json();
    return NextResponse.json({ messages: Array.isArray(messages) ? messages : [], status: session.status });
  } catch (err) {
    // OpenCode unreachable — return empty, not an error (session may have ended)
    return NextResponse.json({ messages: [], status: 'unknown', error: err.message }, { status: 200 });
  }
}

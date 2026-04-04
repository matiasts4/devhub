import { NextResponse } from 'next/server';

const OPENCODE_PORT = process.env.OPENCODE_PORT || 4153;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

/**
 * POST /api/agenthub/sessions/[sessionId]/abort
 *
 * Forwards an abort request to the OpenCode headless server using the correct
 * server-side OPENCODE_PORT (not the client-side NEXT_PUBLIC_OPENCODE_PORT).
 */
export async function POST(_req, { params }) {
  try {
    const { sessionId } = await params;

    const res = await fetch(`${OPENCODE_URL}/session/${sessionId}/abort`, {
      method: 'POST',
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `OpenCode abort failed: ${errText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error aborting OpenCode session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

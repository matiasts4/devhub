import { NextResponse } from 'next/server';
import { writeAgentReadyMarker } from '@/lib/terminal/opencodeReadyMarker.node';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const tmuxSession = String(body?.tmuxSession || '').trim();
    const sessionId = String(body?.sessionId || '').trim();
    const opencodeSessionId = String(body?.opencodeSessionId || '').trim();
    const program = String(body?.program || 'opencode').trim() || 'opencode';
    const reason = String(body?.reason || '').trim() || 'client-detected';

    if (!tmuxSession) {
      return NextResponse.json({ ok: false, error: 'tmuxSession required' }, { status: 400 });
    }

    const markerPath = writeAgentReadyMarker(tmuxSession, program, {
      sessionId: sessionId || null,
      opencodeSessionId: opencodeSessionId || null,
      reason,
    });

    if (!markerPath) {
      return NextResponse.json({ ok: false, error: 'invalid tmuxSession' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, markerPath, tmuxSession, program });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'agent-ready failed' },
      { status: 500 }
    );
  }
}
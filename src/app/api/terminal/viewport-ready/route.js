import { NextResponse } from 'next/server';
import { writeViewportReadyMarker } from '@/lib/terminal/viewportReadyMarker';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const tmuxSession = String(body?.tmuxSession || '').trim();
    const sessionId = String(body?.sessionId || '').trim();
    const cols = Number(body?.cols);
    const rows = Number(body?.rows);

    if (!tmuxSession) {
      return NextResponse.json({ ok: false, error: 'tmuxSession required' }, { status: 400 });
    }

    const markerPath = writeViewportReadyMarker(tmuxSession, {
      sessionId: sessionId || null,
      cols: Number.isFinite(cols) ? cols : null,
      rows: Number.isFinite(rows) ? rows : null,
    });

    if (!markerPath) {
      return NextResponse.json({ ok: false, error: 'invalid tmuxSession' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, markerPath, tmuxSession });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'viewport-ready failed' },
      { status: 500 }
    );
  }
}

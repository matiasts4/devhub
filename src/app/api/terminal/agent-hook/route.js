import { NextResponse } from 'next/server';
import { handleHookReport } from '@/lib/terminal/agentHooks/handleHookReport';
import { getOrInitSessions, broadcastSessionPayload } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const text = await request.text();
    if (text.length > 4096) {
      return NextResponse.json({ error: 'Payload size exceeds 4KB limit' }, { status: 400 });
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const sessions = getOrInitSessions();
    const result = handleHookReport(sessions, body, Date.now());

    if (result.status !== 204) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (result.broadcast && result.session) {
      broadcastSessionPayload(result.session, result.broadcast);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Agent hook failed' }, { status: 500 });
  }
}

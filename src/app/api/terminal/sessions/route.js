import { NextResponse } from 'next/server';
import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';

export const dynamic = 'force-dynamic';

async function readProductionSessions() {
  try {
    const port = await readProductionSidecarPort();
    if (!port) {
      return null;
    }

    const res = await fetch(`http://127.0.0.1:${port}/sessions`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('Error fetching sessions from sidecar:', error);
    return null;
  }
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    try {
      const data = await readProductionSessions();
      if (data) {
        return NextResponse.json(data);
      }
    } catch (e) {
      console.error('Error fetching sessions from sidecar:', e);
    }

    try {
      const { ensureTTYServer, getTTYSessionsSnapshot } = await import('@/lib/terminal/ttyServer');
      await ensureTTYServer();
      const sessions = getTTYSessionsSnapshot();
      return NextResponse.json({ sessions });
    } catch (error) {
      console.error('Failed to read local PTY sessions fallback:', error);
    }

    return NextResponse.json({ sessions: [] });
  }

  try {
    const { ensureTTYServer, getTTYSessionsSnapshot } = await import('@/lib/terminal/ttyServer');
    await ensureTTYServer();
    const sessions = getTTYSessionsSnapshot();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Failed to read terminal sessions:', error);
    return NextResponse.json(
      { error: 'No se pudo obtener estado de sesiones de terminal.' },
      { status: 500 }
    );
  }
}

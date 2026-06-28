import { NextResponse } from 'next/server';
import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';

export const dynamic = 'force-dynamic';

async function readProductionSession(terminalId) {
  try {
    const port = await readProductionSidecarPort();
    if (!port) {
      return null;
    }

    const res = await fetch(`http://127.0.0.1:${port}/sessions/${encodeURIComponent(terminalId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('Error fetching session from sidecar:', error);
    return null;
  }
}

async function readLocalSession(terminalId) {
  const { getTTYSessionsSnapshot } = await import('@/lib/terminal/ttyServer');
  const sessions = getTTYSessionsSnapshot();
  return sessions.find((s) => s.terminalId === terminalId) || null;
}

export async function GET(_req, { params }) {
  const { terminalId } = await params;

  if (!terminalId) {
    return NextResponse.json({ error: 'terminalId is required' }, { status: 400 });
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const data = await readProductionSession(terminalId);
      if (data) {
        return NextResponse.json(data);
      }
    } catch (e) {
      console.error('Error fetching session from sidecar:', e);
    }

    try {
      const session = await readLocalSession(terminalId);
      if (session) {
        return NextResponse.json(session);
      }
    } catch (error) {
      console.error('Failed to read local PTY session fallback:', error);
    }

    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const { ensureTTYServer } = await import('@/lib/terminal/ttyServer');
    await ensureTTYServer();
    const session = await readLocalSession(terminalId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to read terminal session:', error);
    return NextResponse.json(
      { error: 'No se pudo obtener estado de la sesión de terminal.' },
      { status: 500 }
    );
  }
}

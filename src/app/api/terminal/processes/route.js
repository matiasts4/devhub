import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  try {
    const { getActiveOpenCodeSessionIds } = await import('@/lib/terminal/ttyServer');
    const activeSessions = getActiveOpenCodeSessionIds();
    return NextResponse.json({
      processes: Object.entries(activeSessions).map(([terminalId, sessionId]) => ({
        terminalId,
        sessionId,
        type: 'opencode',
      })),
    });
  } catch (error) {
    console.error('Failed to detect terminal processes:', error);
    return NextResponse.json(
      { error: 'No se pudo leer el estado de sesiones de terminal.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  try {
    const { terminalId } = await request.json();
    if (!terminalId) {
      return NextResponse.json({ error: 'terminalId required' }, { status: 400 });
    }

    const { closeSession } = await import('@/lib/terminal/ttyServer');
    closeSession(terminalId);
    return NextResponse.json({ success: true, terminalId });
  } catch (error) {
    console.error('Failed to close terminal session:', error);
    return NextResponse.json(
      { error: 'No se pudo cerrar la sesión de terminal.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { ensureTTYServer, getTTYSessionsSnapshot } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  try {
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

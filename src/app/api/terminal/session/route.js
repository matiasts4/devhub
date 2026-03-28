import { NextResponse } from 'next/server';
import { ensureTTYServer } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'API route not available in static export build.',
      },
      { status: 501 },
    );
  }

  try {
    const cwd = request.nextUrl.searchParams.get('cwd');
    const { port, wsPath } = await ensureTTYServer(cwd);
    return NextResponse.json({ port, wsPath });
  } catch (error) {
    console.error('Failed to initialize terminal PTY server:', error);
    return NextResponse.json(
      { error: 'No se pudo inicializar el servidor PTY.' },
      { status: 500 }
    );
  }
}

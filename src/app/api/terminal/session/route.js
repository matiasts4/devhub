import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function readProductionSidecarPort() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const portFile = path.join(os.homedir(), '.devhub', 'sidecar-port.txt');
  if (!fs.existsSync(portFile)) {
    return null;
  }

  const port = Number(fs.readFileSync(portFile, 'utf8').trim());
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`, {
      cache: 'no-store',
    });
    if (healthResponse.ok) {
      return port;
    }
  } catch (error) {
    console.error('Error checking sidecar health:', error);
  }

  return null;
}

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    try {
      const port = await readProductionSidecarPort();
      if (port) {
        return NextResponse.json({ port, wsPath: '/' });
      }
    } catch (e) {
      console.error('Error reading sidecar port file:', e);
    }

    try {
      const cwd = request.nextUrl.searchParams.get('cwd');
      const { ensureTTYServer } = await import('@/lib/terminal/ttyServer');
      const { port, wsPath } = await ensureTTYServer(cwd);
      return NextResponse.json({ port, wsPath });
    } catch (error) {
      console.error('Failed to initialize local PTY fallback:', error);
    }

    return NextResponse.json({ error: 'Servidor terminal (sidecar) no encontrado' }, { status: 503 });
  }

  try {
    const cwd = request.nextUrl.searchParams.get('cwd');
    const { ensureTTYServer } = await import('@/lib/terminal/ttyServer');
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

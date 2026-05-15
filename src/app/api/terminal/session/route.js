import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function findPathUpwards(startDir, ...relativeSegments) {
  const fs = require('fs');
  const path = require('path');

  let currentDir = path.resolve(startDir);
  for (let depth = 0; depth <= 8; depth += 1) {
    const candidate = path.join(currentDir, ...relativeSegments);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

function resolveProductionSidecarScript() {
  const fs = require('fs');
  const path = require('path');

  const envCandidate = process.env.DEVHUB_SIDECAR_PATH;
  const candidates = [
    envCandidate,
    process.env.APPDIR ? path.join(process.env.APPDIR, 'usr', 'lib', 'DevHub', '_up_', 'sidecar-backend', 'server.js') : null,
    process.env.APPDIR ? path.join(process.env.APPDIR, 'sidecar-backend', 'server.js') : null,
    '/usr/lib/DevHub/_up_/sidecar-backend/server.js',
    '/usr/local/lib/DevHub/_up_/sidecar-backend/server.js',
    findPathUpwards(process.cwd(), 'sidecar-backend', 'server.js'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function waitForSidecarHealth(port, attempts = 10, delayMs = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        cache: 'no-store',
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Keep retrying while the sidecar boots.
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

async function recoverProductionSidecar() {
  const path = require('path');
  const { spawn } = require('child_process');

  const sidecarScript = resolveProductionSidecarScript();
  if (!sidecarScript) {
    return null;
  }

  const sidecarPort = Number(process.env.SIDECAR_PORT || 4000);
  const child = spawn(process.execPath, [sidecarScript], {
    cwd: path.dirname(sidecarScript),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SIDECAR_PORT: String(sidecarPort),
    },
  });

  child.unref();

  const healthy = await waitForSidecarHealth(sidecarPort);
  if (!healthy) {
    return null;
  }

  return { port: sidecarPort, wsPath: '/tty' };
}

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
        return NextResponse.json({ port, wsPath: '/tty' });
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

    try {
      const recovered = await recoverProductionSidecar();
      if (recovered) {
        return NextResponse.json(recovered);
      }
    } catch (error) {
      console.error('Failed to recover production sidecar:', error);
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

export async function DELETE(request) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const sidecarPort = await readProductionSidecarPort();
      if (!sidecarPort) {
        return NextResponse.json(
          { error: 'Servidor terminal (sidecar) no encontrado' },
          { status: 503 }
        );
      }

      const response = await fetch(`http://127.0.0.1:${sidecarPort}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: 'No se pudo cerrar la sesión de terminal.' },
          { status: response.status }
        );
      }

      return NextResponse.json({ success: true, sessionId });
    } catch (error) {
      console.error('Failed to close production terminal PTY session:', error);
      return NextResponse.json(
        { error: 'No se pudo cerrar la sesión de terminal.' },
        { status: 500 }
      );
    }
  }

  try {
    const { closeSession } = await import('@/lib/terminal/ttyServer');
    closeSession(sessionId);
    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error('Failed to close terminal PTY session:', error);
    return NextResponse.json(
      { error: 'No se pudo cerrar la sesión de terminal.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { closeTerminalSessionById } from '@/lib/terminal/closeTerminalSession';
import { createSession, ensureTTYServer, pushSessionInput } from '@/lib/terminal/ttyServer';

export { closeTerminalSessionById } from '@/lib/terminal/closeTerminalSession';

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
    process.env.APPDIR
      ? path.join(
          process.env.APPDIR,
          'usr',
          'lib',
          'DevHub',
          '_up_',
          'sidecar-backend',
          'server.js'
        )
      : null,
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
        // Consume body to fully close the underlying connection
        try {
          await response.text();
        } catch {
          /* ignore */
        }
        return true;
      } else {
        // Consume body on non-ok responses too
        try {
          await response.text();
        } catch {
          /* ignore */
        }
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
    // Consume body to fully close the underlying undici connection
    try {
      await healthResponse.text();
    } catch {
      /* ignore */
    }
    if (healthResponse.ok) {
      return port;
    }
  } catch (error) {
    console.error('Error checking sidecar health:', error);
  }

  return null;
}

export async function GET(request) {
  // Always check for production sidecar first (works in both dev and prod)
  try {
    const port = await readProductionSidecarPort();
    if (port) {
      return NextResponse.json({ port, wsPath: '/tty' });
    }
  } catch (e) {
    console.error('Error checking sidecar:', e);
  }

  // Fallback to local TTY server only if sidecar is not available
  try {
    const cwd = request.nextUrl.searchParams.get('cwd');
    const { port, wsPath } = await ensureTTYServer(cwd);
    return NextResponse.json({ port, wsPath });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      const recoveredSidecar = await recoverProductionSidecar();
      if (recoveredSidecar) {
        return NextResponse.json(recoveredSidecar);
      }

      return NextResponse.json(
        { error: 'Servidor terminal (sidecar) no encontrado' },
        { status: 503 }
      );
    }

    console.error('Failed to initialize terminal PTY server:', error);
    return NextResponse.json({ error: 'No se pudo inicializar el servidor PTY.' }, { status: 500 });
  }
}

// T-016: POST /api/terminal/session — create a new PTY session and return
// { id, port, wsPath } (the contract the open_terminal tool expects at
// src/lib/asistente/tools/terminal.js:67-76). Previously the route only
// exported GET and DELETE, so the tool's POST got 405 Method Not Allowed.
// Body: { command?, program?, cwd? } — all optional. `program` is the
// shell to launch; defaults to $SHELL or 'bash'.
export async function POST(request) {
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const { cwd, program } = body;
  const shell = program || process.env.SHELL || 'bash';

  try {
    const { port, wsPath } = await ensureTTYServer(cwd);
    const session = createSession({ cwd, shell });

    // T-030: if the caller provided a `command`, execute it in the new PTY
    // immediately. Previously the route ignored body.command, forcing the
    // assistant tool to send a second execute_in_terminal call (the 6-turn
    // latency loop the assistant tools were spending on). Writing the
    // command + '\n' makes the PTY run it as if the user typed it.
    if (typeof body.command === 'string' && body.command.trim() !== '') {
      try {
        pushSessionInput(session.id, body.command + '\n');
      } catch (err) {
        // The session is already up — don't fail the whole POST if the
        // command write blows up; just log and let the caller continue.
        console.error('[terminal/session] pushSessionInput failed:', err?.message || err);
      }
    }

    return NextResponse.json({ id: session.id, port, wsPath });
  } catch (error) {
    console.error('Failed to create terminal session:', error);
    return NextResponse.json(
      { error: `No se pudo crear la sesión de terminal: ${error.message}` },
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
      const result = await closeTerminalSessionById(sessionId);
      return NextResponse.json(result);
    } catch (error) {
      console.error('Failed to close production terminal PTY session:', error);
      return NextResponse.json(
        { error: 'No se pudo cerrar la sesión de terminal.' },
        { status: error?.status || 500 }
      );
    }
  }

  try {
    const result = await closeTerminalSessionById(sessionId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to close terminal PTY session:', error);
    return NextResponse.json(
      { error: 'No se pudo cerrar la sesión de terminal.' },
      { status: 500 }
    );
  }
}

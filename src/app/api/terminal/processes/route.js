import { NextResponse } from 'next/server';
import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';
import { nameFromId } from '@/lib/asistente/zedTerminalResolver';

export const dynamic = 'force-dynamic';

async function readSidecarSessions() {
  try {
    const port = await readProductionSidecarPort();
    if (!port) return null;

    const res = await fetch(`http://127.0.0.1:${port}/sessions`, { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const list = data?.sessions || data || [];
    return list.map((s) => ({
      terminalId: s.id,
      displayName: nameFromId(s.id),
      type: 'sidecar',
      cwd: s.cwd || null,
      createdAt: s.createdAt || null,
      clients: s.clients || 0,
    }));
  } catch {
    return null;
  }
}

export async function GET() {
  // In desktop (even prod builds) we want the list for Zed assistant.
  // The old static-export guard is kept only as soft fallback.

  const processes = [];

  // 1. Sidecar PTYs (these power most visible workspace terminals in Tauri)
  try {
    const sidecarOnes = await readSidecarSessions();
    if (sidecarOnes && sidecarOnes.length > 0) {
      processes.push(...sidecarOnes);
    }
  } catch {
    // Sidecar may be offline in dev; fall through to local ttyServer.
  }

  // 2. Local ttyServer (dev / Zed-specific PTYs)
  try {
    const { getAllActiveSessions } = await import('@/lib/terminal/ttyServer');
    const ttySessions = getAllActiveSessions() || [];
    for (const s of ttySessions) {
      const already = processes.some((p) => p.terminalId === s.id);
      if (!already) {
        processes.push({
          terminalId: s.id,
          displayName: nameFromId(s.id),
          sessionId: s.opencodeSessionId || null,
          type: s.type || 'pty',
          cwd: s.cwd || null,
          shell: s.shell || null,
          createdAt: s.createdAt || null,
        });
      }
    }
  } catch (error) {
    console.error('Failed to read ttyServer sessions for processes list:', error);
  }

  // If we have nothing, still return empty array (not error) so Zed can react gracefully.
  return NextResponse.json({ processes });
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

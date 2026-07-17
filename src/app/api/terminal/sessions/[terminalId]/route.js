import { NextResponse } from 'next/server';
import { fetchSidecarHealth, readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';

export const dynamic = 'force-dynamic';

async function readSidecarSession(terminalId, port) {
  try {
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

async function resolveSidecarPort() {
  const envPort = Number(process.env.SIDECAR_PORT);
  if (Number.isFinite(envPort) && envPort > 0) {
    if (await fetchSidecarHealth(envPort, { timeoutMs: 400 })) {
      return envPort;
    }
  }
  try {
    return await readProductionSidecarPort({ timeoutMs: 800 });
  } catch {
    return null;
  }
}

async function readLocalSession(terminalId) {
  const { getTTYSessionsSnapshot } = await import('@/lib/terminal/ttyServer');
  const sessions = getTTYSessionsSnapshot();
  return sessions.find((s) => s.terminalId === terminalId) || null;
}

/**
 * GET /api/terminal/sessions/:id — lookup only.
 * Never boots a local PTY server for a miss (restore probes 404 often; that used to
 * call ensureTTYServer on every poll and stall Turbopack/health).
 */
export async function GET(_req, { params }) {
  const { terminalId } = await params;

  if (!terminalId) {
    return NextResponse.json({ error: 'terminalId is required' }, { status: 400 });
  }

  try {
    const sidecarPort = await resolveSidecarPort();
    if (sidecarPort) {
      const data = await readSidecarSession(terminalId, sidecarPort);
      if (data) {
        return NextResponse.json(data);
      }
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
    console.error('Failed to read local PTY session:', error);
  }

  return NextResponse.json({ error: 'Session not found' }, { status: 404 });
}

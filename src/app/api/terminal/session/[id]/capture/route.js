import { NextResponse } from 'next/server';
import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';
import { getSessionOutput } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

async function trySidecarCapture(sessionId) {
  try {
    const port = await readProductionSidecarPort();
    if (!port) return null;

    const res = await fetch(
      `http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionId)}/output`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data && typeof data.output === 'string') {
      return { output: data.output, session_id: sessionId, source: 'sidecar' };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(_request, { params }) {
  const { id } = (await params) || {};
  if (!id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  // 1. Try local ttyServer (Zed / dev PTYs)
  const output = getSessionOutput(id);
  if (output !== null) {
    return NextResponse.json({ output, session_id: id, source: 'tty' });
  }

  // 2. Fallback to sidecar (main visible workspace terminals / agent TUIs)
  const sidecar = await trySidecarCapture(id);
  if (sidecar) {
    return NextResponse.json(sidecar);
  }

  return NextResponse.json({ error: 'unknown session' }, { status: 404 });
}

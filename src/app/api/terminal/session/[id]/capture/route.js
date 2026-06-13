import { NextResponse } from 'next/server';
import { getSessionOutput } from '@/lib/terminal/ttyServer';
import { trySidecarCapture } from '@/lib/terminal/sidecarSessionApi';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = (await params) || {};
  if (!id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const output = getSessionOutput(id);
  if (output !== null) {
    return NextResponse.json({ output, session_id: id, source: 'tty' });
  }

  const sidecar = await trySidecarCapture(id);
  if (sidecar) {
    return NextResponse.json(sidecar);
  }

  return NextResponse.json({ error: 'unknown session' }, { status: 404 });
}

import { NextResponse } from 'next/server';
import { pushSessionInput } from '@/lib/terminal/ttyServer';
import { trySidecarInput } from '@/lib/terminal/sidecarSessionApi';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const { id } = (await params) || {};
  if (!id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const data = body?.data;
  if (data === undefined || data === null) {
    return NextResponse.json({ error: 'data field is required' }, { status: 400 });
  }

  const ok = pushSessionInput(id, data);
  if (ok) {
    return NextResponse.json({ session_id: id, sent: true, source: 'tty' });
  }

  const sidecar = await trySidecarInput(id, data);
  if (sidecar) {
    return NextResponse.json(sidecar);
  }

  // Neither the in-process ttyServer nor the sidecar know this session — the
  // client will fall back to dispatching devhub:zed-terminal-input to an
  // open WebSocket panel, which only works if that panel is currently
  // mounted/subscribed. Log so this rare-but-fragile path stays observable.
  console.warn(
    `[terminal/input] unknown session ${id}: neither tty nor sidecar had it, falling back to client WebSocket dispatch`
  );

  return NextResponse.json(
    {
      error: 'unknown session',
      action: 'send_input',
      terminalId: id,
      hint: 'Client may dispatch devhub:zed-terminal-input to active WebSocket panel.',
    },
    { status: 404 }
  );
}

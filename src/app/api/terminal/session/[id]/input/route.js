import { NextResponse } from 'next/server';
import { pushSessionInput } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const { id } = params || {};
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
  if (!ok) {
    return NextResponse.json({ error: 'unknown session' }, { status: 404 });
  }

  return NextResponse.json({ session_id: id, sent: true });
}

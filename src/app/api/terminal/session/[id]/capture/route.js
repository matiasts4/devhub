import { NextResponse } from 'next/server';
import { getSessionOutput } from '@/lib/terminal/ttyServer';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = (await params) || {};
  if (!id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const output = getSessionOutput(id);
  if (output === null) {
    return NextResponse.json({ error: 'unknown session' }, { status: 404 });
  }

  return NextResponse.json({ output, session_id: id });
}

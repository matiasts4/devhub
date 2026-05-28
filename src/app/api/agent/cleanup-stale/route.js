import { NextResponse } from 'next/server';
import { cleanupStaleAgentSessions } from '@/lib/db/localDb';

export async function POST() {
  try {
    const result = cleanupStaleAgentSessions();
    return NextResponse.json({ ok: true, cleaned: result });
  } catch (err) {
    console.error('[cleanup-stale]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

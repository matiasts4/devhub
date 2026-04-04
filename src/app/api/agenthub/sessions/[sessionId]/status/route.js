import { NextResponse } from 'next/server';
import { tables } from '@/lib/db/localDb.js';

export async function PUT(req, { params }) {
  try {
    const { sessionId } = params;
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const validStatuses = [
      'active',
      'working',
      'running',
      'thinking',
      'completed',
      'error',
      'aborted',
      'idle',
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = tables.agent_hub_sessions.update(
      { status, updated_at: new Date().toISOString() },
      [['id', '=', sessionId]]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating session status:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

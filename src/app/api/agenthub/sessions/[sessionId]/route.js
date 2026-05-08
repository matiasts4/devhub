import { NextResponse } from 'next/server';
import { tables } from '@/lib/db/localDb.js';

const VALID_VISIBILITY = ['visible', 'hidden_active', 'hidden_history', 'hidden_all'];

export async function PATCH(req, { params }) {
  try {
    const { sessionId } = await params;
    const body = await req.json();

    const session = tables.agent_hub_sessions.single({
      where: [['id', '=', sessionId]],
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const updates = { updated_at: new Date().toISOString() };

    if ('custom_name' in body) {
      updates.custom_name = body.custom_name || null;
    }

    if ('visibility' in body) {
      if (!VALID_VISIBILITY.includes(body.visibility)) {
        return NextResponse.json(
          { error: `Invalid visibility. Must be one of: ${VALID_VISIBILITY.join(', ')}` },
          { status: 400 }
        );
      }
      updates.visibility = body.visibility;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = tables.agent_hub_sessions.update(updates, [['id', '=', sessionId]]);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

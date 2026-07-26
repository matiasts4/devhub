import { NextResponse } from 'next/server';
import { updateTrace } from '@/lib/db/localDb.js';

export async function PATCH(req, { params }) {
  try {
    const { sessionId: _sessionId, traceId } = await params;
    const body = await req.json();

    if (!traceId) {
      return NextResponse.json({ error: 'traceId is required' }, { status: 400 });
    }

    // Build partial update — only include provided fields
    const updates = {};
    const allowedFields = [
      'tool_status',
      'tool_output',
      'tool_input',
      'duration_ms',
      'time_end',
      'content',
      'metadata',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const result = updateTrace(traceId, updates);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Error updating trace:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

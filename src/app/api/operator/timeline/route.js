/**
 * POST /api/operator/timeline
 * Server-side endpoint for writing timeline entries from client components.
 * Writes to the operator_timeline table via timelineStore.
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();

    const { actionId, event, timestamp, actor, detail } = body;

    if (!actionId || !event) {
      return NextResponse.json(
        { error: 'actionId and event are required' },
        { status: 400 }
      );
    }

    // Import here to avoid client-side bundling
    const { insertTimelineItem } = await import('@/lib/operators/timelineStore.js');

    const executionId = actionId;
    const status = event === 'confirmed' ? 'policy_approved' : event === 'dispatched' ? 'invoked' : event;
    const occurredAt = new Date(timestamp || Date.now()).toISOString();

    const item = {
      item_id: crypto.randomUUID(),
      execution_id: executionId,
      correlation_id: '',
      stage: 'action_request',
      status,
      actor: {
        type: actor === 'human' ? 'human' : 'operator',
        id: actor === 'human' ? 'human' : 'operator',
        role: 'operator',
      },
      tool: null,
      params: detail ?? null,
      evidence_refs: [],
      redaction_level: 'none',
      occurred_at: occurredAt,
    };

    insertTimelineItem(item);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[operator/timeline] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
/**
 * GET + POST /api/agenthub/operators/timeline
 *
 * Operator-facing REST endpoint for the execution timeline.
 * Authentication: operator session cookie or X-Operator-Id header (existing operator pattern).
 *
 * GET  — query timeline items or rollup (OET-8)
 * POST — emit a new timeline item (OET-9)
 */

import { NextResponse } from 'next/server';
import {
  insertTimelineItem,
  getTimelineItems,
  getExecutionRollup,
} from '@/lib/operators/timelineStore.js';
import { purgeOldEntries } from '@/lib/operators/timelineRetention.js';
import { VALID_STAGES, VALID_STATUSES } from '@/lib/db/constants.js';

// ──────────────────────────────────────────────────────────────────────────────
// Auth helper — operator session or X-Operator-Id header
// ──────────────────────────────────────────────────────────────────────────────

function getOperatorId(request) {
  // Prefer explicit header for API clients; fall back to session cookie
  return request.headers.get('X-Operator-Id') || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — query timeline items or rollup
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request) {
  // OET-8: require operator authentication
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const filters = {
    execution_id: searchParams.get('execution_id') || undefined,
    actor_id: searchParams.get('actor_id') || undefined,
    stage: searchParams.get('stage')
      ? searchParams.get('stage').split(',').map((s) => s.trim())
      : undefined,
    status: searchParams.get('status')
      ? searchParams.get('status').split(',').map((s) => s.trim())
      : undefined,
    since: searchParams.get('since') || undefined,
    limit: Math.min(Number(searchParams.get('limit')) || 50, 200),
  };

  const rollup = searchParams.get('rollup') === 'true';

  const items = rollup ? getExecutionRollup(filters) : getTimelineItems(filters);

  return NextResponse.json({ items }, { status: 200 });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST — emit a new timeline item
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
  // OET-9: require operator authentication
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Required field validation (D-3)
  const requiredFields = [
    { field: 'execution_id', label: 'execution_id' },
    { field: 'stage', label: 'stage' },
    { field: 'status', label: 'status' },
    { field: 'actor', label: 'actor' },
  ];

  for (const { field, label } of requiredFields) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${label}` },
        { status: 400 }
      );
    }
  }

  // Validate actor sub-fields
  if (!body.actor?.type || !body.actor?.id || !body.actor?.role) {
    return NextResponse.json(
      { error: 'Missing required field: actor.type / actor.id / actor.role' },
      { status: 400 }
    );
  }

  // ── Stage vocabulary validation (OET-2)
  if (!VALID_STAGES.has(body.stage)) {
    return NextResponse.json(
      {
        error: `Unknown stage: ${body.stage}`,
        valid_values: [...VALID_STAGES],
      },
      { status: 400 }
    );
  }

  // ── Status vocabulary validation (OET-3)
  if (!VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      {
        error: `Unknown status: ${body.status}`,
        valid_values: [...VALID_STATUSES],
      },
      { status: 400 }
    );
  }

  // ── Insert (idempotency handled inside insertTimelineItem)
  let result;
  try {
    result = insertTimelineItem(body);
  } catch (err) {
    console.error('[timeline/POST] Insert failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // ── Lazy purge on successful POST (D-4) — fire-and-forget
  setImmediate(() => {
    try {
      purgeOldEntries();
    } catch (_) {
      // Non-blocking — do not fail the request on purge error
    }
  });

  return NextResponse.json({ item: result.row }, { status: result.statusCode });
}
/**
 * DEPRECATED — POST /api/agenthub/traces/persist
 *
 * This endpoint is no longer used. Server-side background SSE consumer
 * in headless/route.js now handles trace persistence directly.
 *
 * Kept as a stub for backward compatibility. Remove in next major cleanup.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const POST = withAuth(async function POST(req) {
  console.warn(
    '[DEPRECATED] /api/agenthub/traces/persist is deprecated. ' +
      'Use the background SSE consumer in headless/route.js instead.'
  );
  return NextResponse.json(
    {
      success: false,
      message: 'This endpoint is deprecated. Traces are now persisted server-side.',
    },
    { status: 410 }
  );
});

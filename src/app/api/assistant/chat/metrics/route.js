import { NextResponse } from 'next/server';
import { getZedServerMetricsSummary } from '@/lib/asistente/zedServerMetrics';

export async function GET() {
  // Internal observability endpoint; disabled in production to avoid leaking
  // runtime counters.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not available in production' }, { status: 404 });
  }
  return NextResponse.json(getZedServerMetricsSummary());
}

export const dynamic = 'force-dynamic';

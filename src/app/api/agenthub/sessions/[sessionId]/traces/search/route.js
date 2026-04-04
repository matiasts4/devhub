import { NextResponse } from 'next/server';
import { searchTraces } from '@/lib/db/localDb.js';

export async function GET(req, { params }) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q');
    const type = searchParams.get('type') || undefined;
    const limit = parseInt(searchParams.get('limit'), 10) || 50;

    if (!q) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const results = searchTraces(sessionId, q, { limit });

    // If type filter is provided, filter results in-memory
    const filtered = type ? results.filter((r) => r.trace_type === type) : results;

    return NextResponse.json(filtered);
  } catch (err) {
    console.error('Error searching traces:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

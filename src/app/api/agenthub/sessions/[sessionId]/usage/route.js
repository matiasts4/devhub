import { NextResponse } from 'next/server';
import { getSessionUsage } from '@/lib/db/localDb.js';

export async function GET(req, { params }) {
  try {
    const { sessionId } = await params;
    const usage = getSessionUsage(sessionId);

    if (!usage) {
      return NextResponse.json(
        {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          context_utilization: 0,
          tool_calls_count: 0,
          total_duration_ms: 0,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      context_utilization: usage.context_utilization || 0,
      tool_calls_count: usage.tool_calls_count || 0,
      total_duration_ms: usage.total_duration_ms || 0,
    });
  } catch (err) {
    console.error('Error fetching session usage:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

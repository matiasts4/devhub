import { NextResponse } from 'next/server';
import { getSessionUsage, tables } from '@/lib/db/localDb.js';
import { resolveContextUsage } from '@/lib/agenthub/contextUsage';

export async function GET(req, { params }) {
  try {
    const { sessionId } = await params;
    const usage = getSessionUsage(sessionId);
    const session = tables.agent_hub_sessions.single({ where: [['id', '=', sessionId]] });
    const resolvedUsage = resolveContextUsage(usage || {}, { model: session?.agent_model || null });

    if (!usage) {
      return NextResponse.json(
        {
          prompt_tokens: resolvedUsage.prompt_tokens,
          completion_tokens: resolvedUsage.completion_tokens,
          total_tokens: resolvedUsage.total_tokens,
          context_window_size: resolvedUsage.context_window_size,
          context_utilization: resolvedUsage.context_utilization,
          current_context_tokens: resolvedUsage.current_context_tokens,
          context_tone: resolvedUsage.context_tone,
          model: resolvedUsage.model,
          tool_calls_count: 0,
          total_duration_ms: 0,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      prompt_tokens: resolvedUsage.prompt_tokens,
      completion_tokens: resolvedUsage.completion_tokens,
      total_tokens: resolvedUsage.total_tokens,
      context_window_size: resolvedUsage.context_window_size,
      context_utilization: resolvedUsage.context_utilization,
      current_context_tokens: resolvedUsage.current_context_tokens,
      context_tone: resolvedUsage.context_tone,
      model: resolvedUsage.model,
      tool_calls_count: usage.tool_calls_count || 0,
      total_duration_ms: usage.total_duration_ms || 0,
    });
  } catch (err) {
    console.error('Error fetching session usage:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

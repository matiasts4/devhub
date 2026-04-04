import { NextResponse } from 'next/server';
import { getTracesBySession, insertTrace } from '@/lib/db/localDb.js';

export async function GET(req, { params }) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type') || undefined;
    const tool = searchParams.get('tool') || undefined;
    const status = searchParams.get('status') || undefined;
    const messageId = searchParams.get('message_id') || undefined;
    const limit = parseInt(searchParams.get('limit'), 10) || 100;

    const traces = getTracesBySession(sessionId, {
      message_id: messageId,
      trace_type: type,
      tool_name: tool,
      tool_status: status,
      limit,
    });

    return NextResponse.json(traces);
  } catch (err) {
    console.error('Error fetching traces:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { sessionId } = await params;
    const body = await req.json();

    const {
      id,
      message_id,
      trace_type,
      agent_name,
      tool_name,
      tool_input,
      tool_output,
      tool_status,
      content,
      duration_ms,
      time_start,
      time_end,
      metadata,
    } = body;

    if (!trace_type) {
      return NextResponse.json({ error: 'trace_type is required' }, { status: 400 });
    }

    const result = insertTrace({
      id: id || crypto.randomUUID(),
      session_id: sessionId,
      message_id,
      trace_type,
      agent_name,
      tool_name,
      tool_input,
      tool_output,
      tool_status,
      content,
      duration_ms,
      time_start,
      time_end,
      metadata,
    });

    return NextResponse.json({ success: true, id: result.lastInsertRowid || id });
  } catch (err) {
    console.error('Error inserting trace:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

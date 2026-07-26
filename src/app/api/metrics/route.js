import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = localDb.getDb();

    // Use agent_traces (managed by localDb) instead of the legacy agent_logs table
    // agent_traces has: session_id, agent_name, trace_type, tool_name, tool_status,
    // duration_ms, content, created_at — equivalent data with proper schema management

    // Obtener las ultimas sesiones unicas (10)
    const recentSessionsQuery = db.prepare(`
      SELECT session_id, agent_name, MAX(created_at) as last_activity
      FROM agent_traces
      WHERE agent_name IS NOT NULL
      GROUP BY session_id, agent_name
      ORDER BY last_activity DESC
      LIMIT 10
    `);
    const recentSessions = recentSessionsQuery.all();

    // Obtener los ultimos eventos (50)
    const recentEventsQuery = db.prepare(`
      SELECT id, session_id, agent_name, trace_type as event_type,
             tool_name as details, duration_ms, tool_status as status, created_at
      FROM agent_traces
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const recentEvents = recentEventsQuery.all();

    // Obtener KPIs agregados
    const kpisQuery = db.prepare(`
      SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(CASE WHEN trace_type = 'tool_call' THEN 1 END) as total_tools_used,
        COUNT(CASE WHEN tool_status = 'error' THEN 1 END) as total_errors,
        AVG(CASE WHEN trace_type = 'tool_call' AND duration_ms IS NOT NULL THEN duration_ms END) as avg_tool_duration_ms
      FROM agent_traces
    `);
    const kpis = kpisQuery.get();

    // Agrupar eventos de uso de tool por fecha (para Recharts temporal)
    const chartDataQuery = db.prepare(`
      SELECT
        substr(created_at, 1, 10) as date,
        COUNT(CASE WHEN trace_type = 'tool_call' THEN 1 END) as tools,
        COUNT(CASE WHEN trace_type = 'session_start' THEN 1 END) as sessions
      FROM agent_traces
      GROUP BY date
      ORDER BY date ASC
      LIMIT 30
    `);
    const chartData = chartDataQuery.all();

    return NextResponse.json({
      success: true,
      kpis,
      recentSessions,
      recentEvents,
      chartData,
    });
  } catch (error) {
    console.error('Error fetching agent metrics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

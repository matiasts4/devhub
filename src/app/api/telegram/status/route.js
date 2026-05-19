import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = localDb.getDb();

    // Session counts
    const activeChats = db
      .prepare(`SELECT count(*) as cnt FROM telegram_sessions WHERE status = 'active'`)
      .get();
    const totalSessions = db.prepare(`SELECT count(*) as cnt FROM telegram_sessions`).get();

    // Last activity across the entire audit log
    const lastActivity = db
      .prepare(
        `SELECT created_at, event_type, chat_id
         FROM telegram_activity
         ORDER BY created_at DESC LIMIT 1`
      )
      .get();

    // Errors in the last 5 minutes
    const recentErrors = db
      .prepare(
        `SELECT count(*) as cnt
         FROM telegram_activity
         WHERE status = 'error'
           AND created_at >= datetime('now', '-5 minutes')`
      )
      .get();

    const busyStatus = db
      .prepare(
        `SELECT count(*) as cnt
         FROM agent_logs
         WHERE event_type IN ('tool_execute', 'tool_start', 'session_busy')
           AND created_at >= datetime('now', '-10 seconds')`
      )
      .get();

    const currentTool = db
      .prepare(
        `SELECT tool_name
         FROM agent_logs
         WHERE tool_name IS NOT NULL
           AND event_type IN ('tool_execute', 'tool_start')
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get();

    const latestWorkspaceAudit = db
      .prepare(
        `SELECT id, status, evidence_ref
         FROM agent_workspaces
         WHERE status IS NOT NULL OR evidence_ref IS NOT NULL
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`
      )
      .get();

    const latestRunAudit = db
      .prepare(
        `SELECT run_id, workspace_id, status, terminal_reason_class
         FROM agent_runs
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`
      )
      .get();

    const latestArtifactAudit = latestRunAudit?.run_id
      ? db
          .prepare(
            `SELECT artifact_id, kind, evidence_ref, seq
             FROM agent_artifacts
             WHERE run_id = ?
             ORDER BY seq DESC, created_at DESC
             LIMIT 1`
          )
          .get(latestRunAudit.run_id)
      : null;

    const artifactCountRow = latestRunAudit?.run_id
      ? db
          .prepare(`SELECT count(*) as cnt FROM agent_artifacts WHERE run_id = ?`)
          .get(latestRunAudit.run_id)
      : null;

    // Derive bot_connected from recency of last activity
    let botConnected = false;
    if (lastActivity?.created_at) {
      const lastMs = new Date(lastActivity.created_at + 'Z').getTime();
      // Consider "connected" if something happened in the last 10 minutes
      botConnected = Date.now() - lastMs < 10 * 60 * 1000;
    }

    return NextResponse.json({
      bot_connected: botConnected,
      active_chats: Number(activeChats?.cnt ?? 0),
      total_sessions: Number(totalSessions?.cnt ?? 0),
      last_activity: lastActivity?.created_at ?? null,
      last_event_type: lastActivity?.event_type ?? null,
      recent_errors: Number(recentErrors?.cnt ?? 0),
      is_busy: Number(busyStatus?.cnt ?? 0) > 0,
      current_tool: currentTool?.tool_name ?? null,
      workspace_status: latestWorkspaceAudit?.status ?? null,
      run_status: latestRunAudit?.status ?? null,
      terminal_reason_class: latestRunAudit?.terminal_reason_class ?? null,
      evidence_ref: latestWorkspaceAudit?.evidence_ref ?? null,
      latest_artifact_kind: latestArtifactAudit?.kind ?? null,
      latest_artifact_evidence_ref: latestArtifactAudit?.evidence_ref ?? null,
      artifact_count: Number(artifactCountRow?.cnt ?? 0),
    });
  } catch (error) {
    console.error('telegram/status error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

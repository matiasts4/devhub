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
    const totalSessions = db
      .prepare(`SELECT count(*) as cnt FROM telegram_sessions`)
      .get();

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
    });
  } catch (error) {
    console.error('telegram/status error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

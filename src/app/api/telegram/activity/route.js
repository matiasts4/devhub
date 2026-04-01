import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let limit = parseInt(searchParams.get('limit') ?? '50');
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0') || 0);
    const chatId = searchParams.get('chat_id') ?? null;
    const eventType = searchParams.get('event_type') ?? null;

    const db = localDb.getDb();

    const whereParts = [];
    const params = [];

    if (chatId) {
      whereParts.push('chat_id = ?');
      params.push(chatId);
    }
    if (eventType) {
      whereParts.push('event_type = ?');
      params.push(eventType);
    }

    const whereClause =
      whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Items
    const items = db
      .prepare(
        `SELECT id, chat_id, event_type, direction, source, command,
                content_preview, status, metadata, created_at
         FROM telegram_activity
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    // Has more?
    const totalRow = db
      .prepare(
        `SELECT count(*) as cnt FROM telegram_activity ${whereClause}`
      )
      .get(...params);
    const total = Number(totalRow?.cnt ?? 0);
    const hasMore = offset + limit < total;

    return NextResponse.json({ items, has_more: hasMore, total });
  } catch (error) {
    console.error('telegram/activity error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

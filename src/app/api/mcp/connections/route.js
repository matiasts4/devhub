export const dynamic = 'force-static';

import { getDb } from '@/lib/db/localDb';
import { NextResponse } from 'next/server';

/**
 * GET /api/mcp/connections
 * Returns all active MCP connections.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  const db = getDb();
  const connections = db.tables.mcp_connections.select({
    select: 'id, name, type, endpoint_url, is_active, last_sync, created_at',
    orderBy: [['created_at', 'DESC']],
  });

  return NextResponse.json({ connections });
}

/**
 * POST /api/mcp/connections
 * Creates a new MCP connection.
 */
export async function POST(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  const body = await request.json();
  const { name, type, endpoint_url, api_key, config } = body;

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
  }

  const db = getDb();
  const data = db.tables.mcp_connections.insert({
    id: `conn-${Date.now()}`,
    user_id: 'local-user',
    name,
    type: type || 'generic',
    endpoint_url: endpoint_url || null,
    api_key_encrypted: api_key || null,
    config: config ? JSON.stringify(config) : '{}',
    is_active: 1,
  });

  return NextResponse.json({ connection: data }, { status: 201 });
}

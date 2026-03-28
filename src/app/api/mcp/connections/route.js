export const dynamic = 'force-static';

import { createClient } from '@/lib/supabase/server';

import { NextResponse } from 'next/server';

/**
 * GET /api/mcp/connections
 * Returns all active MCP connections for the current user.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'API route not available in static export build.',
      },
      { status: 501 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('mcp_connections')
    .select('id, name, type, endpoint_url, is_active, last_sync, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data });
}

/**
 * POST /api/mcp/connections
 * Creates a new MCP connection.
 */
export async function POST(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'API route not available in static export build.',
      },
      { status: 501 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, type, endpoint_url, api_key, config } = body;

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('mcp_connections').insert({
    user_id: user.id,
    name,
    type: type || 'generic',
    endpoint_url: endpoint_url || null,
    api_key_encrypted: api_key || null, // TODO: encrypt with server-side key
    config: config || {},
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connection: data }, { status: 201 });
}

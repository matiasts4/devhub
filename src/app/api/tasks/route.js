export const dynamic = 'force-static';

import { createClient } from '@/lib/supabase/server';

import { NextResponse } from 'next/server';

/**
 * GET /api/tasks?project_id=xxx
 * Returns all tasks for a project (for MCP agents to read).
 */
export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get('project_id');

  let query = supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (project_id) query = query.eq('project_id', project_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

/**
 * POST /api/tasks
 * Creates a new task (usable by MCP agents).
 */
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { project_id, title, description, status, priority, due_date } = body;

  if (!project_id || !title) {
    return NextResponse.json({ error: 'project_id and title are required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('tasks').insert({
    project_id, title,
    description: description || null,
    status: status || 'pending',
    priority: priority || 'medium',
    due_date: due_date || null,
    user_id: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

/**
 * PATCH /api/tasks
 * Updates a task status/fields (usable by MCP agents).
 * Body: { id, ...fields }
 */
export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (updates.status === 'completed' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('tasks').update(updates).eq('id', id).eq('user_id', user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

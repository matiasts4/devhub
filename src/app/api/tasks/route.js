export const dynamic = 'force-static';

import { getDb } from '@/lib/db/localDb';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const TaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().optional().nullable(),
});

const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().optional().nullable(),
});

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get('project_id');

  const db = getDb();
  const where = [];
  if (project_id) where.push(['project_id', '=', project_id]);

  const tasks = db.tables.tasks.select({
    where,
    orderBy: [['created_at', 'DESC']],
  });

  return NextResponse.json({ tasks });
}

export async function POST(request) {
  const body = await request.json();
  const parsed = TaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { project_id, title, description, status, priority, due_date } = parsed.data;

  const db = getDb();
  const task = db.tables.tasks.insert({
    id: `task-${Date.now()}`,
    project_id,
    title,
    description: description || null,
    status: status || 'pending',
    priority: priority || 'medium',
    due_date: due_date || null,
    user_id: 'local-user',
  });

  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();
  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { id, ...updates } = parsed.data;

  if (updates.status === 'completed' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const db = getDb();
  const task = db.tables.tasks.update(updates, [['id', '=', id]]);

  return NextResponse.json({ task });
}

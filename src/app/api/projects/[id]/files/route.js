import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

// POST /api/projects/[id]/files
// Body: { files: [{ file_name, content, file_type }], user_id }
export async function POST(req, context) {
  try {
    const params = await context.params;
    const { id: project_id } = params;
    const { files, user_id } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const saved = [];
    for (const f of files) {
      const row = localDb.tables.project_files?.insert({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        project_id,
        user_id: user_id || 'local-user',
        file_name: f.file_name,
        content: f.content,
        file_type: f.file_type || 'text',
        size_chars: f.content?.length || 0,
      });
      if (row) saved.push(row);
    }

    return NextResponse.json({ success: true, saved: saved.length, files: saved });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/projects/[id]/files
export async function GET(req, context) {
  try {
    const params = await context.params;
    const { id: project_id } = params;

    const files =
      localDb.tables.project_files?.select({
        where: [['project_id', '=', project_id]],
        select: 'id, file_name, file_type, size_chars, created_at',
        orderBy: [['created_at', 'ASC']],
      }) || [];

    return NextResponse.json({ total: files.length, files });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/files?file_id=uuid
export async function DELETE(req, context) {
  try {
    const params = await context.params;
    const { id: project_id } = params;
    const { searchParams } = new URL(req.url);
    const file_id = searchParams.get('file_id');
    if (!file_id) return NextResponse.json({ error: 'file_id required' }, { status: 400 });

    localDb.tables.project_files?.delete([
      ['id', '=', file_id],
      ['project_id', '=', project_id],
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

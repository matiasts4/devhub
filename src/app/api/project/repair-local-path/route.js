import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db/localDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isUsableDirectory(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

// Best-known real project root for this server process. In dev this is the repo
// root (process.cwd()); DEVHUB_PROJECT_DIR wins when the runtime sets it. This is
// only used to repair a local_path that cannot exist on the current OS (e.g. a
// POSIX path left in the DB after roaming it to a Windows install).
function resolveServerProjectRoot(env = process.env) {
  return path.resolve(env.DEVHUB_PROJECT_DIR || process.cwd());
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    if (!projectId) {
      return NextResponse.json({ error: 'projectId requerido' }, { status: 400 });
    }

    const db = getDb();
    const row = db.prepare('SELECT id, local_path FROM projects WHERE id = ?').get(projectId);
    if (!row) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const currentPath = typeof row.local_path === 'string' ? row.local_path.trim() : '';
    if (isUsableDirectory(currentPath)) {
      return NextResponse.json({ changed: false, exists: true, localPath: currentPath });
    }

    const suggestedRoot = resolveServerProjectRoot();
    if (!isUsableDirectory(suggestedRoot)) {
      return NextResponse.json({
        changed: false,
        exists: false,
        localPath: currentPath,
        suggestedRoot,
      });
    }

    db.prepare('UPDATE projects SET local_path = ? WHERE id = ?').run(suggestedRoot, projectId);
    return NextResponse.json({
      changed: true,
      exists: false,
      previousPath: currentPath,
      localPath: suggestedRoot,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

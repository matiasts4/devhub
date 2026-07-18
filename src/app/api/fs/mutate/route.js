import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const baseDir = body.base || process.cwd();
    const action = String(body.action || '');

    if (!['create_file', 'create_dir', 'rename', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action === 'rename') {
      const fromBox = resolveSandboxPath(baseDir, body.from || '');
      const toBox = resolveSandboxPath(baseDir, body.to || '');
      if (!fromBox.ok) {
        return NextResponse.json({ error: fromBox.error }, { status: fromBox.status });
      }
      if (!toBox.ok) {
        return NextResponse.json({ error: toBox.error }, { status: toBox.status });
      }
      if (!fromBox.relative || !toBox.relative) {
        return NextResponse.json({ error: 'Cannot rename workspace root' }, { status: 400 });
      }
      await fs.rename(fromBox.resolved, toBox.resolved);
      return NextResponse.json({ ok: true, from: fromBox.relative, to: toBox.relative });
    }

    const target = resolveSandboxPath(baseDir, body.path || '');
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
    }
    if (!target.relative) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (action === 'create_file') {
      await fs.mkdir(path.dirname(target.resolved), { recursive: true });
      await fs.writeFile(target.resolved, '', { flag: 'wx' });
      return NextResponse.json({ ok: true, path: target.relative });
    }

    if (action === 'create_dir') {
      await fs.mkdir(target.resolved, { recursive: false });
      return NextResponse.json({ ok: true, path: target.relative });
    }

    if (action === 'delete') {
      await fs.rm(target.resolved, { recursive: true, force: false });
      return NextResponse.json({ ok: true, path: target.relative });
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
  } catch (error) {
    const message = error?.code === 'EEXIST' ? 'Already exists' : error?.message || 'Mutate failed';
    console.error('fs mutate failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';
import { getWatchEntry } from '@/lib/fs/watchRegistry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const baseDir = searchParams.get('base') || process.cwd();
  const sandbox = resolveSandboxPath(baseDir, '');
  if (!sandbox.ok) {
    return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
  }

  const entry = getWatchEntry(sandbox.resolvedBase);
  let controllerRef = null;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      entry.addClient(controller);
      controller.enqueue(`data: ${JSON.stringify({ paths: [], ready: true })}\n\n`);
    },
    cancel() {
      if (controllerRef) entry.removeClient(controllerRef);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const baseDir = body.base || process.cwd();
    const action = body.action === 'remove' ? 'remove' : 'add';
    const paths = Array.isArray(body.paths) ? body.paths.map((p) => String(p ?? '')) : [];

    const sandbox = resolveSandboxPath(baseDir, '');
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }

    // Validate each path is under base
    for (const rel of paths) {
      if (!rel) continue;
      const check = resolveSandboxPath(baseDir, rel);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: check.status });
      }
    }

    const entry = getWatchEntry(sandbox.resolvedBase);
    if (action === 'add') entry.addPaths(paths);
    else entry.removePaths(paths);

    return NextResponse.json({ ok: true, action, count: paths.length });
  } catch (error) {
    console.error('fs watch post failed:', error);
    return NextResponse.json({ error: 'Watch update failed' }, { status: 500 });
  }
}

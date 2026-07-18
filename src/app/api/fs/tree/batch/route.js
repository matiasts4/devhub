import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { listDirectoryEntries } from '@/lib/fs/listDir';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';

export const dynamic = 'force-dynamic';

/**
 * POST { base, dirs: string[], fresh?: boolean }
 * → { listings: { [dirRel]: DirEntry[] } }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const baseDir = body.base || process.cwd();
    const dirs = Array.isArray(body.dirs) ? body.dirs.map((d) => String(d ?? '')) : [''];
    const unique = [...new Set(dirs)].slice(0, 64);

    const sandbox = resolveSandboxPath(baseDir, '');
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }

    await fs.access(sandbox.resolvedBase);

    const listings = {};
    await Promise.all(
      unique.map(async (dirRel) => {
        const check = resolveSandboxPath(baseDir, dirRel);
        if (!check.ok) {
          listings[dirRel] = [];
          return;
        }
        try {
          listings[dirRel] = await listDirectoryEntries(check.resolved, sandbox.resolvedBase);
        } catch {
          listings[dirRel] = [];
        }
      })
    );

    return NextResponse.json({
      root: sandbox.resolvedBase,
      listings,
    });
  } catch (error) {
    console.error('tree batch failed:', error);
    return NextResponse.json({ error: 'Failed to list directories' }, { status: 500 });
  }
}

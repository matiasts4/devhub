import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { HEAVY_DIR_NAMES, resolveSandboxPath } from '@/lib/fs/pathSandbox';
import { rankFuzzy } from '@/lib/fs/fuzzyScore';
import { loadRootGitignore } from '@/lib/fs/simpleGitignore';

export const dynamic = 'force-dynamic';

const MAX_SCANNED = 50_000;
const DEFAULT_LIMIT = 200;
const HARD_LIMIT = 1000;

function toPosixRelative(rootPath, fullPath) {
  return path.relative(rootPath, fullPath).split(path.sep).join('/');
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseDir = searchParams.get('base') || process.cwd();
    const query = (searchParams.get('q') || '').trim();
    const limit = Math.min(
      HARD_LIMIT,
      Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT)
    );
    const showHidden = searchParams.get('hidden') === '1';

    if (query.length < 2) {
      return NextResponse.json({ hits: [], truncated: false });
    }

    const sandbox = resolveSandboxPath(baseDir, '');
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }

    await fs.access(sandbox.resolvedBase);
    const isIgnored = await loadRootGitignore(sandbox.resolvedBase);

    const cands = [];
    let scanned = 0;
    let truncated = false;
    const queue = [sandbox.resolvedBase];

    while (queue.length > 0 && scanned < MAX_SCANNED) {
      const current = queue.shift();
      let items;
      try {
        items = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const item of items) {
        scanned += 1;
        if (scanned > MAX_SCANNED) {
          truncated = true;
          break;
        }

        const name = item.name;
        if (!showHidden && name.startsWith('.')) continue;
        if (HEAVY_DIR_NAMES.has(name)) continue;

        const fullPath = path.join(current, name);
        const rel = toPosixRelative(sandbox.resolvedBase, fullPath);
        if (!rel || rel === '.') continue;

        const isDir = item.isDirectory();
        if (isIgnored(rel, isDir)) continue;

        cands.push({
          path: fullPath,
          rel,
          name,
          is_dir: isDir,
        });

        if (isDir) queue.push(fullPath);
      }
    }

    if (scanned >= MAX_SCANNED) truncated = true;

    const hits = rankFuzzy(cands, query, limit);
    return NextResponse.json({
      hits: hits.map(({ rel, name, is_dir }) => ({
        path: rel,
        rel,
        name,
        is_dir,
      })),
      truncated: truncated || cands.length > hits.length,
    });
  } catch (error) {
    console.error('fs search failed:', error);
    return NextResponse.json({ error: 'Failed to search files' }, { status: 500 });
  }
}

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 2 * 1024 * 1024;

async function gitShow(cwd, spec) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cwd, '-c', 'core.quotepath=false', 'show', '--no-textconv', spec],
      {
        timeout: 12_000,
        windowsHide: true,
        maxBuffer: MAX_BYTES + 64 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
        },
        encoding: 'buffer',
      }
    );
    if (stdout.length > MAX_BYTES) {
      return { kind: 'too_large', size: stdout.length };
    }
    if (stdout.slice(0, Math.min(8192, stdout.length)).includes(0)) {
      return { kind: 'binary' };
    }
    return { kind: 'text', text: stdout.toString('utf8') };
  } catch (err) {
    // Missing in HEAD (new/untracked) → empty original
    if (
      err?.code === 128 ||
      /does not exist|exists on disk/i.test(String(err?.stderr || err?.message))
    ) {
      return { kind: 'missing' };
    }
    throw err;
  }
}

/**
 * GET ?base=&path=&staged=0|1
 * → { path, original, modified, binary, tooLarge }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseDir = searchParams.get('base') || process.cwd();
    const relPath = searchParams.get('path') || '';
    const staged = searchParams.get('staged') === '1';

    const sandbox = resolveSandboxPath(baseDir, relPath);
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }
    if (!sandbox.relative) {
      return NextResponse.json({ error: 'path required' }, { status: 400 });
    }

    const posixRel = sandbox.relative.replace(/\\/g, '/');
    // Staged: HEAD → index. Working: HEAD → working tree.
    const originalResult = await gitShow(sandbox.resolvedBase, `HEAD:${posixRel}`);
    if (originalResult.kind === 'binary' || originalResult.kind === 'too_large') {
      return NextResponse.json({
        path: posixRel,
        binary: originalResult.kind === 'binary',
        tooLarge: originalResult.kind === 'too_large',
        original: '',
        modified: '',
      });
    }

    let modified = '';
    let modifiedBinary = false;
    if (staged) {
      const indexResult = await gitShow(sandbox.resolvedBase, `:0:${posixRel}`);
      if (indexResult.kind === 'binary' || indexResult.kind === 'too_large') {
        return NextResponse.json({
          path: posixRel,
          binary: indexResult.kind === 'binary',
          tooLarge: indexResult.kind === 'too_large',
          original: '',
          modified: '',
        });
      }
      modified = indexResult.kind === 'text' ? indexResult.text : '';
    } else {
      try {
        const meta = await fs.stat(sandbox.resolved);
        if (meta.size > MAX_BYTES) {
          return NextResponse.json({
            path: posixRel,
            binary: false,
            tooLarge: true,
            original: originalResult.kind === 'text' ? originalResult.text : '',
            modified: '',
          });
        }
        const buf = await fs.readFile(sandbox.resolved);
        if (buf.slice(0, Math.min(8192, buf.length)).includes(0)) {
          modifiedBinary = true;
        } else {
          modified = buf.toString('utf8');
        }
      } catch {
        // deleted in working tree
        modified = '';
      }
    }

    if (modifiedBinary) {
      return NextResponse.json({
        path: posixRel,
        binary: true,
        tooLarge: false,
        original: '',
        modified: '',
      });
    }

    return NextResponse.json({
      path: posixRel,
      binary: false,
      tooLarge: false,
      original: originalResult.kind === 'text' ? originalResult.text : '',
      modified,
      originalMissing: originalResult.kind === 'missing',
      staged,
    });
  } catch (error) {
    console.error('git-diff failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load git diff' },
      { status: 500 }
    );
  }
}

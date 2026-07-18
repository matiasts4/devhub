import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

async function runGit(cwd, args) {
  const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return { stdout, stderr };
}

/**
 * POST { base, action: stage|unstage|discard|commit, paths?: string[], message?: string }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const baseDir = body.base || process.cwd();
    const action = String(body.action || '');
    const paths = Array.isArray(body.paths)
      ? body.paths.map((p) => String(p || '').replace(/\\/g, '/')).filter(Boolean)
      : [];

    const sandbox = resolveSandboxPath(baseDir, '');
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }

    for (const rel of paths) {
      const check = resolveSandboxPath(baseDir, rel);
      if (!check.ok) {
        return NextResponse.json({ error: `Invalid path: ${rel}` }, { status: 400 });
      }
    }

    const cwd = sandbox.resolvedBase;

    if (action === 'stage') {
      if (paths.length === 0) {
        await runGit(cwd, ['add', '-A']);
      } else {
        await runGit(cwd, ['add', '--', ...paths]);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'unstage') {
      if (paths.length === 0) {
        await runGit(cwd, ['reset', 'HEAD']);
      } else {
        await runGit(cwd, ['reset', 'HEAD', '--', ...paths]);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'discard') {
      if (paths.length === 0) {
        return NextResponse.json({ error: 'paths required for discard' }, { status: 400 });
      }
      await runGit(cwd, ['checkout', '--', ...paths]);
      // also clean untracked if needed — only checkout for tracked
      return NextResponse.json({ ok: true });
    }

    if (action === 'commit') {
      const message = String(body.message || '').trim();
      if (!message) {
        return NextResponse.json({ error: 'message required' }, { status: 400 });
      }
      await runGit(cwd, ['commit', '-m', message]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('git-mutate failed:', error);
    return NextResponse.json(
      { error: error?.stderr?.toString?.() || error?.message || 'git mutate failed' },
      { status: 500 }
    );
  }
}

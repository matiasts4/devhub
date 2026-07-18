import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { resolveSandboxPath } from '@/lib/fs/pathSandbox';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';

function normPathCompare(p) {
  const n = String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return IS_WIN ? n.toLowerCase() : n;
}

function normalizeStatusCode(xy) {
  const x = xy[0] || ' ';
  const y = xy[1] || ' ';
  if (x === '?' || y === '?') {
    return { indexStatus: '?', worktreeStatus: '?', untracked: true, unstaged: true };
  }
  if (x === 'U' || y === 'U') {
    return { indexStatus: 'U', worktreeStatus: 'U', untracked: false, unstaged: true };
  }
  return {
    indexStatus: x === ' ' ? ' ' : x,
    worktreeStatus: y === ' ' ? ' ' : y,
    untracked: false,
    unstaged: y !== ' ',
  };
}

export function parsePorcelainV2(stdout) {
  const changedFiles = [];
  for (const line of String(stdout || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split(' ');
      if (parts.length < 9) continue;
      const xy = parts[1] || '  ';
      const rest = parts.slice(8).join(' ');
      const pathPart = rest.includes('\t') ? rest.split('\t')[0] : rest;
      const meta = normalizeStatusCode(xy);
      changedFiles.push({
        path: pathPart.replace(/\\/g, '/'),
        ...meta,
      });
    } else if (line.startsWith('? ')) {
      changedFiles.push({
        path: line.slice(2).replace(/\\/g, '/'),
        indexStatus: '?',
        worktreeStatus: '?',
        untracked: true,
        unstaged: true,
      });
    }
  }
  return changedFiles;
}

export function scopeChangedFiles(changedFiles, repoRoot, workspaceBase) {
  const baseNorm = normPathCompare(workspaceBase);
  const repoNorm = normPathCompare(repoRoot);
  if (baseNorm === repoNorm) return changedFiles;
  if (!baseNorm.startsWith(`${repoNorm}/`)) return changedFiles;

  const rel = path.relative(repoRoot, workspaceBase).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return changedFiles;
  const displayPrefix = `${rel}/`;
  const prefNorm = normPathCompare(displayPrefix);

  return changedFiles
    .map((file) => {
      if (!normPathCompare(file.path).startsWith(prefNorm)) return null;
      return { ...file, path: file.path.slice(displayPrefix.length) };
    })
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseDir = searchParams.get('base') || process.cwd();
    const sandbox = resolveSandboxPath(baseDir, '');
    if (!sandbox.ok) {
      return NextResponse.json({ error: sandbox.error }, { status: sandbox.status });
    }

    await fs.access(sandbox.resolvedBase);

    let repoRoot = sandbox.resolvedBase;
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', sandbox.resolvedBase, 'rev-parse', '--show-toplevel'],
        { timeout: 5_000, windowsHide: true, maxBuffer: 1024 * 1024 }
      );
      repoRoot = stdout.trim() || sandbox.resolvedBase;
    } catch (err) {
      console.warn('[git-status] not a git repo or git missing:', err?.message || err);
      return NextResponse.json({
        repoRoot: sandbox.resolvedBase,
        changedFiles: [],
        updatedAt: Date.now(),
        error: 'not_a_repo',
      });
    }

    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        repoRoot,
        '-c',
        'core.quotepath=false',
        'status',
        '--porcelain=v2',
        '--untracked-files=normal',
        '--ignore-submodules=dirty',
      ],
      {
        timeout: 12_000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
        },
      }
    );

    const changedFiles = scopeChangedFiles(
      parsePorcelainV2(stdout),
      repoRoot,
      sandbox.resolvedBase
    );

    let branch = '';
    try {
      const { stdout: branchOut } = await execFileAsync(
        'git',
        ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { timeout: 4_000, windowsHide: true, maxBuffer: 256 * 1024 }
      );
      branch = String(branchOut || '').trim();
      if (branch === 'HEAD') branch = 'detached';
    } catch {
      branch = '';
    }

    return NextResponse.json({
      repoRoot: path.resolve(repoRoot),
      branch,
      changedFiles,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('git-status failed:', error);
    return NextResponse.json(
      { error: 'Failed to read git status', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

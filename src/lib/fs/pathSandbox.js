import path from 'path';

/**
 * Resolve `relativePath` under `baseDir` and reject path escapes.
 * @returns {{ ok: true, resolvedBase: string, resolved: string, relative: string } | { ok: false, status: number, error: string }}
 */
export function resolveSandboxPath(baseDir, relativePath = '') {
  const resolvedBase = path.resolve(String(baseDir || ''));
  const segments = String(relativePath || '')
    .split(/[/\\]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.some((s) => s === '..')) {
    return { ok: false, status: 400, error: 'Invalid path' };
  }

  const resolved = segments.length ? path.resolve(resolvedBase, ...segments) : resolvedBase;

  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    return { ok: false, status: 400, error: 'Invalid path' };
  }

  const relative = path.relative(resolvedBase, resolved).split(path.sep).join('/');
  return { ok: true, resolvedBase, resolved, relative };
}

export const HEAVY_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.jj',
  'node_modules',
  'bower_components',
  '.pnpm-store',
  '.yarn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.vite',
  '.turbo',
  '.parcel-cache',
  '.cache',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  'vendor',
  'graphify-out',
  '.gradle',
  'obj',
  '.idea',
  '.terraform',
]);

export function isHeavyDirName(name) {
  return HEAVY_DIR_NAMES.has(String(name || ''));
}

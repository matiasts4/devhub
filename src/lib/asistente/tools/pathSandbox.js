// Path sandbox for file-accessing tools (`browse_files`, `review_log_file`).
// Resolves a project root from `DEVHUB_PROJECT_ROOT` (fallback `process.cwd()`)
// and rejects any path that is not:
//   - the root itself
//   - a subpath of the root
//   - a path under `<root>/.devhub/`
//   - a path under `/tmp/devhub-*`
//
// This is the only place in the codebase that decides whether a tool may
// touch a file. `path.resolve()` is `..`-aware so escapes are caught.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const DEV_TMP_PREFIX = path.join(os.tmpdir(), 'devhub-');

export function resolveProjectRoot() {
  return process.env.DEVHUB_PROJECT_ROOT || process.cwd();
}

function containsNullBytes(p) {
  return typeof p === 'string' && p.includes('\0');
}

function isWithinRoot(resolved) {
  const root = resolveProjectRoot();

  if (resolved === root) return true;
  if (resolved.startsWith(root + path.sep)) return true;
  if (resolved.startsWith(path.join(/*turbopackIgnore: true*/ root, '.devhub') + path.sep))
    return true;
  if (resolved.startsWith(DEV_TMP_PREFIX)) return true;
  return false;
}

export function assertWithinRoot(p) {
  if (containsNullBytes(p)) return false;
  const resolved = path.resolve(p);
  return isWithinRoot(resolved);
}

/**
 * Validate a path for safe file access.
 *
 * @param {string} p
 * @returns {{ ok: true, resolved: string } | { ok: false, error: string }}
 */
export function validateSandboxedPath(p) {
  if (typeof p !== 'string' || p.trim() === '') {
    return { ok: false, error: 'path must be a non-empty string' };
  }
  if (containsNullBytes(p)) {
    return { ok: false, error: 'path contains null bytes' };
  }

  const resolved = path.resolve(p);

  // Reject obvious traversal attempts before hitting the filesystem.
  if (!isWithinRoot(resolved)) {
    return { ok: false, error: 'path escapes project root' };
  }

  // If the path exists, resolve symlinks and verify the real location.
  try {
    const real = fs.realpathSync(resolved);
    if (!isWithinRoot(real)) {
      return { ok: false, error: 'symlink escapes project root' };
    }
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      return { ok: false, error: `cannot validate path: ${err.message}` };
    }
    // Non-existent paths are allowed as long as their resolved location is
    // inside the root; the tool itself will handle missing-file errors.
  }

  return { ok: true, resolved };
}

export default {
  resolveProjectRoot,
  assertWithinRoot,
  validateSandboxedPath,
};

/**
 * Resolve a raw path from agent output into a path suitable for FileExplorer loadFile
 * and /api/fs/read (project-relative POSIX preferred).
 */

/**
 * @param {string} value
 */
export function toPosixPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

/**
 * @param {string} value
 */
export function stripTrailingSlashes(value) {
  const s = toPosixPath(value);
  if (s.length <= 1) return s;
  return s.replace(/\/+$/, '');
}

/**
 * @param {string} value
 */
export function isWindowsAbsolutePath(value) {
  return /^[A-Za-z]:[\\/]/.test(String(value || ''));
}

/**
 * @param {string} value
 */
export function isPosixAbsolutePath(value) {
  return String(value || '').startsWith('/');
}

/**
 * @param {string} value
 */
export function isAbsolutePath(value) {
  return isWindowsAbsolutePath(value) || isPosixAbsolutePath(value);
}

/**
 * Case-fold drive letter for Windows-style comparison.
 * @param {string} posixPath
 */
function normalizeForCompare(posixPath) {
  const s = stripTrailingSlashes(posixPath);
  if (/^[A-Za-z]:\//.test(s)) {
    return s[0].toLowerCase() + s.slice(1);
  }
  return s;
}

/**
 * @param {string} absolutePosix
 * @param {string} rootPosix
 * @returns {string|null} relative posix or null if not under root
 */
export function relativeIfUnderRoot(absolutePosix, rootPosix) {
  const abs = normalizeForCompare(absolutePosix);
  const root = normalizeForCompare(rootPosix);
  if (!abs || !root) return null;
  if (abs === root) return '';
  if (abs.startsWith(root + '/')) {
    return abs.slice(root.length + 1);
  }
  return null;
}

/**
 * Join base + relative using POSIX separators (client-safe).
 * @param {string} base
 * @param {string} rel
 */
export function joinPosix(base, rel) {
  const b = stripTrailingSlashes(base);
  const r = toPosixPath(rel).replace(/^\.\//, '');
  if (!b) return r;
  if (!r) return b;
  if (r.startsWith('/')) return r;
  return `${b}/${r}`;
}

/**
 * @param {{ rawPath?: string, projectRoot?: string|null, cwd?: string|null }} input
 * @returns {{ ok: boolean, openPath?: string, displayPath?: string, reason?: string }}
 */
export function resolveOpenFileTarget({ rawPath, projectRoot = null, cwd = null } = {}) {
  const raw = String(rawPath || '').trim();
  if (!raw) {
    return { ok: false, reason: 'empty' };
  }

  const project = projectRoot ? stripTrailingSlashes(toPosixPath(projectRoot)) : '';
  const sessionCwd = cwd ? stripTrailingSlashes(toPosixPath(cwd)) : project;

  if (isAbsolutePath(raw)) {
    const abs = toPosixPath(raw);
    if (project) {
      const rel = relativeIfUnderRoot(abs, project);
      if (rel != null) {
        return { ok: true, openPath: rel, displayPath: rel || abs };
      }
    }
    // Outside project: still openable via absolute path for /api/fs/read
    return { ok: true, openPath: abs, displayPath: abs };
  }

  const rel = toPosixPath(raw).replace(/^\.\//, '');
  const base = sessionCwd || project;
  if (!base) {
    return { ok: true, openPath: rel, displayPath: rel };
  }

  const joined = joinPosix(base, rel);
  if (project) {
    const under = relativeIfUnderRoot(joined, project);
    if (under != null) {
      return { ok: true, openPath: under, displayPath: under };
    }
  }
  return { ok: true, openPath: joined, displayPath: joined };
}

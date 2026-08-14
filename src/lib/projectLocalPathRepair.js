const DRIVE_LETTER_PATH = /^[A-Za-z]:[\\/]/;

function isWindowsLike() {
  if (typeof navigator === 'undefined') return false;
  return `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase().includes('win');
}

/**
 * High-confidence detection of a project path saved on a different OS: a POSIX
 * absolute path while running on Windows, or a drive-letter path elsewhere.
 * Such a path can never resolve on the current machine — it is the stale value
 * left in the DB when it roams across OS installs — so it is safe to auto-repair.
 *
 * @param {string} localPath
 * @param {boolean} [win] - override the OS detection (tests)
 * @returns {boolean}
 */
export function isCrossPlatformPathMismatch(localPath, win = isWindowsLike()) {
  if (typeof localPath !== 'string') return false;
  const trimmed = localPath.trim();
  if (!trimmed) return false;
  return win ? trimmed.startsWith('/') : DRIVE_LETTER_PATH.test(trimmed);
}

/**
 * Ask the server to validate (and if stale, repair) a project's local_path.
 * Returns the parsed payload, or null on a non-OK response.
 *
 * @param {string} projectId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function repairProjectLocalPath(projectId, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl('/api/project/repair-local-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) return null;
  return res.json();
}

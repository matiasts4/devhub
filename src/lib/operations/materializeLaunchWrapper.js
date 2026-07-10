import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function sanitizeLaunchScriptSegment(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return normalized || fallback;
}

/**
 * Convert an absolute host path into a form bash on Windows can open.
 * Linux/macOS: returned as-is (normalized).
 * Windows: prefer WSL2 layout (`D:\foo` → `/mnt/d/foo`) because
 * `C:\\Windows\\System32\\bash.exe` is WSL on most machines. Git Bash
 * still works when the wrapper resolves paths at runtime.
 *
 * @param {string} absolutePath
 * @returns {string}
 */
export function toBashAccessiblePath(absolutePath) {
  const resolved = path.resolve(String(absolutePath || ''));
  if (process.platform !== 'win32') {
    return resolved;
  }
  const withSlashes = resolved.replace(/\\/g, '/');
  const driveMatch = withSlashes.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  return withSlashes;
}

/**
 * Directory where launch wrappers are written.
 * Prefer an explicit baseDir (agent worktree) so `bash ./script.sh` works in the
 * terminal cwd on Windows PowerShell + Git Bash / WSL.
 * Fallback: `<os.tmpdir()>/devhub-launch` (never bare `/tmp` on Windows).
 *
 * @param {{ baseDir?: string }} [options]
 * @returns {string}
 */
export function resolveLaunchWrapperDir({ baseDir } = {}) {
  const explicit = typeof baseDir === 'string' ? baseDir.trim() : '';
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(os.tmpdir(), 'devhub-launch');
}

export function resolveLaunchWrapperScriptPath(launchId, roleKey, options = {}) {
  const safeLaunch = sanitizeLaunchScriptSegment(launchId, 'unknown');
  const safeRole = sanitizeLaunchScriptSegment(roleKey, 'agent');
  const dir = resolveLaunchWrapperDir(options);
  return path.join(dir, `devhub-launch-${safeLaunch}-${safeRole}.sh`);
}

export function materializeLaunchWrapperScript(
  wrapper,
  launchId,
  roleKey,
  { fsImpl = fs, baseDir } = {}
) {
  const scriptPath = resolveLaunchWrapperScriptPath(launchId, roleKey, { baseDir });
  const dir = path.dirname(scriptPath);
  fsImpl.mkdirSync(dir, { recursive: true });
  fsImpl.writeFileSync(scriptPath, String(wrapper || ''), {
    encoding: 'utf8',
    mode: 0o755,
  });
  return scriptPath;
}

/**
 * Materialize the multi-line wrapper and return a one-line command the PTY can paste.
 * When baseDir is the agent worktree (preferred), uses `bash ./devhub-launch-….sh`
 * so PowerShell/Git Bash/WSL all resolve the file from the panel cwd.
 *
 * @param {string} wrapper
 * @param {string} launchId
 * @param {string} roleKey
 * @param {{ fsImpl?: typeof fs, baseDir?: string }} [options]
 * @returns {string}
 */
export function buildMaterializedLaunchCommand(wrapper, launchId, roleKey, options = {}) {
  const scriptPath = materializeLaunchWrapperScript(wrapper, launchId, roleKey, options);
  const baseDir = typeof options.baseDir === 'string' ? options.baseDir.trim() : '';

  if (baseDir) {
    // Relative to worktree cwd — most portable on Windows terminals.
    const fileName = path.basename(scriptPath);
    return `bash ./${fileName}`;
  }

  // Temp-dir fallback: convert absolute path for bash (esp. Windows → /c/...).
  return `bash ${toBashAccessiblePath(scriptPath)}`;
}

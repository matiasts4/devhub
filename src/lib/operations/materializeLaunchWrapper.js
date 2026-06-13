import fs from 'node:fs';

function sanitizeLaunchScriptSegment(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return normalized || fallback;
}

export function resolveLaunchWrapperScriptPath(launchId, roleKey) {
  const safeLaunch = sanitizeLaunchScriptSegment(launchId, 'unknown');
  const safeRole = sanitizeLaunchScriptSegment(roleKey, 'agent');
  return `/tmp/devhub-launch-${safeLaunch}-${safeRole}.sh`;
}

export function materializeLaunchWrapperScript(wrapper, launchId, roleKey, { fsImpl = fs } = {}) {
  const scriptPath = resolveLaunchWrapperScriptPath(launchId, roleKey);
  fsImpl.writeFileSync(scriptPath, String(wrapper || ''), {
    encoding: 'utf8',
    mode: 0o755,
  });
  return scriptPath;
}

export function buildMaterializedLaunchCommand(wrapper, launchId, roleKey, options = {}) {
  const scriptPath = materializeLaunchWrapperScript(wrapper, launchId, roleKey, options);
  return `bash ${scriptPath}`;
}

/**
 * Pure cwd normalization shared by the Node-side agentSessionBinder and
 * browser bundles (TerminalWorkspacesManager). Keep this module free of
 * Node-only imports (fs/os/path) so it stays safe for client components.
 */

/** Slash-normalizes both sides; case-insensitive for win32 hosts and Windows paths. */
export function normalizeCwdForCompare(value) {
  let normalized = String(value || '')
    .trim()
    .replace(/\\+/g, '/')
    .replace(/\/+$/, '');
  // process.platform is undefined in browser bundles, so also key off the path shape.
  if (globalThis.process?.platform === 'win32' || /^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token for session hook authentication.
 * @returns {string} 32-character hex string
 */
export function generateSessionHookToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Build environment variables for DevHub agent lifecycle hooks.
 *
 * @param {object} params
 * @param {object} params.session — Terminal session object
 * @param {string} params.hookUrl — Full URL for POST /agent-hook
 * @returns {object} Env map
 */
export function buildSessionHookEnv({ session, hookUrl } = {}) {
  if (!session) return {};

  const url = hookUrl || process.env.DEVHUB_HOOK_URL;
  if (!url) {
    throw new Error('hookUrl is required in buildSessionHookEnv (pass hookUrl or set DEVHUB_HOOK_URL)');
  }

  if (!session.hookToken) {
    session.hookToken = generateSessionHookToken();
  }

  return {
    DEVHUB_HOOK_ENV: '1',
    DEVHUB_TERMINAL_ID: session.id || '',
    DEVHUB_HOOK_URL: url,
    DEVHUB_HOOK_TOKEN: session.hookToken,
  };
}

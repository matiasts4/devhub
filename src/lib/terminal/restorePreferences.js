/**
 * restorePreferences.js — Per-session-type restore policy management.
 *
 * Manages restore policies per project for different session types:
 * - `auto`: automatic restore on startup
 * - `manual`: user must manually resume (no automatic restore, UI handles this)
 * - `off`: restore disabled entirely
 *
 * LocalStorage format: `devhub_terminal_restore_prefs` → JSON `{ opencode: string, generic: string, swarm: string }`
 */

export const RESTORE_POLICY = Object.freeze({ AUTO: 'auto', MANUAL: 'manual', OFF: 'off' });
export const RESTORE_PREFERENCES_STORAGE_KEY = 'devhub_terminal_restore_prefs';

/** @type {Record<string, string>} */
const DEFAULT_PREFERENCES = {
  opencode: RESTORE_POLICY.AUTO,
  generic: RESTORE_POLICY.AUTO,
  swarm: RESTORE_POLICY.AUTO,
};

const VALID_POLICIES = new Set([RESTORE_POLICY.AUTO, RESTORE_POLICY.MANUAL, RESTORE_POLICY.OFF]);

function normalizePolicy(value) {
  return VALID_POLICIES.has(value) ? value : RESTORE_POLICY.AUTO;
}

function sanitizePreferences(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
  return {
    opencode: normalizePolicy(raw.opencode),
    generic: normalizePolicy(raw.generic),
    swarm: normalizePolicy(raw.swarm),
  };
}

/**
 * Returns the default restore policy for a given session type.
 * Currently all session types default to 'auto'.
 *
 * @param {string|null|undefined} sessionType - e.g. 'opencode-durable', 'pty-durable', 'shell-ephemeral'
 * @returns {'auto'} Always returns 'auto' by default for all types
 */
export function getDefaultRestorePolicy() {
  return 'auto';
}

/**
 * Determines if automatic restore is allowed for a given policy.
 *
 * - 'auto' → true (automatic restore permitted)
 * - 'off' → false (restore disabled)
 * - 'manual' → false (manual restore handled by UI, not automatic)
 * - unknown values → false
 *
 * @param {string|null|undefined} policy - restore policy to check
 * @returns {boolean} true if automatic restore is allowed
 */
export function isRestoreAllowed(policy) {
  if (policy === 'auto') {
    return true;
  }
  return false;
}

/**
 * Returns a human-readable label for UI display.
 *
 * @param {string|null|undefined} policy - restore policy
 * @returns {string} Localized label for the policy
 */
export function getPolicyLabel(policy) {
  switch (policy) {
    case 'auto':
      return 'Automático';
    case 'manual':
      return 'Manual';
    case 'off':
      return 'Desactivado';
    default:
      return 'Desconocido';
  }
}

/**
 * Reads restore preferences from localStorage.
 *
 * @param {Storage|null} storage - localStorage instance
 * @returns {{ opencode: string, generic: string, swarm: string }} preferences object
 */
export function readTerminalRestorePreferences(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const raw = storage.getItem(RESTORE_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Writes restore preferences to localStorage.
 *
 * @param {Storage|null} storage - localStorage instance
 * @param {{ opencode?: string, generic?: string, swarm?: string }} prefs - partial prefs object
 */
export function writeTerminalRestorePreferences(storage, prefs) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    const current = readTerminalRestorePreferences(storage);
    const merged = {
      opencode: prefs.opencode !== undefined ? normalizePolicy(prefs.opencode) : current.opencode,
      generic: prefs.generic !== undefined ? normalizePolicy(prefs.generic) : current.generic,
      swarm: prefs.swarm !== undefined ? normalizePolicy(prefs.swarm) : current.swarm,
    };
    storage.setItem(RESTORE_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage write failed — non-fatal
  }
}
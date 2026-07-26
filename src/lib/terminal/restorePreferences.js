/**
 * restorePreferences.js — Per-session-type restore policy management.
 *
 * Manages restore policies per project for different session types:
 * - `auto`: automatic restore on startup
 * - `manual`: user must manually resume (no automatic restore, UI handles this)
 * - `off`: restore disabled entirely
 *
 * A master `restoreOnReboot` switch (default `true`) short-circuits the whole
 * automatic startup restore pipeline when disabled; manual revive still works.
 *
 * LocalStorage format: `devhub_terminal_restore_prefs` → JSON
 * `{ opencode, kimi, grok, codex, qoder, swarm, generic, restoreOnReboot }`
 * Legacy 3-key payloads (`{ opencode, generic, swarm }`) are read back-compatibly:
 * missing kinds default to `auto` and `restoreOnReboot` defaults to `true`.
 */

export const RESTORE_POLICY = Object.freeze({ AUTO: 'auto', MANUAL: 'manual', OFF: 'off' });
export const RESTORE_PREFERENCES_STORAGE_KEY = 'devhub_terminal_restore_prefs';

/**
 * Restore preference kinds. One key per verified TUI provider plus `swarm`
 * (tmux-reattach panels) and `generic` (fallback for everything else).
 */
export const TERMINAL_RESTORE_KINDS = Object.freeze([
  'opencode',
  'kimi',
  'grok',
  'codex',
  'qoder',
  'swarm',
  'generic',
]);

/** @type {Record<string, string|boolean>} */
const DEFAULT_PREFERENCES = {
  opencode: RESTORE_POLICY.AUTO,
  kimi: RESTORE_POLICY.AUTO,
  grok: RESTORE_POLICY.AUTO,
  codex: RESTORE_POLICY.AUTO,
  qoder: RESTORE_POLICY.AUTO,
  swarm: RESTORE_POLICY.AUTO,
  generic: RESTORE_POLICY.AUTO,
  restoreOnReboot: true,
};

const VALID_POLICIES = new Set([RESTORE_POLICY.AUTO, RESTORE_POLICY.MANUAL, RESTORE_POLICY.OFF]);

function normalizePolicy(value) {
  return VALID_POLICIES.has(value) ? value : RESTORE_POLICY.AUTO;
}

function sanitizePreferences(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
  const sanitized = {};
  // Only known kind keys are kept — unknown keys are dropped as before.
  TERMINAL_RESTORE_KINDS.forEach((kind) => {
    sanitized[kind] = normalizePolicy(raw[kind]);
  });
  sanitized.restoreOnReboot =
    raw.restoreOnReboot === undefined ? true : Boolean(raw.restoreOnReboot);
  return sanitized;
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
 * Whether the master reboot-restore switch is enabled. Anything but an
 * explicit `false` keeps the automatic startup restore pipeline active.
 *
 * @param {object|null|undefined} prefs - sanitized (or raw) preferences object
 * @returns {boolean}
 */
export function isRebootRestoreEnabled(prefs) {
  return prefs?.restoreOnReboot !== false;
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
 * @returns {Record<string, string|boolean>} sanitized preferences object
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
 * @param {Record<string, string|boolean>} prefs - partial prefs object
 */
export function writeTerminalRestorePreferences(storage, prefs) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    const current = readTerminalRestorePreferences(storage);
    const merged = { ...current };
    TERMINAL_RESTORE_KINDS.forEach((kind) => {
      if (prefs && prefs[kind] !== undefined) {
        merged[kind] = normalizePolicy(prefs[kind]);
      }
    });
    if (prefs && prefs.restoreOnReboot !== undefined) {
      merged.restoreOnReboot = Boolean(prefs.restoreOnReboot);
    }
    storage.setItem(RESTORE_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage write failed — non-fatal
  }
}

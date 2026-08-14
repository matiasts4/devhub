/**
 * Kill-switch for embedded browser surfaces (WebView2 native + dedicated
 * WebviewWindow + iframe preview).
 *
 * Goal: diagnose thrash/crashes without ripping browser code out of the app.
 * One place to flip; all open/probe/resize paths no-op. Teardown (close/purge)
 * still runs so orphan HWNDs are cleaned up.
 *
 * Priority (first match wins):
 *   1. Test override via `_setNativeBrowserEnabledForTests`
 *   2. Runtime localStorage `devhub_native_browser` = 0|false|off → OFF
 *      or = 1|true|on → ON
 *   3. Env `NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER` (same spellings)
 *   4. `NATIVE_BROWSER_FORCE_DISABLED` constant below
 *   5. Default ON (product behaviour)
 *
 * DIAGNOSTIC: keep FORCE_DISABLED true while A/B testing without WebView2.
 * Flip to false (or set NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER=1 / localStorage=1)
 * to re-enable.
 */

/** @type {boolean} — hard off without env. Set false to re-enable product browser. */
export const NATIVE_BROWSER_FORCE_DISABLED = true;

const FLAG_ENV = 'NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER';
const STORAGE_KEY = 'devhub_native_browser';
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/** @type {boolean | null} */
let testOverride = null;
/** @type {boolean | null} */
let cached = null;

function parseTriState(raw) {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return null;
}

function readEnvFlag() {
  try {
    if (typeof process === 'undefined' || !process.env) return null;
    return parseTriState(process.env[FLAG_ENV]);
  } catch {
    return null;
  }
}

function readStorageFlag() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return parseTriState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function resolveEnabled() {
  if (testOverride !== null) return testOverride;
  const fromStorage = readStorageFlag();
  if (fromStorage !== null) return fromStorage;
  const fromEnv = readEnvFlag();
  if (fromEnv !== null) return fromEnv;
  if (NATIVE_BROWSER_FORCE_DISABLED) return false;
  return true;
}

/**
 * Whether embedded browser runtimes may open/show (native WebView2, iframe,
 * dedicated WebviewWindow).
 */
export function isNativeBrowserEnabled() {
  if (cached !== null) return cached;
  cached = resolveEnabled();
  return cached;
}

/** Alias — same gate covers all embedded browser surfaces for this diagnostic. */
export function isEmbeddedBrowserEnabled() {
  return isNativeBrowserEnabled();
}

export function getNativeBrowserDisableReason() {
  if (isNativeBrowserEnabled()) return null;
  if (testOverride === false) return 'test-override';
  if (readStorageFlag() === false) return 'localStorage';
  if (readEnvFlag() === false) return 'env';
  if (NATIVE_BROWSER_FORCE_DISABLED) return 'force-disabled';
  return 'disabled';
}

/**
 * @param {boolean | null} enabled — null clears override
 */
export function _setNativeBrowserEnabledForTests(enabled) {
  testOverride = enabled === null ? null : Boolean(enabled);
  cached = null;
}

export function _resetNativeBrowserFlagForTests() {
  testOverride = null;
  cached = null;
}

export default isNativeBrowserEnabled;

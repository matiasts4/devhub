/**
 * DevHub AI quota provider preferences.
 *
 * Persists which quota providers are enabled (and in what display order) plus
 * the provider pinned as default in the header badge. Follows the same
 * localStorage + CustomEvent pattern as `zedOverlaySettings.js` so the badge,
 * popover and settings UI stay in sync within the same document.
 */

import { PROVIDERS } from './types.js';

export const QUOTA_PREFERENCES_KEY = 'devhub-quota-preferences';
export const QUOTA_PREFERENCES_EVENT = 'devhub:quota-preferences-change';

const ALL_PROVIDER_IDS = Object.values(PROVIDERS);

const DEFAULTS = Object.freeze({
  /** Ordered list of ENABLED providers; disabled ones are absent. */
  providerOrder: ALL_PROVIDER_IDS,
  /** Pinned provider for the badge; null = auto-detect from active session. */
  defaultProvider: null,
});

function normalize(parsed) {
  const valid = new Set(ALL_PROVIDER_IDS);
  const seen = new Set();
  const providerOrder = [];

  if (Array.isArray(parsed?.providerOrder)) {
    for (const id of parsed.providerOrder) {
      if (valid.has(id) && !seen.has(id)) {
        seen.add(id);
        providerOrder.push(id);
      }
    }
  } else {
    providerOrder.push(...ALL_PROVIDER_IDS);
  }

  const defaultProvider =
    typeof parsed?.defaultProvider === 'string' && providerOrder.includes(parsed.defaultProvider)
      ? parsed.defaultProvider
      : null;

  return { providerOrder, defaultProvider };
}

export function readQuotaPreferences() {
  if (typeof window === 'undefined') return { ...DEFAULTS, providerOrder: [...ALL_PROVIDER_IDS] };
  try {
    const raw = window.localStorage.getItem(QUOTA_PREFERENCES_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS, providerOrder: [...ALL_PROVIDER_IDS] };
  }
}

export function writeQuotaPreferences(next) {
  const normalized = normalize(next);
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(QUOTA_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota/serialization errors */
  }
  window.dispatchEvent(new CustomEvent(QUOTA_PREFERENCES_EVENT, { detail: normalized }));
  return normalized;
}

export function isProviderEnabled(prefs, providerId) {
  return prefs.providerOrder.includes(providerId);
}

/**
 * Toggles a provider. Enabling appends it at the end of the order; disabling
 * removes it (and clears the pin if it was the default).
 */
export function toggleProvider(prefs, providerId) {
  const enabled = isProviderEnabled(prefs, providerId);
  const providerOrder = enabled
    ? prefs.providerOrder.filter((id) => id !== providerId)
    : [...prefs.providerOrder, providerId];
  return {
    providerOrder,
    defaultProvider: enabled && prefs.defaultProvider === providerId ? null : prefs.defaultProvider,
  };
}

/** Moves a provider one slot within the order (delta = -1 | +1). */
export function moveProvider(prefs, providerId, delta) {
  const index = prefs.providerOrder.indexOf(providerId);
  if (index === -1) return prefs;
  const target = index + delta;
  if (target < 0 || target >= prefs.providerOrder.length) return prefs;
  const providerOrder = [...prefs.providerOrder];
  [providerOrder[index], providerOrder[target]] = [providerOrder[target], providerOrder[index]];
  return { ...prefs, providerOrder };
}

/**
 * Resolves which provider the badge should display:
 * pinned default → session-detected (if enabled) → first enabled.
 */
export function resolveBadgeProvider(prefs, detectedProvider) {
  if (prefs.defaultProvider && prefs.providerOrder.includes(prefs.defaultProvider)) {
    return prefs.defaultProvider;
  }
  if (detectedProvider && prefs.providerOrder.includes(detectedProvider)) {
    return detectedProvider;
  }
  return prefs.providerOrder[0] || null;
}

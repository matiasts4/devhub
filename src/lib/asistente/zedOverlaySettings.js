/**
 * DevHub Zed ambient overlay personalization settings.
 *
 * Persists user preferences for the aura/pill overlay (ZedAmbientOverlay.jsx)
 * and the activity drawer (ZedActivityDrawer.jsx). Mirrors the pattern used
 * by `voiceFeatureFlag.js`, plus a custom event so same-document listeners
 * (the overlay itself) pick up changes made from the settings modal without
 * relying on the cross-tab-only `storage` event.
 */

export const ZED_OVERLAY_SETTINGS_KEY = 'devhub-zed-overlay-settings';
export const ZED_OVERLAY_SETTINGS_EVENT = 'devhub:zed-overlay-settings-change';

/** Multiplies the per-phase aura opacity budget from `zedAuraBudget.js`. */
export const ZED_AURA_INTENSITY_SCALE = Object.freeze({
  subtle: 0.6,
  normal: 1,
  intense: 1.5,
});

/** Multiplies keyframe durations via `--zed-aura-speed` (lower = faster). */
export const ZED_AURA_SPEED_SCALE = Object.freeze({
  slow: 1.6,
  normal: 1,
  fast: 0.6,
});

/** Pixel width for the activity drawer (`ZedActivityDrawer.jsx`). */
export const ZED_DRAWER_WIDTH_PX = Object.freeze({
  compact: 320,
  normal: 400,
  wide: 480,
});

const DEFAULTS = Object.freeze({
  auraEnabled: true,
  auraIntensity: 'normal',
  auraSpeed: 'normal',
  drawerWidth: 'normal',
});

function normalize(parsed) {
  return {
    auraEnabled: parsed?.auraEnabled !== false,
    auraIntensity: ZED_AURA_INTENSITY_SCALE[parsed?.auraIntensity]
      ? parsed.auraIntensity
      : DEFAULTS.auraIntensity,
    auraSpeed: ZED_AURA_SPEED_SCALE[parsed?.auraSpeed] ? parsed.auraSpeed : DEFAULTS.auraSpeed,
    drawerWidth: ZED_DRAWER_WIDTH_PX[parsed?.drawerWidth]
      ? parsed.drawerWidth
      : DEFAULTS.drawerWidth,
  };
}

export function readZedOverlaySettings() {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(ZED_OVERLAY_SETTINGS_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeZedOverlaySettings(next) {
  const normalized = normalize(next);
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(ZED_OVERLAY_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota/serialization errors */
  }
  window.dispatchEvent(new CustomEvent(ZED_OVERLAY_SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}

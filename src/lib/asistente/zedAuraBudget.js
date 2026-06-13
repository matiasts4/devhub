/** @typedef {'idle' | 'open' | 'responding' | 'executing'} ZedAmbientPhase */

/**
 * Per-phase max opacity for the Zed ambient aura.
 * Source of truth for the `idle` / `open` / `responding` / `executing`
 * opacity caps. The overlay clamps its computed opacity to this budget so
 * the aura never overshoots the documented subtle budget.
 */
export const AURA_INTENSITY = Object.freeze({
  idle: 0.1,
  open: 0.18,
  responding: 0.3,
  executing: 0.35,
});

const KNOWN_PHASES = new Set(Object.keys(AURA_INTENSITY));

/**
 * Returns the documented max opacity for a given phase, falling back to
 * `idle` (0.10) for unknown / null / undefined input. Defensive: never
 * throws on bad input.
 *
 * @param {ZedAmbientPhase | string | null | undefined} phase
 * @returns {number}
 */
export function clampZedAuraIntensity(phase) {
  if (typeof phase === 'string' && KNOWN_PHASES.has(phase)) {
    return AURA_INTENSITY[phase];
  }
  return AURA_INTENSITY.idle;
}

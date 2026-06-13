/**
 * useSurfaceEnterAnimation — shared enter-animation timing for pizarra
 * live surfaces (CanvasTerminal, PizarraBrowserSurface).
 *
 * pizarra-motion-polish (P-MP-6). The token is applied at mount; the
 * `data-surface-state="entering"` attribute is held for `DUR.enter` ms
 * (340ms) and then dropped so the chrome settles to "ready". The
 * opacity-only keyframes are already injected by
 * `ensureSurfaceMotionKeyframes()` at module scope; the
 * `prefers-reduced-motion` `@media` block inside the keyframe rules
 * collapses the animation to ≤ 50ms when the OS reports reduced motion.
 *
 * Contract:
 *   - `data-surface-state` returns "entering" for the first DUR.enter ms
 *     and "" (or undefined) afterwards.
 *   - The returned object has the CSS animation string ready to apply
 *     to an element's `style.animation` (consumer controls where).
 *   - SSR-safe: returns the animation string and "entering" immediately
 *     (no document access); the timer only runs in the browser.
 *   - The timer is cleared on unmount, so a fast remount does not leak.
 */
import { useEffect, useState } from 'react';
import { DUR, SURFACE_ENTER_OPACITY_ONLY } from './surfaceMotion';

export const SURFACE_ENTER_STATE_ATTRIBUTE = 'data-surface-state';
export const SURFACE_ENTER_STATE_ENTERING = 'entering';

export function useSurfaceEnterAnimation() {
  const [surfaceState, setSurfaceState] = useState(SURFACE_ENTER_STATE_ENTERING);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handle = window.setTimeout(() => {
      setSurfaceState('');
    }, DUR.enter);
    return () => window.clearTimeout(handle);
  }, []);

  return {
    animation: SURFACE_ENTER_OPACITY_ONLY,
    surfaceState,
    SURFACE_ENTER_OPACITY_ONLY,
    SURFACE_ENTER_STATE_ATTRIBUTE,
  };
}

export default useSurfaceEnterAnimation;

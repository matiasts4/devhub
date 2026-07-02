'use client';

import { useMotionLabMode } from './MotionModeContext';

/**
 * Motion-mode-aware transform value picker.
 *
 * Returns `amplified` when the page is in amplified mode, otherwise `base`.
 * Reduced mode keeps the base (subtle) transform values.
 */
export function useDemoTransform(base, amplified) {
  const mode = useMotionLabMode();
  return mode === 'amplified' ? amplified : base;
}

export default useDemoTransform;

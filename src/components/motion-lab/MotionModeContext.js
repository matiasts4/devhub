'use client';

import { createContext, useContext } from 'react';

/**
 * Shared motion-mode simulation state for the Motion Lab page.
 *
 * Three mutually exclusive modes:
 *   - 'reduced'   → ≤50 ms opacity-only fallback
 *   - 'normal'    → default spring presets
 *   - 'amplified' → more pronounced spring presets and transform displacement
 *
 * System preference is handled by framer-motion's MotionConfig +
 * useReducedMotion. This context carries the page-level control so every
 * demo can respond in sync.
 */
const MotionModeContext = createContext('normal');

export const MotionModeProvider = MotionModeContext.Provider;

export function useMotionLabMode() {
  return useContext(MotionModeContext);
}

export default MotionModeContext;

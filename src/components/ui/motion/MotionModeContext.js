'use client';

import { createContext, useContext } from 'react';

/**
 * Global motion-mode preference context for DevHub.
 *
 * Three mutually exclusive modes:
 *   - 'reduced'   → minimal motion (≤50 ms opacity-only)
 *   - 'normal'    → default spring presets
 *   - 'amplified' → more pronounced spring presets and transform displacement
 *
 * This context is owned by MotionProvider and read by any component that needs
 * to know the current global motion preference. The Motion Lab showcase keeps
 * its own local MotionModeContext so demos can be toggled side-by-side without
 * mutating the stored preference.
 */
const MotionModeContext = createContext('normal');

export const MotionModeProvider = MotionModeContext.Provider;

export function useMotionMode() {
  return useContext(MotionModeContext);
}

export { MotionModeContext };

export default MotionModeContext;

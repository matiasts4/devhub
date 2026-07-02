'use client';

import { useReducedMotion } from 'framer-motion';
import { spring, amplified } from '../ui/motion/motionPresets';
import { useMotionLabMode } from './MotionModeContext';

/**
 * Motion-mode-aware transition for every Motion Lab demo.
 *
 * When the user has requested reduced motion (via system preference or the
 * page-level simulation control), every transition collapses to a 50 ms
 * opacity-only tween. Otherwise the requested spring preset is returned,
 * using the amplified set when the page is in amplified mode.
 */
export const REDUCED_MOTION_TRANSITION = { duration: 0.05, ease: 'linear' };

export function useDemoTransition(intent) {
  const systemReduced = useReducedMotion();
  const mode = useMotionLabMode();
  if (systemReduced || mode === 'reduced') {
    return REDUCED_MOTION_TRANSITION;
  }
  const presets = mode === 'amplified' ? amplified : spring;
  return presets[intent].transition;
}

export default useDemoTransition;

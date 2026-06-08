'use client';

/**
 * MotionProvider — global framer-motion config for DevHub.
 *
 * Centralizes reduced-motion handling and default transition spring
 * so every motion.* element inherits consistent timing.
 */

import { MotionConfig } from 'framer-motion';
import { TRANSITION } from '../system/motion-tokens';

export function MotionProvider({ children, reducedMotion }) {
  return (
    <MotionConfig
      reducedMotion={reducedMotion ?? 'user'}
      transition={TRANSITION.base}
    >
      {children}
    </MotionConfig>
  );
}

export default MotionProvider;
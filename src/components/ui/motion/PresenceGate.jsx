'use client';

/**
 * PresenceGate — show/hide with pointer-events guard during exit.
 *
 * Blocks interaction while the exit animation plays.
 */

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TRANSITION, VARIANTS_FADE } from '../system/motion-tokens';

export function PresenceGate({
  open,
  children,
  className,
  style,
  transition,
  onExitComplete,
}) {
  const [isAnimating, setIsAnimating] = useState(false);
  const resolvedTransition = transition ?? TRANSITION.base;

  useEffect(() => {
    if (!open) setIsAnimating(true);
  }, [open]);

  return (
    <div
      className={className}
      style={{
        pointerEvents: open && !isAnimating ? 'auto' : 'none',
        ...style,
      }}
    >
      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          setIsAnimating(false);
          onExitComplete?.();
        }}
      >
        {open && (
          <motion.div
            key="presence-gate-content"
            variants={VARIANTS_FADE}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={resolvedTransition}
            style={{ willChange: 'opacity' }}
            onAnimationStart={() => setIsAnimating(true)}
            onAnimationComplete={() => setIsAnimating(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PresenceGate;
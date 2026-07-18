'use client';

/**
 * SlidePanel — GPU-safe slide-in panel (sidebars, sheets).
 *
 * Animates translateX + opacity only. Width is set instantly via style
 * to avoid layout-thrashing width animations.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { TRANSITION } from '../system/motion-tokens';

const SLIDE_VARIANTS = {
  left: {
    hidden: { opacity: 0, x: -16 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -16 },
  },
  right: {
    hidden: { opacity: 0, x: 16 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
  },
};

export function SlidePanel({
  children,
  visible = true,
  side = 'left',
  width,
  className,
  style,
  transition,
}) {
  const variants = SLIDE_VARIANTS[side] ?? SLIDE_VARIANTS.left;
  const resolvedTransition = transition ?? TRANSITION.base;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="slide-panel"
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={resolvedTransition}
          className={className}
          style={{
            width,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            willChange: 'transform, opacity',
            ...style,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SlidePanel;

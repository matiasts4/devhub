'use client';

/**
 * ContentReveal — crossfade from skeleton/placeholder to real content.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { TRANSITION, VARIANTS_FADE } from '../system/motion-tokens';

export function ContentReveal({
  ready,
  placeholder,
  children,
  className,
  style,
  transition,
}) {
  const resolvedTransition = transition ?? TRANSITION.base;

  return (
    <div className={className} style={style}>
      <AnimatePresence mode="sync" initial={false}>
        {!ready ? (
          <motion.div
            key="placeholder"
            variants={VARIANTS_FADE}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={resolvedTransition}
            style={{ willChange: 'opacity' }}
          >
            {placeholder}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            variants={VARIANTS_FADE}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={resolvedTransition}
            style={{ willChange: 'opacity' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContentReveal;
'use client';

/**
 * FadeSlide — GPU-composited enter/exit wrapper.
 *
 * Uses framer-motion with transform + opacity only, ensuring the
 * browser compositor handles all animation without triggering layout
 * or paint. `will-change: transform, opacity` is set automatically.
 *
 * Props:
 *  - `children`      — content to wrap
 *  - `id`            — required AnimatePresence key (pass a stable string)
 *  - `variant`       — 'up' (default) | 'fade' | 'right'
 *  - `transition`    — framer-motion transition override
 *  - `className`     — forwarded to the motion div
 *  - `style`         — forwarded to the motion div
 *
 * Usage:
 *   <AnimatePresence mode="wait" initial={false}>
 *     <FadeSlide id={activeTab} key={activeTab}>
 *       <Content />
 *     </FadeSlide>
 *   </AnimatePresence>
 */

import { motion, AnimatePresence } from 'framer-motion';
import { VARIANTS_FADE_UP, VARIANTS_FADE, VARIANTS_SLIDE_RIGHT, TRANSITION } from './motion-tokens';

const VARIANT_MAP = {
  up: VARIANTS_FADE_UP,
  fade: VARIANTS_FADE,
  right: VARIANTS_SLIDE_RIGHT,
};

export function FadeSlide({
  children,
  id,
  variant = 'up',
  transition,
  className,
  style,
  layoutId,
}) {
  const variants = VARIANT_MAP[variant] ?? VARIANTS_FADE_UP;
  const resolvedTransition = transition ?? TRANSITION.content;

  return (
    <motion.div
      key={id}
      layoutId={layoutId}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={resolvedTransition}
      className={className}
      style={{
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * FadeSlidePresence — convenience wrapper that includes AnimatePresence.
 * Use when you control a single keyed child (e.g., tab content swap).
 *
 * Props are the same as FadeSlide plus:
 *  - `mode` — AnimatePresence mode ('wait' | 'sync' | 'popLayout'), default 'wait'
 */
export function FadeSlidePresence({
  children,
  id,
  variant = 'up',
  transition,
  className,
  style,
  mode = 'wait',
}) {
  return (
    <AnimatePresence mode={mode} initial={false}>
      <FadeSlide
        id={id}
        variant={variant}
        transition={transition}
        className={className}
        style={style}
      >
        {children}
      </FadeSlide>
    </AnimatePresence>
  );
}

export default FadeSlide;

'use client';

/**
 * Crossfade — opacity-only visibility layer for stacked content.
 *
 * Keeps children mounted (terminal processes, native surfaces) while
 * crossfading visibility. Uses GPU-composited opacity only.
 *
 * Usage (workspace shells stacked with position:absolute):
 *   <Crossfade active={isActive} className="absolute inset-0">
 *     <WorkspaceContent />
 *   </Crossfade>
 */

import { motion } from 'framer-motion';
import { TRANSITION, VARIANTS_FADE } from '../system/motion-tokens';

export function Crossfade({
  children,
  active = true,
  transition,
  className,
  style,
  'aria-hidden': ariaHidden,
  ...rest
}) {
  const resolvedTransition = transition ?? TRANSITION.fast;

  return (
    <motion.div
      initial={false}
      animate={active ? 'visible' : 'hidden'}
      variants={VARIANTS_FADE}
      transition={resolvedTransition}
      className={className}
      style={{
        willChange: 'opacity',
        pointerEvents: active ? 'auto' : 'none',
        ...style,
      }}
      aria-hidden={ariaHidden ?? !active}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export default Crossfade;

'use client';

/**
 * StaggerList — staggered enter animation for list children.
 */

import { motion } from 'framer-motion';
import { TRANSITION } from '../system/motion-tokens';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: TRANSITION.fast,
  },
};

export function StaggerList({ children, className, style, as = 'div' }) {
  const Component = motion[as] ?? motion.div;

  return (
    <Component
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      style={style}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({ children, className, style, as = 'div' }) {
  const Component = motion[as] ?? motion.div;

  return (
    <Component variants={itemVariants} className={className} style={style}>
      {children}
    </Component>
  );
}

export default StaggerList;

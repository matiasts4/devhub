'use client';

/**
 * MotionProvider — global framer-motion config for DevHub.
 *
 * Reads the stored motion-mode preference and drives both
 * framer-motion's MotionConfig.reducedMotion and a global context
 * so every motion consumer inherits consistent timing.
 */

import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { getStoredMotionMode } from '@/lib/theme/themes';
import { TRANSITION } from '../system/motion-tokens';
import { MotionModeProvider } from './MotionModeContext';

function toReducedMotion(mode) {
  return mode === 'reduced' ? 'always' : 'user';
}

export function MotionProvider({ children, reducedMotion }) {
  const [mode, setMode] = useState('normal');

  useEffect(() => {
    setMode(getStoredMotionMode());

    const handleChange = () => {
      setMode(getStoredMotionMode());
    };

    window.addEventListener('devhub:motion-mode-change', handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener('devhub:motion-mode-change', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return (
    <MotionConfig
      reducedMotion={reducedMotion ?? toReducedMotion(mode)}
      transition={TRANSITION.base}
    >
      <MotionModeProvider value={mode}>{children}</MotionModeProvider>
    </MotionConfig>
  );
}

export default MotionProvider;

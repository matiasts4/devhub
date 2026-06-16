'use client';

import { useEffect } from 'react';
import { isZedVoiceToggleShortcut, shouldIgnoreVoiceShortcut } from './zedVoiceShortcuts';

/**
 * Toggle Zed push-to-talk with Ctrl+Shift+M (same key starts and stops).
 */
export function useZedVoiceShortcut({ enabled = false, onToggle } = {}) {
  useEffect(() => {
    if (!enabled || typeof onToggle !== 'function') return undefined;

    const handler = (event) => {
      if (!isZedVoiceToggleShortcut(event)) return;
      if (shouldIgnoreVoiceShortcut(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    };

    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, [enabled, onToggle]);
}

/**
 * useCommandBar hook — keyboard shortcut and state management for CommandBar.
 *
 * Registers Cmd+Shift+K (or Ctrl+Shift+K) global shortcut to toggle CommandBar.
 * Respects feature flag — returns disabled state if flag is off.
 *
 * @module commandBar/useCommandBar
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { isCommandBarEnabled } from './featureFlag';

/**
 * Hook to manage CommandBar open/close state and keyboard shortcut.
 *
 * @returns {{isOpen: boolean, open: () => void, close: () => void, toggle: () => void}}
 */
export function useCommandBar() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    if (isCommandBarEnabled()) {
      setIsOpen(true);
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isCommandBarEnabled()) {
      setIsOpen((prev) => !prev);
    }
  }, []);

  // Register Cmd+Shift+K shortcut
  useEffect(() => {
    if (!isCommandBarEnabled()) {
      return;
    }

    const handleKeyDown = (e) => {
      // Cmd+Shift+K on Mac, Ctrl+Shift+K on Windows/Linux
      if (e.key === 'K' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [toggle]);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

/**
 * useQuickActionsPalette — open/close state + keyboard shortcut for the
 * Quick Actions palette.
 *
 * Registers Ctrl+Shift+P (Cmd+Shift+P on Mac) as a global toggle. The
 * shortcut is free app-wide (Ctrl+K is used by AgentHub's ChatCommandPalette,
 * Ctrl+Shift+K by the CommandBar).
 *
 * @module quickActions/useQuickActionsPalette
 */

'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * Hook to manage Quick Actions palette open/close state and shortcut.
 *
 * @returns {{isOpen: boolean, open: () => void, close: () => void, toggle: () => void}}
 */
export function useQuickActionsPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Register Ctrl+Shift+P / Cmd+Shift+P toggle.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleKeyDown = (e) => {
      // Cmd+Shift+P on Mac, Ctrl+Shift+P on Windows/Linux.
      if ((e.key === 'P' || e.key === 'p') && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [toggle]);

  return { isOpen, open, close, toggle };
}

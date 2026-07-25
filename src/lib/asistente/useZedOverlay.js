'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ZED_OVERLAY_CLOSE_EVENT,
  ZED_OVERLAY_OPEN_EVENT,
  ZED_OVERLAY_TOGGLE_EVENT,
} from './zedOverlayEvents';

/**
 * Global Zed ambient overlay open/close + Ctrl/Cmd+Shift+Z shortcut.
 */
export function useZedOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    const onToggle = () => toggle();
    const onOpen = () => open();
    const onClose = () => close();

    window.addEventListener(ZED_OVERLAY_TOGGLE_EVENT, onToggle);
    window.addEventListener(ZED_OVERLAY_OPEN_EVENT, onOpen);
    window.addEventListener(ZED_OVERLAY_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(ZED_OVERLAY_TOGGLE_EVENT, onToggle);
      window.removeEventListener(ZED_OVERLAY_OPEN_EVENT, onOpen);
      window.removeEventListener(ZED_OVERLAY_CLOSE_EVENT, onClose);
    };
  }, [close, open, toggle]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Z' && e.key !== 'z') return;
      if (!e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [toggle]);

  return { isOpen, open, close, toggle };
}

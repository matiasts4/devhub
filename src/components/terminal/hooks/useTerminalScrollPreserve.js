/**
 * useTerminalScrollPreserve — save/restore viewport scroll on visibility changes.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
import { useEffect } from 'react';
import {
  getTerminalViewportScrollOffset,
  restoreTerminalViewportScroll,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalScrollPreserve({
  ctxRef,
  initialCommand,
  isVisibleInLayout,
  isActivePanel,
  scrollTerminalToBottom,
}) {
  useEffect(() => {
    const c = ctxRef.current;
    const { termRef, lastViewportYRef } = c;
    if (!termRef.current) return;
    if (isVisibleInLayout) {
      const saved = lastViewportYRef.current;
      if (saved != null) {
        restoreTerminalViewportScroll(termRef.current, saved);
      } else if (isActivePanel) {
        scrollTerminalToBottom(true);
      }
    } else {
      lastViewportYRef.current = getTerminalViewportScrollOffset(termRef.current);
    }
  }, [ctxRef, initialCommand, isVisibleInLayout, isActivePanel, scrollTerminalToBottom]);
}

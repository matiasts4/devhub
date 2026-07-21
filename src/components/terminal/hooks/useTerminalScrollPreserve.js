/**
 * useTerminalScrollPreserve — save/restore viewport scroll on visibility changes.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
import { useEffect } from 'react';
import {
  getTerminalViewportScrollOffset,
  isTerminalViewportNearBottom,
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
    if (!c) return;
    const { termRef, lastViewportYRef } = c;
    const term = termRef?.current;
    if (!term) return;

    if (isVisibleInLayout) {
      const saved = lastViewportYRef?.current;
      if (lastViewportYRef) {
        lastViewportYRef.current = null;
      }
      if (saved === 'bottom' || saved == null) {
        if (isActivePanel) {
          scrollTerminalToBottom(true);
        }
      } else if (typeof saved === 'number') {
        restoreTerminalViewportScroll(term, saved);
      }
    } else if (lastViewportYRef) {
      if (isTerminalViewportNearBottom(term, 1)) {
        lastViewportYRef.current = 'bottom';
      } else {
        lastViewportYRef.current = getTerminalViewportScrollOffset(term);
      }
    }
  }, [ctxRef, initialCommand, isVisibleInLayout, isActivePanel, scrollTerminalToBottom]);
}

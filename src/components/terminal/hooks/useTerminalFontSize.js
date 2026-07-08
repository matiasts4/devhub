/**
 * useTerminalFontSize — local font size adjustment.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
import { useCallback } from 'react';
import {
  isStaleXtermRendererError,
  isTerminalRendererReady,
} from '@/components/terminal/TerminalTTY.helpers';
import { setTerminalTypography } from '@/components/terminal/terminalTypographyPreferences';

export default function useTerminalFontSize({ ctxRef }) {
  const adjustFontSize = useCallback(
    (delta) => {
      const c = ctxRef.current;
      const { setFontSize, termRef, fitRef, isDisposingRef } = c;
      setFontSize((prev) => {
        const next = Math.min(24, Math.max(8, prev + delta));
        try {
          window.localStorage.setItem(c.FONT_SIZE_KEY, String(next));
          const typography = setTerminalTypography(window.localStorage, { fontSize: next });
          window.dispatchEvent(
            new CustomEvent('devhub:terminal-typography-changed', { detail: typography })
          );
        } catch {
          /* ignore */
        }
        if (
          termRef.current &&
          !isDisposingRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          termRef.current.options.fontSize = next;
          try {
            fitRef.current?.fit();
            if (typeof termRef.current.clearTextureAtlas === 'function') {
              termRef.current.clearTextureAtlas();
            }
            termRef.current.refresh(0, termRef.current.rows - 1);
          } catch (err) {
            if (!isStaleXtermRendererError(err)) throw err;
          }
        }
        return next;
      });
    },
    [ctxRef]
  );

  return { adjustFontSize };
}

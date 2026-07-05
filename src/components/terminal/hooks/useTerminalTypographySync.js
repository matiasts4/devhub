/**
 * Live-sync global terminal typography settings (Ajustes → Terminal) into xterm.
 */
import { useEffect, useRef } from 'react';
import {
  applyTerminalTypographyToDocument,
  resolveTerminalTypography,
} from '@/components/terminal/terminalTypographyPreferences';
import { getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { isStaleXtermRendererError } from '@/components/terminal/TerminalTTY.helpers';

const FONT_SIZE_KEY = 'devhub:terminalFontSize';

function typographyNeedsXtermReinit(prev, next) {
  if (!prev || !next) return false;
  return (
    prev.fontFamily !== next.fontFamily ||
    String(prev.fontWeight) !== String(next.fontWeight) ||
    String(prev.fontWeightBold) !== String(next.fontWeightBold)
  );
}

export default function useTerminalTypographySync({ ctxRef, setFontSize, setXtermBootNonce }) {
  const lastTypographyRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const applyToRunningTerm = (typography, { forceReinit = false } = {}) => {
      const c = ctxRef.current;
      const term = c?.termRef?.current;
      if (!term || c?.isDisposingRef?.current || forceReinit) {
        setXtermBootNonce((n) => n + 1);
        return;
      }
      const fontOpts = getTerminalFontOptions();
      term.options.fontSize = typography.fontSize;
      term.options.fontFamily = fontOpts.fontFamily;
      term.options.fontWeight = fontOpts.fontWeight;
      term.options.fontWeightBold = fontOpts.fontWeightBold;
      term.options.lineHeight = fontOpts.lineHeight;
      term.options.letterSpacing = fontOpts.letterSpacing;
      try {
        c.fitRef?.current?.fit();
        if (typeof term.clearTextureAtlas === 'function') {
          term.clearTextureAtlas();
        }
        term.refresh(0, Math.max(0, term.rows - 1));
        c.sendResizeRef?.current?.();
      } catch (err) {
        if (!isStaleXtermRendererError(err)) throw err;
        setXtermBootNonce((n) => n + 1);
      }
    };

    const onTypographyChanged = (event) => {
      const typography = event?.detail || resolveTerminalTypography(window.localStorage);
      const forceReinit = typographyNeedsXtermReinit(lastTypographyRef.current, typography);
      lastTypographyRef.current = typography;
      applyTerminalTypographyToDocument(typography);
      setFontSize(typography.fontSize);
      try {
        window.localStorage.setItem(FONT_SIZE_KEY, String(typography.fontSize));
      } catch {
        /* ignore */
      }
      applyToRunningTerm(typography, { forceReinit });
    };

    const initial = resolveTerminalTypography(window.localStorage);
    lastTypographyRef.current = initial;
    applyTerminalTypographyToDocument(initial);
    setFontSize(initial.fontSize);
    window.addEventListener('devhub:terminal-typography-changed', onTypographyChanged);
    return () => {
      window.removeEventListener('devhub:terminal-typography-changed', onTypographyChanged);
    };
  }, [ctxRef, setFontSize, setXtermBootNonce]);
}

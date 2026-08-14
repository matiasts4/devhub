/**
 * useTerminalRenderIntegrityProbe — passive corruption diagnostics.
 *
 * Listens for the same OS/layout events that trigger viewport recovery and,
 * after a short delay, probes the terminal's render integrity. Issues are
 * logged to the durable terminal-session JSONL relay so they survive page
 * refreshes and can be correlated with user-visible corruption.
 *
 * Purely observational — never mutates terminal state.
 */

import { useEffect, useRef } from 'react';
import {
  probeTerminalRenderIntegrity,
  isTerminalRendererReady,
} from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

const PROBE_DELAY_MS = 600;

export default function useTerminalRenderIntegrityProbe({ ctxRef, id, isVisibleInLayout }) {
  const probeTimerRef = useRef(null);
  const isVisibleRef = useRef(isVisibleInLayout);
  isVisibleRef.current = isVisibleInLayout;

  useEffect(() => {
    const scheduleProbe = (trigger) => {
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      probeTimerRef.current = setTimeout(() => {
        probeTimerRef.current = null;
        const c = ctxRef.current;
        if (!c?.termRef?.current) return;
        if (!isVisibleRef.current) return;

        const report = probeTerminalRenderIntegrity({
          term: c.termRef.current,
          container: c.containerRef?.current,
          fitAddon: c.fitRef?.current,
          operationalRendererMode: c.operationalRendererModeRef?.current,
          webglAddon: c.webglAddonRef?.current,
          canvasAddon: c.canvasAddonRef?.current,
          lastPtySize: c.lastPtySizeRef?.current,
        });

        if (!report.healthy) {
          logTerminalSession('render-integrity-probe', {
            panelId: id,
            trigger,
            ...report,
          });
        }
      }, PROBE_DELAY_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleProbe('visibility-visible');
    };
    const handleFocus = () => scheduleProbe('window-focus');
    const handleSurvivorRecover = () => scheduleProbe('survivor-recover');
    const handleLayoutSettled = () => scheduleProbe('layout-settled');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);
    window.addEventListener('devhub:terminal-layout-settled', handleLayoutSettled);

    return () => {
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);
      window.removeEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    };
  }, [ctxRef, id]);
}

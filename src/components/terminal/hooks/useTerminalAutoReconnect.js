/**
 * useTerminalAutoReconnect — exponential-backoff reconnect.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 2).
 */
import { useEffect, useRef } from 'react';
import { shouldAutoReconnectTerminal } from '@/components/terminal/TerminalTTY.helpers';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

export default function useTerminalAutoReconnect({
  ctxRef,
  autoFocus,
  connectionState,
  initError,
  id,
  reconnect,
}) {
  const reconnectAttemptsRef = useRef(0);
  const prevAutoFocusRef = useRef(autoFocus);

  useEffect(() => {
    if (autoFocus && !prevAutoFocusRef.current) {
      reconnectAttemptsRef.current = 0;
    }
    prevAutoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    const c = ctxRef.current;
    const { sessionClosingRef } = c;
    if (sessionClosingRef.current) return undefined;

    if (shouldAutoReconnectTerminal(connectionState, autoFocus, initError)) {
      if (!autoFocus) {
        cliLog(`CLIENT:${id}`, 'auto-reconnect SKIPPED (not autoFocus)', { connectionState });
        return;
      }
      const delay = Math.min(300 * 2 ** reconnectAttemptsRef.current, 5000);
      cliLog(`CLIENT:${id}`, 'auto-reconnect scheduled', {
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      logTerminalSession('terminal-auto-reconnect-scheduled', {
        panelId: id,
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      const timer = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        reconnect();
      }, delay);
      return () => clearTimeout(timer);
    }
    if (connectionState === 'connected') {
      cliLog(`CLIENT:${id}`, 'connected — resetting reconnect counter');
      reconnectAttemptsRef.current = 0;
    }
  }, [ctxRef, autoFocus, connectionState, initError, id, reconnect]);
}

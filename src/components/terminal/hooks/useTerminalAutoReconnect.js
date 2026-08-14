/**
 * useTerminalAutoReconnect — exponential-backoff reconnect.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 2).
 *
 * Visible-layout panels (split siblings) may reconnect without autoFocus so OS
 * sleep / socket drops recover without Ctrl+R. Hidden workspace panels still
 * skip until they become visible again.
 */
import { useEffect, useRef } from 'react';
import { shouldAutoReconnectTerminal } from '@/components/terminal/TerminalTTY.helpers';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

/**
 * Cap on consecutive auto-reconnect attempts. Without it a persistently
 * failing session (e.g. PTY spawn crashing in the sidecar) loops forever:
 * fetch + WS + term.clear() every ≤5s per dead panel, which stalls the whole
 * restored workspace. After the cap the panel stays in its error state and
 * the counter only resets on connect, on regained focus, or on becoming
 * visible in the layout again (manual recovery paths).
 */
export const MAX_AUTO_RECONNECT_ATTEMPTS = 8;

export default function useTerminalAutoReconnect({
  ctxRef,
  autoFocus,
  isVisibleInLayout = false,
  connectionState,
  initError,
  id,
  reconnect,
}) {
  const reconnectAttemptsRef = useRef(0);
  const prevAutoFocusRef = useRef(autoFocus);
  const prevVisibleRef = useRef(isVisibleInLayout);
  const exhaustedLoggedRef = useRef(false);

  useEffect(() => {
    if (autoFocus && !prevAutoFocusRef.current) {
      reconnectAttemptsRef.current = 0;
      exhaustedLoggedRef.current = false;
    }
    prevAutoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    if (isVisibleInLayout && !prevVisibleRef.current) {
      reconnectAttemptsRef.current = 0;
      exhaustedLoggedRef.current = false;
    }
    prevVisibleRef.current = isVisibleInLayout;
  }, [isVisibleInLayout]);

  useEffect(() => {
    const c = ctxRef.current;
    const { sessionClosingRef } = c;
    if (sessionClosingRef.current) return undefined;

    if (
      shouldAutoReconnectTerminal(connectionState, autoFocus, initError, {
        isVisibleInLayout,
      })
    ) {
      if (reconnectAttemptsRef.current >= MAX_AUTO_RECONNECT_ATTEMPTS) {
        if (!exhaustedLoggedRef.current) {
          exhaustedLoggedRef.current = true;
          cliLog(`CLIENT:${id}`, 'auto-reconnect EXHAUSTED — manual recovery required', {
            connectionState,
            attempts: reconnectAttemptsRef.current,
          });
          logTerminalSession('terminal-auto-reconnect-exhausted', {
            panelId: id,
            connectionState,
            autoFocus,
            isVisibleInLayout,
            attempts: reconnectAttemptsRef.current,
          });
        }
        return undefined;
      }
      const delay = Math.min(300 * 2 ** reconnectAttemptsRef.current, 5000);
      cliLog(`CLIENT:${id}`, 'auto-reconnect scheduled', {
        connectionState,
        autoFocus,
        isVisibleInLayout,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      logTerminalSession('terminal-auto-reconnect-scheduled', {
        panelId: id,
        connectionState,
        autoFocus,
        isVisibleInLayout,
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
      exhaustedLoggedRef.current = false;
    }
    return undefined;
  }, [ctxRef, autoFocus, isVisibleInLayout, connectionState, initError, id, reconnect]);
}

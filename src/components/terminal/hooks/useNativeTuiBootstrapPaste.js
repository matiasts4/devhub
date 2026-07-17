/**
 * useNativeTuiBootstrapPaste — after panel open, paste reserved bootstrap_input
 * like human Ctrl+V once the agent TUI is ready (then Enter).
 */
import { useEffect, useRef } from 'react';
import {
  formatTerminalPastePayload,
  sendTerminalPasteInput,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  consumeNativeTuiBootstrap,
  markNativeTuiBootstrapDone,
  isNativeTuiBootstrapDone,
  reserveNativeTuiBootstrap,
} from '@/lib/asistente/nativeTuiBootstrapRegistry';
import {
  DEFAULT_BOOTSTRAP_TIMEOUT_MS,
  runNativeTuiBootstrapPaste,
} from '@/lib/asistente/nativeTuiBootstrapPaste';
import { zedClientDebug } from '@/lib/asistente/zedClientDebug';

/**
 * @param {object} opts
 * @param {string} opts.panelId
 * @param {string|null|undefined} opts.initialCommand
 * @param {React.MutableRefObject} opts.wsRef
 * @param {React.MutableRefObject} opts.transportRef
 * @param {React.MutableRefObject} opts.grokTuiReadyRef
 * @param {React.MutableRefObject} opts.kimiReadyNotifiedRef
 * @param {React.MutableRefObject} opts.tuiSessionActiveRef
 * @param {React.MutableRefObject} opts.tuiSessionFooterConfirmedRef
 * @param {React.MutableRefObject} [opts.isGrokSessionRef]
 * @param {object} [opts.lifecycleRefs] — shape expected by formatTerminalPastePayload
 */
export default function useNativeTuiBootstrapPaste({
  panelId,
  initialCommand,
  wsRef,
  transportRef,
  grokTuiReadyRef,
  kimiReadyNotifiedRef,
  tuiSessionActiveRef,
  tuiSessionFooterConfirmedRef,
  isGrokSessionRef,
  lifecycleRefs,
}) {
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!panelId || startedRef.current) return undefined;
    if (isNativeTuiBootstrapDone(panelId)) return undefined;

    const pending = consumeNativeTuiBootstrap(panelId);
    if (!pending?.text) return undefined;

    startedRef.current = true;
    const program = pending.program || null;
    const timeoutMs = pending.timeoutMs || DEFAULT_BOOTSTRAP_TIMEOUT_MS;

    zedClientDebug('bootstrap_paste_start', {
      panelId,
      program,
      textLen: pending.text.length,
      timeoutMs,
    });

    const lifecycle = lifecycleRefs || {
      current: {
        isGrokSessionRef,
        grokTuiReadyRef,
        kimiReadyNotifiedRef,
        tuiSessionActiveRef,
      },
    };

    void (async () => {
      const result = await runNativeTuiBootstrapPaste({
        program,
        text: pending.text,
        timeoutMs,
        getSignals: () => ({
          grokReady: Boolean(grokTuiReadyRef?.current),
          kimiReady: Boolean(kimiReadyNotifiedRef?.current),
          opencodeFooterReady: Boolean(tuiSessionFooterConfirmedRef?.current),
          tuiActive: Boolean(tuiSessionActiveRef?.current),
        }),
        formatPayload: (text) =>
          formatTerminalPastePayload(text, lifecycle, initialCommand || pending.initialCommand),
        sendInput: (data) =>
          sendTerminalPasteInput({
            socket: wsRef?.current,
            transport: transportRef?.current || 'json',
            text: data,
          }),
        isCancelled: () => cancelledRef.current,
      });

      if (result.status === 'pasted') {
        markNativeTuiBootstrapDone(panelId);
        zedClientDebug('bootstrap_paste_done', { panelId, program });
      } else if (result.status === 'timeout') {
        // Do not mark done — allows a future retry path; avoid silent success.
        zedClientDebug('bootstrap_paste_timeout', { panelId, program, reason: result.reason });
      } else {
        zedClientDebug('bootstrap_paste_result', { panelId, program, ...result });
        if (result.status === 'send_failed' || result.status === 'failed') {
          // Leave unmarked so a remount could retry once WS is open.
          startedRef.current = false;
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
      // If we never finished, put the reservation back so remount can retry.
      if (!isNativeTuiBootstrapDone(panelId) && pending?.text) {
        reserveNativeTuiBootstrap(panelId, {
          text: pending.text,
          program: pending.program,
          timeoutMs: pending.timeoutMs,
          initialCommand: pending.initialCommand,
        });
        startedRef.current = false;
      }
    };
  }, [
    panelId,
    initialCommand,
    wsRef,
    transportRef,
    grokTuiReadyRef,
    kimiReadyNotifiedRef,
    tuiSessionActiveRef,
    tuiSessionFooterConfirmedRef,
    isGrokSessionRef,
    lifecycleRefs,
  ]);
}

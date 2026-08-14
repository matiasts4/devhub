/**
 * useTerminalV2Session — WS connect, subscribe, frame decode, rehydration.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-6).
 */
import { useCallback, useRef } from 'react';
import {
  cliLog,
  prepareActiveTuiTerminalFocus,
  resetTerminalModesForReattach,
  disableTerminalFocusReporting,
  reconcileGrokTuiWheelReadiness,
  reconcileOpenCodeTuiWheelReadiness,
  detectGrokSessionFromOutput,
  isGrokTuiInitialCommand,
  shouldScrollAgentWheelLocally,
  terminalHasActiveMouseReporting,
  resolveConnectInitialCommandState,
  resolveColdConnectStaggerMs,
  resolveTerminalConnectionCloseState,
  restoreTerminalViewportScroll,
  isTerminalViewportNearBottom,
  getTerminalViewportScrollOffset,
  TERMINAL_SNAPSHOT_THRESHOLD_BYTES,
  TERMINAL_SNAPSHOT_MAX_INTERVAL_MS,
  TERMINAL_DISABLE_MOUSE_REPORTING_SEQ,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  clearPanelInitialCommandLifecycle,
  markPanelInitialCommandDispatched,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { createPanelActivityTracker } from '@/components/terminal/utils/panelActivityTracker';
import { setPanelSemanticState } from '@/components/terminal/utils/panelSemanticStateStore';
import {
  detectOpenCodeTuiReady,
  isOpenCodeLaunchCommand,
  shouldSkipConfirmedTuiReadyHotPath,
} from '@/lib/terminal/opencodeReadyMarker';
import { isGrokLaunchCommand } from '@/lib/terminal/grokReadyMarker';
import { scheduleGrokWheelBootstrap } from '@/lib/terminal/grokWheelBootstrap';
import { detectKimiTuiReady, isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import {
  markConnectStart,
  markSessionApiOk,
  markFirstPtyByte,
  markWsConnected,
} from '@/lib/terminal/startupPerfMarks';
import { warmTtySidecarViaApi } from '@/lib/terminal/terminalWarmPolicy';
import { markTerminalConnectedOnce } from '@/lib/terminal/terminalConnectedOnceRegistry';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

/**
 * Decide whether the reconnect viewport safety net should re-anchor the scroll.
 * Returns false once the pre-reconnect intent was already consumed (replayComplete
 * re-anchored it), so a late safety-net tick cannot yank the user's scroll. Otherwise
 * re-anchor only when the viewport is still far from the captured intent.
 * @param {object} opts
 * @param {'bottom'|number|null} opts.pendingViewport - intent captured pre-clear
 * @param {boolean} opts.intentConsumed - replayComplete already consumed the intent
 * @param {boolean} opts.nearBottom - viewport currently within threshold of the bottom
 * @param {number|null} opts.currentOffset - current integer scroll offset (or null)
 * @param {number} [opts.threshold=4]
 * @returns {boolean}
 */
export function shouldReanchorReconnectViewport({
  pendingViewport,
  intentConsumed,
  nearBottom,
  currentOffset,
  threshold = 4,
}) {
  if (intentConsumed) return false;
  if (pendingViewport === 'bottom') return !nearBottom;
  if (Number.isInteger(pendingViewport)) {
    return Number.isInteger(currentOffset) && Math.abs(currentOffset - pendingViewport) > threshold;
  }
  return false;
}

export default function useTerminalV2Session({ ctxRef }) {
  const reconnectViewportVerifyRef = useRef(null);

  const stopV2Session = useCallback(() => {
    if (reconnectViewportVerifyRef.current) {
      clearTimeout(reconnectViewportVerifyRef.current);
      reconnectViewportVerifyRef.current = null;
    }
    const c = ctxRef.current;
    if (typeof c?._cancelGrokWheelBootstrap === 'function') {
      c._cancelGrokWheelBootstrap();
      c._cancelGrokWheelBootstrap = null;
    }
    const { connectAbortRef, wsRef, connectInFlightRef, initialCommandRetryTimerRef } = c || {};
    if (initialCommandRetryTimerRef?.current) {
      clearTimeout(initialCommandRetryTimerRef.current);
      initialCommandRetryTimerRef.current = null;
    }
    if (connectAbortRef?.current) {
      connectAbortRef.current.abort();
      connectAbortRef.current = null;
    }
    const ws = wsRef?.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (connectInFlightRef) connectInFlightRef.current = false;
  }, [ctxRef]);

  const startV2Session = useCallback(async () => {
    const {
      id,
      cwd,
      initialCommand,
      restored,
      swarmContext,
      autoFocus,
      coldMountOrdinal,
      isVisibleInLayoutRef,
      connectInFlightRef,
      sessionClosingRef,
      wsRef,
      transportRef,
      connectEpochRef,
      connectAbortRef,
      hasConnectedOnceRef,
      initialCommandDelayScheduledRef,
      sessionReattachedRef,
      serverReadyReceivedRef,
      readyEverReceivedRef,
      initialCommandRetryTimerRef,
      hasSentInitialCommand,
      processExitedRef,
      isEngineV2Ref,
      isDisposingRef,
      termRef,
      serializeAddonRef,
      rehydrationRef,
      dataProcessedSinceSnapshotRef,
      snapshotIntervalRef,
      currentPtyOffsetRef,
      serverTermsizeRef,
      panelActivityTrackerRef,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      tuiOutputTailRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      isGrokSessionRef,
      grokTuiReadyRef,
      tuiSessionFooterConfirmedRef,
      agentTypeRef,
      initialCommandConnectSnapshotRef,
      isActivePanelRef,
      lastPtySizeRef,
      preReconnectViewportRef,
      scrollTerminalToBottom,
      setConnectionState,
      setHasConnectedOnce,
      setRestoredToast,
      setNativeWheelPassthrough,
      clearConnectDeferTimer,
      sendResize,
      writeTerminalOutput,
      scrollIfActivePanel,
      sendInitialCommandIfReady,
      applyTerminalSessionExit,
      notifyAgentReady,
      notifyOpencodeReady,
      onFlushWriteRef,
      sendResizeRef,
    } = ctxRef.current;
    console.log(`[DEBUG TTY:${id}] connect() called`);
    if (connectInFlightRef.current) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — connect already in flight');
      return;
    }
    if (sessionClosingRef.current) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — session is closing');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — socket already open');
      setConnectionState('connected');
      sendResize();
      return;
    }

    initialCommandDelayScheduledRef.current = false;

    const connectCommandState = resolveConnectInitialCommandState({
      hasConnectedOnce: hasConnectedOnceRef.current,
      panelId: id,
      initialCommand,
      readyEverReceived: readyEverReceivedRef.current,
    });
    if (connectCommandState.clearLifecycle) {
      clearPanelInitialCommandLifecycle(id);
    }
    sessionReattachedRef.current = connectCommandState.sessionReattached;
    serverReadyReceivedRef.current = false;
    hasSentInitialCommand.current = connectCommandState.hasSentInitialCommand;
    if (connectCommandState.markDispatched) {
      markPanelInitialCommandDispatched(id, initialCommand);
    }
    processExitedRef.current = false;

    if (!hasConnectedOnceRef.current) {
      setConnectionState('connecting');
    }

    markConnectStart();
    cliLog(`CLIENT:${id}`, 'connect() called', { cwd, autoFocus });

    connectInFlightRef.current = true;
    const connectEpoch = connectEpochRef.current;
    if (connectAbortRef.current) {
      connectAbortRef.current.abort();
    }
    const abortController = new AbortController();
    connectAbortRef.current = abortController;

    try {
      // Silence the stale socket BEFORE closing it so its onclose doesn't
      // override 'connecting' back to 'disconnected' and trigger a reconnect loop.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
        cliLog(`CLIENT:${id}`, 'stale socket silenced+closed');
      }

      const cwdParam = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
      const sessionIdParam = id ? `sessionId=${encodeURIComponent(id)}` : '';
      const legacyIdParam = id ? `id=${encodeURIComponent(id)}` : '';
      const swarmRoleParam = swarmContext?.isSwarmRole ? 'isSwarmRole=1' : '';
      const swarmRoleKeyParam = swarmContext?.roleKey
        ? `roleKey=${encodeURIComponent(swarmContext.roleKey)}`
        : '';
      const swarmLaunchIdParam = swarmContext?.launchId
        ? `launchId=${encodeURIComponent(swarmContext.launchId)}`
        : '';
      const v2Param = isEngineV2Ref.current ? 'v2=true' : '';
      const queryParams = [
        cwdParam,
        sessionIdParam,
        legacyIdParam,
        swarmRoleParam,
        swarmRoleKeyParam,
        swarmLaunchIdParam,
        v2Param,
      ]
        .filter(Boolean)
        .join('&');
      const queryStr = queryParams ? `?${queryParams}` : '';

      console.log(`[TTY:${id}] Connecting to /api/terminal/session${queryStr}`);
      cliLog(`CLIENT:${id}`, 'fetching session API', { queryStr });
      // Coalesce with background warm — cache/inflight skip a second cold compile.
      const endpoint = await warmTtySidecarViaApi({
        cwd,
        fetchImpl: (url, init) => fetch(url, { ...init, signal: abortController.signal }),
      });
      if (connectEpoch !== connectEpochRef.current) {
        cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch after session API');
        return;
      }
      const { port, wsPath } = endpoint || {};
      if (!port || !wsPath) {
        cliLog(`CLIENT:${id}`, 'session API FAILED', { body: 'missing port/wsPath' });
        throw new Error('No se pudo crear la sesión de terminal (endpoint inválido).');
      }
      console.log(`[TTY:${id}] Got port=${port}, wsPath=${wsPath}`);
      cliLog(`CLIENT:${id}`, 'session API ok', { port, wsPath });
      markSessionApiOk();
      transportRef.current = wsPath === '/' ? 'raw' : 'json';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${queryStr}`;
      console.log(`[TTY:${id}] WebSocket URL: ${wsUrl}`);
      cliLog(`CLIENT:${id}`, 'opening WebSocket', { wsUrl });

      // Restored-workspace fan-out control: N panels restored at once would
      // fire N simultaneous node-pty spawns (conPTY race on Windows). Only the
      // FIRST connect of restored panels is staggered; fresh panels and
      // reconnects are never delayed. See resolveColdConnectStaggerMs.
      if (!hasConnectedOnceRef.current) {
        const staggerMs = resolveColdConnectStaggerMs({ coldMountOrdinal, restored });
        if (staggerMs > 0) {
          cliLog(`CLIENT:${id}`, 'cold connect stagger', { staggerMs });
          await new Promise((resolve) => setTimeout(resolve, staggerMs));
          if (connectEpoch !== connectEpochRef.current || isDisposingRef.current) {
            cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch after cold stagger');
            return;
          }
        }
      }

      const socket = new WebSocket(wsUrl);
      if (connectEpoch !== connectEpochRef.current) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch after WebSocket create');
        return;
      }
      wsRef.current = socket;
      panelActivityTrackerRef.current = createPanelActivityTracker(id);

      const flushHeldData = () => {
        const { heldData } = rehydrationRef.current;
        rehydrationRef.current.heldData = [];
        for (const chunk of heldData) {
          writeTerminalOutput(chunk);
        }
      };

      // Boot-race safety net: after a FRESH ready the launch command can still
      // be waiting on later gates (viewport fit, projection). Retry a few times
      // with backoff instead of silently losing the resume; every attempt is
      // persisted to the terminal-session log for diagnostics.
      const INITIAL_COMMAND_RETRY_DELAYS_MS = [750, 1500, 3000, 6000, 12000];
      const scheduleInitialCommandRetryLadder = () => {
        if (!initialCommand) return;
        if (initialCommandRetryTimerRef.current) {
          clearTimeout(initialCommandRetryTimerRef.current);
          initialCommandRetryTimerRef.current = null;
        }
        let attempt = 0;
        const tick = () => {
          initialCommandRetryTimerRef.current = null;
          if (isDisposingRef.current) return;
          if (connectEpoch !== connectEpochRef.current) return;
          if (!initialCommand || hasSentInitialCommand.current) return;
          if (sessionReattachedRef.current) return;
          if (wsRef.current?.readyState !== WebSocket.OPEN) return;
          logTerminalSession('initial-command-retry', {
            panelId: id,
            attempt,
            command: initialCommand,
          });
          sendInitialCommandIfReady();
          attempt += 1;
          if (
            !hasSentInitialCommand.current &&
            attempt < INITIAL_COMMAND_RETRY_DELAYS_MS.length
          ) {
            initialCommandRetryTimerRef.current = setTimeout(
              tick,
              INITIAL_COMMAND_RETRY_DELAYS_MS[attempt]
            );
          }
        };
        initialCommandRetryTimerRef.current = setTimeout(
          tick,
          INITIAL_COMMAND_RETRY_DELAYS_MS[0]
        );
      };

      const maybeSaveSnapshot = (force = false) => {
        if (!isEngineV2Ref.current) return;
        if (!serializeAddonRef.current) return;
        if (!termRef.current) return;
        if (socket.readyState !== WebSocket.OPEN) return;
        // Hidden keep-alive panels keep the socket open; serializing their
        // full scrollback on a timer is pure main-thread cost. Snapshots
        // resume when the panel becomes visible again.
        if (isVisibleInLayoutRef?.current === false) return;
        if (dataProcessedSinceSnapshotRef.current < TERMINAL_SNAPSHOT_THRESHOLD_BYTES && !force) {
          return;
        }

        try {
          const serialized = serializeAddonRef.current.serialize();
          socket.send(
            JSON.stringify({
              type: 'save-snapshot',
              serialized,
              ptyOffset: currentPtyOffsetRef.current,
              termsize: { cols: termRef.current.cols, rows: termRef.current.rows },
            })
          );
          dataProcessedSinceSnapshotRef.current = 0;
        } catch (err) {
          cliLog(`CLIENT:${id}`, 'snapshot save failed', { error: err?.message });
        }
      };

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error(`[TTY:${id}] WebSocket connection timeout after 10s`);
          cliLog(`CLIENT:${id}`, 'WS connection TIMEOUT (10s)', { readyState: socket.readyState });
          socket.close();
          setConnectionState('error');
        }
      }, 10000);

      socket.onopen = () => {
        if (connectEpoch !== connectEpochRef.current) return;
        clearTimeout(connectionTimeout);
        clearConnectDeferTimer();
        console.log(`[TTY:${id}] WebSocket connected`);
        cliLog(`CLIENT:${id}`, 'WS onopen — connected');
        markWsConnected();
        hasConnectedOnceRef.current = true;
        markTerminalConnectedOnce(id);
        // The PTY host re-created its side of the session on (re)connect — force
        // the first post-connect resize through the zero-delta guard so the
        // server re-syncs dimensions (terminal-load-performance PR6).
        if (lastPtySizeRef?.current) {
          lastPtySizeRef.current = { cols: 0, rows: 0 };
        }
        panelActivityTrackerRef.current?.onOpen();
        if (initialCommandConnectSnapshotRef.current === null) {
          initialCommandConnectSnapshotRef.current = initialCommand;
        }
        setHasConnectedOnce(true);
        setConnectionState('connected');
        if (!initialCommand) {
          hasSentInitialCommand.current = true;
        }

        // Sync focus ownership with PTY host (Win Ctrl+C sibling isolation).
        try {
          if (transportRef.current !== 'raw') {
            socket.send(
              JSON.stringify({
                type: 'panel-focus',
                focused: Boolean(isActivePanelRef?.current),
              })
            );
          }
          if (initialCommand && transportRef.current !== 'raw') {
            const clean = String(initialCommand)
              .replace(/\s*#recovery-\d+\s*$/, '')
              .trim();
            if (clean) {
              socket.send(JSON.stringify({ type: 'session-meta', launchCommand: clean }));
            }
          }
        } catch {
          // ignore
        }

        if (isEngineV2Ref.current) {
          // Phase 3 terminal-engine-v2: start rehydration in a loaded=false state.
          // Subscribe is deferred until after the snapshot response so the
          // ring-buffer delta can be replayed from the snapshot ptyOffset without
          // interleaving with live output.
          rehydrationRef.current = { loaded: false, heldData: [] };
          dataProcessedSinceSnapshotRef.current = 0;
          currentPtyOffsetRef.current = 0;
          // The snapshot interval is NOT started here: it only makes sense once
          // the server confirms v2 support in its `ready` frame (sidecar-backend
          // in production discards save-snapshot — serializing the full
          // scrollback every 5s per panel would be pure main-thread waste).
          if (snapshotIntervalRef.current) {
            clearInterval(snapshotIntervalRef.current);
            snapshotIntervalRef.current = null;
          }

          // Initial-restore viewport intent: reconnect() captures the pre-clear
          // intent, but a first connect (workspace restore / durable resume) has
          // none — default to 'bottom' so the replayComplete re-anchor and the
          // safety net below apply. Without it, restored agent TUIs (Kimi) land
          // pinned at the TOP of the rebuilt scrollback: the snapshot+delta
          // replay leaves ydisp=0 while baseY grows, and every non-forced scroll
          // rescue skips inline-scroll TUIs, so nothing re-anchors them.
          if (preReconnectViewportRef && preReconnectViewportRef.current == null) {
            preReconnectViewportRef.current = 'bottom';
          }

          // Reconnect viewport safety net (kimi idle-reconnect): the metadata
          // replayComplete frame re-anchors the viewport intent captured
          // pre-clear, but when that frame is lost or raced the panel stays
          // pinned at the TOP of the rebuilt scrollback looking frozen until
          // the next user interaction. Re-apply the intent once — only when
          // the viewport is still far from it — and flush held live output if
          // the metadata frame never arrived.
          if (preReconnectViewportRef?.current != null) {
            const pendingViewport = preReconnectViewportRef.current;
            const epochAtSchedule = connectEpoch;
            if (reconnectViewportVerifyRef.current) {
              clearTimeout(reconnectViewportVerifyRef.current);
            }
            reconnectViewportVerifyRef.current = setTimeout(() => {
              reconnectViewportVerifyRef.current = null;
              if (isDisposingRef.current || connectEpochRef.current !== epochAtSchedule) return;
              if (socket.readyState !== WebSocket.OPEN) return;
              const term = termRef.current;
              if (!term) return;
              if (!rehydrationRef.current.loaded) {
                rehydrationRef.current.loaded = true;
                flushHeldData();
                cliLog(`CLIENT:${id}`, 'reconnect safety-net flushed held data (no replayComplete)');
              }
              const intentConsumed = preReconnectViewportRef?.current == null;
              if (preReconnectViewportRef) preReconnectViewportRef.current = null;
              const currentOffset = getTerminalViewportScrollOffset(term);
              const shouldReanchor = shouldReanchorReconnectViewport({
                pendingViewport,
                intentConsumed,
                nearBottom: isTerminalViewportNearBottom(term, 4),
                currentOffset,
              });
              if (!shouldReanchor) return;
              if (pendingViewport === 'bottom') {
                scrollTerminalToBottom?.(true);
                cliLog(`CLIENT:${id}`, 'reconnect safety-net re-anchored viewport', {
                  pendingViewport,
                });
              } else if (Number.isInteger(pendingViewport)) {
                restoreTerminalViewportScroll(term, pendingViewport);
                cliLog(`CLIENT:${id}`, 'reconnect safety-net re-anchored viewport', {
                  pendingViewport,
                  currentOffset,
                });
              }
            }, 2500);
          }
        } else {
          // Legacy v1 path: fit the viewport and notify the PTY immediately.
          sendResize();
        }

        // Note: sendInitialCommandIfReady() is NOT called here. It is gated on the
        // server's `ready` message (see Bug B) to avoid typing the launch command into
        // an already-live reattached TUI. The `ready` handler dispatches it for fresh
        // sessions; confirmViewportFit dispatches it once both ready + fit are done.

        // Show restored toast for sessions from previous run
        if (restored && cwd) {
          setRestoredToast(true);
          setTimeout(() => setRestoredToast(false), 2000);
        }
        // Initial focus handled by the other useEffect
      };

      const handleTuiReadyFromOutput = (chunk) => {
        if (!chunk || typeof chunk !== 'string') return;
        const tail = `${tuiOutputTailRef.current}${chunk}`.slice(-8192);
        tuiOutputTailRef.current = tail;

        // Capa B: kimi readiness posts marker only — never fall through to opencode/grok.
        const isKimiLaunch = isKimiLaunchCommand(initialCommand);
        const kimiTuiReady = detectKimiTuiReady(chunk) || detectKimiTuiReady(tail);
        if (isKimiLaunch || kimiTuiReady) {
          if (!kimiReadyNotifiedRef.current && kimiTuiReady) {
            kimiReadyNotifiedRef.current = true;
            void notifyAgentReady('kimi', null, 'client-tui-footer');
            if (termRef.current) {
              termRef.current.write(TERMINAL_DISABLE_MOUSE_REPORTING_SEQ);
            }
          }
          tuiSessionActiveRef.current = true;
          return;
        }

        // Footer strings linger in the 8KB tail — once confirmed, skip detection
        // and mouse rebind so every keystroke echo does not re-inject DECSET.
        if (
          shouldSkipConfirmedTuiReadyHotPath({
            footerConfirmed: tuiSessionFooterConfirmedRef.current,
            grokReady: grokTuiReadyRef.current,
          })
        ) {
          return;
        }

        const footerReady = detectOpenCodeTuiReady(chunk) || detectOpenCodeTuiReady(tail);
        const grokReady = detectGrokSessionFromOutput(chunk) || detectGrokSessionFromOutput(tail);
        if (!footerReady && !grokReady) return;
        tuiSessionActiveRef.current = true;
        if (!hasSentInitialCommand.current && initialCommand) {
          hasSentInitialCommand.current = true;
          markPanelInitialCommandDispatched(id, initialCommand);
        }
        if (grokReady) {
          isGrokSessionRef.current = true;
          grokTuiReadyRef.current = true;
          // Grok is inject-only — never enable native passthrough (first-panel swallow).
          setNativeWheelPassthrough(false);
          // One light rebind when chrome is real — avoid Ctrl+L storm during boot.
          prepareActiveTuiTerminalFocus(termRef.current, { tuiSessionActive: true });
        }
        if (footerReady) {
          tuiSessionFooterConfirmedRef.current = true;
          setNativeWheelPassthrough(true);
          void notifyOpencodeReady(null, 'client-tui-footer');
          // OpenCode already works; keep light rebind for parity after panel hide.
          prepareActiveTuiTerminalFocus(termRef.current, { tuiSessionActive: true });
        } else if (!grokReady) {
          prepareActiveTuiTerminalFocus(termRef.current, { tuiSessionActive: true });
        }
      };

      onFlushWriteRef.current = (combined) => {
        termRef.current?.write(combined);
        handleTuiReadyFromOutput(combined);
        scrollIfActivePanel();
      };

      socket.onmessage = (event) => {
        if (connectEpoch !== connectEpochRef.current) return;
        if (isDisposingRef.current) return;
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            panelActivityTrackerRef.current?.onFrame('raw', event.data);
            markFirstPtyByte();
            writeTerminalOutput(event.data);
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'spawn-error') {
            // El PTY host no pudo crear la sesión (p.ej. carrera conPTY
            // "AttachConsole failed"). Fallo explícito: marcamos error ya —
            // el auto-reconnect acotado reintenta con backoff en vez de
            // esperar el timeout de 10s.
            cliLog(`CLIENT:${id}`, 'server spawn-error', { message: payload.message });
            logTerminalSession('terminal-spawn-error', {
              panelId: id,
              message: payload.message || null,
            });
            setConnectionState('error');
            try {
              socket.close();
            } catch {
              // ignore
            }
            return;
          }

          if (payload.type === 'ready') {
            panelActivityTrackerRef.current?.onReady(payload);
            serverReadyReceivedRef.current = true;
            readyEverReceivedRef.current = true;

            if (payload.v2) {
              // Phase 3 terminal-engine-v2: remember the server's canonical
              // termsize and current ring offset, then ask for the latest
              // serialized snapshot. The snapshot response drives the
              // temp-resize + replay sequence; we do NOT resize to the current
              // server termsize here because the snapshot may have been saved at
              // a different grid size.
              serverTermsizeRef.current = {
                cols: Number(payload.cols) || 0,
                rows: Number(payload.rows) || 0,
              };
              currentPtyOffsetRef.current = Number(payload.ptyOffset) || 0;

              try {
                socket.send(JSON.stringify({ type: 'get-snapshot' }));
              } catch {
                // ignore snapshot request send errors
              }

              // Server confirmed v2/snapshot support — start the periodic
              // snapshot saver (moved here from onopen: servers without v2,
              // e.g. the production sidecar, discard save-snapshot frames).
              if (snapshotIntervalRef.current) {
                clearInterval(snapshotIntervalRef.current);
                snapshotIntervalRef.current = null;
              }
              snapshotIntervalRef.current = setInterval(() => {
                maybeSaveSnapshot(true);
              }, TERMINAL_SNAPSHOT_MAX_INTERVAL_MS);
            } else if (
              Number(payload.cols) > 0 &&
              Number(payload.rows) > 0 &&
              termRef.current &&
              typeof termRef.current.resize === 'function'
            ) {
              // Legacy v1 path: apply server termsize if provided.
              serverTermsizeRef.current = {
                cols: Number(payload.cols),
                rows: Number(payload.rows),
              };
              termRef.current.resize(
                serverTermsizeRef.current.cols,
                serverTermsizeRef.current.rows
              );
            }

            if (payload.reattached) {
              sessionReattachedRef.current = true;
              hasSentInitialCommand.current = true;
              markPanelInitialCommandDispatched(id, initialCommand);
              hiddenOutputCatchupPendingRef.current = false;
              if (hiddenOutputBufferRef.current) {
                hiddenOutputBufferRef.current.value = '';
              }
              if (payload.mode === 'tui') {
                tuiSessionActiveRef.current = true;
                if (isKimiLaunchCommand(initialCommand)) {
                  kimiReadyNotifiedRef.current = true;
                } else if (isOpenCodeLaunchCommand(initialCommand)) {
                  reconcileOpenCodeTuiWheelReadiness({
                    term: termRef.current,
                    initialCommand,
                    tuiSessionActiveRef,
                    tuiSessionFooterConfirmedRef,
                    setNativeWheelPassthrough,
                    assumeTuiIfReattached: true,
                  });
                } else if (isGrokTuiInitialCommand(initialCommand)) {
                  reconcileGrokTuiWheelReadiness({
                    term: termRef.current,
                    initialCommand,
                    tuiSessionActiveRef,
                    isGrokSessionRef,
                    grokTuiReadyRef,
                    setNativeWheelPassthrough,
                    assumeTuiIfReattached: true,
                  });
                }
              } else {
                tuiSessionActiveRef.current = false;
                isGrokSessionRef.current = false;
                grokTuiReadyRef.current = false;
                tuiSessionFooterConfirmedRef.current = false;
                setNativeWheelPassthrough(false);
                disableTerminalFocusReporting(termRef.current, { disableMouse: true });
              }

              // xterm.js is fresh after reconnect; prod the TUI/shell into
              // re-emitting its private modes and redraw the screen.
              // Inline-scroll agents never use host mouse — skip the mouse burst.
              resetTerminalModesForReattach(termRef.current, {
                tuiSessionActive:
                  tuiSessionActiveRef.current &&
                  !shouldScrollAgentWheelLocally(initialCommand, agentTypeRef?.current),
              });
            } else {
              // Fresh session: the tmux pane is empty, so it is safe to launch the
              // agent now. sendInitialCommandIfReady also waits for viewport fit.
              //
              // Do NOT set grokTuiReady / mouse-on here: enabling xterm mouse before
              // Grok's TUI owns tracking causes native wheel to swallow events with
              // no TUI listener. Readiness + resetTerminalModesForReattach runs when
              // chrome is detected (handleTuiReadyFromOutput) — same moment OpenCode
              // flips footerConfirmed.
              if (isGrokTuiInitialCommand(initialCommand) || isGrokLaunchCommand(initialCommand)) {
                isGrokSessionRef.current = true;
                tuiSessionActiveRef.current = true;
                // Cold app start: Grok boots slowly. One rebind at 2.5s often fires too early
                // (before TUI owns mouse); then hot-path skip never rebinds again → dead scroll
                // until Ctrl+R. After a page reload Grok is warm and one rebind works.
                // Multi-shot bootstrap repeats Ctrl+R-equivalent rebind for ~14s.
                if (typeof ctxRef.current._cancelGrokWheelBootstrap === 'function') {
                  ctxRef.current._cancelGrokWheelBootstrap();
                }
                const epochAtSchedule = connectEpochRef.current;
                ctxRef.current._cancelGrokWheelBootstrap = scheduleGrokWheelBootstrap({
                  getTerm: () => termRef.current,
                  isCancelled: () =>
                    isDisposingRef.current || connectEpochRef.current !== epochAtSchedule,
                  initialCommand,
                  tuiSessionActiveRef,
                  isGrokSessionRef,
                  grokTuiReadyRef,
                  setNativeWheelPassthrough,
                  resetTerminalModesForReattach,
                  prepareActiveTuiTerminalFocus,
                  terminalHasActiveMouseReporting,
                });
              } else if (isOpenCodeLaunchCommand(initialCommand)) {
                tuiSessionActiveRef.current = true;
              } else if (payload.mode === 'tui') {
                // Generic server signal: session was pre-detected as an agent
                // TUI (qodercli, claude, codex, hermes, agy, …). Honor it so
                // wheel inject works without per-agent client code.
                tuiSessionActiveRef.current = true;
              }
              sendInitialCommandIfReady();
              scheduleInitialCommandRetryLadder();
            }
            return;
          }

          // Phase 3 terminal-engine-v2: the server responded with the stored
          // serialized snapshot. Temp-resize to the snapshot's grid, write the
          // serialized scrollback, then subscribe to the delta from the snapshot
          // ptyOffset. If there is no snapshot, subscribe from the current offset
          // for a fresh terminal.
          if (payload.type === 'snapshot' && isEngineV2Ref.current) {
            if (payload.serialized && payload.termsize) {
              const cols = Number(payload.termsize.cols);
              const rows = Number(payload.termsize.rows);
              if (
                cols > 0 &&
                rows > 0 &&
                termRef.current &&
                typeof termRef.current.resize === 'function'
              ) {
                termRef.current.resize(cols, rows);
              }
              if (termRef.current && typeof termRef.current.write === 'function') {
                termRef.current.write(payload.serialized);
                reconcileOpenCodeTuiWheelReadiness({
                  term: termRef.current,
                  initialCommand,
                  tuiSessionActiveRef,
                  tuiSessionFooterConfirmedRef,
                  setNativeWheelPassthrough,
                });
                reconcileGrokTuiWheelReadiness({
                  term: termRef.current,
                  initialCommand,
                  tuiSessionActiveRef,
                  isGrokSessionRef,
                  grokTuiReadyRef,
                  setNativeWheelPassthrough,
                });
              }
              try {
                socket.send(
                  JSON.stringify({
                    type: 'subscribe',
                    v2: true,
                    fromOffset: Number(payload.ptyOffset) || 0,
                  })
                );
              } catch {
                // ignore subscribe send errors
              }
            } else {
              // Fresh terminal (no snapshot): keep any pre-reconnect viewport
              // intent — the subscribe below still triggers a metadata
              // replayComplete frame whose re-anchor consumes it (the restore
              // is clamped, so it is a no-op when the buffer only holds live
              // output).
              try {
                socket.send(JSON.stringify({ type: 'subscribe', v2: true }));
              } catch {
                // ignore subscribe send errors
              }
            }
            return;
          }

          // Phase 2 terminal-engine-v2: server-side metadata message carrying
          // canonical termsize + cwd. On the v2 path the metadata that follows
          // subscribe marks the end of the snapshot+delta replay; we flush held
          // live output and resize back to the container instead of applying the
          // cached server termsize.
          if (payload.type === 'metadata' && payload.termsize) {
            if (isEngineV2Ref.current && !rehydrationRef.current.loaded && payload.replayComplete) {
              rehydrationRef.current.loaded = true;
              flushHeldData();
              reconcileOpenCodeTuiWheelReadiness({
                term: termRef.current,
                initialCommand,
                tuiSessionActiveRef,
                tuiSessionFooterConfirmedRef,
                setNativeWheelPassthrough,
              });
              reconcileGrokTuiWheelReadiness({
                term: termRef.current,
                initialCommand,
                tuiSessionActiveRef,
                isGrokSessionRef,
                grokTuiReadyRef,
                setNativeWheelPassthrough,
              });
              sendResizeRef.current?.();

              // Re-anchor the viewport after a reconnect replay. reconnect()
              // clear()s the buffer (ydisp=0) and the non-forced scroll rescues
              // skip Kimi TUIs, so without this the user lands at the TOP of the
              // rebuilt scrollback. Restore the intent captured pre-clear.
              const pendingViewport = preReconnectViewportRef?.current;
              if (preReconnectViewportRef) preReconnectViewportRef.current = null;
              if (pendingViewport != null) {
                cliLog(`CLIENT:${id}`, 'reconnect viewport re-anchor scheduled (replayComplete)', {
                  pendingViewport,
                });
              }
              if (pendingViewport != null && termRef.current) {
                const term = termRef.current;
                const restoreViewport = () => {
                  if (pendingViewport === 'bottom') {
                    scrollTerminalToBottom?.(true);
                  } else {
                    restoreTerminalViewportScroll(term, pendingViewport);
                  }
                };
                // Wait for the snapshot write to flush and sendResize's RAF fit
                // (which reflows the grid) to settle before re-anchoring.
                if (typeof term.write === 'function') {
                  term.write('', () => {
                    requestAnimationFrame(() => requestAnimationFrame(restoreViewport));
                  });
                } else {
                  restoreViewport();
                }
              }
              return;
            }

            const cols = Number(payload.termsize.cols);
            const rows = Number(payload.termsize.rows);
            if (
              cols > 0 &&
              rows > 0 &&
              termRef.current &&
              typeof termRef.current.resize === 'function'
            ) {
              serverTermsizeRef.current = { cols, rows };
              termRef.current.resize(cols, rows);
            }
            return;
          }

          if (payload.type === 'agent-state' && payload.agentTuiState) {
            // Generic TUI promotion: the server detected a known agent TUI
            // (any type — qodercli, claude, codex, hermes, agy, etc.). Flip
            // the session flag so the wheel router injects SGR into the PTY
            // instead of dead local-viewport scroll on the alt buffer.
            if (payload.reason === 'agent-exit' || payload.reason === 'exit') {
              tuiSessionActiveRef.current = false;
              if (agentTypeRef) agentTypeRef.current = null;
            } else if (payload.agentType && !tuiSessionActiveRef.current) {
              tuiSessionActiveRef.current = true;
            }
            // Track the detected type so the wheel router can pick the right
            // scroll strategy (inline-scroll agents vs SGR-inject TUIs).
            if (payload.agentType && agentTypeRef && agentTypeRef.current !== payload.agentType) {
              agentTypeRef.current = payload.agentType;
            }
            setPanelSemanticState(
              id,
              {
                agentTuiState: payload.agentTuiState,
                agentTuiStateAt: payload.at ?? Date.now(),
              },
              {
                // DONE-EVIDENCE-01: only the server-detected type is a valid
                // agent identity — the raw initialCommand is NOT (it produced
                // garbage labels like the full command string in titles).
                agentType: payload.agentType || null,
                wasCancelled: Boolean(payload.wasCancelled),
                reason: payload.reason || null,
              }
            );
            return;
          }

          if (payload.type === 'output' && typeof payload.data === 'string') {
            panelActivityTrackerRef.current?.onFrame('output', payload.data);
            markFirstPtyByte();
            writeTerminalOutput(payload.data);
            return;
          }

          // Phase 1/3 terminal-engine-v2: decode base64 append frames. While the
          // rehydration sequence is still in progress (loaded=false), append data
          // is buffered in heldData so it can be flushed after the snapshot and
          // delta replay complete, preserving output order.
          if (payload.type === 'append' && typeof payload.data === 'string') {
            markFirstPtyByte();
            const binaryString = atob(payload.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i += 1) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const decoded = new TextDecoder().decode(bytes);

            panelActivityTrackerRef.current?.onFrame('output', decoded);

            if (typeof payload.offset === 'number') {
              currentPtyOffsetRef.current = payload.offset;
            }

            if (isEngineV2Ref.current && !rehydrationRef.current.loaded) {
              rehydrationRef.current.heldData.push(decoded);
            } else {
              writeTerminalOutput(decoded);
            }

            dataProcessedSinceSnapshotRef.current += decoded.length;
            maybeSaveSnapshot();
            return;
          }

          // Some proxies / older server builds send title updates as JSON messages.
          // They are not terminal output; dropping them prevents stray control text
          // from appearing inside the TUI prompt.
          if (payload.type === 'title') {
            return;
          }

          if (payload.type === 'exit') {
            applyTerminalSessionExit(
              {
                id,
                initialCommand,
                reason: `child-exited:${payload.exitCode ?? 0}`,
              },
              { emitBrowserEvent: true }
            );
          }

          // The server detected an OpenCode session ID in this terminal — propagate it
          // so TerminalWorkspacesManager can persist it and restore it after reboots.
          if (payload.type === 'opencode-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:opencode-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }

          // Multiprovider session-id detection (kimi/codex fs correlation,
          // grok/qoder pre-assigned ids) — same flow as opencode above.
          const agentSessionDetectedMatch = String(payload.type || '').match(
            /^(kimi|codex|grok|qoder)-session-detected$/
          );
          if (agentSessionDetectedMatch && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent(`devhub:${agentSessionDetectedMatch[1]}-session-detected`, {
                detail: {
                  panelId: id,
                  sessionId: payload.sessionId,
                  agentType: payload.agentType || agentSessionDetectedMatch[1],
                  cwd: payload.cwd || null,
                },
              })
            );
            return;
          }

          if (payload.type === 'hermes-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:hermes-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }
        } catch {
          if (typeof event.data === 'string' && event.data.length > 0) {
            writeTerminalOutput(event.data);
          }
        }
      };

      socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        console.error(`[TTY:${id}] WebSocket error:`, err);
        cliLog(`CLIENT:${id}`, 'WS onerror');
        setConnectionState('error');
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (snapshotIntervalRef.current) {
          clearInterval(snapshotIntervalRef.current);
          snapshotIntervalRef.current = null;
        }
        panelActivityTrackerRef.current?.onClose();
        console.log(`[TTY:${id}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        cliLog(`CLIENT:${id}`, 'WS onclose', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setConnectionState((prev) =>
          resolveTerminalConnectionCloseState(prev, processExitedRef.current)
        );
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        cliLog(`CLIENT:${id}`, 'connect() aborted — fetch cancelled');
        return;
      }
      console.error(`[TTY:${id}] Connection failed:`, error);
      cliLog(`CLIENT:${id}`, 'connect() catch', { error: error?.message });
      setConnectionState('error');
    } finally {
      if (connectAbortRef.current === abortController) {
        connectAbortRef.current = null;
      }
      connectInFlightRef.current = false;
    }
  }, [ctxRef]);

  return { connect: startV2Session, startV2Session, stopV2Session };
}

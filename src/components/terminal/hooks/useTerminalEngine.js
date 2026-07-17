/**
 * useTerminalEngine — xterm lifecycle boot/dispose.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-9).
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag */
import { useCallback, useEffect, useRef } from 'react';
import {
  cliLog,
  attachTerminalRendererAddons,
  neutralizeWebglAddonForDisposal,
  isStaleXtermRendererError,
  resolveColdMountStaggerMs,
  fitTerminalViewport,
  stabilizeTerminalRenderer,
  refreshTerminalViewport,
  prepareActiveTuiTerminalFocus,
  prepareActiveTuiTerminalFocusRespectingSelection,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldRefitVisibleInactiveSplitPanel,
  needsGpuRendererReattach,
} from '@/components/terminal/TerminalTTY.helpers';
import { buildTerminalLifecycleEvent } from '@/lib/terminal/terminalLifecycleEvent';
import { getTerminalTheme, getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { resolveTerminalFontFamily } from '@/components/terminal/TerminalTTY.helpers';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import { stashTerminalPanelBridge } from '@/lib/terminal/terminalPanelBridge';
import {
  hasSurface as graveyardHasSurface,
  restoreSurface as graveyardRestoreSurface,
  stashSurface as graveyardStashSurface,
} from '@/lib/terminal/v2Graveyard';
import { filterTerminalInputForSession } from '@/lib/terminal/terminalNoiseFilter';
import { clearPanelInitialCommandLifecycle } from '@/lib/terminal/panelInitialCommandLifecycle';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import {
  markFirstPanelInteractive,
  markXtermCoreImportDone,
  markXtermCoreImportStart,
} from '@/lib/terminal/startupPerfMarks';

export default function useTerminalEngine({
  ctxRef,
  requestedRendererMode,
  runtimePhase,
  shouldBootXterm,
  xtermBootNonce,
  coldMountOrdinal,
  id,
  initialCommand,
}) {
  const prevInitialCommandRef = useRef(initialCommand);

  const disposeXtermRuntime = useCallback(
    ({ stashForV2 = false } = {}) => {
      const {
        ENABLE_NATIVE_VTE,
        autoFocus,
        canvasAddonRef,
        clearConnectDeferTimer,
        clearOutputQueue,
        clearTimers,
        coalescedSoftGpuVisibilityReveal,
        coldMountOrdinal,
        connectAbortRef,
        connectDeferTimerRef,
        connectEpochRef,
        connectPendingUntilFitRef,
        connectRef,
        containerRef,
        currentPtyOffsetRef,
        cwd,
        disposeXtermRuntime,
        effectiveRequestedMode,
        fitRef,
        fontSize,
        grokTuiReadyRef,
        handleWebglContextLossRef,
        hasSentInitialCommand,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        id,
        initialCommand,
        isActivePanelRef,
        isDisposingRef,
        isEngineV2Ref,
        isGrokSessionRef,
        isInitializingRef,
        isVisibleInLayoutRef,
        lastPtySizeRef,
        logViewportDiagnostic,
        maybeConnectAfterViewportFit,
        nativeResizeObserverRef,
        nativeResizeRafRef,
        needsViewportSyncOnShowRef,
        operationalRendererModeRef,
        outputPendingRef,
        panelActivityTrackerRef,
        pendingWebglRecoveryRef,
        reconnect,
        rendererViewModel,
        requestedRendererMode,
        requestedRendererModeRef,
        resizeObserverRef,
        restored,
        runtimePhase,
        scheduleInactiveViewportRepaint,
        searchRef,
        sendResizeRef,
        serializeAddonRef,
        setConnectionState,
        setInitError,
        setIsInitializing,
        setWebglFallback,
        shouldBootXterm,
        stashTerminalPanelBridge,
        surfaceHostRef,
        termRef,
        terminalBlurCleanupRef,
        transportRef,
        tryReattachCanvasAddonRef,
        tryReattachWebglAddonRef,
        tuiResizeDebounceTimerRef,
        tuiSessionActiveRef,
        tuiSessionFooterConfirmedRef,
        visibleTerminalPanelCountRef,
        waitForVisibleDimensions,
        webglAddonRef,
        writeTerminalOutput,
        wsRef,
        xtermBootNonce,
      } = ctxRef.current;
      // 0. Mark disposing BEFORE touching anything. Any callback that re-enters
      //    during teardown (or a stray rAF/observer that fires while the renderer
      //    slot is half-cleared) sees this and bails. Cleared in the finally so a
      //    later boot is never wrongly blocked. A.4.
      if (isDisposingRef.current) return;
      isDisposingRef.current = true;
      connectEpochRef.current += 1;
      if (panelActivityTrackerRef.current) {
        panelActivityTrackerRef.current.dispose();
        panelActivityTrackerRef.current = null;
      }
      clearPanelActivity(id);
      if (connectAbortRef.current) {
        connectAbortRef.current.abort();
        connectAbortRef.current = null;
      }
      // A.0 lifecycle telemetry: capture renderer + dims BEFORE refs are nulled.
      // This is the dispose-count-per-toggle signal A.1 must drive to zero.
      cliLog(
        `LIFECYCLE:${id}`,
        'dispose',
        buildTerminalLifecycleEvent({
          event: 'dispose',
          panelId: id,
          renderer: requestedRendererModeRef.current,
          isVisible: isVisibleInLayoutRef.current,
          cols: termRef.current?.cols,
          rows: termRef.current?.rows,
        })
      );
      try {
        // 1. Stop observing the container FIRST so no new resize callbacks queue.
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;

        // 2. Cancel any RAF / setTimeout that might call fit() or sendResize()
        //    after the runtime is gone. Without this, a queued RAF can fire
        //    fitAddon.fit() on a terminal that has already started disposing
        //    and trigger the WebGL addon's stale-renderer crash on Linux.
        clearTimers();
        clearConnectDeferTimer();
        clearOutputQueue();

        // 3. Silence and close the websocket. Closing it first means the
        //    onmessage/onclose can't push more output into a disposed terminal.
        if (wsRef.current) {
          const stale = wsRef.current;
          // Phase 3 terminal-engine-v2: serialize and push a final snapshot before
          // unsubscribing so the next show has the most recent state available.
          if (
            isEngineV2Ref.current &&
            stale.readyState === WebSocket.OPEN &&
            serializeAddonRef.current &&
            termRef.current
          ) {
            try {
              const serialized = serializeAddonRef.current.serialize();
              stale.send(
                JSON.stringify({
                  type: 'save-snapshot',
                  serialized,
                  ptyOffset: currentPtyOffsetRef.current,
                  termsize: { cols: termRef.current.cols, rows: termRef.current.rows },
                })
              );
            } catch {
              // ignore snapshot send errors during teardown
            }
          }
          // Phase 1 terminal-engine-v2: explicitly unsubscribe before closing so
          // the sidecar keeps the PTY alive for hidden panels.
          if (isEngineV2Ref.current && stale.readyState === WebSocket.OPEN) {
            try {
              stale.send(JSON.stringify({ type: 'unsubscribe' }));
            } catch {
              // ignore unsubscribe send errors during teardown
            }
          }
          stale.onopen = null;
          stale.onmessage = null;
          stale.onerror = null;
          stale.onclose = null;
          try {
            stale.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
        }

        if (terminalBlurCleanupRef.current) {
          try {
            terminalBlurCleanupRef.current();
          } catch {
            // ignore
          }
          terminalBlurCleanupRef.current = null;
        }

        // Phase 4 terminal-engine-v2: instead of disposing the xterm surface on
        // hide/close, stash it in the graveyard. The PTY stays alive in the sidecar
        // and the surface can be restored on re-mount, avoiding a full rebuild.
        const shouldStashForV2 = stashForV2 && isEngineV2Ref.current && termRef.current;
        if (shouldStashForV2) {
          const surface = {
            termInstance: termRef.current,
            webglAddon: webglAddonRef.current,
            canvasAddon: canvasAddonRef.current,
            serializeAddon: serializeAddonRef.current,
            fitAddon: fitRef.current,
            searchAddon: searchRef.current,
            container: containerRef.current,
            lastPtySize: { ...lastPtySizeRef.current },
          };

          // Null refs BEFORE stashing so concurrent callbacks see a detached runtime.
          // The graveyard holds the live objects; we just drop our local handles.
          webglAddonRef.current = null;
          canvasAddonRef.current = null;
          serializeAddonRef.current = null;
          termRef.current = null;
          fitRef.current = null;
          searchRef.current = null;

          if (outputPendingRef.current) {
            outputPendingRef.current.value = '';
          }
          if (hiddenOutputBufferRef.current) {
            hiddenOutputBufferRef.current.value = '';
          }
          hiddenOutputCatchupPendingRef.current = false;
          connectPendingUntilFitRef.current = false;
          if (connectDeferTimerRef.current) {
            clearTimeout(connectDeferTimerRef.current);
            connectDeferTimerRef.current = null;
          }

          try {
            graveyardStashSurface(id, surface);
          } catch (err) {
            cliLog(`CLIENT:${id}`, 'graveyard stash failed', { error: err?.message });
            // Fall back to disposal if stash fails.
            try {
              surface.webglAddon?.dispose?.();
            } catch {
              // ignore disposal errors during stash fallback
            }
            try {
              surface.canvasAddon?.dispose?.();
            } catch {
              // ignore disposal errors during stash fallback
            }
            try {
              surface.termInstance?.dispose?.();
            } catch {
              // ignore disposal errors during stash fallback
            }
          }
          isDisposingRef.current = false;
          return;
        }

        // 4. Snapshot refs and null them out IMMEDIATELY. Any concurrent code
        //    (queued resize, focus handler, paste handler) that re-checks the
        //    refs now sees null and bails out before we start tearing things
        //    down. This is the key ordering change for the Linux/WebKitGTK race.
        const webglAddon = webglAddonRef.current;
        const canvasAddon = canvasAddonRef.current;
        const term = termRef.current;
        webglAddonRef.current = null;
        canvasAddonRef.current = null;
        const bufferedOutput = hiddenOutputBufferRef.current?.value || '';
        const pendingOutput = outputPendingRef.current?.value || '';
        if (
          !isEngineV2Ref.current &&
          (bufferedOutput || pendingOutput || hiddenOutputCatchupPendingRef.current)
        ) {
          stashTerminalPanelBridge(id, {
            buffer: bufferedOutput,
            catchupPending: hiddenOutputCatchupPendingRef.current || Boolean(bufferedOutput),
            outputPending: pendingOutput,
            lastPtySize: { ...lastPtySizeRef.current },
            host: surfaceHostRef.current,
            reason: 'xterm-dispose',
          });
        }
        if (outputPendingRef.current) {
          outputPendingRef.current.value = '';
        }
        if (hiddenOutputBufferRef.current) {
          hiddenOutputBufferRef.current.value = '';
        }
        hiddenOutputCatchupPendingRef.current = false;
        connectPendingUntilFitRef.current = false;
        if (connectDeferTimerRef.current) {
          clearTimeout(connectDeferTimerRef.current);
          connectDeferTimerRef.current = null;
        }
        termRef.current = null;
        fitRef.current = null;
        searchRef.current = null;

        if (containerRef.current) {
          try {
            containerRef.current.replaceChildren();
          } catch {
            // ignore ÔÇö container may already be detached
          }
        }

        // 5. Neutralize the WebGL addon's internal handleResize before any
        //    dispose runs. See neutralizeWebglAddonForDisposal ÔÇö this is the
        //    fix for the `_renderer.value.handleResize` undefined crash that
        //    xterm-addon-webgl@0.16.0 exposes during teardown.
        neutralizeWebglAddonForDisposal(webglAddon);

        // 6. Dispose the terminal FIRST. xterm's AddonManager will walk the
        //    registered addons (including WebglAddon) in a safe internal order
        //    and detach the resize listener before clearing the renderer slot.
        if (term) {
          try {
            term.dispose();
          } catch (err) {
            if (!isStaleXtermRendererError(err)) {
              console.warn('Error disposing Terminal instance:', err);
            }
          }
        }

        // 7. Defensive second dispose for the addon ref. xterm cascades the
        //    dispose in step 6, but if loadAddon never completed (WebGL context
        //    creation threw) the addon won't be in the AddonManager's list, so
        //    we still need to release its handlers explicitly. dispose() is
        //    idempotent on the official addon.
        if (webglAddon) {
          try {
            webglAddon.dispose?.();
          } catch (err) {
            if (!isStaleXtermRendererError(err)) {
              console.warn('Error disposing WebglAddon:', err);
            }
          }
        }

        if (canvasAddon) {
          try {
            canvasAddon.dispose?.();
          } catch (err) {
            if (!isStaleXtermRendererError(err)) {
              console.warn('Error disposing CanvasAddon:', err);
            }
          }
        }
      } finally {
        isDisposingRef.current = false;
      }
    },
    [ctxRef]
  );

  useEffect(() => {
    const {
      ENABLE_NATIVE_VTE,
      autoFocus,
      canvasAddonRef,
      clearConnectDeferTimer,
      clearOutputQueue,
      clearTimers,
      coalescedSoftGpuVisibilityReveal,
      coldMountOrdinal,
      connectAbortRef,
      connectDeferTimerRef,
      connectEpochRef,
      connectPendingUntilFitRef,
      connectRef,
      containerRef,
      currentPtyOffsetRef,
      cwd,
      disposeXtermRuntime,
      effectiveRequestedMode,
      fitRef,
      fontSize,
      grokTuiReadyRef,
      handleWebglContextLossRef,
      hasSentInitialCommand,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      id,
      initialCommand,
      isActivePanelRef,
      isDisposingRef,
      isEngineV2Ref,
      isGrokSessionRef,
      isInitializingRef,
      isVisibleInLayoutRef,
      lastPtySizeRef,
      logViewportDiagnostic,
      maybeConnectAfterViewportFit,
      nativeResizeObserverRef,
      nativeResizeRafRef,
      needsViewportSyncOnShowRef,
      operationalRendererModeRef,
      outputPendingRef,
      panelActivityTrackerRef,
      pendingWebglRecoveryRef,
      reconnect,
      rendererViewModel,
      requestedRendererMode,
      requestedRendererModeRef,
      resizeObserverRef,
      restored,
      runtimePhase,
      scheduleInactiveViewportRepaint,
      searchRef,
      sendResizeRef,
      serializeAddonRef,
      setConnectionState,
      setInitError,
      setIsInitializing,
      setWebglFallback,
      shouldBootXterm,
      stashTerminalPanelBridge,
      surfaceHostRef,
      termRef,
      terminalBlurCleanupRef,
      transportRef,
      tryReattachCanvasAddonRef,
      tryReattachWebglAddonRef,
      tuiResizeDebounceTimerRef,
      tuiSessionActiveRef,
      tuiSessionFooterConfirmedRef,
      visibleTerminalPanelCountRef,
      waitForVisibleDimensions,
      webglAddonRef,
      writeTerminalOutput,
      wsRef,
      xtermBootNonce,
    } = ctxRef.current;

    const previous = prevInitialCommandRef.current;
    prevInitialCommandRef.current = initialCommand;

    if (previous === initialCommand) return;
    if (!/#recovery-\d+\s*$/i.test(initialCommand)) return;

    logTerminalSession('initial-command-recovery-reconnect', {
      panelId: id,
      previous,
      initialCommand,
    });
    hasSentInitialCommand.current = false;
    clearPanelInitialCommandLifecycle(id);
    reconnect();
  }, [ctxRef, id, initialCommand]);
  useEffect(() => {
    const {
      ENABLE_NATIVE_VTE,
      autoFocus,
      canvasAddonRef,
      clearConnectDeferTimer,
      clearOutputQueue,
      clearTimers,
      coalescedSoftGpuVisibilityReveal,
      coldMountOrdinal,
      connectAbortRef,
      connectDeferTimerRef,
      connectEpochRef,
      connectPendingUntilFitRef,
      connectRef,
      containerRef,
      currentPtyOffsetRef,
      cwd,
      disposeXtermRuntime,
      effectiveRequestedMode,
      fitRef,
      fontSize,
      grokTuiReadyRef,
      handleWebglContextLossRef,
      hasSentInitialCommand,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      id,
      initialCommand,
      isActivePanelRef,
      isDisposingRef,
      isEngineV2Ref,
      isGrokSessionRef,
      isInitializingRef,
      isVisibleInLayoutRef,
      lastPtySizeRef,
      logViewportDiagnostic,
      maybeConnectAfterViewportFit,
      nativeResizeObserverRef,
      nativeResizeRafRef,
      needsViewportSyncOnShowRef,
      operationalRendererModeRef,
      outputPendingRef,
      panelActivityTrackerRef,
      pendingWebglRecoveryRef,
      reconnect,
      rendererViewModel,
      requestedRendererMode,
      requestedRendererModeRef,
      resizeObserverRef,
      restored,
      runtimePhase,
      scheduleInactiveViewportRepaint,
      searchRef,
      sendResizeRef,
      serializeAddonRef,
      setConnectionState,
      setInitError,
      setIsInitializing,
      setWebglFallback,
      shouldBootXterm,
      stashTerminalPanelBridge,
      surfaceHostRef,
      termRef,
      terminalBlurCleanupRef,
      transportRef,
      tryReattachCanvasAddonRef,
      tryReattachWebglAddonRef,
      tuiResizeDebounceTimerRef,
      tuiSessionActiveRef,
      tuiSessionFooterConfirmedRef,
      visibleTerminalPanelCountRef,
      waitForVisibleDimensions,
      webglAddonRef,
      writeTerminalOutput,
      wsRef,
      xtermBootNonce,
    } = ctxRef.current;

    let mounted = true;

    if (!shouldBootXterm) {
      // Phase 4 terminal-engine-v2: stash the surface instead of disposing when
      // the renderer is told to stand down (e.g. surface host change).
      disposeXtermRuntime({ stashForV2: isEngineV2Ref.current });
      setInitError(null);
      setIsInitializing(runtimePhase === 'native-probing' || runtimePhase === 'native-opening');

      return () => {
        mounted = false;
        clearTimers();
        resizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current = null;
        if (nativeResizeRafRef.current) {
          cancelAnimationFrame(nativeResizeRafRef.current);
          nativeResizeRafRef.current = null;
        }
        disposeXtermRuntime({ stashForV2: isEngineV2Ref.current });
      };
    }

    async function initializeTerminal() {
      if (isInitializingRef.current || termRef.current) {
        cliLog(`CLIENT:${id}`, 'initializeTerminal() skipped ÔÇö runtime exists or init in flight');
        return;
      }
      isInitializingRef.current = true;
      cliLog(`CLIENT:${id}`, 'initializeTerminal() start', {
        cwd,
        autoFocus,
        requestedRendererMode: requestedRendererModeRef.current,
        effectiveRendererMode: rendererViewModel.effectiveMode,
      });
      try {
        // Core first — do not await WebGL/canvas before terminal.open (Turbopack cold
        // was paying ~10–17s on addon-webgl before first paint). Start GPU import in
        // parallel; attach after open via ctor or tryReattach*.
        const wantsWebgl = shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        const wantsCanvas = shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        const mountCanvasOnInit = shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });
        const gpuImportPromise = wantsWebgl
          ? import('@xterm/addon-webgl').catch((err) => {
              console.warn(`[TTY:${id}] Failed to import @xterm/addon-webgl:`, err?.message || err);
              return { failed: true };
            })
          : wantsCanvas && mountCanvasOnInit
            ? import('@xterm/addon-canvas').catch((err) => {
                console.warn(
                  `[TTY:${id}] Failed to import @xterm/addon-canvas:`,
                  err?.message || err
                );
                return { failed: true };
              })
            : null;

        markXtermCoreImportStart();
        const importResults = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-search'),
        ]);
        markXtermCoreImportDone();

        const [{ Terminal }, { FitAddon }, { SearchAddon }] = importResults;

        // Phase 3 terminal-engine-v2: load the SerializeAddon for periodic full
        // terminal snapshots. It is only needed on the v2 path.
        let SerializeAddonCtor = null;
        if (isEngineV2Ref.current) {
          try {
            const serializeModule = await import('@xterm/addon-serialize');
            SerializeAddonCtor = serializeModule.SerializeAddon ?? null;
          } catch (err) {
            console.warn(
              `[TTY:${id}] Failed to import @xterm/addon-serialize:`,
              err?.message || err
            );
          }
        }

        // Warm GPU module cache in parallel; attach happens after open via
        // needsGpuAfterInit → tryReattach* (must not block first-panel mark).
        if (gpuImportPromise) {
          void gpuImportPromise;
        }

        if (!mounted || !containerRef.current) {
          cliLog(
            `CLIENT:${id}`,
            'initializeTerminal() aborted ÔÇö unmounted or no container (after import)'
          );
          return;
        }

        if (termRef.current) {
          cliLog(`CLIENT:${id}`, 'initializeTerminal() aborted ÔÇö runtime won race after import');
          return;
        }

        // Phase 4 terminal-engine-v2: restore a stashed surface before building a
        // new xterm instance. The graveyard keeps the surface mounted-but-hidden;
        // we move its container back into the visible tree and reconnect.
        if (isEngineV2Ref.current && graveyardHasSurface(id)) {
          const stashed = graveyardRestoreSurface(id);
          if (stashed?.termInstance) {
            cliLog(`CLIENT:${id}`, 'restoring surface from graveyard');

            termRef.current = stashed.termInstance;
            fitRef.current = stashed.fitAddon || null;
            searchRef.current = stashed.searchAddon || null;
            webglAddonRef.current = stashed.webglAddon || null;
            canvasAddonRef.current = stashed.canvasAddon || null;
            serializeAddonRef.current = stashed.serializeAddon || null;

            if (containerRef.current) {
              containerRef.current.replaceChildren();
              if (stashed.termInstance.element) {
                containerRef.current.appendChild(stashed.termInstance.element);
              } else if (stashed.container) {
                containerRef.current.appendChild(stashed.container);
              }
            }

            if (terminalBlurCleanupRef.current) {
              terminalBlurCleanupRef.current();
              terminalBlurCleanupRef.current = null;
            }
            const blurTarget = stashed.termInstance.element || containerRef.current;
            const handleTerminalBlur = () =>
              prepareActiveTuiTerminalFocus(stashed.termInstance, {
                tuiSessionActive: tuiSessionActiveRef.current,
              });
            blurTarget?.addEventListener('focusout', handleTerminalBlur);
            terminalBlurCleanupRef.current = () => {
              blurTarget?.removeEventListener('focusout', handleTerminalBlur);
            };

            resizeObserverRef.current = new ResizeObserver(() => {
              if (isDisposingRef.current) return;
              if (!isVisibleInLayoutRef.current) {
                needsViewportSyncOnShowRef.current = true;
                return;
              }
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect || rect.width <= 0 || rect.height <= 0) return;
              logViewportDiagnostic('resize-observer');
              if (
                shouldRefitVisibleInactiveSplitPanel({
                  isActivePanel: isActivePanelRef.current,
                  isVisibleInLayout: isVisibleInLayoutRef.current,
                })
              ) {
                scheduleInactiveViewportRepaint();
                return;
              }
              const scheduleResize = () => sendResizeRef.current?.();
              if (tuiSessionActiveRef.current) {
                if (tuiResizeDebounceTimerRef.current) {
                  clearTimeout(tuiResizeDebounceTimerRef.current);
                }
                tuiResizeDebounceTimerRef.current = setTimeout(() => {
                  tuiResizeDebounceTimerRef.current = null;
                  scheduleResize();
                }, 160);
                return;
              }
              scheduleResize();
            });
            resizeObserverRef.current.observe(containerRef.current);

            cliLog(
              `LIFECYCLE:${id}`,
              'restore',
              buildTerminalLifecycleEvent({
                event: 'restore',
                panelId: id,
                renderer: requestedRendererModeRef.current,
                isVisible: isVisibleInLayoutRef.current,
                cols: stashed.termInstance?.cols,
                rows: stashed.termInstance?.rows,
              })
            );

            setInitError(null);
            setIsInitializing(false);
            isInitializingRef.current = false;

            // Reconnect to the sidecar and resume the subscription from the current offset.
            connectRef.current?.();
            return;
          }
        }

        const theme = getTerminalTheme();
        cliLog(`CLIENT:${id}`, 'computed theme colors', theme);

        // Font configuration comes from CSS variables via the central TerminalThemeSync
        // (opencode-vars.css / globals.css). This keeps the defaults (Kali thick style)
        // in a general CSS layer instead of inside the terminal component.
        const fontOpts = getTerminalFontOptions();

        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorWidth: 2,
          fontFamily: fontOpts.fontFamily || resolveTerminalFontFamily(),
          fontSize: fontSize,
          fontWeight: fontOpts.fontWeight,
          fontWeightBold: fontOpts.fontWeightBold,
          letterSpacing: fontOpts.letterSpacing,
          lineHeight: fontOpts.lineHeight,
          allowTransparency: false,
          // T2.3 ÔÇö per-pane scrollback buffer (R-BUF-3). The default
          // xterm scrollback is 1000 lines, which is too shallow for
          // director + 4 workers during a swarm launch: the user loses
          // the prompt injection context as soon as the TUI scrolls.
          // 5000 lines per pane ├ù 5 panes = 25K total per launch, well
          // under the xterm memory budget. Per-pane (not global) so
          // single-pane users don't pay the extra memory.
          scrollback: 5000,
          theme: theme,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);

        if (SerializeAddonCtor) {
          try {
            const serializeAddon = new SerializeAddonCtor();
            serializeAddonRef.current = serializeAddon;
            terminal.loadAddon(serializeAddon);
            cliLog(`CLIENT:${id}`, 'serialize-addon-attached');
          } catch (err) {
            console.warn(
              `[TTY:${id}] xterm-addon-serialize failed to register`,
              err?.message || err
            );
            serializeAddonRef.current = null;
          }
        }

        containerRef.current.replaceChildren();
        terminal.open(containerRef.current);
        if (isVisibleInLayoutRef.current) {
          markFirstPanelInteractive();
        }
        prepareActiveTuiTerminalFocus(terminal, {
          tuiSessionActive: tuiSessionActiveRef.current,
        });
        if (terminalBlurCleanupRef.current) {
          terminalBlurCleanupRef.current();
          terminalBlurCleanupRef.current = null;
        }
        const blurTarget = terminal.element || containerRef.current;
        let pendingBlurFocusCleanup = null;
        const handleTerminalBlur = () => {
          pendingBlurFocusCleanup?.();
          pendingBlurFocusCleanup = prepareActiveTuiTerminalFocusRespectingSelection(terminal, {
            tuiSessionActive: tuiSessionActiveRef.current,
          });
        };
        blurTarget?.addEventListener('focusout', handleTerminalBlur);
        terminalBlurCleanupRef.current = () => {
          pendingBlurFocusCleanup?.();
          pendingBlurFocusCleanup = null;
          blurTarget?.removeEventListener('focusout', handleTerminalBlur);
        };

        // DOM renderer only on open — GPU deferred (see gpuImportPromise + needsGpuAfterInit).
        attachTerminalRendererAddons({
          terminal,
          wantsWebgl: false,
          wantsCanvas: false,
          mountCanvasOnInit: false,
          WebglAddonCtor: null,
          CanvasAddonCtor: null,
          panelId: id,
          webglAddonRef,
          canvasAddonRef,
          setWebglFallback,
          pendingWebglRecoveryRef,
          handleWebglContextLossRef,
          isActivePanel: isActivePanelRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });

        terminal.onData((data) => {
          const sessionContext = {
            mode: tuiSessionActiveRef.current ? 'tui' : 'shell',
            tuiReady: isGrokSessionRef.current
              ? grokTuiReadyRef.current === true
              : tuiSessionFooterConfirmedRef.current === true,
            tuiAdapter: isGrokSessionRef.current
              ? 'grok'
              : tuiSessionActiveRef.current
                ? 'opencode'
                : 'shell',
            panelHidden: isVisibleInLayoutRef.current !== true,
            panelInactive: isActivePanelRef.current !== true,
          };
          const filtered = filterTerminalInputForSession(sessionContext, data);
          if (filtered === null) return;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (transportRef.current === 'raw') {
              wsRef.current.send(filtered);
            } else {
              wsRef.current.send(JSON.stringify({ type: 'input', data: filtered }));
            }
          }
        });

        resizeObserverRef.current = new ResizeObserver(() => {
          if (isDisposingRef.current) return;
          if (!isVisibleInLayoutRef.current) {
            needsViewportSyncOnShowRef.current = true;
            return;
          }
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          logViewportDiagnostic('resize-observer');
          if (
            shouldRefitVisibleInactiveSplitPanel({
              isActivePanel: isActivePanelRef.current,
              isVisibleInLayout: isVisibleInLayoutRef.current,
            })
          ) {
            scheduleInactiveViewportRepaint();
            return;
          }
          const scheduleResize = () => sendResizeRef.current?.();
          if (tuiSessionActiveRef.current) {
            if (tuiResizeDebounceTimerRef.current) {
              clearTimeout(tuiResizeDebounceTimerRef.current);
            }
            tuiResizeDebounceTimerRef.current = setTimeout(() => {
              tuiResizeDebounceTimerRef.current = null;
              scheduleResize();
            }, 160);
            return;
          }
          scheduleResize();
        });
        resizeObserverRef.current.observe(containerRef.current);

        termRef.current = terminal;
        fitRef.current = fitAddon;
        searchRef.current = searchAddon;

        // A.0 lifecycle telemetry: a fresh xterm runtime came online.
        cliLog(
          `LIFECYCLE:${id}`,
          'boot',
          buildTerminalLifecycleEvent({
            event: 'boot',
            panelId: id,
            renderer: requestedRendererModeRef.current,
            isVisible: isVisibleInLayoutRef.current,
            cols: terminal?.cols,
            rows: terminal?.rows,
          })
        );

        setInitError(null);
        setIsInitializing(false);

        void waitForVisibleDimensions()
          .then((ready) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions done', {
              ready,
              width: containerRef.current?.getBoundingClientRect().width,
              height: containerRef.current?.getBoundingClientRect().height,
            });

            if (!mounted || !containerRef.current || !termRef.current || !fitRef.current) {
              return;
            }

            logViewportDiagnostic(ready ? 'terminal-open-visible' : 'terminal-open-pending');

            let fitWorked = false;
            if (ready) {
              fitWorked = fitTerminalViewport({
                container: containerRef.current,
                fitAddon,
                term: termRef.current,
                socket: wsRef.current,
                clearAtlas: Boolean(canvasAddonRef.current),
                lastPtySizeRef: lastPtySizeRef.current,
              });
              stabilizeTerminalRenderer(termRef.current, {
                clearAtlas: Boolean(canvasAddonRef.current),
              });
              refreshTerminalViewport(termRef.current);
            } else {
              logViewportDiagnostic('terminal-open-timeout');
              connectPendingUntilFitRef.current = true;
            }

            if (ready) {
              if (!maybeConnectAfterViewportFit(fitWorked)) {
                connectPendingUntilFitRef.current = true;
              } else {
                sendResizeRef.current?.();
              }
            }

            if (!mounted || !termRef.current || !isVisibleInLayoutRef.current) return;

            const needsGpuAfterInit = needsGpuRendererReattach({
              operationalRendererMode: operationalRendererModeRef.current,
              webglAddon: webglAddonRef.current,
              canvasAddon: canvasAddonRef.current,
            });
            if (needsGpuAfterInit) {
              void (async () => {
                if (
                  shouldAttachWebglRenderer({
                    operationalRendererMode: operationalRendererModeRef.current,
                  })
                ) {
                  await tryReattachWebglAddonRef.current?.({
                    clearAtlas: false,
                    skipFitWhenUnchanged: true,
                  });
                } else {
                  await tryReattachCanvasAddonRef.current?.();
                }
                if (termRef.current && isVisibleInLayoutRef.current) {
                  coalescedSoftGpuVisibilityReveal(
                    termRef.current,
                    hiddenOutputBufferRef.current,
                    hiddenOutputCatchupPendingRef,
                    { reason: 'visibility-visible-soft-reveal' }
                  );
                  needsViewportSyncOnShowRef.current = false;
                }
              })();
            } else if (needsViewportSyncOnShowRef.current && termRef.current) {
              coalescedSoftGpuVisibilityReveal(
                termRef.current,
                hiddenOutputBufferRef.current,
                hiddenOutputCatchupPendingRef,
                { reason: 'visibility-visible-soft-reveal-pending' }
              );
              needsViewportSyncOnShowRef.current = false;
            }
          })
          .catch((error) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions failed', {
              error: error?.message,
            });
          });
      } catch (error) {
        console.error(`[TTY:${id}] initializeTerminal() failed:`, error);
        cliLog(`CLIENT:${id}`, 'initializeTerminal() failed', { error: error?.message });

        if (!mounted) return;

        setInitError('No se pudo inicializar la terminal en esta ventana.');
        setConnectionState('error');
        setIsInitializing(false);
        disposeXtermRuntime();
        clearTimers();
        return;
      } finally {
        isInitializingRef.current = false;
      }
    }

    const initStaggerMs = resolveColdMountStaggerMs({
      coldMountOrdinal,
      isVisibleInLayout: isVisibleInLayoutRef.current,
    });
    let initStaggerTimer = null;
    if (initStaggerMs > 0) {
      initStaggerTimer = setTimeout(() => {
        if (mounted) initializeTerminal();
      }, initStaggerMs);
    } else {
      initializeTerminal();
    }

    return () => {
      mounted = false;
      isInitializingRef.current = false;
      if (initStaggerTimer) clearTimeout(initStaggerTimer);
      clearTimers();
      clearConnectDeferTimer();
      resizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = null;
      if (nativeResizeRafRef.current) {
        cancelAnimationFrame(nativeResizeRafRef.current);
        nativeResizeRafRef.current = null;
      }
      // Silence the socket before closing so it doesn't set 'disconnected'
      // on the (possibly re-mounting) component during React Strict Mode double-invoke.
      // We do NOT null wsRef here; disposeXtermRuntime needs it to send the final
      // v2 snapshot before unsubscribing, and it nulls the ref after closing.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
      }
      // Phase 4 terminal-engine-v2: hide/close stashes the surface in the graveyard
      // instead of disposing it. Non-v2 paths and error recovery keep force-dispose.
      disposeXtermRuntime({ stashForV2: true });
    };
  }, [
    disposeXtermRuntime,
    requestedRendererMode,
    runtimePhase,
    shouldBootXterm,
    xtermBootNonce,
    coldMountOrdinal,
    id,
  ]);
  return { disposeXtermRuntime };
}

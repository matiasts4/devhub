/**
 * useTerminalRendererMigration — WebGL ↔ Canvas migration on split count changes.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 5).
 *
 * When split geometry changes, migrate between WebGL and Canvas renderers without
 * remounting the PTY; keep canvas on visible split siblings; re-attach canvas when
 * a panel becomes visible again.
 */
/* eslint-disable react-hooks/exhaustive-deps -- ctxRef bag */
import { useLayoutEffect, useEffect } from 'react';
import {
  cliLog,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  isTerminalRendererReady,
  refreshTerminalViewport,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalRendererMigration({
  ctxRef,
  isActivePanel,
  isVisibleInLayout,
  operationalRendererMode,
  shouldUseNativeRenderer,
  visibleTerminalPanelCount,
}) {
  // Migrate WebGL ↔ Canvas when split geometry changes, without remounting PTYs.
  useLayoutEffect(() => {
    const {
      id,
      termRef,
      webglAddonRef,
      canvasAddonRef,
      prevVisibleTerminalPanelCountRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      releaseWebglAddonForInactivePanel,
      releaseCanvasAddon,
    } = ctxRef.current;

    if (shouldUseNativeRenderer || !termRef.current) return;

    const prevCount = prevVisibleTerminalPanelCountRef.current;
    prevVisibleTerminalPanelCountRef.current = visibleTerminalPanelCount;

    const wantsWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const wantsCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });

    if (wantsWebgl) {
      if (canvasAddonRef.current) {
        releaseCanvasAddon('split-collapse-webgl');
      }
      if (!webglAddonRef.current) {
        if (prevCount > visibleTerminalPanelCount) {
          cliLog(`RENDER:${id}`, 'webgl-reattach-after-split-collapse');
        }
        void tryReattachWebglAddonRef.current?.({ clearAtlas: false });
      }
      return;
    }

    if (wantsCanvas) {
      if (webglAddonRef.current) {
        releaseWebglAddonForInactivePanel('split-open-canvas');
      }

      if (
        shouldMountCanvasAddon({
          operationalRendererMode,
          isActivePanel: isActivePanel,
          isVisibleInLayout: isVisibleInLayout,
          visibleTerminalPanelCount,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.();
      }
      return;
    }

    if (webglAddonRef.current) {
      releaseWebglAddonForInactivePanel('operational-dom-fallback');
    }
    if (canvasAddonRef.current) {
      releaseCanvasAddon('operational-dom-fallback');
    }
  }, [
    isActivePanel,
    isVisibleInLayout,
    operationalRendererMode,
    shouldUseNativeRenderer,
    visibleTerminalPanelCount,
  ]);

  // Keep canvas on all visible split siblings; DOM fallback corrupts TUIs with horizontal seams.
  useLayoutEffect(() => {
    const { termRef, canvasAddonRef, tryReattachCanvasAddonRef } = ctxRef.current;
    if (shouldUseNativeRenderer || !termRef.current) return;
    if (!shouldAttachCanvasRenderer({ operationalRendererMode })) return;
    if (!isVisibleInLayout) return;

    if (!canvasAddonRef.current) {
      void tryReattachCanvasAddonRef.current?.();
      return;
    }

    if (!isActivePanel && isTerminalRendererReady(termRef.current)) {
      refreshTerminalViewport(termRef.current);
    }
  }, [isActivePanel, isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);

  // Shared-surface / split layouts: re-attach canvas when a panel becomes visible again.
  useEffect(() => {
    const {
      termRef,
      canvasAddonRef,
      tryReattachCanvasAddonRef,
      isVisibleInLayoutRef,
      isDisposingRef,
      operationalRendererModeRef,
      connectPendingUntilFitRef,
    } = ctxRef.current;

    if (!isVisibleInLayout || shouldUseNativeRenderer || !termRef.current) return undefined;

    if (
      shouldMountCanvasAddon({
        operationalRendererMode,
        isActivePanel,
        isVisibleInLayout,
        visibleTerminalPanelCount,
      }) &&
      !canvasAddonRef.current
    ) {
      void tryReattachCanvasAddonRef.current?.();
    }

    const timer = window.setTimeout(() => {
      if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;

      const afterRendererReady = () => {
        if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;
        const canvasMode = shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        // Avoid refreshing WebGL panels from the canvas recovery timeout; the WebGL
        // renderer is handled by its own recovery path and this refresh only adds
        // visible flicker during a plain workspace switch.
        const { fitAndResize: currentFitAndResize } = ctxRef.current;
        if (canvasMode && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
        }
        if (connectPendingUntilFitRef.current) {
          currentFitAndResize({ clearAtlas: true });
        }
      };

      if (
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.().then(afterRendererReady);
        return;
      }

      afterRendererReady();
    }, 140);

    return () => window.clearTimeout(timer);
  }, [isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);
}

/**
 * useTerminalRendererState — renderer capability / WebGL fallback state.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
/* eslint-disable react-hooks/exhaustive-deps -- derived state intentionally mirrors props */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getTerminalRuntimePlatform,
  getTerminalRendererRuntimeCapabilities,
  resolveOperationalRendererMode,
  probeWebglSupport,
  TERMINAL_OPERATIONAL_CANVAS_MODE,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { resolveTerminalRendererViewModel } from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalRendererState({
  requestedRendererMode,
  visibleTerminalPanelCount,
  resolvedRuntimePlatform,
  nativeVteProbeResult,
  nativeVteOpenFailure,
  nativeVteOpened,
  onResetRendererToXterm,
  setXtermBootNonce,
}) {
  const tauriAvailable = false;

  // Master switch for the legacy native VTE (GTK) backend. Mirrors the constant
  // in TerminalTTY.jsx so vte-experimental requests stay test-routable.
  const ENABLE_NATIVE_VTE =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

  const effectiveRequestedMode =
    !ENABLE_NATIVE_VTE && requestedRendererMode === 'vte-experimental'
      ? 'xterm-webgl'
      : requestedRendererMode;

  const [webglProbeResult, setWebglProbeResult] = useState(() => probeWebglSupport());
  const [webglFallback, setWebglFallback] = useState(null);

  const webglFallbackRef = useRef(webglFallback);
  webglFallbackRef.current = webglFallback;

  const effectiveRendererModeRef = useRef('xterm-webgl');
  const operationalRendererModeRef = useRef('xterm-webgl');

  const rendererCapabilities = getTerminalRendererRuntimeCapabilities({
    platform: resolvedRuntimePlatform,
    tauriAvailable,
    nativeVteProbe: nativeVteProbeResult,
    nativeVteOpenFailure,
    webglProbe: webglProbeResult,
  });
  const rendererViewModel = resolveTerminalRendererViewModel({
    requestedRendererMode: effectiveRequestedMode,
    rendererCapabilities,
    nativeVteReady:
      ENABLE_NATIVE_VTE && effectiveRequestedMode === 'vte-experimental' && nativeVteOpened,
  });
  const operationalRendererMode = resolveOperationalRendererMode({
    requestedMode: effectiveRequestedMode,
    effectiveMode: rendererViewModel.effectiveMode,
    visibleTerminalPanelCount,
  });

  useLayoutEffect(() => {
    effectiveRendererModeRef.current = operationalRendererMode;
    operationalRendererModeRef.current = operationalRendererMode;
  }, [operationalRendererMode]);

  useEffect(() => {
    try {
      const result = probeWebglSupport();
      setWebglProbeResult((prev) => {
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    } catch {
      setWebglProbeResult((prev) => {
        const result = {
          ready: false,
          reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED,
        };
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    }
  }, []);

  useEffect(() => {
    if (operationalRendererMode === TERMINAL_OPERATIONAL_CANVAS_MODE) {
      if (
        webglFallback &&
        (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
      ) {
        setWebglFallback(null);
      }
      return;
    }

    if (
      requestedRendererMode === 'xterm-webgl' &&
      rendererViewModel.effectiveMode !== 'xterm-webgl'
    ) {
      setWebglFallback({
        active: true,
        reason:
          webglProbeResult?.reason || TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
      });
    } else if (
      webglFallback &&
      (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
    ) {
      setWebglFallback(null);
    }
  }, [
    operationalRendererMode,
    requestedRendererMode,
    rendererViewModel.effectiveMode,
    webglProbeResult,
    webglFallback,
  ]);

  const handleSwitchToXterm = useCallback(() => {
    if (typeof onResetRendererToXterm === 'function') {
      onResetRendererToXterm();
      return;
    }
    setWebglFallback(null);
    setWebglProbeResult(probeWebglSupport());
  }, [onResetRendererToXterm]);

  const handleRetryProbe = useCallback(() => {
    setWebglProbeResult(probeWebglSupport());
    setXtermBootNonce?.((n) => n + 1);
  }, [setXtermBootNonce]);

  return {
    operationalRendererMode,
    rendererViewModel,
    rendererCapabilities,
    webglFallback,
    webglProbeResult,
    handleSwitchToXterm,
    handleRetryProbe,
    effectiveRendererModeRef,
    operationalRendererModeRef,
    webglFallbackRef,
    setWebglFallback,
  };
}

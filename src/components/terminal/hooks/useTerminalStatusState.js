/**
 * useTerminalStatusState — derived status label / overlays.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
import { useMemo } from 'react';
import {
  shouldShowTerminalViewport,
  shouldShowTerminalLoadingOverlay,
  shouldShowTerminalStatusOverlay,
} from '@/components/terminal/TerminalTTY.helpers';
import { buildTerminalExitOverlayCopy } from '@/lib/terminal/agentSessionExit';

export default function useTerminalStatusState({
  isInitializing,
  initError,
  connectionState,
  hasConnectedOnce,
  sessionExitReason,
  initialCommand,
  webglFallback: _webglFallback,
  requestedRendererMode: _requestedRendererMode,
  shouldUseNativeRenderer,
}) {
  const isConnected = connectionState === 'connected';
  const showTerminalViewport =
    shouldShowTerminalViewport(isInitializing, initError) && !shouldUseNativeRenderer;
  const showTerminalLoadingOverlay = shouldShowTerminalLoadingOverlay(
    isInitializing,
    connectionState,
    hasConnectedOnce
  );
  const showTerminalStatusOverlay = shouldShowTerminalStatusOverlay(
    isInitializing,
    initError,
    connectionState
  );
  const exitOverlayCopy = useMemo(
    () =>
      buildTerminalExitOverlayCopy({
        initialCommand,
        reason: sessionExitReason,
        initError,
        connectionState,
      }),
    [initialCommand, sessionExitReason, initError, connectionState]
  );

  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'suspended'
      ? 'Suspendida'
      : connectionState === 'agent-exited'
        ? 'Agente finalizado'
        : connectionState === 'connecting'
          ? 'Conectando...'
          : connectionState === 'terminated'
            ? 'Finalizada'
            : 'Desconectado';

  return {
    isConnected,
    showTerminalViewport,
    showTerminalLoadingOverlay,
    showTerminalStatusOverlay,
    exitOverlayCopy,
    statusLabel,
  };
}

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
  webglFallback,
  requestedRendererMode,
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

  // Don't advertise "Conectando..." in the chrome — it made host switches and
  // first paint feel multi-second slow even when the shell was already usable.
  // Keep a quiet label until the socket is open.
  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'suspended'
      ? 'Suspendida'
      : connectionState === 'agent-exited'
        ? 'Agente finalizado'
        : connectionState === 'connecting'
          ? 'Listo'
          : connectionState === 'terminated'
            ? 'Finalizada'
            : connectionState === 'idle'
              ? 'Listo'
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

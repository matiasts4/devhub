/**
 * useTerminalWheelRouter — shell vs TUI wheel routing decisions.
 * Extracted from TerminalTTY.jsx.
 */

import { useCallback, useEffect } from 'react';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import {
  buildGrokWheelScrollPayload,
  buildTerminalWheelScrollPayload,
  buildTerminalWheelSgrSequence,
  forwardTerminalWheelToXterm,
  isForwardedTerminalWheelEvent,
  isGrokTuiInitialCommand,
  isTerminalTranscriptCell,
  resolveGrokWheelSgrCoords,
  resolveTerminalCellFromPointer,
  resolveTerminalPointerElement,
  resolveTerminalWheelInputZoneRows,
  resolveTerminalWheelPageSteps,
  resolveTerminalWheelScrollDirection,
  resolveTerminalWheelScrollPrefer,
  scrollTerminalViewport,
  sendTerminalPasteInput,
  shouldInjectTerminalWheelIntoPty,
  shouldPassthroughNativeTuiWheel,
  shouldRouteWheelToTranscript,
  shouldScrollKimiWheelLocally,
  shouldUseTerminalScrollbackWheel,
} from '@/components/terminal/TerminalTTY.helpers';

/**
 * True when document focus is inside the xterm host.
 * When focus is on Zed's composer (or any non-terminal UI), native wheel
 * passthrough can "succeed" at the xterm layer while the TUI ignores it —
 * prefer direct PTY SGR inject instead.
 */
export function terminalElementHasDocumentFocus(
  term,
  doc = typeof document !== 'undefined' ? document : null
) {
  if (!doc) return true;
  const el = term?.element;
  if (!el) return false;
  const active = doc.activeElement;
  if (!active) return false;
  return el === active || (typeof el.contains === 'function' && el.contains(active));
}

export function createTerminalWheelHandler({
  term,
  shell,
  initialCommand,
  lifecycleRefs,
  rendererRefs,
  sessionRefs,
  viewportRefs,
  sendTerminalPasteInput: sendPaste = sendTerminalPasteInput,
  resolveTerminalCellFromPointer: resolveCell = resolveTerminalCellFromPointer,
  shouldRouteWheelToTranscript: routeToTranscript = shouldRouteWheelToTranscript,
  terminalHasFocus = terminalElementHasDocumentFocus,
}) {
  return function handleWheel(event) {
    if (isForwardedTerminalWheelEvent(event)) return;

    const activeTerm = term || rendererRefs?.current?.termRef?.current;
    if (!activeTerm) return;

    if (shouldUseTerminalScrollbackWheel(event)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      const lines = resolveTerminalWheelPageSteps(event.deltaY) * 3;
      activeTerm.scrollLines(direction === 'up' ? -lines : lines);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const lifecycle = lifecycleRefs?.current || {};
    const isGrokSession =
      lifecycle.isGrokSessionRef?.current || isGrokTuiInitialCommand(initialCommand);
    const isKimiSession =
      lifecycle.kimiReadyNotifiedRef?.current || isKimiLaunchCommand(initialCommand);
    const isTuiSession = lifecycle.tuiSessionActiveRef?.current || isGrokSession;

    if (shouldScrollKimiWheelLocally(isKimiSession)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      if (
        scrollTerminalViewport(activeTerm, direction, event.deltaY, {
          linesPerStep: 1,
          lineHeight: 60,
          maxSteps: 4,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (!shouldInjectTerminalWheelIntoPty(isTuiSession)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      if (scrollTerminalViewport(activeTerm, direction, event.deltaY)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // Native passthrough only when the terminal actually has document focus.
    // Zed ambient modal focuses its textarea on open; xterm may still have mouse
    // modes on, but OpenCode/Grok often ignore forwarded wheel while unfocused.
    // Fall through to PTY SGR inject in that case (scroll keeps working).
    if (
      shouldPassthroughNativeTuiWheel({
        isGrokSession,
        isKimiSession,
        grokTuiReady: lifecycle.grokTuiReadyRef?.current,
        kimiTuiReady: lifecycle.kimiReadyNotifiedRef?.current,
        opencodeFooterConfirmed: lifecycle.tuiSessionFooterConfirmedRef?.current,
      }) &&
      lifecycle.isActivePanelRef?.current &&
      terminalHasFocus(activeTerm)
    ) {
      // Only consume when xterm can emit SGR (mouse modes on). After panel hide
      // mouse modes are cleared — dispatchEvent alone would swallow the wheel.
      // Cold-start / missing term.element / mouse-off → fall through to inject.
      if (forwardTerminalWheelToXterm(activeTerm, event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const inputZoneRows = resolveTerminalWheelInputZoneRows({ isGrokSession, isKimiSession });
    const containerRef = viewportRefs?.current?.containerRef;
    const pointerEl = resolveTerminalPointerElement(
      activeTerm,
      containerRef?.current,
      shell || viewportRefs?.current?.viewportShellRef?.current
    );
    const cell = resolveCell(activeTerm, pointerEl, event.clientX, event.clientY);
    if (cell && lifecycle.lastPointerZoneRef) {
      lifecycle.lastPointerZoneRef.current = isTerminalTranscriptCell(
        cell.row,
        activeTerm.rows,
        inputZoneRows
      )
        ? 'transcript'
        : 'input';
    }

    const inTranscript = routeToTranscript({
      cell,
      rows: activeTerm.rows,
      lastPointerZone: lifecycle.lastPointerZoneRef?.current,
      inputZoneRows,
    });
    if (!inTranscript) {
      if (isTuiSession) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    const direction = resolveTerminalWheelScrollDirection(event.deltaY);
    if (!direction) return;

    const TERMINAL_WHEEL_MAX_PAGE_STEPS = 2;
    const rawSteps = resolveTerminalWheelPageSteps(event.deltaY);
    const steps = Math.max(1, Math.min(TERMINAL_WHEEL_MAX_PAGE_STEPS, rawSteps));
    let wheelCol = cell?.col ?? Math.max(0, Math.floor((activeTerm.cols || 80) / 2));
    let wheelRow = cell?.row ?? Math.max(0, Math.floor((activeTerm.rows || 24) * 0.35));

    if (isTuiSession) {
      const coords = resolveGrokWheelSgrCoords(cell, activeTerm, inputZoneRows);
      wheelCol = coords.col;
      wheelRow = coords.row;
    }

    const scrollPrefer = resolveTerminalWheelScrollPrefer(initialCommand, {
      isGrokSession,
      isKimiSession,
      tuiActive: lifecycle.tuiSessionActiveRef?.current,
    });
    const payload = isGrokSession
      ? buildGrokWheelScrollPayload(direction, wheelCol, wheelRow, steps)
      : scrollPrefer === 'sgr'
        ? buildTerminalWheelSgrSequence(direction, wheelCol, wheelRow)
        : buildTerminalWheelScrollPayload(direction, steps, { prefer: scrollPrefer });

    const wsRef = sessionRefs?.current?.wsRef;
    const transportRef = sessionRefs?.current?.transportRef;
    const sent = sendPaste({
      socket: wsRef?.current,
      transport: transportRef?.current,
      text: payload,
    });
    if (!sent) return;

    event.preventDefault();
    event.stopPropagation();
  };
}

export default function useTerminalWheelRouter({
  lifecycleRefs,
  rendererRefs,
  sessionRefs,
  viewportRefs,
  initialCommand,
  shouldUseNativeRenderer,
}) {
  const onWheel = useCallback(
    (event) => {
      const shell = viewportRefs?.current?.viewportShellRef?.current;
      const handler = createTerminalWheelHandler({
        shell,
        initialCommand,
        lifecycleRefs,
        rendererRefs,
        sessionRefs,
        viewportRefs,
      });
      handler(event);
    },
    [initialCommand, lifecycleRefs, rendererRefs, sessionRefs, viewportRefs]
  );

  useEffect(() => {
    if (shouldUseNativeRenderer) return undefined;

    const shell = viewportRefs?.current?.viewportShellRef?.current;
    if (!shell) return undefined;

    const handler = createTerminalWheelHandler({
      shell,
      initialCommand,
      lifecycleRefs,
      rendererRefs,
      sessionRefs,
      viewportRefs,
    });

    shell.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => shell.removeEventListener('wheel', handler, { capture: true });
  }, [
    initialCommand,
    lifecycleRefs,
    rendererRefs,
    sessionRefs,
    viewportRefs,
    shouldUseNativeRenderer,
  ]);

  return { onWheel };
}

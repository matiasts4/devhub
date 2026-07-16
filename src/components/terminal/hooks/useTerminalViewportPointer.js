/**
 * useTerminalViewportPointer — mouse-down zone detection + TUI mouse injection.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 *
 * TUI transcript clicks are deferred to short-click (mouseup without drag) so
 * selection drags are not stolen by PTY mouse injection.
 */

import { useCallback, useEffect, useRef } from 'react';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import {
  sendTerminalPasteInput,
  resolveTerminalCellFromPointer,
  isTerminalTranscriptCell,
  buildTerminalMousePressSequence,
  resolveTerminalWheelInputZoneRows,
  prepareActiveTuiTerminalFocusRespectingSelection,
  scheduleTuiTranscriptMouseInjection,
  isGrokTuiInitialCommand,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalViewportPointer({ ctxRef }) {
  const pendingInjectionCleanupRef = useRef(null);
  const pendingFocusCleanupRef = useRef(null);

  useEffect(
    () => () => {
      pendingInjectionCleanupRef.current?.();
      pendingInjectionCleanupRef.current = null;
      pendingFocusCleanupRef.current?.();
      pendingFocusCleanupRef.current = null;
    },
    []
  );

  const handleViewportMouseDown = useCallback(
    (event) => {
      const c = ctxRef.current;
      const {
        id,
        initialCommand,
        shouldUseNativeRenderer,
        nativeVteOpened,
        onActivatePanel,
        termRef,
        viewportShellRef,
        isGrokSessionRef,
        grokTuiReadyRef,
        kimiReadyNotifiedRef,
        tuiSessionActiveRef,
        tuiSessionFooterConfirmedRef,
        lastPointerZoneRef,
        wsRef,
        transportRef,
        isVisibleInLayoutRef,
        focusNativeVtePanel,
        handleNativeLeaseCommandError,
      } = c;

      if (shouldUseNativeRenderer) {
        onActivatePanel?.(id);
        if (nativeVteOpened) {
          Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
            handleNativeLeaseCommandError
          );
        }
        return;
      }

      const term = termRef.current;
      const shell = viewportShellRef.current;
      const cell =
        event && shell && term
          ? resolveTerminalCellFromPointer(term, shell, event.clientX, event.clientY)
          : null;
      const grokSession = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
      const isKimiSession = kimiReadyNotifiedRef.current || isKimiLaunchCommand(initialCommand);
      const inputZoneRows = resolveTerminalWheelInputZoneRows({
        isGrokSession: grokSession,
        isKimiSession,
      });
      const inTranscript = cell
        ? isTerminalTranscriptCell(cell.row, term.rows, inputZoneRows)
        : lastPointerZoneRef.current !== 'input';

      if (inTranscript) {
        lastPointerZoneRef.current = 'transcript';
      } else {
        lastPointerZoneRef.current = 'input';
      }

      const tuiActive = Boolean(tuiSessionActiveRef.current || grokSession);
      pendingFocusCleanupRef.current?.();
      pendingFocusCleanupRef.current = prepareActiveTuiTerminalFocusRespectingSelection(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
        deferMouseUntilPointerUp: tuiActive,
      });
      term?.focus?.();

      const tuiReady = grokSession
        ? grokTuiReadyRef.current === true
        : tuiSessionFooterConfirmedRef.current === true;
      const eligible =
        Boolean(inTranscript) &&
        Boolean(cell) &&
        tuiActive &&
        tuiReady &&
        isVisibleInLayoutRef.current === true;

      pendingInjectionCleanupRef.current?.();
      pendingInjectionCleanupRef.current = scheduleTuiTranscriptMouseInjection({
        event,
        cell,
        eligible,
        inject: (clickCell) => {
          const payload = buildTerminalMousePressSequence(clickCell.col, clickCell.row);
          sendTerminalPasteInput({
            socket: wsRef.current,
            transport: transportRef.current,
            text: payload,
          });
        },
      });
    },
    [ctxRef]
  );

  return { handleViewportMouseDown };
}

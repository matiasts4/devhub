/**
 * useTerminalViewportPointer — mouse-down zone detection + TUI mouse injection.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback } from 'react';
import { isGrokTuiInitialCommand, isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { sendTerminalPasteInput } from '@/components/terminal/TerminalTTY.helpers';
import {
  resolveTerminalCellFromPointer,
  isTerminalTranscriptCell,
  buildTerminalMousePressSequence,
  resolveTerminalWheelInputZoneRows,
  prepareActiveTuiTerminalFocus,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalViewportPointer({ ctxRef }) {
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
          Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(handleNativeLeaseCommandError);
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

      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      term?.focus?.();

      const tuiReady = grokSession
        ? grokTuiReadyRef.current === true
        : tuiSessionFooterConfirmedRef.current === true;
      const tuiActive = tuiSessionActiveRef.current || grokSession;
      if (inTranscript && cell && tuiActive && tuiReady && isVisibleInLayoutRef.current === true) {
        const payload = buildTerminalMousePressSequence(cell.col, cell.row);
        sendTerminalPasteInput({
          socket: wsRef.current,
          transport: transportRef.current,
          text: payload,
        });
      }
    },
    [ctxRef]
  );

  return { handleViewportMouseDown };
}

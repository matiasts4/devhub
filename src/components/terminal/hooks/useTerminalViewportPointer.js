/**
 * useTerminalViewportPointer — mouse-down zone detection + TUI mouse injection.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 *
 * TUI clicks are deferred to short-click (mouseup without drag) so
 * selection drags are not stolen by PTY mouse injection. Inject covers
 * transcript and input/footer chrome — native DECSET alone is unreliable
 * while mouse modes are deferred until pointer-up.
 */

import { useCallback, useEffect, useRef } from 'react';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { isOpenCodeLaunchCommand } from '@/lib/terminal/opencodeReadyMarker';
import { logTuiPointerDebug } from '@/lib/terminal/tuiPointerDebug';
import {
  sendTerminalPasteInput,
  resolveTerminalCellFromPointer,
  isTerminalTranscriptCell,
  buildTerminalMousePressSequence,
  resolveTerminalWheelInputZoneRows,
  prepareActiveTuiTerminalFocusRespectingSelection,
  scheduleTuiTranscriptMouseInjection,
  shouldScrollAgentWheelLocally,
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
        isActivePanelRef,
        focusNativeVtePanel,
        handleNativeLeaseCommandError,
        agentTypeRef,
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

      // Ctrl/Cmd+click is reserved for agent file-path open (xterm link provider).
      // Skip TUI mouse injection so the link activate handler can win.
      if (event?.ctrlKey || event?.metaKey) {
        onActivatePanel?.(id);
        logTuiPointerDebug('tui-pointer', {
          path: 'modifier-file-open',
          panelId: id,
          zone: 'transcript',
          cell: null,
          term: termRef.current,
          eligible: false,
        });
        return;
      }

      const term = termRef.current;
      const shell = viewportShellRef.current;
      const cell =
        event && shell && term
          ? resolveTerminalCellFromPointer(term, shell, event.clientX, event.clientY)
          : null;
      const grokSession = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
      const opencodeSession = isOpenCodeLaunchCommand(initialCommand);
      const isKimiSession = kimiReadyNotifiedRef.current || isKimiLaunchCommand(initialCommand);
      const inputZoneRows = resolveTerminalWheelInputZoneRows({
        isGrokSession: grokSession,
        isKimiSession,
      });
      const inTranscript = cell
        ? isTerminalTranscriptCell(cell.row, term.rows, inputZoneRows)
        : lastPointerZoneRef.current !== 'input';
      const zone = inTranscript ? 'transcript' : 'input';

      if (inTranscript) {
        lastPointerZoneRef.current = 'transcript';
      } else {
        lastPointerZoneRef.current = 'input';
      }

      // Include launch-command TUI identity — tuiSessionActiveRef lags until footer/chrome.
      // Passing false here used to write mouse-off on every Grok/OpenCode mousedown.
      // Inline-scroll agents (kimi, qodercli, claude, codex) never use host mouse:
      // the server marks them mode=tui, but enabling DECSET here kills text
      // selection and injects clicks the TUI ignores. Keep mouse off for them.
      const inlineScrollAgent = shouldScrollAgentWheelLocally(
        initialCommand,
        agentTypeRef?.current
      );
      const tuiActive = Boolean(
        !inlineScrollAgent &&
        (tuiSessionActiveRef.current || grokSession || opencodeSession || isKimiSession)
      );
      pendingFocusCleanupRef.current?.();
      pendingFocusCleanupRef.current = prepareActiveTuiTerminalFocusRespectingSelection(term, {
        tuiSessionActive: tuiActive,
        deferMouseUntilPointerUp: tuiActive,
      });
      term?.focus?.();

      const tuiReady = grokSession
        ? grokTuiReadyRef.current === true
        : tuiSessionFooterConfirmedRef.current === true;
      // Inject anywhere on the grid once we know it's a TUI — footer buttons live in
      // the input zone and never got a fallback when DECSET was deferred/off.
      // Ready flags are diagnostic-only here (wheel already injects while cold).
      const eligible = Boolean(cell) && tuiActive && isVisibleInLayoutRef.current === true;

      let path = 'ineligible';
      if (!cell) path = 'no-cell';
      else if (!tuiActive) path = 'shell-no-inject';
      else if (isVisibleInLayoutRef.current !== true) path = 'hidden-layout';
      else if (eligible) path = 'inject-click-scheduled';

      logTuiPointerDebug('tui-pointer', {
        path,
        panelId: id,
        zone,
        cell,
        term,
        tuiSessionActive: Boolean(tuiSessionActiveRef.current),
        grokTuiReady: grokTuiReadyRef.current === true,
        opencodeFooterConfirmed: tuiSessionFooterConfirmedRef.current === true,
        isActivePanel: isActivePanelRef?.current === true,
        tuiReady,
        eligible,
        extra: { grokSession, opencodeSession, tuiActive },
      });

      pendingInjectionCleanupRef.current?.();
      pendingInjectionCleanupRef.current = scheduleTuiTranscriptMouseInjection({
        event,
        cell,
        eligible,
        inject: (clickCell) => {
          const payload = buildTerminalMousePressSequence(clickCell.col, clickCell.row);
          const sent = sendTerminalPasteInput({
            socket: wsRef.current,
            transport: transportRef.current,
            text: payload,
          });
          logTuiPointerDebug('tui-pointer', {
            path: sent ? 'inject-click' : 'inject-click-failed',
            panelId: id,
            zone,
            cell: clickCell,
            term,
            eligible: true,
          });
        },
      });
    },
    [ctxRef]
  );

  return { handleViewportMouseDown };
}

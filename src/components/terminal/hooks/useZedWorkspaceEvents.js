/**
 * useZedWorkspaceEvents — Zed action event handlers for workspace/terminal integration.
 * Extracted from TerminalWorkspacesManager.jsx.
 */

import { useEffect, useRef } from 'react';
import { subscribeZedWorkspaceAction } from '@/lib/asistente/zedWorkspaceActionEvent';
import { dispatchZedOverlayToggle } from '@/lib/asistente/zedOverlayEvents';
import { applyZedOpenTerminalFocus } from '@/components/asistente/zedOpenTerminalFocus';
import {
  isValidZedOpenTerminalEvent,
  resolveZedOpenTerminalPanelId,
} from '@/components/zedOpenTerminalEvent';
import { coerceZedOpenUrlFocus, isValidZedOpenUrlEvent } from '@/components/zedOpenUrlEvent';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';
import { applyZedOpenUrlDockUpdate } from '@/components/workspace/rightDockLayout';
import { buildBrowserWindowLabel } from '@/components/workspace/browserWindowState';
import { setDisplayName as setPanelDisplayNameInStore } from '@/lib/terminal/panelDisplayName';
import { countPanelsInColumns } from '@/lib/terminal/workspaceSurfaceReconcile';
import {
  MAX_ZED_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';

export default function useZedWorkspaceEvents({
  projectId,
  activeWsId,
  activePanelId,
  rightDockState,
  workspacesRef,
  activeWsIdRef,
  activePanelIdsRef,
  handleSplit,
  handleClosePanel,
  getAllPanelIds,
  activateWorkspacePanel,
  setFocusedPanelByWorkspace,
  updateRightDockState,
  updateBrowserWindowState,
  setWorkspaces,
  setRestoreSettingsModal,
}) {
  const lastZedOpenUrlRef = useRef({ url: null, label: null });
  const rightDockStateRef = useRef(rightDockState);
  rightDockStateRef.current = rightDockState;

  useEffect(() => {
    const handleZedOpenTerminal = (e) => {
      if (!isValidZedOpenTerminalEvent(e.detail)) return;
      const { command, cwd, session_id, focus = false, displayName: zedDisplayName } = e.detail;
      const explicitPanelId = resolveZedOpenTerminalPanelId(e.detail, null);

      const targetWsId = activeWsIdRef.current || activeWsId;
      if (!targetWsId) return;

      const targetWorkspace = workspacesRef.current.find((ws) => ws.id === targetWsId);
      const currentPanelCount = countPanelsInColumns(targetWorkspace?.columns || []);
      const resolvedSourcePanelId =
        activePanelIdsRef.current[targetWsId] ||
        activePanelId ||
        getAllPanelIds(targetWorkspace?.columns || [])[0] ||
        null;

      if (currentPanelCount > 0 && !resolvedSourcePanelId) return;

      if (isWorkspaceTerminalPanelLimitReached(currentPanelCount, MAX_ZED_TERMINAL_PANELS)) {
        console.warn(
          `[Zed] Terminal open blocked: limit ${MAX_ZED_TERMINAL_PANELS} panels (current ${currentPanelCount})`
        );
        return;
      }

      console.log(
        `[Zed] Opening terminal command=${command} cwd=${cwd} session_id=${session_id} focus=${focus}`
      );
      const newPanelId = handleSplit(
        'horizontal',
        resolvedSourcePanelId,
        command,
        cwd || null,
        explicitPanelId
      );
      if (!newPanelId) return;

      const maximizedView = rightDockStateRef.current?.maximizedView ?? null;
      applyZedOpenTerminalFocus(
        targetWsId,
        newPanelId,
        { focus },
        {
          activateWorkspacePanel,
          setFocusedPanelByWorkspace,
          updateRightDockState,
          maximizedView,
        }
      );

      if (typeof zedDisplayName === 'string' && zedDisplayName.trim()) {
        const cleanName = zedDisplayName.trim();
        const renameResult = setPanelDisplayNameInStore(newPanelId, targetWsId, cleanName);
        if (renameResult?.ok) {
          setWorkspaces((prev) =>
            prev.map((ws) => {
              if (ws.id !== targetWsId) return ws;
              return {
                ...ws,
                columns: ws.columns.map((col) => ({
                  ...col,
                  panels: col.panels.map((p) =>
                    p.id === newPanelId ? { ...p, displayName: cleanName } : p
                  ),
                })),
              };
            })
          );
        }
      }

      if (maximizedView === 'pizarra' && typeof window !== 'undefined') {
        logPizarraBrowser('zed-open-terminal:in-pizarra', { panelId: newPanelId, focus });
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
        }, 400);
      }
    };

    const handleZedTerminalInput = (e) => {
      const detail = e?.detail;
      if (!detail || typeof detail.input !== 'string') return;
      const panelId = detail.terminalId || detail.session_id || detail.panelId || null;
      if (!panelId) return;
      window.dispatchEvent(
        new CustomEvent('devhub:zed-terminal-input', {
          detail: { panelId, terminalId: panelId, input: detail.input },
        })
      );
    };

    const handleZedCloseTerminal = (e) => {
      const sessionId = e?.detail?.session_id;
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        handleClosePanel(sessionId);
      }
    };

    const handleZedCloseUrl = () => {
      const wsId = activeWsIdRef.current || activeWsId;
      if (wsId) {
        updateBrowserWindowState(wsId, {
          open: false,
          updatedAt: Date.now(),
        });
      }
      updateRightDockState((currentState) => ({
        ...currentState,
        browserUrl: null,
      }));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
      }
    };

    const handleZedOpenUrl = (e) => {
      logPizarraBrowser('zed-open-url:received', { detail: e?.detail ?? null });
      if (!isValidZedOpenUrlEvent(e.detail)) {
        logPizarraBrowser('zed-open-url:rejected-invalid', { detail: e?.detail ?? null });
        return;
      }
      const { url, label } = e.detail;
      const focus = coerceZedOpenUrlFocus(e.detail?.focus, true);
      const last = lastZedOpenUrlRef.current;
      if (focus !== true && last.url === url && (last.label ?? null) === (label ?? null)) {
        logPizarraBrowser('zed-open-url:skipped-idempotent', { url, label, focus });
        return;
      }
      lastZedOpenUrlRef.current = { url, label: label ?? null };

      const wsId = activeWsIdRef.current || activeWsId;
      if (wsId) {
        updateBrowserWindowState(wsId, {
          open: true,
          url,
          label: label || buildBrowserWindowLabel(projectId, wsId),
          pizarraLayoutPriority: focus === true,
          updatedAt: Date.now(),
        });
        logPizarraBrowser('zed-open-url:browser-state', { wsId, url, focus });
      }

      updateRightDockState((currentState) => {
        const next = applyZedOpenUrlDockUpdate(currentState, { url, focus });
        logPizarraBrowser('zed-open-url:dock-state', {
          activeTab: next.activeTab,
          maximizedView: next.maximizedView,
          visible: next.visible,
          browserUrl: next.browserUrl,
        });
        return next;
      });

      if (focus === true && typeof window !== 'undefined') {
        const dispatchArrangeFit = () => {
          logPizarraBrowser('zed-open-url:arrange-fit-dispatch');
          window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
        };
        window.setTimeout(dispatchArrangeFit, 400);
        window.setTimeout(dispatchArrangeFit, 720);
        window.setTimeout(dispatchArrangeFit, 1200);
      }
    };

    const handleZedWorkspaceAction = ({ action, section }) => {
      if (action === 'open_restore_settings') {
        setRestoreSettingsModal({ open: true, section });
      } else if (action === 'close_restore_settings') {
        setRestoreSettingsModal({ open: false });
      } else if (action === 'toggle_pizarra') {
        dispatchZedOverlayToggle?.('pizarra');
      } else if (action === 'arrange_pizarra') {
        updateRightDockState((currentState) => {
          const isCurrentlyPizarra =
            currentState?.maximized && currentState?.maximizedView === 'pizarra';
          if (!isCurrentlyPizarra) {
            const nextEpoch = (Number(currentState?.browserLayoutEpoch) || 0) + 1;
            return {
              ...currentState,
              visible: true,
              activeTab: 'pizarra',
              maximized: true,
              maximizedView: 'pizarra',
              browserLayoutEpoch: nextEpoch,
            };
          }
          return currentState;
        });

        const dispatchArrangeFit = () => {
          logPizarraBrowser('zed-workspace-action:arrange-fit-dispatch');
          window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
        };
        dispatchArrangeFit();
        window.setTimeout(dispatchArrangeFit, 200);
        window.setTimeout(dispatchArrangeFit, 400);
        window.setTimeout(dispatchArrangeFit, 720);
        window.setTimeout(dispatchArrangeFit, 1200);
      }
    };

    window.addEventListener('devhub:zed-open-terminal', handleZedOpenTerminal);
    window.addEventListener('devhub:zed-close-terminal', handleZedCloseTerminal);
    window.addEventListener('devhub:zed-close-url', handleZedCloseUrl);
    window.addEventListener('devhub:zed-terminal-input', handleZedTerminalInput);
    window.addEventListener('devhub:zed-open-url', handleZedOpenUrl);
    const unsubscribeWorkspaceAction = subscribeZedWorkspaceAction(handleZedWorkspaceAction);

    return () => {
      unsubscribeWorkspaceAction();
      window.removeEventListener('devhub:zed-open-terminal', handleZedOpenTerminal);
      window.removeEventListener('devhub:zed-close-terminal', handleZedCloseTerminal);
      window.removeEventListener('devhub:zed-close-url', handleZedCloseUrl);
      window.removeEventListener('devhub:zed-terminal-input', handleZedTerminalInput);
      window.removeEventListener('devhub:zed-open-url', handleZedOpenUrl);
    };
  }, [
    activePanelId,
    activeWsId,
    activateWorkspacePanel,
    getAllPanelIds,
    handleClosePanel,
    handleSplit,
    projectId,
    setFocusedPanelByWorkspace,
    setRestoreSettingsModal,
    setWorkspaces,
    updateBrowserWindowState,
    updateRightDockState,
    activePanelIdsRef,
    activeWsIdRef,
    workspacesRef,
  ]);
}

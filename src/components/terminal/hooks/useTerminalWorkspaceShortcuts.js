/**
 * useTerminalWorkspaceShortcuts — keyboard shortcut wiring for workspace terminals.
 * Extracted from TerminalWorkspacesManager.jsx.
 */

import { useEffect, useRef } from 'react';
import {
  isTerminalWorkspaceUiAction,
  resolveTerminalNavigationAction,
  resolveTerminalShortcutAction,
  resolveTerminalWorkspaceAction,
  shouldHandleTerminalFocusExitShortcut,
  shouldHandleTerminalFocusShortcut,
  shouldHandleTerminalNavigationShortcut,
  shouldHandleTerminalShortcut,
  shouldHandleTerminalWorkspaceShortcut,
} from '@/components/terminal/workspaceShortcuts';

export default function useTerminalWorkspaceShortcuts({
  isVisible,
  workspaceTerminalSetupOpen,
  managerRootRef,
  activeWsIdRef,
  workspacesRef,
  focusedPanelByWorkspaceRef,
  clearPanelFocusMode,
  applyTerminalNavigationAction,
  applyTerminalWorkspaceAction,
  activateWorkspacePanel,
  handleSplit,
}) {
  const workspaceTerminalSetupOpenRef = useRef(workspaceTerminalSetupOpen);
  workspaceTerminalSetupOpenRef.current = workspaceTerminalSetupOpen;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (workspaceTerminalSetupOpenRef.current) {
        return;
      }

      const rootElement = managerRootRef.current;
      const activeElement = document?.activeElement || null;
      const currentWorkspaceId = activeWsIdRef.current;
      const focusModeActive = Boolean(focusedPanelByWorkspaceRef.current[currentWorkspaceId]);

      if (
        shouldHandleTerminalFocusExitShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
          focusModeActive,
        })
      ) {
        e.preventDefault();
        clearPanelFocusMode(currentWorkspaceId);
        return;
      }

      if (
        shouldHandleTerminalFocusShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        if (applyTerminalNavigationAction('togglePanelFocus')) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (
        shouldHandleTerminalNavigationShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        const navAction = resolveTerminalNavigationAction(e);
        if (!navAction) return;
        if (applyTerminalNavigationAction(navAction)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (
        shouldHandleTerminalWorkspaceShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        const workspaceAction = resolveTerminalWorkspaceAction(e);
        if (!workspaceAction) return;
        if (applyTerminalWorkspaceAction(workspaceAction)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!shouldHandleTerminalShortcut(e, { isVisible, rootElement, activeElement })) return;

      const action = resolveTerminalShortcutAction(e);
      if (!action) return;

      e.preventDefault();

      if (action === 'splitDown') {
        handleSplit('vertical');
        return;
      }

      if (action === 'splitRight') {
        handleSplit('horizontal');
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    applyTerminalNavigationAction,
    applyTerminalWorkspaceAction,
    clearPanelFocusMode,
    focusedPanelByWorkspaceRef,
    handleSplit,
    isVisible,
    managerRootRef,
    activeWsIdRef,
  ]);

  useEffect(() => {
    const handleNativeVteRuntimeEvent = (event) => {
      const detail = event.detail || {};

      if (detail.type === 'navigation-shortcut') {
        const action = typeof detail.action === 'string' ? detail.action.trim() : '';
        if (!action) return;
        if (isTerminalWorkspaceUiAction(action)) {
          applyTerminalWorkspaceAction(action);
        } else {
          applyTerminalNavigationAction(action);
        }
        return;
      }

      if (detail.type !== 'panel-activated') return;

      const panelId = typeof detail.panelId === 'string' ? detail.panelId.trim() : '';
      if (!panelId) return;

      const workspaceId =
        workspacesRef.current.find((workspace) =>
          workspace?.columns?.some((column) =>
            (column.panels || []).some((panel) => panel.id === panelId)
          )
        )?.id || null;

      if (!workspaceId) return;
      activateWorkspacePanel(workspaceId, panelId);
    };

    window.addEventListener('devhub:terminal-native-vte-event', handleNativeVteRuntimeEvent);
    return () => {
      window.removeEventListener('devhub:terminal-native-vte-event', handleNativeVteRuntimeEvent);
    };
  }, [
    activateWorkspacePanel,
    applyTerminalNavigationAction,
    applyTerminalWorkspaceAction,
    workspacesRef,
  ]);
}

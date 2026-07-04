/**
 * useTerminalWorkspaceShortcuts — keyboard shortcut wiring for workspace terminals.
 * Extracted from TerminalWorkspacesManager.jsx.
 */

import { useEffect, useRef } from 'react';
import {
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
  focusedPanelByWorkspaceRef,
  clearPanelFocusMode,
  applyTerminalNavigationAction,
  applyTerminalWorkspaceAction,
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
}

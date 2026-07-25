export const TERMINAL_WORKSPACE_SHORTCUTS = {
  splitDown: 'Ctrl+Shift+D',
  splitRight: 'Ctrl+Shift+R',
  closePanel: 'Ctrl+Shift+W ×2',
  openBrowserDock: 'Ctrl+Shift+B',
  openEditorDock: 'Ctrl+Shift+E',
  closeRightDock: 'Ctrl+Shift+.',
  newWorkspace: 'Ctrl+Shift+N',
  previousWorkspace: 'Ctrl+ArrowUp (Ctrl+PageUp)',
  nextWorkspace: 'Ctrl+ArrowDown (Ctrl+PageDown)',
  panelLeft: 'Ctrl+Shift+ArrowLeft',
  panelRight: 'Ctrl+Shift+ArrowRight',
  panelUp: 'Ctrl+Shift+ArrowUp (workspace if no vertical split)',
  panelDown: 'Ctrl+Shift+ArrowDown (workspace if no vertical split)',
  togglePanelFocus: 'Ctrl+Shift+F',
  exitPanelFocus: 'Escape',
};

export const CLOSE_PANEL_SHORTCUT_ARM_MS = 2000;

export function isEditableElement(element) {
  if (!element || typeof element !== 'object') return false;

  const tagName = String(element.tagName || '').toLowerCase();
  return (
    element.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export function isTerminalViewportElement(element) {
  if (!element || typeof element !== 'object') return false;
  return Boolean(element.closest?.('[data-testid="terminal-viewport-shell"]'));
}

function shouldBlockShortcutForEditableFocus(activeElement) {
  if (!isEditableElement(activeElement)) return false;
  // xterm (and similar emulators) keep focus on a hidden textarea inside the viewport.
  if (isTerminalViewportElement(activeElement)) return false;
  return true;
}

function isDomNode(value) {
  return Boolean(value && typeof value.nodeType === 'number');
}

function isContainedByRoot(rootElement, candidate) {
  if (!isDomNode(rootElement) || !isDomNode(candidate)) return false;
  return rootElement.contains(candidate);
}

function isTerminalPageAmbientFocus(activeElement) {
  if (typeof document === 'undefined') return false;
  return (
    activeElement == null ||
    activeElement === document.body ||
    activeElement === document.documentElement
  );
}

export function resolveTerminalShortcutAction(event) {
  if (!event?.ctrlKey || event?.metaKey) return null;

  const key = String(event.key || '');
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  if (event.shiftKey && !event.altKey) {
    if (normalizedKey === 'd') return 'splitDown';
    if (normalizedKey === 'r') return 'splitRight';
    if (normalizedKey === 'f') return 'togglePanelFocus';
  }

  return null;
}

export function resolveTerminalWorkspaceAction(event) {
  if (!event?.ctrlKey || event?.metaKey || event?.altKey || !event.shiftKey) return null;

  const key = String(event.key || '');
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  if (normalizedKey === 'b') return 'openBrowserDock';
  if (normalizedKey === 'e') return 'openEditorDock';
  if (normalizedKey === 'n') return 'newWorkspace';
  if (normalizedKey === 'w') return 'closePanel';
  if (key === '.' || key === '>' || event.code === 'Period') return 'closeRightDock';

  return null;
}

export function isTerminalWorkspaceUiAction(action) {
  return (
    action === 'openBrowserDock' ||
    action === 'openEditorDock' ||
    action === 'closeRightDock' ||
    action === 'newWorkspace' ||
    action === 'closePanel'
  );
}

export function resolveTerminalNavigationAction(event) {
  if (!event?.ctrlKey || event?.metaKey || event?.altKey) return null;

  const key = String(event.key || '');

  if (!event.shiftKey) {
    if (key === 'PageUp' || key === 'ArrowUp') return 'previousWorkspace';
    if (key === 'PageDown' || key === 'ArrowDown') return 'nextWorkspace';
    return null;
  }

  if (key === 'PageUp') return 'previousWorkspace';
  if (key === 'PageDown') return 'nextWorkspace';

  if (!key.startsWith('Arrow')) return null;

  if (key === 'ArrowUp') return 'panelUp';
  if (key === 'ArrowDown') return 'panelDown';
  if (key === 'ArrowLeft') return 'panelLeft';
  if (key === 'ArrowRight') return 'panelRight';
  return null;
}

export function resolveTerminalFocusExitAction(event, { focusModeActive } = {}) {
  if (!focusModeActive) return null;
  if (event?.ctrlKey || event?.metaKey || event?.altKey || event?.shiftKey) return null;
  if (String(event?.key || '') !== 'Escape') return null;
  return 'exitPanelFocus';
}

export function shouldHandleTerminalShortcut(
  event,
  { isVisible, rootElement, activeElement } = {}
) {
  const action = resolveTerminalShortcutAction(event);
  if (!action || action === 'togglePanelFocus' || !isVisible || !rootElement || !activeElement) {
    return false;
  }
  if (!isContainedByRoot(rootElement, activeElement)) return false;
  if (isTerminalViewportElement(activeElement)) return false;
  if (isEditableElement(activeElement)) return false;
  return true;
}

export function shouldHandleTerminalNavigationShortcut(
  event,
  { isVisible, rootElement, activeElement } = {}
) {
  const action = resolveTerminalNavigationAction(event);
  if (!action || !isVisible || !rootElement) return false;
  if (shouldBlockShortcutForEditableFocus(activeElement)) return false;

  const focusInRoot = isContainedByRoot(rootElement, activeElement);
  const eventTarget = event?.target && typeof event.target === 'object' ? event.target : null;
  const targetInRoot = isContainedByRoot(rootElement, eventTarget);
  const ambientTerminalFocus = isTerminalPageAmbientFocus(activeElement);

  if (!focusInRoot && !targetInRoot && !ambientTerminalFocus) return false;
  return true;
}

export function shouldHandleTerminalWorkspaceShortcut(
  event,
  { isVisible, rootElement, activeElement } = {}
) {
  const action = resolveTerminalWorkspaceAction(event);
  if (!action || !isVisible || !rootElement) return false;
  if (shouldBlockShortcutForEditableFocus(activeElement)) return false;

  const focusInRoot = isContainedByRoot(rootElement, activeElement);
  const eventTarget = event?.target && typeof event.target === 'object' ? event.target : null;
  const targetInRoot = isContainedByRoot(rootElement, eventTarget);
  const ambientTerminalFocus = isTerminalPageAmbientFocus(activeElement);

  if (!focusInRoot && !targetInRoot && !ambientTerminalFocus) return false;
  return true;
}

export function shouldHandleTerminalFocusShortcut(
  event,
  { isVisible, rootElement, activeElement } = {}
) {
  const action = resolveTerminalShortcutAction(event);
  if (action !== 'togglePanelFocus' || !isVisible || !rootElement) return false;
  if (shouldBlockShortcutForEditableFocus(activeElement)) return false;

  const focusInRoot = isContainedByRoot(rootElement, activeElement);
  const eventTarget = event?.target && typeof event.target === 'object' ? event.target : null;
  const targetInRoot = isContainedByRoot(rootElement, eventTarget);
  const ambientTerminalFocus = isTerminalPageAmbientFocus(activeElement);

  if (!focusInRoot && !targetInRoot && !ambientTerminalFocus) return false;
  return true;
}

export function shouldHandleTerminalFocusExitShortcut(
  event,
  { isVisible, rootElement, activeElement, focusModeActive } = {}
) {
  if (!resolveTerminalFocusExitAction(event, { focusModeActive })) return false;
  if (!isVisible || !rootElement || !activeElement) return false;
  if (!isContainedByRoot(rootElement, activeElement)) return false;
  if (isTerminalViewportElement(activeElement)) return false;
  if (isEditableElement(activeElement)) return false;
  return true;
}

export function getOrderedWorkspaceIds(workspaces) {
  if (!Array.isArray(workspaces)) return [];
  return workspaces.map((workspace) => workspace?.id).filter(Boolean);
}

export function getAdjacentWorkspaceId(workspaces, activeWsId, direction) {
  const orderedIds = getOrderedWorkspaceIds(workspaces);
  if (!orderedIds.length || !activeWsId) return null;

  const activeIndex = orderedIds.indexOf(activeWsId);
  if (activeIndex === -1) return null;

  const offset = direction === 'previous' ? -1 : direction === 'next' ? 1 : 0;
  if (!offset) return null;

  const targetIndex = (activeIndex + offset + orderedIds.length) % orderedIds.length;
  return orderedIds[targetIndex] || null;
}

export function findPanelCoordinates(columns, panelId) {
  if (!Array.isArray(columns) || !panelId) return null;

  for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
    const panels = columns[colIndex]?.panels || [];
    const panelIndex = panels.findIndex((panel) => panel?.id === panelId);
    if (panelIndex !== -1) {
      return {
        colIndex,
        panelIndex,
        columnId: columns[colIndex]?.id || null,
      };
    }
  }

  return null;
}

export function getAdjacentPanelId(columns, activePanelId, direction) {
  const coords = findPanelCoordinates(columns, activePanelId);
  if (!coords) return null;

  const { colIndex, panelIndex } = coords;

  if (direction === 'up') {
    if (panelIndex <= 0) return null;
    return columns[colIndex]?.panels?.[panelIndex - 1]?.id || null;
  }

  if (direction === 'down') {
    const panels = columns[colIndex]?.panels || [];
    if (panelIndex >= panels.length - 1) return null;
    return panels[panelIndex + 1]?.id || null;
  }

  if (direction === 'left') {
    if (colIndex <= 0) return null;
    const targetPanels = columns[colIndex - 1]?.panels || [];
    if (!targetPanels.length) return null;
    const targetIndex = Math.min(panelIndex, targetPanels.length - 1);
    return targetPanels[targetIndex]?.id || null;
  }

  if (direction === 'right') {
    if (colIndex >= columns.length - 1) return null;
    const targetPanels = columns[colIndex + 1]?.panels || [];
    if (!targetPanels.length) return null;
    const targetIndex = Math.min(panelIndex, targetPanels.length - 1);
    return targetPanels[targetIndex]?.id || null;
  }

  return null;
}

export function resolveHorizontalNavigation(workspaces, workspace, activePanelId, direction) {
  const panelDirection = direction === 'previous' ? 'left' : 'right';
  const adjacentPanelId = getAdjacentPanelId(workspace?.columns, activePanelId, panelDirection);
  if (adjacentPanelId) {
    return { type: 'panel', panelId: adjacentPanelId };
  }

  const workspaceId = getAdjacentWorkspaceId(workspaces, workspace?.id, direction);
  if (workspaceId) {
    return { type: 'workspace', workspaceId };
  }

  return null;
}

export function resolveVerticalNavigation(workspaces, workspace, activePanelId, direction) {
  const panelDirection = direction === 'previous' ? 'up' : 'down';
  const adjacentPanelId = getAdjacentPanelId(workspace?.columns, activePanelId, panelDirection);
  if (adjacentPanelId) {
    return { type: 'panel', panelId: adjacentPanelId };
  }

  const workspaceId = getAdjacentWorkspaceId(workspaces, workspace?.id, direction);
  if (workspaceId) {
    return { type: 'workspace', workspaceId };
  }

  return null;
}

export function resolvePanelNavigationDirection(action) {
  if (action === 'panelUp') return 'up';
  if (action === 'panelDown') return 'down';
  if (action === 'panelLeft') return 'left';
  if (action === 'panelRight') return 'right';
  return null;
}

export const TERMINAL_WORKSPACE_SHORTCUTS = {
  splitDown: 'Ctrl+Shift+D',
  splitRight: 'Ctrl+Shift+R',
  closePanel: 'Ctrl+Shift+W',
  previousWorkspace: 'Ctrl+Shift+PageUp',
  nextWorkspace: 'Ctrl+Shift+PageDown',
};

function isEditableElement(element) {
  if (!element || typeof element !== 'object') return false;

  const tagName = String(element.tagName || '').toLowerCase();
  return (
    element.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export function resolveTerminalShortcutAction(event) {
  if (!event?.ctrlKey || event?.metaKey) return null;

  const key = String(event.key || '');
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  if (event.shiftKey && !event.altKey) {
    if (normalizedKey === 'd') return 'splitDown';
    if (normalizedKey === 'r') return 'splitRight';
    if (normalizedKey === 'w') return 'closePanel';
    if (normalizedKey === 'PageUp') return 'previousWorkspace';
    if (normalizedKey === 'PageDown') return 'nextWorkspace';
  }

  return null;
}

export function shouldHandleTerminalShortcut(
  event,
  { isVisible, rootElement, activeElement } = {}
) {
  const action = resolveTerminalShortcutAction(event);
  if (!action || !isVisible || !rootElement || !activeElement) return false;
  if (!rootElement.contains(activeElement)) return false;
  const eventTarget = event?.target instanceof Node ? event.target : null;
  const terminalViewport = eventTarget?.closest?.('[data-testid="terminal-viewport-shell"]');
  if (terminalViewport) return false;
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

import { isEditableElement } from '@/components/terminal/workspaceShortcuts';

/**
 * Whether a clipboard keydown/paste handler on a terminal panel should run.
 * Active panels must not steal Ctrl+Shift+V from modals or other inputs.
 */
export function terminalClipboardEventBelongsToPanel({
  rootElement,
  activeElement,
  eventTarget,
  isActivePanel = false,
} = {}) {
  if (!rootElement) return false;

  const activeInRoot = Boolean(activeElement && rootElement.contains(activeElement));
  const targetInRoot = Boolean(eventTarget && rootElement.contains(eventTarget));

  if (activeInRoot || targetInRoot) return true;

  if (isEditableElement(activeElement) && !rootElement.contains(activeElement)) {
    return false;
  }

  if (isEditableElement(eventTarget) && !rootElement.contains(eventTarget)) {
    return false;
  }

  return Boolean(isActivePanel);
}

export function readClipboardTextFromEvent(clipboardEvent) {
  if (!clipboardEvent?.clipboardData) return null;
  const text = clipboardEvent.clipboardData.getData('text/plain');
  return typeof text === 'string' && text.length > 0 ? text : null;
}

export async function readClipboardText({ clipboardEvent } = {}) {
  const fromEvent = readClipboardTextFromEvent(clipboardEvent);
  if (fromEvent) return fromEvent;

  try {
    const api = globalThis?.navigator?.clipboard;
    if (api?.readText) {
      const text = await api.readText();
      if (typeof text === 'string' && text.length > 0) return text;
    }
  } catch {
    // WebKitGTK often blocks async clipboard reads — fall through to Tauri GTK.
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const text = await invoke('read_system_clipboard_text');
    if (typeof text === 'string' && text.length > 0) return text;
  } catch {
    // Browser dev mode or non-Tauri runtime.
  }

  return null;
}

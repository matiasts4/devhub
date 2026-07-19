import { isEditableElement } from '@/components/terminal/workspaceShortcuts';
import {
  invokeDesktop,
  isElectronDesktop,
  detectDesktopRuntime,
} from '@/lib/desktop/desktopBridge';

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

async function invokeClipboardCommand(command, payload = {}) {
  if (isElectronDesktop()) {
    return invokeDesktop(command, payload, {
      failureShape: { __desktopFail: true, reason: 'desktop-unavailable' },
      tauriWrapRequest: false,
    });
  }

  if (detectDesktopRuntime() === 'tauri') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(command, payload);
    } catch {
      return { __desktopFail: true };
    }
  }

  return { __desktopFail: true, reason: 'web' };
}

function isDesktopFail(result) {
  return Boolean(result && typeof result === 'object' && result.__desktopFail);
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
    // WebKitGTK often blocks async clipboard reads — fall through to desktop bridge.
  }

  const result = await invokeClipboardCommand('read_system_clipboard_text');
  if (isDesktopFail(result)) return null;
  if (typeof result === 'string' && result.length > 0) return result;
  if (result && typeof result.text === 'string' && result.text.length > 0) return result.text;
  return null;
}

export function readClipboardImageFromEvent(clipboardEvent) {
  if (!clipboardEvent?.clipboardData) return null;
  const items = clipboardEvent.clipboardData.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item?.kind === 'file' && typeof item.type === 'string' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return { file, mimeType: item.type };
    }
  }
  return null;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    // ponytail: browser-only helper; FileReader is absent in Jest/node lint env
    const reader = new globalThis.FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not produce a data URL'));
        return;
      }
      const comma = result.indexOf(',');
      if (comma === -1) {
        reject(new Error('Invalid data URL'));
        return;
      }
      resolve({ data: result.slice(comma + 1), mimeType: file.type });
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

export async function saveClipboardImageToTempFile({ data, mimeType } = {}) {
  if (!data) return null;
  const extension = typeof mimeType === 'string' ? mimeType.split('/')[1] : 'png';
  const result = await invokeClipboardCommand('write_clipboard_image_to_temp_file', {
    dataBase64: data,
    extension,
  });
  if (isDesktopFail(result)) return null;
  if (typeof result === 'string' && result.length > 0) return result;
  if (result && typeof result.path === 'string' && result.path.length > 0) return result.path;
  return null;
}

export async function readClipboardImage({ clipboardEvent } = {}) {
  const fromEvent = readClipboardImageFromEvent(clipboardEvent);
  if (fromEvent) {
    return fileToBase64(fromEvent.file);
  }

  try {
    const api = globalThis?.navigator?.clipboard;
    if (api?.read) {
      const items = await api.read();
      for (const item of items) {
        for (const type of item.types) {
          if (typeof type === 'string' && type.startsWith('image/')) {
            const blob = await item.getType(type);
            const extension = type.split('/')[1] || 'png';
            const file = new File([blob], `paste.${extension}`, { type });
            return fileToBase64(file);
          }
        }
      }
    }
  } catch {
    // WebKitGTK / restricted contexts block async clipboard reads.
  }

  const image = await invokeClipboardCommand('read_system_clipboard_image');
  if (isDesktopFail(image) || !image) return null;
  if (image?.data) {
    return { data: image.data, mimeType: image.mime_type || image.mimeType || 'image/png' };
  }
  return null;
}

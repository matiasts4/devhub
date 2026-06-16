/** Global Zed voice push-to-talk shortcut (toggle start/stop listen). */
export const ZED_VOICE_TOGGLE_SHORTCUT_LABEL = 'Ctrl+Shift+M';

export function isZedVoiceToggleShortcut(event) {
  if (!event) return false;
  const key = event.key;
  if (key !== 'm' && key !== 'M') return false;
  if (!event.shiftKey) return false;
  return Boolean(event.metaKey || event.ctrlKey);
}

/** Skip when user is typing in a field outside Zed overlay composer. */
export function shouldIgnoreVoiceShortcut(target) {
  if (!target || typeof target !== 'object') return false;
  const el = /** @type {HTMLElement} */ (target);
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input' || tag === 'select') {
    return !el.closest('[data-zed-voice-composer]');
  }
  if (el.isContentEditable) return !el.closest('[data-zed-voice-composer]');
  return false;
}

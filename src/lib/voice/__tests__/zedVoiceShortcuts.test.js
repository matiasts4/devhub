/**
 * @jest-environment jsdom
 */
const { isZedVoiceToggleShortcut, shouldIgnoreVoiceShortcut } = require('../zedVoiceShortcuts');

describe('zedVoiceShortcuts', () => {
  test('detects Ctrl+Shift+M', () => {
    expect(
      isZedVoiceToggleShortcut({ key: 'M', shiftKey: true, ctrlKey: true, metaKey: false })
    ).toBe(true);
  });

  test('ignores without shift', () => {
    expect(isZedVoiceToggleShortcut({ key: 'M', ctrlKey: true })).toBe(false);
  });

  test('ignores shortcuts in unrelated inputs', () => {
    const input = document.createElement('input');
    expect(shouldIgnoreVoiceShortcut(input)).toBe(true);
  });

  test('allows shortcut in zed composer', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-zed-voice-composer', '1');
    const textarea = document.createElement('textarea');
    wrap.appendChild(textarea);
    document.body.appendChild(wrap);
    expect(shouldIgnoreVoiceShortcut(textarea)).toBe(false);
    document.body.removeChild(wrap);
  });
});

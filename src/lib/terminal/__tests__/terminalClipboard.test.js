import {
  readClipboardTextFromEvent,
  terminalClipboardEventBelongsToPanel,
} from '../terminalClipboard';

describe('terminalClipboardEventBelongsToPanel()', () => {
  test('returns false when focus is in an external textarea even if panel is active', () => {
    const root = { contains: (node) => node?.id === 'inside-root' };
    const textarea = { id: 'modal-textarea', tagName: 'TEXTAREA', isContentEditable: false };

    expect(
      terminalClipboardEventBelongsToPanel({
        rootElement: root,
        activeElement: textarea,
        eventTarget: textarea,
        isActivePanel: true,
      })
    ).toBe(false);
  });

  test('returns true for active panel when focus is not in another editable control', () => {
    const shell = { id: 'inside-root', tagName: 'DIV', isContentEditable: false };
    const root = { contains: (node) => node?.id === 'inside-root' };

    expect(
      terminalClipboardEventBelongsToPanel({
        rootElement: root,
        activeElement: shell,
        eventTarget: shell,
        isActivePanel: true,
      })
    ).toBe(true);
  });
});

describe('readClipboardTextFromEvent()', () => {
  test('reads plain text from a paste event', () => {
    const event = {
      clipboardData: {
        getData: (type) => (type === 'text/plain' ? 'hello swarm' : ''),
      },
    };

    expect(readClipboardTextFromEvent(event)).toBe('hello swarm');
  });
});

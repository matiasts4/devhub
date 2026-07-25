/**
 * Mouse-mode probe + OpenCode wheel restore after panel deactivate.
 */

const { installDom } = require('@/test-support/domHarness');
const {
  terminalHasActiveMouseReporting,
  terminalHasDomFocus,
  terminalCanNativeWheelPassthrough,
  forwardTerminalWheelToXterm,
  reconcileOpenCodeTuiWheelReadiness,
  shouldBlockInlineAgentMouseModes,
  TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ,
  TERMINAL_DISABLE_FOCUS_REPORTING_SEQ,
} = require('../TerminalTTY.helpers');

beforeAll(() => {
  installDom();
});

describe('terminalHasActiveMouseReporting', () => {
  test('returns false when mouseTrackingMode is 0 or missing', () => {
    expect(terminalHasActiveMouseReporting(null)).toBe(false);
    expect(
      terminalHasActiveMouseReporting({
        _core: { coreService: { decPrivateModes: { mouseTrackingMode: 0 } } },
      })
    ).toBe(false);
    expect(terminalHasActiveMouseReporting({ element: {} })).toBe(false);
  });

  test('returns true when mouseTrackingMode > 0', () => {
    expect(
      terminalHasActiveMouseReporting({
        _core: { coreService: { decPrivateModes: { mouseTrackingMode: 2 } } },
      })
    ).toBe(true);
  });
});

describe('terminalHasDomFocus / native wheel gate', () => {
  test('returns false when focus is outside the terminal (Zed overlay input)', () => {
    const root = document.createElement('div');
    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    document.body.appendChild(root);
    const overlayInput = document.createElement('input');
    document.body.appendChild(overlayInput);
    overlayInput.focus();

    const term = { element: root, textarea };
    expect(terminalHasDomFocus(term)).toBe(false);
    expect(
      terminalCanNativeWheelPassthrough({
        ...term,
        _core: { coreService: { decPrivateModes: { mouseTrackingMode: 2 } } },
      })
    ).toBe(false);

    overlayInput.remove();
    root.remove();
  });

  test('returns true when xterm textarea holds focus', () => {
    const root = document.createElement('div');
    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    document.body.appendChild(root);
    textarea.focus();

    expect(terminalHasDomFocus({ element: root, textarea })).toBe(true);

    root.remove();
  });
});

describe('forwardTerminalWheelToXterm', () => {
  test('returns false when mouse modes are off even if element exists', () => {
    const term = {
      element: { dispatchEvent: jest.fn(() => true), contains: () => true },
      textarea: document.body,
      _core: { coreService: { decPrivateModes: { mouseTrackingMode: 0 } } },
    };
    expect(forwardTerminalWheelToXterm(term, { type: 'wheel', deltaY: 100 })).toBe(false);
    expect(term.element.dispatchEvent).not.toHaveBeenCalled();
  });

  test('returns false when mouse modes on but terminal unfocused (modal stole focus)', () => {
    const root = document.createElement('div');
    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    document.body.appendChild(root);
    const overlayInput = document.createElement('input');
    document.body.appendChild(overlayInput);
    overlayInput.focus();

    const term = {
      element: Object.assign(root, { dispatchEvent: jest.fn(() => true) }),
      textarea,
      _core: { coreService: { decPrivateModes: { mouseTrackingMode: 2 } } },
    };
    expect(forwardTerminalWheelToXterm(term, { type: 'wheel', deltaY: 100 })).toBe(false);
    expect(term.element.dispatchEvent).not.toHaveBeenCalled();

    overlayInput.remove();
    root.remove();
  });
});

describe('reconcileOpenCodeTuiWheelReadiness on panel reactivate', () => {
  test('assumeTuiIfReattached rebinds mouse without waiting for footer paint', () => {
    const tuiSessionActiveRef = { current: true };
    const tuiSessionFooterConfirmedRef = { current: false };
    const setNative = jest.fn();
    const writes = [];
    const term = { write: (s) => writes.push(s) };

    const ok = reconcileOpenCodeTuiWheelReadiness({
      term,
      initialCommand: 'opencode',
      tuiSessionActiveRef,
      tuiSessionFooterConfirmedRef,
      setNativeWheelPassthrough: setNative,
      assumeTuiIfReattached: true,
    });

    expect(ok).toBe(true);
    expect(tuiSessionFooterConfirmedRef.current).toBe(true);
    expect(setNative).toHaveBeenCalledWith(true);
    expect(writes.join('')).toContain(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
    expect(writes.join('')).toContain(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
  });
});

describe('shouldBlockInlineAgentMouseModes', () => {
  test('blocks for every inline-scroll agent type via launch command', () => {
    for (const cmd of ['kimi', 'qodercli', 'claude', 'codex']) {
      expect(shouldBlockInlineAgentMouseModes({ initialCommand: cmd })).toBe(true);
    }
  });

  test('blocks via server-detected agentType even without launch command', () => {
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: '', agentType: 'qodercli' })).toBe(
      true
    );
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: '', agentType: 'claude' })).toBe(
      true
    );
  });

  test('blocks for kimi via ready flag (mid-session detection)', () => {
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: '', kimiReady: true })).toBe(true);
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: '', isKimiLaunch: true })).toBe(true);
  });

  test('does not block for alt-screen mouse TUIs or plain shells', () => {
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: 'grok' })).toBe(false);
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: 'opencode' })).toBe(false);
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: 'bash' })).toBe(false);
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: '' })).toBe(false);
  });

  test('does not false-positive on qoder config paths', () => {
    expect(shouldBlockInlineAgentMouseModes({ initialCommand: 'vim .qoder/AGENTS.md' })).toBe(
      false
    );
  });
});

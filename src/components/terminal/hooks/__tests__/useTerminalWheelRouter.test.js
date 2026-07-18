/**
 * Guard tests for useTerminalWheelRouter — shell vs TUI wheel routing.
 */

const { installDom } = require('@/test-support/domHarness');
const { createTerminalWheelHandler } = require('../useTerminalWheelRouter');

beforeAll(() => {
  installDom();
});

function createWheelEvent(deltaY = 100) {
  return {
    deltaY,
    clientX: 50,
    clientY: 50,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  };
}

describe('useTerminalWheelRouter', () => {
  it('routes shell wheel to local scrollback when TUI is inactive', () => {
    const scrollLines = jest.fn();
    const term = { scrollLines, cols: 80, rows: 24 };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'bash',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: false },
          isGrokSessionRef: { current: false },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: false },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: null }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(scrollLines).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('injects wheel into PTY when TUI session is active and in transcript zone', () => {
    const sendPaste = jest.fn(() => true);
    const term = { cols: 80, rows: 24, scrollLines: jest.fn() };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'grok',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: true },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: false },
          isActivePanelRef: { current: false },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('cold-start Grok (ready=false) injects SGR into PTY instead of native passthrough', () => {
    const sendPaste = jest.fn(() => true);
    const term = {
      cols: 80,
      rows: 24,
      scrollLines: jest.fn(),
      element: document.createElement('div'),
    };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'grok',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: true },
          kimiReadyNotifiedRef: { current: false },
          // Cold first session: session known as Grok, chrome not confirmed yet
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: false },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    const payload = sendPaste.mock.calls[0][0].text;
    // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
    expect(payload).toMatch(/\x1b\[<6[45];/);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('falls back to SGR inject when native passthrough forward fails', () => {
    const sendPaste = jest.fn(() => true);
    // No term.element → forwardTerminalWheelToXterm returns false
    const term = { cols: 80, rows: 24, scrollLines: jest.fn() };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'grok',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: true },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: true },
          tuiSessionFooterConfirmedRef: { current: false },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('when terminal lacks document focus (Zed modal open) injects SGR instead of native passthrough', () => {
    const sendPaste = jest.fn(() => true);
    const termEl = document.createElement('div');
    const term = {
      cols: 80,
      rows: 24,
      scrollLines: jest.fn(),
      element: termEl,
      // Mouse modes ON — native forward would succeed and swallow the wheel,
      // but OpenCode ignores it while Zed's composer holds focus.
      _core: { coreService: { decPrivateModes: { mouseTrackingMode: 1 } } },
    };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'opencode',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: false },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: true },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
      // Simulate Zed composer focused (terminal unfocused)
      terminalHasFocus: () => false,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    const payload = sendPaste.mock.calls[0][0].text;
    // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
    expect(payload).toMatch(/\x1b\[<6[45];/);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('OpenCode footer-ready with mouse modes off injects SGR instead of swallowing wheel', () => {
    const sendPaste = jest.fn(() => true);
    const term = {
      cols: 80,
      rows: 24,
      scrollLines: jest.fn(),
      element: document.createElement('div'),
      // Panel deactivate cleared DECSET mouse tracking — dispatchEvent would
      // succeed but xterm would not emit SGR 64/65.
      _core: { coreService: { decPrivateModes: { mouseTrackingMode: 0 } } },
    };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'opencode',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: false },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: true },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    const payload = sendPaste.mock.calls[0][0].text;
    // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
    expect(payload).toMatch(/\x1b\[<6[45];/);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('TUI wheel over input zone injects SGR instead of swallowing', () => {
    const sendPaste = jest.fn(() => true);
    const term = { cols: 80, rows: 24, scrollLines: jest.fn() };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'opencode',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: false },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: true },
          isActivePanelRef: { current: false },
          lastPointerZoneRef: { current: 'input' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 23 }),
      shouldRouteWheelToTranscript: () => false,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
    expect(sendPaste.mock.calls[0][0].text).toMatch(/\x1b\[<6[45];/);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('OpenCode with mouse modes on but focus stolen by Zed modal injects SGR', () => {
    const sendPaste = jest.fn(() => true);
    const root = document.createElement('div');
    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    document.body.appendChild(root);
    const overlayInput = document.createElement('input');
    document.body.appendChild(overlayInput);
    overlayInput.focus();

    const term = {
      cols: 80,
      rows: 24,
      scrollLines: jest.fn(),
      element: root,
      textarea,
      _core: { coreService: { decPrivateModes: { mouseTrackingMode: 2 } } },
    };
    const handler = createTerminalWheelHandler({
      term,
      initialCommand: 'opencode',
      lifecycleRefs: {
        current: {
          tuiSessionActiveRef: { current: true },
          isGrokSessionRef: { current: false },
          kimiReadyNotifiedRef: { current: false },
          grokTuiReadyRef: { current: false },
          tuiSessionFooterConfirmedRef: { current: true },
          isActivePanelRef: { current: true },
          lastPointerZoneRef: { current: 'transcript' },
        },
      },
      rendererRefs: { current: { termRef: { current: term } } },
      sessionRefs: { current: { wsRef: { current: {} }, transportRef: { current: 'json' } } },
      viewportRefs: {
        current: {
          containerRef: { current: null },
          viewportShellRef: { current: document.createElement('div') },
        },
      },
      sendTerminalPasteInput: sendPaste,
      resolveTerminalCellFromPointer: () => ({ col: 10, row: 5 }),
      shouldRouteWheelToTranscript: () => true,
    });

    const event = createWheelEvent(120);
    handler(event);

    expect(sendPaste).toHaveBeenCalled();
    // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
    expect(sendPaste.mock.calls[0][0].text).toMatch(/\x1b\[<6[45];/);

    overlayInput.remove();
    root.remove();
  });
});

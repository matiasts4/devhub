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
});

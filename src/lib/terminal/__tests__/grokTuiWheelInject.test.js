/**
 * @jest-environment jsdom
 */

const {
  isGrokWheelSession,
  createGrokWheelInjectHandler,
  attachGrokTuiWheelInject,
} = require('../grokTuiWheelInject');

describe('isGrokWheelSession', () => {
  test('true when isGrokSessionRef set', () => {
    expect(
      isGrokWheelSession({
        getLifecycle: () => ({ isGrokSessionRef: { current: true } }),
      })
    ).toBe(true);
  });

  test('true when launch command is grok', () => {
    expect(
      isGrokWheelSession({
        getInitialCommand: () => 'grok',
        getLifecycle: () => ({}),
      })
    ).toBe(true);
  });

  test('false for shell', () => {
    expect(
      isGrokWheelSession({
        getInitialCommand: () => 'bash',
        getLifecycle: () => ({}),
      })
    ).toBe(false);
  });
});

describe('createGrokWheelInjectHandler', () => {
  test('injects SGR for Grok and stops propagation', () => {
    const sent = [];
    const socket = {
      readyState: 1,
      send: (data) => sent.push(data),
    };
    const term = {
      cols: 80,
      rows: 24,
      focus: jest.fn(),
      element: document.createElement('div'),
      buffer: { active: { length: 0 } },
    };
    const handler = createGrokWheelInjectHandler({
      term,
      getInitialCommand: () => 'grok',
      getLifecycle: () => ({
        isGrokSessionRef: { current: false },
        grokTuiReadyRef: { current: false },
        tuiSessionActiveRef: { current: false },
      }),
      getSession: () => ({
        wsRef: { current: socket },
        transportRef: { current: 'json' },
      }),
      getViewport: () => ({
        containerRef: { current: term.element },
        viewportShellRef: { current: term.element },
      }),
    });

    const event = {
      deltaY: 120,
      clientX: 10,
      clientY: 10,
      shiftKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    handler(event);

    expect(sent.length).toBeGreaterThanOrEqual(1);
    const raw = typeof sent[0] === 'string' ? sent[0] : JSON.stringify(sent[0]);
    // eslint-disable-next-line no-control-regex
    expect(raw).toMatch(/\\u001b\[<6[45];|\\x1b\[<6[45];|\x1b\[<6[45];/);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  test('ignores non-Grok sessions', () => {
    const send = jest.fn();
    const handler = createGrokWheelInjectHandler({
      term: { cols: 80, rows: 24, focus: jest.fn(), element: document.createElement('div') },
      getInitialCommand: () => 'opencode',
      getLifecycle: () => ({}),
      getSession: () => ({
        wsRef: { current: { readyState: 1, send } },
        transportRef: { current: 'json' },
      }),
      getViewport: () => ({}),
    });
    handler({
      deltaY: 100,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('attachGrokTuiWheelInject', () => {
  test('registers capture wheel on term.element', () => {
    const el = document.createElement('div');
    const add = jest.spyOn(el, 'addEventListener');
    const term = {
      element: el,
      attachCustomWheelEventHandler: jest.fn(),
      cols: 80,
      rows: 24,
    };
    const dispose = attachGrokTuiWheelInject(term, {
      getInitialCommand: () => 'grok',
      getLifecycle: () => ({ isGrokSessionRef: { current: true } }),
      getSession: () => ({}),
      getViewport: () => ({}),
    });
    expect(add).toHaveBeenCalledWith('wheel', expect.any(Function), {
      passive: false,
      capture: true,
    });
    expect(term.attachCustomWheelEventHandler).toHaveBeenCalled();
    dispose();
  });
});

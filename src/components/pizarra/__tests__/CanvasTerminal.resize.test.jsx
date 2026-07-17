/**
 * CanvasTerminal â€” border resize contract (pizarra-drag-resize-polish).
 *
 * The Konva Transformer is excluded for TERMINAL shapes (composite
 * type). The user resizes by grabbing any of the 8 edge/corner
 * handles (4 edges + 4 corners) on the element border. Resize is
 * live: onResize fires on every mousemove for visual feedback.
 *
 * Test strategy: render CanvasTerminal with `selected={true}` so the
 * 8 resize handles appear in the DOM. Dispatch mousedown on the
 * testid-bearing handle, then a window mousemove with the desired
 * delta, then assert onResize was called with the expected bounds.
 *
 * The handle testids are:
 *   - canvas-terminal-resize-n, s, e, w (edges â€” hit area scaled by resolveHandleSizing)
 *   - canvas-terminal-resize-nw, ne, sw, se (corners â€” hit area scaled)
 *
 * Visible rails/grip dots are rendered inside the hit areas (selected only).
 * Minimum sizes: minW=160, minH=120 (see CanvasTerminal.handleResizeStart).
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync, act: flushSyncAct } = require('react-dom');
const { JSDOM } = require('jsdom');

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
jest.mock('framer-motion', () => ({
  motion: {
    div: (() => {
      const R = require('react');
      return R.forwardRef(({ children, ...props }, ref) =>
        R.createElement('div', { ...props, ref }, children)
      );
    })(),
  },
}));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const R = require('react');
    return R.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock(
  '@xterm/xterm',
  () => ({
    Terminal: jest.fn().mockImplementation(() => ({
      rows: 24,
      cols: 80,
      loadAddon: jest.fn(),
      open: jest.fn(),
      onData: jest.fn(),
      focus: jest.fn(),
      write: jest.fn(),
      writeln: jest.fn(),
      paste: jest.fn(),
      refresh: jest.fn(),
      clearTextureAtlas: jest.fn(),
      dispose: jest.fn(),
      getSelection: jest.fn(() => ''),
      clear: jest.fn(),
      scrollToLine: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock('@/components/TerminalTTY', () => {
  // Mock factory MUST be self-contained. Use require() inside and
  // name the inner factory with the "mock" prefix so jest's hoisting
  // check allows the reference.
  const mockTerminalTTYFactory = () => () => {
    const R = require('react');
    return R.createElement('div', { 'data-testid': 'mock-terminal' }, null);
  };
  return {
    __esModule: true,
    default: mockTerminalTTYFactory(),
  };
});

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
}

function makeMouseEvent(type, clientX, clientY, button = 0, extraProps = {}) {
  const event = new global.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
    clientY,
  });
  Object.keys(extraProps).forEach((key) => {
    try {
      event[key] = extraProps[key];
    } catch (e) {
      // Some props are read-only; ignore.
    }
  });
  return event;
}

const SHAPE = { id: 'shape-terminal-resize', label: 'Terminal' };
const START_BOUNDS = { x: 0, y: 0, width: 400, height: 600 };

function renderTerminal({ onResize, onSelect } = {}) {
  const { default: CanvasTerminal } = require('../CanvasTerminal');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      React.createElement(CanvasTerminal, {
        terminalId: 't1',
        shape: SHAPE,
        bounds: START_BOUNDS,
        selected: true,
        onSelect: onSelect || jest.fn(),
        onResize: onResize || jest.fn(),
      })
    );
  });
  return { container, root };
}

function unmountTerminal(harness) {
  flushSync(() => harness.root.unmount());
  harness.container.remove();
}

function getHandle(testid) {
  return document.querySelector(`[data-testid="${testid}"]`);
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('CanvasTerminal â€” border resize (pizarra-drag-resize-polish)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    installDom();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (global.window && global.window.close) {
      try {
        global.window.close();
      } catch (e) {
        // JSDOM may already be closed; ignore.
      }
    }
  });

  test('e: mousedown on east handle + mousemove +50px â†’ onResize width = oldW + 50', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-e');
    expect(handle).toBeTruthy();

    // Mousedown at the handle (any clientX is fine; the handler reads
    // only the delta from startX, not the absolute position).
    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 10, 20, 0));
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 60, 20, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 450, // 400 + 50
      height: 600,
    });

    // Clean up listeners.
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 60, 20, 0));
    });
    unmountTerminal(harness);
  });

  test('w: mousedown on west handle + mousemove +50px â†’ onResize width = oldW - 50 AND x = oldX + 50', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-w');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 100, 50, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 150, 50, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    // w resize: width shrinks, x grows by the same amount (so the
    // east edge stays anchored).
    expect(onResize).toHaveBeenCalledWith({
      x: 50, // 0 + (400 - 350)
      y: 0,
      width: 350, // 400 - 50
      height: 600,
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 150, 50, 0));
    });
    unmountTerminal(harness);
  });

  test('s: mousedown on south handle + mousemove +50px â†’ onResize height = oldH + 50', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-s');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 10, 200, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 10, 250, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 400,
      height: 650, // 600 + 50
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 10, 250, 0));
    });
    unmountTerminal(harness);
  });

  test('n: mousedown on north handle + mousemove +50px â†’ onResize height = oldH - 50 AND y = oldY + 50', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-n');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 10, 100, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 10, 150, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith({
      x: 0,
      y: 50, // 0 + (600 - 550)
      width: 400,
      height: 550, // 600 - 50
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 10, 150, 0));
    });
    unmountTerminal(harness);
  });

  test('se: mousedown on south-east corner + mousemove +50/+50 â†’ onResize grows both width and height', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-se');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 10, 10, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 60, 60, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 450, // 400 + 50
      height: 650, // 600 + 50
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 60, 60, 0));
    });
    unmountTerminal(harness);
  });

  test('min-w floor: mousedown on east + mousemove -10000px â†’ onResize width = 160 (minW floor), not negative', () => {
    const onResize = jest.fn();
    const harness = renderTerminal({ onResize });

    const handle = getHandle('canvas-terminal-resize-e');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 400, 300, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', -9600, 300, 0));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    // 400 + (-10000) = -9600, clamped to minW = 160.
    expect(onResize).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 160, // minW floor (not -9600)
      height: 600,
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', -9600, 300, 0));
    });
    unmountTerminal(harness);
  });
});

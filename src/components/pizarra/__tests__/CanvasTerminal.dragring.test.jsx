/**
 * CanvasTerminal — border drag ring (pizarra-drag-fluidity-2).
 *
 * The whole perimeter of a terminal surface is now a move target via the
 * SurfaceDragRing strips (cursor: move). Previously only the small header
 * bar initiated drags, which users found "muy delicado" / hard to grab.
 *
 * Contract under test:
 *  - The 4 ring strips render (n/s/e/w) with the drag-handle data attribute.
 *  - mousedown on a ring strip + window mousemove fires onMove with the
 *    zoom-divided delta (the surface moves).
 *  - mousedown on a ring strip selects the surface (onSelect).
 *
 * Test strategy mirrors CanvasTerminal.resize.test.jsx: render the real
 * component in JSDOM, dispatch a native mousedown on the ring strip, then
 * a window mousemove, and assert the onMove/onSelect callbacks fired.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

// ── RAF polyfill (drag hook batches the native sync via RAF) ──────────────
let __rafQueue = [];
let __rafHandleCounter = 0;
function rafPolyfill(callback) {
  const handle = ++__rafHandleCounter;
  __rafQueue.push({ handle, callback });
  return handle;
}
function cancelRafPolyfill(handle) {
  __rafQueue = __rafQueue.filter((entry) => entry.handle !== handle);
}
global.requestAnimationFrame = rafPolyfill;
global.cancelAnimationFrame = cancelRafPolyfill;

// ── Mocks ─────────────────────────────────────────────────────────────────
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

jest.mock('@/components/TerminalTTY', () => {
  const mockTerminalTTYFactory = () => () => {
    const R = require('react');
    return R.createElement('div', { 'data-testid': 'mock-terminal' }, null);
  };
  return { __esModule: true, default: mockTerminalTTYFactory() };
});

// ── Helpers ───────────────────────────────────────────────────────────────
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

function makeMouseEvent(type, clientX, clientY, button = 0) {
  return new global.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
    clientY,
  });
}

const SHAPE = { id: 'shape-terminal-dragring', label: 'Terminal' };
const START_BOUNDS = { x: 0, y: 0, width: 400, height: 600 };

function renderTerminal({ onMove, onSelect, onDragEnd } = {}) {
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
        selected: false,
        onMove: onMove || jest.fn(),
        onSelect: onSelect || jest.fn(),
        onDragEnd: onDragEnd || jest.fn(),
      })
    );
  });
  return { container, root };
}

function unmountTerminal(harness) {
  flushSync(() => harness.root.unmount());
  harness.container.remove();
}

function getRing(testid) {
  return document.querySelector(`[data-testid="${testid}"]`);
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('CanvasTerminal — border drag ring (pizarra-drag-fluidity-2)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    installDom();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    __rafQueue = [];
    if (global.window && global.window.close) {
      try {
        global.window.close();
      } catch (e) {
        // JSDOM may already be closed; ignore.
      }
    }
  });

  test('renders the 4 ring strips as drag handles', () => {
    const harness = renderTerminal({});
    for (const dir of ['n', 's', 'e', 'w']) {
      const strip = getRing(`canvas-terminal-drag-ring-${dir}`);
      expect(strip).toBeTruthy();
      expect(strip.getAttribute('data-pizarra-surface-drag-handle')).toBe('true');
      expect(strip.style.cursor).toBe('move');
    }
    unmountTerminal(harness);
  });

  test('mousedown on east ring + mousemove fires onMove (surface moves)', () => {
    const onMove = jest.fn();
    const harness = renderTerminal({ onMove });

    const ring = getRing('canvas-terminal-drag-ring-e');
    expect(ring).toBeTruthy();

    flushSync(() => {
      ring.dispatchEvent(makeMouseEvent('mousedown', 400, 300, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 440, 310, 0));
    });

    expect(onMove).toHaveBeenCalled();
    const payload = onMove.mock.calls[onMove.mock.calls.length - 1][0];
    // zoom = 1 → screen delta == logical delta.
    expect(payload.deltaX).toBe(40);
    expect(payload.deltaY).toBe(10);

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 440, 310, 0));
    });
    unmountTerminal(harness);
  });

  test('mousedown on ring selects the surface', () => {
    const onSelect = jest.fn();
    const harness = renderTerminal({ onSelect });

    const ring = getRing('canvas-terminal-drag-ring-s');
    flushSync(() => {
      ring.dispatchEvent(makeMouseEvent('mousedown', 200, 600, 0));
    });

    expect(onSelect).toHaveBeenCalledWith(SHAPE.id);

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 200, 600, 0));
    });
    unmountTerminal(harness);
  });

  test('drag from ring commits final position via onDragEnd', () => {
    const onDragEnd = jest.fn();
    const harness = renderTerminal({ onDragEnd });

    const ring = getRing('canvas-terminal-drag-ring-n');
    flushSync(() => {
      ring.dispatchEvent(makeMouseEvent('mousedown', 200, 0, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 230, 25, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 230, 25, 0));
    });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const args = onDragEnd.mock.calls[0][0];
    expect(args.totalDeltaX).toBe(30);
    expect(args.totalDeltaY).toBe(25);
    unmountTerminal(harness);
  });
});

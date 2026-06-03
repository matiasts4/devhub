/**
 * CanvasTerminal — flicker fix contract (pizarra-shared-view-state Phase 1).
 *
 * Root cause: `suspendNativeSurface={isDragging}` flipped to true on
 * mousedown. The native VTE panel was hidden (and re-shown) on EVERY
 * click+release cycle, even pure selection clicks. The IPC round-trip
 * to hide and re-show the panel caused the visible flicker.
 *
 * Fix shape (per design §6.1):
 *   - Track two booleans instead of one:
 *     - pointerDown   — set on mousedown; cleared on mouseup. Visual
 *                       cursor / border state only.
 *     - isLiveDragging — set on the FIRST mousemove after pointerDown
 *                        where hypot(movementX, movementY) > 3. Cleared
 *                        on mouseup. Drives suspendNativeSurface.
 *   - The 3px threshold separates "I am about to drag" from
 *     "I am clicking to select". The native VTE panel is suspended only
 *     when movement actually starts.
 *   - Reattach (when isLiveDragging flips back to false) calls
 *     setNativeVtePanelVisibility({ visible: true }) synchronously in
 *     the same effect tick — no debounce, no setTimeout.
 *
 * This file pins that contract. The tests are:
 *   1. click (mousedown + mouseup, no move): suspendNativeSurface stays
 *      false on TerminalTTY; setNativeVtePanelVisibility is NOT called
 *      with visible:false.
 *   2. click + tiny jitter (< 3px): same as #1 (the jitter is below
 *      the threshold, so the native panel is not suspended).
 *   3. real drag (> 3px): isLiveDragging flips to true after the first
 *      qualifying move; TerminalTTY receives suspendNativeSurface=true;
 *      setNativeVtePanelVisibility is called with visible:false.
 *   4. mouseup after real drag: isLiveDragging flips back to false;
 *      TerminalTTY receives suspendNativeSurface=false; the reattach
 *      IPC is called synchronously (no setTimeout, no debounce).
 *   5. resize handle mousedown + 3px+ move: same flicker fix applies
 *      to the resize path.
 *
 * Test strategy: render CanvasTerminal with the same mocks the other
 * pizarra component tests use, dispatch real MouseEvents on the header
 * and on the resize handles, and assert:
 *   - The `suspendNativeSurface` prop captured by the TerminalTTY mock
 *     follows the contract above.
 *   - The nativeVteBridge mock is called the expected number of times
 *     and with the expected payloads.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

// ── Mocks ──────────────────────────────────────────────────────────────────

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
  'xterm',
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
  'xterm-addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  'xterm-addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

// Capture the suspendNativeSurface prop AND every render's value in a
// sink so tests can read the sequence of values the component saw.
const mockSuspendSink = [];
let mockLastSuspendValue = undefined;
const mockTerminalTTY = jest.fn((props) => {
  mockLastSuspendValue = props.suspendNativeSurface;
  mockSuspendSink.push(props.suspendNativeSurface);
  return React.createElement('div', { 'data-testid': 'mock-terminal' }, null);
});
jest.mock('@/components/TerminalTTY', () => ({
  __esModule: true,
  default: mockTerminalTTY,
}));

// Mock the native VTE bridge. Capture every IPC call so tests can
// assert the synchronous reattach contract.
const mockSetNativeVtePanelVisibility = jest.fn(() => Promise.resolve());
const mockResizeNativeVtePanel = jest.fn(() => Promise.resolve());
jest.mock('@/lib/terminal/nativeVteBridge', () => ({
  setNativeVtePanelVisibility: (...args) => mockSetNativeVtePanelVisibility(...args),
  resizeNativeVtePanel: (...args) => mockResizeNativeVtePanel(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

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
  global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
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

const SHAPE = { id: 'shape-flicker-1', label: 'Terminal' };
const START_BOUNDS = { x: 0, y: 0, width: 400, height: 300 };

function renderTerminal(extra = {}) {
  const { default: CanvasTerminal } = require('../CanvasTerminal');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      React.createElement(CanvasTerminal, {
        terminalId: 't-flicker',
        shape: SHAPE,
        bounds: START_BOUNDS,
        selected: true,
        onSelect: jest.fn(),
        onResize: jest.fn(),
        onClose: jest.fn(),
        ...extra,
      })
    );
  });
  return { container, root };
}

function unmountTerminal(harness) {
  flushSync(() => harness.root.unmount());
  harness.container.remove();
}

function getHeader() {
  return document.querySelector('[data-testid="canvas-terminal-header"]');
}

function getHandle(testid) {
  return document.querySelector(`[data-testid="${testid}"]`);
}

function lastSuspendCall() {
  return mockSuspendSink[mockSuspendSink.length - 1];
}

function callsTo(mockFn) {
  return mockFn.mock.calls;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CanvasTerminal — flicker fix (pizarra-shared-view-state Phase 1)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    installDom();
    mockSuspendSink.length = 0;
    mockLastSuspendValue = undefined;
    mockSetNativeVtePanelVisibility.mockClear();
    mockResizeNativeVtePanel.mockClear();
    mockTerminalTTY.mockClear();
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

  // ── 1. mousedown + mouseup, no move: no flicker ─────────────────────────
  test('mousedown + mouseup with no move: TerminalTTY never receives suspendNativeSurface=true', () => {
    const harness = renderTerminal();

    const header = getHeader();
    expect(header).toBeTruthy();

    // Capture the initial suspendNativeSurface value (render).
    const initialSuspend = mockLastSuspendValue;
    expect(initialSuspend).toBe(false);

    // mousedown on the header. isLiveDragging must NOT flip to true.
    flushSync(() => {
      header.dispatchEvent(makeMouseEvent('mousedown', 50, 60, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    // mouseup with no mousemove in between. Same: no flicker.
    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mouseup', 50, 60, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    // The IPC mock is the closest proxy for the actual native panel
    // hide/show. After a pure click, the panel must NOT be hidden.
    // We allow resizeNativeVtePanel calls (geometry updates) but
    // disallow any setNativeVtePanelVisibility call that toggles
    // visible:false in response to the click.
    const hideCalls = callsTo(mockSetNativeVtePanelVisibility).filter(
      ([payload]) => payload && payload.visible === false
    );
    expect(hideCalls).toHaveLength(0);

    unmountTerminal(harness);
  });

  // ── 2. mousedown + tiny jitter (< 3px): still no flicker ──────────────
  test('mousedown + 2px jitter (< 3px threshold): no flicker', () => {
    const harness = renderTerminal();

    const header = getHeader();
    flushSync(() => {
      header.dispatchEvent(makeMouseEvent('mousedown', 50, 60, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    // Tiny jitter: 2px on each axis. hypot(2, 2) ≈ 2.83 < 3.
    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mousemove', 52, 62, 0));
    });
    // The 2.83 hypot is still under the 3px threshold, so the
    // native panel must NOT be suspended.
    expect(lastSuspendCall()).toBe(false);

    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mouseup', 52, 62, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    const hideCalls = callsTo(mockSetNativeVtePanelVisibility).filter(
      ([payload]) => payload && payload.visible === false
    );
    expect(hideCalls).toHaveLength(0);

    unmountTerminal(harness);
  });

  // ── 3. mousedown + move > 3px: real drag, panel suspended ──────────────
  test('mousedown + 10px move (> 3px threshold): suspendNativeSurface flips to true on TerminalTTY', () => {
    const harness = renderTerminal();

    const header = getHeader();
    flushSync(() => {
      header.dispatchEvent(makeMouseEvent('mousedown', 50, 60, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    // 10px move: clearly above the 3px threshold.
    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mousemove', 60, 70, 0));
    });
    // After the first qualifying move, suspendNativeSurface must
    // flip to true on the TerminalTTY prop.
    expect(lastSuspendCall()).toBe(true);

    // mouseup clears it.
    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mouseup', 60, 70, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    unmountTerminal(harness);
  });

  // ── 4. mouseup after real drag: synchronous reattach ──────────────────
  test('mouseup after real drag: reattach IPC is called synchronously in the same effect tick (no setTimeout)', () => {
    jest.useFakeTimers();
    try {
      const harness = renderTerminal();
      mockSetNativeVtePanelVisibility.mockClear();

      const header = getHeader();
      flushSync(() => {
        header.dispatchEvent(makeMouseEvent('mousedown', 50, 60, 0));
      });
      flushSync(() => {
        window.dispatchEvent(makeMouseEvent('mousemove', 60, 70, 0));
      });
      // isLiveDragging is true. mouseup ends the drag.
      flushSync(() => {
        window.dispatchEvent(makeMouseEvent('mouseup', 60, 70, 0));
      });

      // The reattach IPC MUST be called synchronously inside the
      // effect tick that processes the mouseup. It must NOT be
      // scheduled via setTimeout (no flicker window) and must NOT
      // be deferred to a RAF (no one-frame gap).
      const reattachCalls = callsTo(mockSetNativeVtePanelVisibility).filter(
        ([payload]) => payload && payload.visible === true
      );
      expect(reattachCalls.length).toBeGreaterThanOrEqual(1);

      // Advance fake timers: nothing should fire because the
      // reattach was synchronous, not scheduled.
      jest.advanceTimersByTime(1000);
      // The synchronous reattach was already captured; the
      // advanceTimers call must not have produced a DIFFERENT
      // reattach shape (e.g. a delayed retry). Capture count is
      // stable.
      const reattachAfter = callsTo(mockSetNativeVtePanelVisibility).filter(
        ([payload]) => payload && payload.visible === true
      );
      expect(reattachAfter.length).toBe(reattachCalls.length);

      unmountTerminal(harness);
    } finally {
      jest.useRealTimers();
    }
  });

  // ── 5. resize handle: content stays visible (user request) ───────────
  // Unlike a full card drag (header), during border resize we deliberately
  // keep the native VTE visible and painting so the terminal content
  // continues to be seen while the user drags the edge (matching the
  // behavior of the normal dock/workspace resizable panels).
  // Only the 3px gate + isLiveDragging on *header* drags triggers suspend.
  test('resize handle mousedown + 10px move: suspendNativeSurface stays false (content visible during resize)', () => {
    const harness = renderTerminal();

    const handle = getHandle('canvas-terminal-resize-e');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 400, 150, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    // 10px move: well past the 3px threshold. For resize we do *not* suspend.
    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mousemove', 410, 150, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    flushSync(() => {
      window.dispatchEvent(makeMouseEvent('mouseup', 410, 150, 0));
    });
    expect(lastSuspendCall()).toBe(false);

    unmountTerminal(harness);
  });
});

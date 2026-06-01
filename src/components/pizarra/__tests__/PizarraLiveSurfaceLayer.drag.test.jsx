/**
 * PizarraLiveSurfaceLayer — drag stale-closure regression repro.
 *
 * pizarra-drag-desync-v2: The user reported that the visible bbox of
 * the terminal/browser desyncs from its container/preview during a
 * drag. Investigation traced the bug to PizarraLiveSurfaceLayer's
 * inline `handleMove` closure, which captured `shape.x` and `shape.y`
 * at MOUNT TIME. The drag hook (usePizarraSurfaceDrag) wires
 * `onMove` at the moment of mousedown and never refreshes that
 * reference while a drag is in progress. After the first mousemove,
 * the parent reducer updates `elements[0].x` and React re-renders
 * PizarraLiveSurfaceLayer with a NEW `handleMove` closure bound to
 * the latest shape, but the drag hook keeps calling the OLD closure
 * bound to the START shape.
 *
 * Concretely: with a TERMINAL shape at start (100, 200), the first
 * mousemove at (50, 80) is computed against shape.x=100 → x=50
 * (correct by accident, because totalDeltaX is the cumulative delta
 * from the start). After the parent re-renders with shape.x=50, a
 * second mousemove at (70, 100) should logically use the LATEST
 * shape.x=50, giving x=20 (50 + (-30)). The CURRENT code, however,
 * still uses the stale shape.x=100, giving x=70 (100 + (-30)). The
 * test below pins the "latest shape" contract so the fix has a
 * green target.
 *
 * The fix mirrors the onClose ref pattern used by
 * pizarra-add-terminal-bugfix: handleMove becomes a stable
 * useCallback that reads `shape` and `onMoveElement` from refs so
 * the drag hook can keep calling the same function across
 * mousemoves while always seeing the freshest data.
 *
 * TDD contract:
 *   - 1st mousemove → onMoveElement(id, {x: 50, y: 80})   (start + delta)
 *   - re-render with shape.x=50, shape.y=80
 *   - 2nd mousemove → onMoveElement(id, {x: 20, y: -20})  (latest + delta)
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

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

jest.mock('@/components/TerminalTTY', () => ({
  __esModule: true,
  default: function MockTerminalTTY() {
    return require('react').createElement('div', { 'data-testid': 'mock-terminal-tty' }, null);
  },
}));

jest.mock('@/lib/terminal/nativeVteBridge', () => ({
  resizeNativeVtePanel: jest.fn(() => Promise.resolve()),
}));

// canvasViewport is a React context; we provide the bare minimum
// (zoom=1, no pan, identity projectRect) so the live layer can
// compute bounds = {x: shape.x, y: shape.y, ...}.
jest.mock('@/lib/pizarra/canvasViewport', () => {
  const ReactLocal = require('react');
  return {
    useCanvasViewport: () => ({
      zoom: 1,
      setZoom: () => {},
      pan: { x: 0, y: 0 },
      setPan: () => {},
      projectRect: (rect) => ({
        x: rect.x ?? 0,
        y: rect.y ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        screenX: rect.x ?? 0,
        screenY: rect.y ?? 0,
      }),
    }),
    CanvasViewportProvider: ({ children }) => children,
  };
});

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
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  return dom;
}

function fireMouseEvent(target, type, { clientX = 0, clientY = 0, button = 0 } = {}) {
  const ev = new global.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
    clientY,
  });
  target.dispatchEvent(ev);
}

describe('PizarraLiveSurfaceLayer — drag stale closure (pizarra-drag-desync-v2)', () => {
  let dom;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = installDom();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    if (dom && dom.window) {
      try {
        dom.window.close();
      } catch (e) {
        // ignore
      }
    }
  });

  function render(props) {
    const { default: PizarraLiveSurfaceLayer } = require('../PizarraLiveSurfaceLayer');
    flushSync(() => root.render(React.createElement(PizarraLiveSurfaceLayer, props)));
  }

  test('Repro: handleMove reads stale shape.x after parent re-render during a drag', () => {
    const onMoveElement = jest.fn();
    const initialShape = {
      id: 'term-1',
      type: 'terminal',
      x: 100,
      y: 200,
      width: 640,
      height: 400,
      label: 'Terminal',
    };
    const baseProps = {
      selectedElementIds: ['term-1'],
      onSelect: () => {},
      onMoveElement,
      onActivateTerminal: () => {},
      onUpdateElement: () => {},
      onRemoveElement: () => {},
    };

    // 1. Mount with the terminal shape at (100, 200).
    render({ elements: [initialShape], ...baseProps });

    const dragHandle = container.querySelector('[data-pizarra-surface-drag-handle="true"]');
    expect(dragHandle).toBeTruthy();

    // 2. Mousedown on the drag handle. The drag hook captures the
    //    `onMove` reference (the inline `handleMove` from
    //    PizarraLiveSurfaceLayer) at this point. The captured closure
    //    holds shape.x=100, shape.y=200.
    flushSync(() => {
      fireMouseEvent(dragHandle, 'mousedown', {
        clientX: 100,
        clientY: 200,
        button: 0,
      });
    });

    // 3. First mousemove at (50, 80). Delta from start: (-50, -120).
    //    The drag hook's handleMouseMove calls onMove synchronously.
    //    The current closure (shape.x=100) computes x=100+(-50)=50.
    //    Reducer-side, this would update elements[0] to x=50, y=80.
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 50, clientY: 80 });
    });
    expect(onMoveElement).toHaveBeenLastCalledWith('term-1', { x: 50, y: 80 });

    // 4. Simulate the parent re-render after the reducer applied the
    //    first move: elements[0].x=50, elements[0].y=80. The new
    //    render builds a NEW handleMove closure bound to the latest
    //    shape (x=50, y=80). The drag hook, however, still has its
    //    handleMouseMove pointing at the OLD onMove from mousedown.
    render({
      elements: [{ ...initialShape, x: 50, y: 80 }],
      ...baseProps,
    });

    // 5. Second mousemove at (70, 100). Cumulative delta from start:
    //    (-30, -100). The CURRENT (buggy) code calls the OLD closure
    //    with shape.x=100, producing {x: 70, y: 100}. The CORRECT
    //    behavior (after the ref fix) is to read the LATEST shape
    //    via ref (shape.x=50, shape.y=80) and produce
    //    {x: 20, y: -20}.
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 70, clientY: 100 });
    });
    expect(onMoveElement).toHaveBeenLastCalledWith('term-1', { x: 20, y: -20 });
  });
});

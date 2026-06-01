/**
 * PizarraLiveSurfaceLayer — double-count regression repro.
 *
 * pizarra-drag-desync-v2: The v2 fix in commit ad43280 solved the
 * stale-closure bug by routing handleMove through a ref to the
 * freshest shape. That made the SECOND mousemove read the latest
 * shape.x, but it also switched handleMove to use `totalDeltaX` /
 * `totalDeltaY` (cumulative from mousedown) instead of the per-tick
 * `deltaX` / `deltaY`. Because the latest shape.x already
 * incorporates the prior mousemoves, adding the cumulative
 * totalDeltaX on top double-counts the displacement.
 *
 * Concrete repro (this file):
 *   - shape initial: x=100, y=100
 *   - mousedown at (200, 200) → startPointer=(200,200), lastPointer=(200,200)
 *   - mousemove 1 at (250, 250):
 *       rawTotalDeltaX = 50, rawDeltaX = 50  (zoom=1, so the
 *                                             post-zoom deltas equal
 *                                             the raw deltas)
 *       handleMove sees { totalDeltaX: 50 } → onMoveElement(id, {x: 100+50=150, y: 150})
 *       Reducer: shape.x=150
 *       Re-render: shapeRef.current = {x: 150, y: 150}
 *   - mousemove 2 at (270, 270):
 *       rawTotalDeltaX = 70 (cumulative from mousedown)
 *       handleMove sees { totalDeltaX: 70 }
 *       ON THE BUGGY CODE (current): onMoveElement(id, {x: 150+70=220, y: 220})
 *       ON THE FIXED CODE (deltaX/Y): onMoveElement(id, {x: 150+20=170, y: 170})
 *
 * The cursor is at start+70 = (270, 270), so the shape should land
 * at start+70 = (170, 170), not (220, 220). The fix is to use the
 * per-tick `deltaX` / `deltaY` (already divided by zoom in the drag
 * hook) so each handleMove adds only the delta from the LAST
 * mousemove to the CURRENT one.
 *
 * TDD contract (this test, RED on buggy code, GREEN on fix):
 *   - 1st mousemove → onMoveElement('t1', {x: 150, y: 150})
 *   - re-render with shape.x=150, shape.y=150
 *   - 2nd mousemove → onMoveElement('t1', {x: 170, y: 170})
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

describe('PizarraLiveSurfaceLayer — double-count on second mousemove (pizarra-drag-desync-v2)', () => {
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

  test('Repro: handleMove must NOT add cumulative totalDelta on top of the already-updated shape.x', () => {
    const onMoveElement = jest.fn();
    const initialShape = {
      id: 't1',
      type: 'terminal',
      x: 100,
      y: 100,
      width: 600,
      height: 400,
      label: 'Terminal',
    };
    const baseProps = {
      selectedElementIds: ['t1'],
      onSelect: () => {},
      onMoveElement,
      onActivateTerminal: () => {},
      onUpdateElement: () => {},
      onRemoveElement: () => {},
    };

    // 1. Mount with the terminal shape at (100, 100).
    render({ elements: [initialShape], ...baseProps });

    const dragHandle = container.querySelector('[data-pizarra-surface-drag-handle="true"]');
    expect(dragHandle).toBeTruthy();

    // 2. Mousedown at (200, 200). The drag hook captures startPointer
    //    and lastPointer at this position.
    flushSync(() => {
      fireMouseEvent(dragHandle, 'mousedown', {
        clientX: 200,
        clientY: 200,
        button: 0,
      });
    });

    // 3. First mousemove at (250, 250). Cumulative delta from start
    //    is (50, 50). With zoom=1, both deltaX/Y and totalDeltaX/Y
    //    are (50, 50). Either contract (per-tick or cumulative) gives
    //    the same answer: shape.x = 100 + 50 = 150. The reducer
    //    would then update elements[0] to (150, 150).
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 250, clientY: 250 });
    });
    expect(onMoveElement).toHaveBeenLastCalledWith('t1', { x: 150, y: 150 });

    // 4. Simulate the parent re-render after the reducer applied the
    //    first move: elements[0] is now at (150, 150). The v2 fix
    //    reads the freshest shape via a ref.
    render({
      elements: [{ ...initialShape, x: 150, y: 150 }],
      ...baseProps,
    });

    // 5. Second mousemove at (270, 270). The cursor is at start+70.
    //    Per-tick delta from (250, 250) is (20, 20); cumulative delta
    //    from (200, 200) is (70, 70). The CORRECT result is that
    //    shape lands at start+70 = (170, 170) — i.e. handleMove must
    //    use the per-tick (20, 20) on top of the freshest shape
    //    (150, 150). The BUGGY code uses the cumulative (70, 70) on
    //    top of the freshest shape (150, 150) and lands at (220,
    //    220), desyncing the visible bbox from the cursor.
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 270, clientY: 270 });
    });
    expect(onMoveElement).toHaveBeenLastCalledWith('t1', { x: 170, y: 170 });

    // 6. Mouseup to clean up. The drag hook removes its window
    //    listeners and clears the in-flight RAF.
    flushSync(() => {
      fireMouseEvent(global.window, 'mouseup', { clientX: 270, clientY: 270 });
    });
  });
});

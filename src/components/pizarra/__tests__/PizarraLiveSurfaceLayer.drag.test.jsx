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
 * The fix mirrors the onClose ref pattern used by
 * pizarra-add-terminal-bugfix: handleMove becomes a stable
 * useCallback that reads `shape` and `onMoveElement` from refs so
 * the drag hook can keep calling the same function across
 * mousemoves while always seeing the freshest data.
 *
 * TDD contract (per-tick deltaX/Y, post-zoom):
 *   - shape initial: x=100, y=200
 *   - mousedown at (100, 200) → startPointer = lastPointer = (100, 200)
 *   - 1st mousemove at (50, 80):
 *       rawDeltaX = 50 - 100 = -50, rawDeltaY = 80 - 200 = -120
 *       per-tick deltaX/Y = (-50, -120) (zoom=1)
 *       handleMove: shape.x = 100 + (-50) = 50, shape.y = 200 + (-120) = 80
 *       onMoveElement(id, {x: 50, y: 80})
 *   - re-render with shape.x=50, shape.y=80 (ref mirrors freshest)
 *   - 2nd mousemove at (70, 100):
 *       lastPointer was (50, 80) → rawDeltaX = 20, rawDeltaY = 20
 *       per-tick deltaX/Y = (20, 20)
 *       handleMove: shape.x = 50 + 20 = 70, shape.y = 80 + 20 = 100
 *       onMoveElement(id, {x: 70, y: 100})
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

    // 3. First mousemove at (50, 80). Per-tick delta from start:
    //    (-50, -120). The drag hook's handleMouseMove calls handleMove
    //    synchronously with deltaX/Y, which mutates the style.left/top
    //    of the wrapper DOM element directly.
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 50, clientY: 80 });
    });
    const wrapper = container.querySelector(
      '[data-testid="canvas-terminal-container"]'
    ).parentElement;
    expect(wrapper.style.left).toBe('50px');
    expect(wrapper.style.top).toBe('80px');
    expect(onMoveElement).not.toHaveBeenCalled();

    // 4. Simulate parent re-render (e.g. selection or other updates).
    render({
      elements: [initialShape],
      ...baseProps,
    });

    // 5. Second mousemove at (70, 100). Per-tick delta is (20, 20).
    //    Total delta becomes (-30, -100).
    //    The style left/top should update to 70px and 100px.
    flushSync(() => {
      fireMouseEvent(global.window, 'mousemove', { clientX: 70, clientY: 100 });
    });
    expect(wrapper.style.left).toBe('70px');
    expect(wrapper.style.top).toBe('100px');
    expect(onMoveElement).not.toHaveBeenCalled();

    // 6. Mouseup ends the drag. It triggers handleDragEnd which calls onMoveElement.
    flushSync(() => {
      fireMouseEvent(global.window, 'mouseup', { clientX: 70, clientY: 100 });
    });
    expect(onMoveElement).toHaveBeenCalledWith('term-1', { x: 70, y: 100 });
  });
});

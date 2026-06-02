/**
 * PizarraCanvas.wheel — pizarra-wheel-passive-fix.
 *
 * React 17+ makes onWheel listeners PASSIVE by default, so calling
 * event.preventDefault() inside an onWheel handler is a no-op. Result:
 * when the user wheel-zooms on the pizarra canvas, the browser ALSO
 * applies its own page zoom on top of the canvas-internal setZoom, so
 * the surrounding chrome (sidebar, topbar, all layout) scales out of
 * view instead of only the canvas content zooming.
 *
 * The fix in PizarraCanvas.jsx replaces the React onWheel prop with a
 * native addEventListener('wheel', handler, { passive: false }) attached
 * via useEffect on a ref. That makes preventDefault() actually work
 * (the browser respects it), so the page does not also zoom.
 *
 * This test asserts:
 *   1. Dispatching a wheel event on the wrapper calls setZoom (handler
 *      runs at all).
 *   2. event.defaultPrevented === true after dispatch (preventDefault
 *      actually had an effect — this is the bug-specific assertion,
 *      and JSDOM 16.7 honors passive listener semantics via
 *      EventImpl._inPassiveListenerFlag).
 *   3. The native wheel listener is attached with { passive: false }
 *      (structural assertion, fails today because React's onWheel
 *      does not call addEventListener on the wrapper at all).
 *   4. The wheel listener is removed on unmount (cleanup regression
 *      guard).
 *
 * IMPORTANT: react-dom/client must be required AFTER JSDOM is set up.
 * React detects passive listener support at module load time by calling
 * `window.addEventListener('test', options, options)` with a passive
 * getter on the options. If window is undefined when react-dom loads,
 * `passiveBrowserEventsSupported` stays false, the test's wheel
 * listener is attached WITHOUT passive, and the bug-specific
 * `defaultPrevented === true` assertion would falsely pass on the
 * buggy code. We defer all React requires until JSDOM is installed.
 */

process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE = '0';

const React = require('react');
const { JSDOM } = require('jsdom');

const mockSetZoom = jest.fn();

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/lib/pizarra/shapeRenderers', () => ({
  SHAPE_RENDERERS: {
    rect: () => null,
    circle: () => null,
    line: () => null,
    arrow: () => null,
    textbox: () => null,
    terminal: () => null,
    browser: () => null,
  },
}));

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 1,
    setZoom: mockSetZoom,
    pan: { x: 0, y: 0 },
    setPan: () => {},
  }),
  CanvasViewportProvider: ({ children }) => children,
}));

jest.mock('@/lib/pizarra/shapeModel', () => ({
  SHAPE_TYPES: {
    RECT: 'rect',
    CIRCLE: 'circle',
    LINE: 'line',
    ARROW: 'arrow',
    TEXTBOX: 'textbox',
    TERMINAL: 'terminal',
    BROWSER: 'browser',
  },
  createShape: (type, props) => ({ id: 'mock', type, ...props }),
}));

jest.mock('react-konva', () => {
  const ReactLocal = require('react');
  function Layer({ children, ...props }) {
    return ReactLocal.createElement('div', { 'data-testid': 'konva-layer', ...props }, children);
  }
  Layer.displayName = 'Layer';
  function Stage(props) {
    return ReactLocal.createElement('div', { 'data-testid': 'konva-stage' }, props.children);
  }
  Stage.displayName = 'Stage';
  const Konva = {
    Stage,
    Layer,
    Rect: (props) => ReactLocal.createElement('div', { 'data-testid': 'konva-rect', ...props }),
    Circle: (props) => ReactLocal.createElement('div', { 'data-testid': 'konva-circle', ...props }),
    Line: (props) => ReactLocal.createElement('div', { 'data-testid': 'konva-line', ...props }),
    Arrow: (props) => ReactLocal.createElement('div', { 'data-testid': 'konva-arrow', ...props }),
    Text: (props) => ReactLocal.createElement('div', { 'data-testid': 'konva-text', ...props }),
    Transformer: (props) =>
      ReactLocal.createElement('div', { 'data-testid': 'konva-transformer', ...props }),
  };
  const esm = { ...Konva, default: Konva };
  esm.Stage = Konva.Stage;
  esm.Layer = Konva.Layer;
  esm.Rect = Konva.Rect;
  esm.Circle = Konva.Circle;
  esm.Line = Konva.Line;
  esm.Arrow = Konva.Arrow;
  esm.Text = Konva.Text;
  esm.Transformer = Konva.Transformer;
  return esm;
});

// ── Helpers ────────────────────────────────────────────────────────────────

function buildWheelEvent(deltaY) {
  // JSDOM has no WheelEvent constructor; build a plain Event and
  // attach deltaY via defineProperty. Same trick the minimap tests
  // use for PointerEvent.
  const event = new global.Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'deltaY', { value: deltaY, configurable: true });
  return event;
}

function installJsdom() {
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PizarraCanvas — wheel listener is non-passive (pizarra-wheel-passive-fix)', () => {
  let dom;
  let container;
  let root;
  let PizarraCanvas;
  let createRoot;
  let flushSync;
  let addEventSpy;

  beforeEach(() => {
    mockSetZoom.mockClear();
    dom = installJsdom();

    // Spy on HTMLElement.prototype.addEventListener so we can assert
    // the wheel listener is attached with { passive: false }. Capture
    // a real reference BEFORE replacing, then route through it.
    const realAdd = dom.window.HTMLElement.prototype.addEventListener;
    addEventSpy = jest.fn(function (type, listener, options) {
      return realAdd.call(this, type, listener, options);
    });
    dom.window.HTMLElement.prototype.addEventListener = addEventSpy;

    // Defer React-DOM require until AFTER JSDOM is set up so the
    // passive-browser-events detection sees window.
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      createRoot = require('react-dom/client').createRoot;
      // eslint-disable-next-line global-require
      flushSync = require('react-dom').flushSync;
      // eslint-disable-next-line global-require
      PizarraCanvas = require('../PizarraCanvas').default;
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      try {
        flushSync(() => root.unmount());
      } catch (_e) {
        // best-effort cleanup
      }
    }
    root = null;
    container = null;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
    delete global.HTMLElement;
    delete global.MouseEvent;
    delete global.Event;
    delete global.document;
    delete global.navigator;
    // Do NOT delete global.window: React 19's scheduler enqueues a
    // setImmediate that reads `window.event`. If we delete global.window
    // before that callback fires, the test process crashes with
    // `ReferenceError: window is not defined`. Leaving the JSDOM
    // window attached is harmless — the next beforeEach overwrites it.
  });

  test('wheel event on wrapper calls setZoom and preventDefault actually works', async () => {
    flushSync(() => {
      root.render(
        React.createElement(PizarraCanvas, {
          elements: [],
          selectedElementIds: [],
          activeTool: 'select',
          toolSettings: {},
          onShapeCreate: () => {},
          onSelect: () => {},
          onDeselect: () => {},
          onUpdateElement: () => {},
          width: 800,
          height: 600,
        })
      );
    });
    // Settle the dynamic import('react-konva') microtask.
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => {});

    const wrapper = container.querySelector('[data-testid="pizarra-canvas-wrapper"]');
    expect(wrapper).toBeTruthy();

    const event = buildWheelEvent(-100); // negative = zoom in
    wrapper.dispatchEvent(event);

    // Sanity: the handler ran and updated the viewport state.
    expect(mockSetZoom).toHaveBeenCalled();
    const zoomCallArg = mockSetZoom.mock.calls[0][0];
    expect(typeof zoomCallArg).toBe('function');

    // THE BUG-SPECIFIC ASSERTION: with React's onWheel (passive by
    // default in React 17+), preventDefault() is a no-op and
    // defaultPrevented stays false. After the fix the listener is
    // non-passive, so preventDefault() flips defaultPrevented to true.
    expect(event.defaultPrevented).toBe(true);
  });

  test('wheel listener is attached via addEventListener with { passive: false }', async () => {
    addEventSpy.mockClear();
    flushSync(() => {
      root.render(
        React.createElement(PizarraCanvas, {
          elements: [],
          selectedElementIds: [],
          activeTool: 'select',
          toolSettings: {},
          onShapeCreate: () => {},
          onSelect: () => {},
          onDeselect: () => {},
          onUpdateElement: () => {},
          width: 800,
          height: 600,
        })
      );
    });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => {});

    // The fix attaches the wheel listener directly on the wrapper
    // element via el.addEventListener('wheel', handler, { passive: false }).
    // The buggy code uses React's onWheel prop, which does NOT call
    // addEventListener on the wrapper (React delegates from the root).
    // So this assertion fails today and passes after the fix.
    //
    // We pair each call's args with the `this` receiver via
    // mockFn.mock.instances (jest stores the receiver per call).
    const calls = addEventSpy.mock.calls;
    const instances = addEventSpy.mock.instances;
    const wrapperWheelCalls = [];
    for (let i = 0; i < calls.length; i += 1) {
      const [type, , options] = calls[i];
      const target = instances[i];
      if (
        type === 'wheel' &&
        target &&
        target.getAttribute &&
        target.getAttribute('data-testid') === 'pizarra-canvas-wrapper'
      ) {
        wrapperWheelCalls.push({ options });
      }
    }
    expect(wrapperWheelCalls.length).toBeGreaterThanOrEqual(1);
    expect(wrapperWheelCalls[0].options).toBeDefined();
    expect(wrapperWheelCalls[0].options.passive).toBe(false);
  });

  test('wheel listener is removed on unmount (cleanup)', async () => {
    flushSync(() => {
      root.render(
        React.createElement(PizarraCanvas, {
          elements: [],
          selectedElementIds: [],
          activeTool: 'select',
          toolSettings: {},
          onShapeCreate: () => {},
          onSelect: () => {},
          onDeselect: () => {},
          onUpdateElement: () => {},
          width: 800,
          height: 600,
        })
      );
    });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => {});

    const wrapper = container.querySelector('[data-testid="pizarra-canvas-wrapper"]');
    expect(wrapper).toBeTruthy();

    // Fire one event to confirm the handler is active.
    const event1 = buildWheelEvent(-100);
    wrapper.dispatchEvent(event1);
    expect(mockSetZoom).toHaveBeenCalledTimes(1);

    // Unmount. The useEffect cleanup should removeEventListener('wheel', ...)
    // off the wrapper, so subsequent dispatches must NOT call setZoom.
    flushSync(() => root.unmount());

    mockSetZoom.mockClear();
    const event2 = buildWheelEvent(-100);
    wrapper.dispatchEvent(event2);
    expect(mockSetZoom).not.toHaveBeenCalled();
  });
});

/**
 * PizarraCanvas wheel routing — pizarra-motion-polish (P-MP-4).
 *
 * Asserts the contract that the `PizarraCanvas` wheel handler routes
 * through `shouldCanvasConsumeWheel(event)`:
 *
 *   1. When the helper returns FALSE (event over a terminal/browser
 *      surface), the canvas does NOT call `setZoom` and does NOT
 *      mark `defaultPrevented = true` — the inner surface scrolls.
 *   2. When the helper returns TRUE (event over empty canvas), the
 *      canvas calls `setZoom` with the focal-aware result of
 *      `zoomAtPoint` and marks `defaultPrevented = true`.
 *
 * These two scenarios pin the routing contract after P-MP-4.
 *
 * The handler still attaches the native non-passive wheel listener
 * (the pizarra-wheel-passive-fix, asserted in the original
 * PizarraCanvas.wheel.test.jsx) — this file focuses on the
 * routing decision only.
 */

process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE = '0';

const React = require('react');
const { JSDOM } = require('jsdom');

const mockSetZoom = jest.fn();
const mockSetPan = jest.fn();

// Mocks for pizarraWheel.shouldCanvasConsumeWheel — controlled per-test.
const mockShouldCanvasConsumeWheel = jest.fn();
const mockZoomAtPoint = jest.fn();

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
    setPan: mockSetPan,
  }),
  CanvasViewportProvider: ({ children }) => children,
  // zoomAtPoint is the focal-zoom helper; mocked so we can pin
  // the exact value passed by the handler.
  zoomAtPoint: (...args) => mockZoomAtPoint(...args),
}));

jest.mock('@/lib/pizarra/pizarraWheel', () => ({
  shouldCanvasConsumeWheel: (...args) => mockShouldCanvasConsumeWheel(...args),
  isPizarraInteractiveWheelTarget: () => false,
  PIZARRA_INTERACTIVE_WHEEL_SELECTOR: '',
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
  function Stage(props) {
    return ReactLocal.createElement('div', { 'data-testid': 'konva-stage' }, props.children);
  }
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
  return { ...Konva, default: Konva };
});

function buildWheelEvent(deltaY, clientX = 100, clientY = 100) {
  const event = new global.Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'deltaY', { value: deltaY, configurable: true });
  Object.defineProperty(event, 'clientX', { value: clientX, configurable: true });
  Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
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

describe('PizarraCanvas — wheel routing via shouldCanvasConsumeWheel (P-MP-4)', () => {
  let dom;
  let container;
  let root;
  let PizarraCanvas;
  let createRoot;
  let flushSync;

  beforeEach(() => {
    mockSetZoom.mockClear();
    mockSetPan.mockClear();
    mockShouldCanvasConsumeWheel.mockReset();
    mockZoomAtPoint.mockReset();
    dom = installJsdom();

    jest.isolateModules(() => {
      createRoot = require('react-dom/client').createRoot;
      flushSync = require('react-dom').flushSync;
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
        // best-effort
      }
    }
    root = null;
    container = null;
  });

  // Helper: render the canvas and wait for the dynamic import.
  async function mount() {
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
    return container.querySelector('[data-testid="pizarra-canvas-wrapper"]');
  }

  test('wheel event over a terminal surface: shouldCanvasConsumeWheel returns false -> setZoom NOT called, defaultPrevented stays false', async () => {
    mockShouldCanvasConsumeWheel.mockReturnValue(false);
    mockZoomAtPoint.mockReturnValue({ zoom: 1.5, pan: { x: 0, y: 0 } });

    const wrapper = await mount();
    expect(wrapper).toBeTruthy();

    const event = buildWheelEvent(-100, 300, 250);
    wrapper.dispatchEvent(event);

    // The handler MUST consult shouldCanvasConsumeWheel.
    expect(mockShouldCanvasConsumeWheel).toHaveBeenCalledTimes(1);
    // It MUST NOT call setZoom when the helper says no.
    expect(mockSetZoom).not.toHaveBeenCalled();
    // It MUST NOT call preventDefault (the terminal scrolls normally).
    expect(event.defaultPrevented).toBe(false);
  });

  test('wheel event over empty canvas: shouldCanvasConsumeWheel returns true -> setZoom called with focal-aware delta, defaultPrevented true', async () => {
    mockShouldCanvasConsumeWheel.mockReturnValue(true);
    mockZoomAtPoint.mockReturnValue({ zoom: 1.25, pan: { x: 0, y: 0 } });

    const wrapper = await mount();
    expect(wrapper).toBeTruthy();

    const event = buildWheelEvent(-100, 400, 200);
    wrapper.dispatchEvent(event);

    // The handler MUST consult shouldCanvasConsumeWheel.
    expect(mockShouldCanvasConsumeWheel).toHaveBeenCalledTimes(1);
    // It MUST call zoomAtPoint with the focal coords (clientX - rect.left,
    // clientY - rect.top). The wrapper is in a fresh JSDOM body at
    // (0, 0) so focalX/Y === clientX/Y.
    expect(mockZoomAtPoint).toHaveBeenCalledTimes(1);
    const call = mockZoomAtPoint.mock.calls[0][0];
    expect(call.deltaY).toBe(-100);
    expect(call.focalX).toBe(400);
    expect(call.focalY).toBe(200);
    // It MUST call setZoom with the helper's result.
    expect(mockSetZoom).toHaveBeenCalledTimes(1);
    expect(mockSetZoom).toHaveBeenCalledWith(1.25);
    // It MUST preventDefault to stop the page-level browser zoom.
    expect(event.defaultPrevented).toBe(true);
  });
});

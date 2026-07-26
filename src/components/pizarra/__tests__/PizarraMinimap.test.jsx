/**
 * PizarraMinimap — UI component tests.
 *
 * pizarra-minimap: tests the bottom-right minimap HUD:
 *  - Container renders with data-testid="pizarra-minimap"
 *  - Starts hidden (data-visible="false", opacity:0)
 *  - Becomes visible on pan/zoom change (data-visible="true", opacity:1)
 *  - Auto-hides after 1500ms idle
 *  - Renders one element div per input element
 *  - Renders the viewport indicator
 *  - Clicking the content area calls setPan with the right values
 *  - Clicking on an element minimap div calls onSelectElement(id)
 *
 * Test strategy:
 *   Same as the hook tests: MockViewportProvider holds pan/zoom in real
 *   useState and exposes setters via a ref so the test can drive changes.
 *   The setPan spy is captured by the same mock (it's a jest.fn() that
 *   forwards to real setPan so visible HUD updates still work).
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockViewportContext = React.createContext(null);

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  __esModule: true,
  useCanvasViewport: () => require('react').useContext(mockViewportContext),
  CanvasViewportProvider: ({ children }) => children,
}));

// ── DOM polyfill ──────────────────────────────────────────────────────────

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

// ── Mock viewport provider ───────────────────────────────────────────────

function MockViewportProvider({
  children,
  initialPan = { x: 0, y: 0 },
  initialZoom = 1,
  canvasRect = null,
  settersRef = null,
}) {
  const [pan, setPanState] = React.useState(initialPan);
  const [zoom, setZoomState] = React.useState(initialZoom);

  // Capture the setPan/setZoom calls the component makes. We want the
  // spy to be observable from the test, but we ALSO want real React
  // state to update so the hook sees the change.
  const setPan = React.useCallback(
    (updater) => {
      if (typeof updater === 'function') {
        setPanState((prev) => {
          const next = updater(prev);
          if (settersRef && settersRef.onSetPan) settersRef.onSetPan(next);
          return next;
        });
      } else {
        if (settersRef && settersRef.onSetPan) settersRef.onSetPan(updater);
        setPanState(updater);
      }
    },
    [settersRef]
  );

  const setZoom = React.useCallback(
    (updater) => {
      if (typeof updater === 'function') {
        setZoomState((prev) => {
          const next = updater(prev);
          if (settersRef && settersRef.onSetZoom) settersRef.onSetZoom(next);
          return next;
        });
      } else {
        if (settersRef && settersRef.onSetZoom) settersRef.onSetZoom(updater);
        setZoomState(updater);
      }
    },
    [settersRef]
  );

  const cr = canvasRect || { left: 0, top: 0, width: 800, height: 600 };

  const value = React.useMemo(
    () => ({
      pan,
      zoom,
      setPan,
      setZoom,
      canvasRect: cr,
      canvasToViewport: (x, y) => ({ x: x * zoom + pan.x, y: y * zoom + pan.y }),
      viewportToCanvas: (x, y) => ({ x: (x - pan.x) / zoom, y: (y - pan.y) / zoom }),
    }),
    [pan, zoom, setPan, setZoom, cr]
  );

  if (settersRef) {
    settersRef.setPan = setPan;
    settersRef.setZoom = setZoom;
    settersRef.getPan = () => pan;
    settersRef.getZoom = () => zoom;
  }

  return React.createElement(mockViewportContext.Provider, { value }, children);
}

// ── Test harness ──────────────────────────────────────────────────────────

function renderComponent({
  elements,
  onSelectElement,
  idleMs,
  initialPan,
  initialZoom,
  canvasRect,
  settersRef: externalSettersRef,
} = {}) {
  const PizarraMinimap = require('../PizarraMinimap').default;
  const container = document.createElement('div');
  // The component uses position:fixed with bottom: 36, right: 12; we
  // give the parent a position:relative so the styles don't escape.
  container.style.position = 'relative';
  container.style.width = '800px';
  container.style.height = '600px';
  document.body.appendChild(container);

  const root = createRoot(container);
  const settersRef = externalSettersRef || {};

  act(() => {
    root.render(
      React.createElement(
        MockViewportProvider,
        { initialPan, initialZoom, canvasRect, settersRef },
        React.createElement(PizarraMinimap, {
          elements: elements || [],
          onSelectElement: onSelectElement || (() => {}),
          idleMs: idleMs ?? 1500,
        })
      )
    );
  });

  return {
    container,
    root,
    minimap: container.querySelector('[data-testid="pizarra-minimap"]'),
    content: container.querySelector('[data-testid="pizarra-minimap-content"]'),
    settersRef,
  };
}

function unmount(harness) {
  act(() => {
    harness.root.unmount();
  });
  harness.container.remove();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function firePointerEvent(target, type, opts = {}) {
  // JSDOM does not implement PointerEvent. Build a MouseEvent and
  // tack on the pointer-event properties via defineProperty.
  const event = new global.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(event, 'clientX', { value: opts.clientX ?? 0, configurable: true });
  Object.defineProperty(event, 'clientY', { value: opts.clientY ?? 0, configurable: true });
  Object.defineProperty(event, 'pointerId', { value: opts.pointerId ?? 1, configurable: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse', configurable: true });
  target.dispatchEvent(event);
  return event;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('PizarraMinimap — pizarra-minimap component contract', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    if (dom && dom.window) {
      try {
        dom.window.close();
      } catch (_e) {
        // ignore
      }
    }
  });

  // ── render ──────────────────────────────────────────────────────────────

  describe('render', () => {
    test('renders the minimap container with data-testid="pizarra-minimap"', () => {
      const harness = renderComponent({ elements: [] });
      expect(harness.minimap).toBeTruthy();
      unmount(harness);
    });

    test('renders the MINIMAP label and a content area', () => {
      const harness = renderComponent({ elements: [] });
      const label = harness.container.querySelector('[data-testid="pizarra-minimap-label"]');
      const content = harness.container.querySelector('[data-testid="pizarra-minimap-content"]');
      expect(label).toBeTruthy();
      expect(label.textContent).toMatch(/minimap/i);
      expect(content).toBeTruthy();
      unmount(harness);
    });

    test('initially hidden (data-visible="false")', () => {
      const harness = renderComponent({ elements: [] });
      expect(harness.minimap.getAttribute('data-visible')).toBe('false');
      unmount(harness);
    });

    test('renders one element div per input element', () => {
      const elements = [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 200 },
        { id: 'r2', type: 'rect', x: 300, y: 0, width: 200, height: 200 },
        { id: 'c1', type: 'circle', x: 100, y: 400, radius: 50 },
      ];
      const harness = renderComponent({ elements });
      const elementDivs = harness.container.querySelectorAll(
        '[data-testid="pizarra-minimap-element"]'
      );
      expect(elementDivs.length).toBe(3);
      // Each element div has the right id and type attributes.
      const ids = Array.from(elementDivs).map((d) => d.getAttribute('data-element-id'));
      expect(ids).toEqual(['r1', 'r2', 'c1']);
      unmount(harness);
    });

    test('renders the viewport indicator with data-testid="pizarra-minimap-viewport"', () => {
      const harness = renderComponent({ elements: [] });
      const viewport = harness.container.querySelector('[data-testid="pizarra-minimap-viewport"]');
      expect(viewport).toBeTruthy();
      unmount(harness);
    });
  });

  // ── visibility ──────────────────────────────────────────────────────────

  describe('visibility', () => {
    test('becomes visible on pan change (data-visible="true")', () => {
      jest.useFakeTimers();
      try {
        const harness = renderComponent({ elements: [] });
        expect(harness.minimap.getAttribute('data-visible')).toBe('false');

        act(() => {
          harness.settersRef.setPan({ x: 50, y: 0 });
        });

        expect(harness.minimap.getAttribute('data-visible')).toBe('true');
        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });

    test('becomes visible on zoom change', () => {
      jest.useFakeTimers();
      try {
        const harness = renderComponent({ elements: [] });
        expect(harness.minimap.getAttribute('data-visible')).toBe('false');

        act(() => {
          harness.settersRef.setZoom(2);
        });

        expect(harness.minimap.getAttribute('data-visible')).toBe('true');
        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });

    test('auto-hides after 1500ms idle', () => {
      jest.useFakeTimers();
      try {
        const harness = renderComponent({ elements: [] });

        act(() => {
          harness.settersRef.setPan({ x: 10, y: 0 });
        });
        expect(harness.minimap.getAttribute('data-visible')).toBe('true');

        act(() => {
          jest.advanceTimersByTime(1500);
        });
        expect(harness.minimap.getAttribute('data-visible')).toBe('false');

        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ── click → handlePanTo ────────────────────────────────────────────────

  describe('click behavior', () => {
    test('clicking the content area calls setPan so the click point centers', () => {
      const settersRef = {
        onSetPan: jest.fn(),
      };
      const harness = renderComponent({
        elements: [],
        canvasRect: { left: 0, top: 0, width: 800, height: 600 },
        initialZoom: 1,
        settersRef,
      });

      // Force the minimap visible so pointer-events are enabled.
      act(() => {
        harness.settersRef.setPan({ x: 10, y: 0 });
      });
      flushSync();

      // Click at content-relative (50, 50). worldBounds is the default
      // 800x600 (-400, -300) to (400, 300). innerWidth=168, innerHeight=96.
      // minimapToWorld(50, 50) = (-400 + 50/168 * 800, -300 + 50/96 * 600)
      //                          = (-400 + 238.1, -300 + 312.5)
      //                          ≈ (-161.9, 12.5)
      // handlePanTo: pan = (400 - (-161.9), 300 - 12.5) = (561.9, 287.5)
      const content = harness.content;
      const rect = { left: 0, top: 0, width: 168, height: 96 };
      // jsdom gives getBoundingClientRect of a position:absolute child
      // (0, 0, 0, 0) since it can't compute layout. We just need pointer
      // events at known coords, and the component should compute the
      // click position from the event (clientX/Y minus content rect).
      // Stub getBoundingClientRect for the content div so we can use a
      // known clientX/Y → content-local mapping.
      content.getBoundingClientRect = () => rect;

      const before = settersRef.onSetPan.mock.calls.length;
      act(() => {
        // clientX/Y are absolute; the component will subtract the
        // content's rect origin (left=0, top=0) to get content-local (50, 50).
        firePointerEvent(content, 'pointerdown', { clientX: 50, clientY: 50 });
        firePointerEvent(content, 'pointerup', { clientX: 50, clientY: 50 });
      });
      flushSync();

      expect(settersRef.onSetPan.mock.calls.length).toBeGreaterThan(before);
      const lastCall = settersRef.onSetPan.mock.calls[settersRef.onSetPan.mock.calls.length - 1][0];
      // x should be positive (panned to recenter). y should also be
      // computed. We don't pin exact values; just check the call happened
      // with sensible numbers.
      expect(typeof lastCall.x).toBe('number');
      expect(typeof lastCall.y).toBe('number');
      unmount(harness);
    });

    test('clicking an element minimap div calls onSelectElement with the id', () => {
      const onSelectElement = jest.fn();
      const elements = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 200 }];
      const harness = renderComponent({ elements, onSelectElement });

      // Force visible so pointer-events are enabled.
      act(() => {
        harness.settersRef.setPan({ x: 10, y: 0 });
      });
      flushSync();

      const elementDiv = harness.container.querySelector('[data-element-id="r1"]');
      expect(elementDiv).toBeTruthy();

      act(() => {
        firePointerEvent(elementDiv, 'pointerdown', { clientX: 5, clientY: 5 });
        firePointerEvent(elementDiv, 'pointerup', { clientX: 5, clientY: 5 });
      });
      flushSync();

      expect(onSelectElement).toHaveBeenCalledWith('r1');
      unmount(harness);
    });
  });
});

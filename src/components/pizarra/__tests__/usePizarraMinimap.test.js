/**
 * usePizarraMinimap — pure JS hook contract tests.
 *
 * pizarra-minimap (task: minimap-impl):
 *   - worldBounds correctly unions element bboxes (rect, circle, line/arrow, textbox, terminal, browser)
 *   - worldBounds applies 80px padding and clamps to a minimum 400x300
 *   - default 400x300 (or sensible fallback) for empty elements
 *   - `visible` starts false and becomes true on pan/zoom change, then auto-hides after 1500ms idle
 *   - minimapToWorld and worldToMinimap are inverse (within rounding)
 *   - handlePanTo(worldX, worldY) updates pan so the world point lands at the canvas center
 *
 * Test strategy:
 *   The hook reads from useCanvasViewport() — we mock that module to read from
 *   a real React Context we control. The MockViewportProvider holds pan/zoom
 *   in real useState and exposes setters via a ref so the test can drive changes.
 *   jest.useFakeTimers() is used to advance through the 1500ms idle timer.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');
const { JSDOM } = require('jsdom');

// ── Mock viewport context ──────────────────────────────────────────────────
//
// We mock the @/lib/pizarra/canvasViewport module to expose a useCanvasViewport
// hook that reads from a real React Context. The MockViewportProvider below
// stores pan/zoom in real useState so re-renders happen naturally when the
// setters are called. The test accesses those setters via a ref-like object.

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

// ── MockViewportProvider (real React state) ───────────────────────────────

function MockViewportProvider({
  children,
  initialPan = { x: 0, y: 0 },
  initialZoom = 1,
  canvasRect = null,
  settersRef = null,
}) {
  const [pan, setPan] = React.useState(initialPan);
  const [zoom, setZoom] = React.useState(initialZoom);

  // The CanvasViewportProvider shape — only fields the hook needs.
  // canvasRect is null by default; the hook should fall back to 800x600.
  const cr = canvasRect || null;

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
    [pan, zoom, cr]
  );

  // Expose setters to the test. Only do this when a ref-like is provided.
  if (settersRef) {
    settersRef.setPan = setPan;
    settersRef.setZoom = setZoom;
    settersRef.getPan = () => pan;
    settersRef.getZoom = () => zoom;
  }

  return React.createElement(mockViewportContext.Provider, { value }, children);
}

// ── Test harness ──────────────────────────────────────────────────────────

function renderHook({
  elements,
  onSelectElement,
  idleMs,
  padding,
  initialPan,
  initialZoom,
  canvasRect,
} = {}) {
  // Require the hook INSIDE the test function so the jest.mock above is in
  // place when the module is first evaluated.
  const usePizarraMinimap = require('../hooks/usePizarraMinimap').default;

  // latestResultRef holds the most recent return value of the hook so the
  // test can read it after React commits.
  const latestResultRef = { current: null };

  function TestHost() {
    latestResultRef.current = usePizarraMinimap({
      elements: elements || [],
      onSelectElement: onSelectElement || (() => {}),
      idleMs: idleMs ?? 1500,
      padding: padding ?? 80,
    });
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const settersRef = {};

  act(() => {
    root.render(
      React.createElement(
        MockViewportProvider,
        { initialPan, initialZoom, canvasRect, settersRef },
        React.createElement(TestHost)
      )
    );
  });

  return {
    getResult: () => latestResultRef.current,
    setters: settersRef,
    container,
    root,
  };
}

function unmount(harness) {
  act(() => {
    harness.root.unmount();
  });
  harness.container.remove();
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('usePizarraMinimap — pizarra-minimap hook contract', () => {
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

  // ── worldBounds ──────────────────────────────────────────────────────────

  describe('worldBounds', () => {
    test('empty elements returns a sensible default bbox', () => {
      const harness = renderHook({ elements: [] });
      const { worldBounds } = harness.getResult();
      // Default is 800x600 centered on origin so the minimap is useful out of
      // the box. Accept either 800x600 or 400x300 — both are documented in the
      // design. The contract here is: non-zero width AND height that
      // comfortably contain the origin.
      expect(worldBounds.width).toBeGreaterThan(0);
      expect(worldBounds.height).toBeGreaterThan(0);
      // Should contain the origin (0,0) so elements at the world origin are visible.
      expect(worldBounds.x).toBeLessThanOrEqual(0);
      expect(worldBounds.y).toBeLessThanOrEqual(0);
      expect(worldBounds.x + worldBounds.width).toBeGreaterThanOrEqual(0);
      expect(worldBounds.y + worldBounds.height).toBeGreaterThanOrEqual(0);
      unmount(harness);
    });

    test('unions 2 rects into a single bounding box with 80px padding', () => {
      const elements = [
        { id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 80 },
        { id: 'b', type: 'rect', x: 300, y: 200, width: 50, height: 50 },
      ];
      const harness = renderHook({ elements, padding: 80 });
      const { worldBounds } = harness.getResult();
      // Union spans (0,0) to (350,250). Padding of 80 on every side:
      expect(worldBounds.x).toBe(-80);
      expect(worldBounds.y).toBe(-80);
      expect(worldBounds.width).toBe(350 + 80 * 2);
      expect(worldBounds.height).toBe(250 + 80 * 2);
      unmount(harness);
    });

    test('handles circle by computing diameter from radius (2r x 2r)', () => {
      const elements = [
        // radius 300 → bbox 600x600, big enough that the 400x300 min
        // doesn't perturb the values.
        { id: 'c', type: 'circle', x: 500, y: 500, radius: 300 },
      ];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      // circle at (500,500) r=300 → bbox (200,200) to (800,800)
      expect(worldBounds.x).toBe(200);
      expect(worldBounds.y).toBe(200);
      expect(worldBounds.width).toBe(600);
      expect(worldBounds.height).toBe(600);
      unmount(harness);
    });

    test('handles line/arrow by computing bbox from points array (offset by x,y)', () => {
      // Line drawn with `points: [0,0, 500,400]` and shape origin (50,50):
      // absolute points are (50,50) and (550,450). bbox: (50,50)-(550,450).
      // Sizes chosen larger than 400x300 min-clamp so the bbox math is visible.
      const elements = [
        { id: 'l', type: 'line', x: 50, y: 50, points: [0, 0, 500, 400] },
        { id: 'a', type: 'arrow', x: -10, y: 0, points: [0, 0, 10, 100] },
      ];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      // Union: line bbox (50,50)-(550,450), arrow bbox (-10,0)-(0,100)
      // → (-10, 0) to (550, 450)
      expect(worldBounds.x).toBe(-10);
      expect(worldBounds.y).toBe(0);
      expect(worldBounds.width).toBe(560);
      expect(worldBounds.height).toBe(450);
      unmount(harness);
    });

    test('handles textbox using its own width/fontSize', () => {
      const elements = [
        // width > MIN_WORLD_WIDTH (400) and fontSize such that fontSize*1.4
        // > MIN_WORLD_HEIGHT (300). fontSize 250 → 350 height, bbox 500x350.
        { id: 't', type: 'textbox', x: 20, y: 30, width: 500, fontSize: 250 },
      ];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      expect(worldBounds.x).toBe(20);
      expect(worldBounds.y).toBe(30);
      expect(worldBounds.width).toBe(500);
      expect(worldBounds.height).toBeCloseTo(350);
      unmount(harness);
    });

    test('handles terminal with composite default 640x400', () => {
      const elements = [{ id: 'tm', type: 'terminal', x: 0, y: 0 }];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      expect(worldBounds.x).toBe(0);
      expect(worldBounds.y).toBe(0);
      expect(worldBounds.width).toBe(640);
      expect(worldBounds.height).toBe(400);
      unmount(harness);
    });

    test('handles browser with composite default 1024x700', () => {
      const elements = [{ id: 'br', type: 'browser', x: 0, y: 0 }];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      expect(worldBounds.width).toBe(1024);
      expect(worldBounds.height).toBe(700);
      unmount(harness);
    });

    test('clamps worldBounds to a minimum 400x300', () => {
      // A single tiny element with padding=0 would still produce a small bbox,
      // but the design says the minimap should always be at least 400x300.
      const elements = [{ id: 's', type: 'rect', x: 0, y: 0, width: 10, height: 10 }];
      const harness = renderHook({ elements, padding: 0 });
      const { worldBounds } = harness.getResult();
      expect(worldBounds.width).toBeGreaterThanOrEqual(400);
      expect(worldBounds.height).toBeGreaterThanOrEqual(300);
      unmount(harness);
    });
  });

  // ── visible HUD ─────────────────────────────────────────────────────────

  describe('visible HUD', () => {
    test('starts false on mount', () => {
      const harness = renderHook({ elements: [] });
      expect(harness.getResult().visible).toBe(false);
      unmount(harness);
    });

    test('becomes true after a pan change', () => {
      jest.useFakeTimers();
      try {
        const harness = renderHook({ elements: [] });
        expect(harness.getResult().visible).toBe(false);

        act(() => {
          harness.setters.setPan({ x: 50, y: 0 });
        });

        expect(harness.getResult().visible).toBe(true);
        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });

    test('becomes true after a zoom change', () => {
      jest.useFakeTimers();
      try {
        const harness = renderHook({ elements: [] });
        expect(harness.getResult().visible).toBe(false);

        act(() => {
          harness.setters.setZoom(2);
        });

        expect(harness.getResult().visible).toBe(true);
        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });

    test('auto-hides after 1500ms idle', () => {
      jest.useFakeTimers();
      try {
        const harness = renderHook({ elements: [] });

        act(() => {
          harness.setters.setPan({ x: 10, y: 0 });
        });
        expect(harness.getResult().visible).toBe(true);

        // Advance just under the threshold — still visible.
        act(() => {
          jest.advanceTimersByTime(1499);
        });
        expect(harness.getResult().visible).toBe(true);

        // Cross the threshold — should hide.
        act(() => {
          jest.advanceTimersByTime(2);
        });
        expect(harness.getResult().visible).toBe(false);

        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });

    test('resets the idle timer on subsequent pan/zoom changes', () => {
      jest.useFakeTimers();
      try {
        const harness = renderHook({ elements: [] });

        act(() => {
          harness.setters.setPan({ x: 10, y: 0 });
        });
        // 1000ms pass — still visible.
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        expect(harness.getResult().visible).toBe(true);

        // New pan change — timer should reset.
        act(() => {
          harness.setters.setPan({ x: 20, y: 0 });
        });

        // 1000ms after the new change — still visible (timer reset).
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        expect(harness.getResult().visible).toBe(true);

        // 600 more ms (1500 from the new change) — should hide.
        act(() => {
          jest.advanceTimersByTime(600);
        });
        expect(harness.getResult().visible).toBe(false);

        unmount(harness);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ── minimapToWorld / worldToMinimap ──────────────────────────────────────

  describe('coordinate translators', () => {
    test('minimapToWorld and worldToMinimap are inverse', () => {
      const elements = [{ id: 'a', type: 'rect', x: 0, y: 0, width: 400, height: 300 }];
      const harness = renderHook({ elements, padding: 0 });
      const { minimapToWorld, worldToMinimap } = harness.getResult();

      // Pick a non-trivial world point and round-trip through both translators.
      const world = { x: 137, y: 89 };
      const minimap = worldToMinimap(world.x, world.y);
      const back = minimapToWorld(minimap.x, minimap.y);
      expect(back.x).toBeCloseTo(world.x);
      expect(back.y).toBeCloseTo(world.y);
      unmount(harness);
    });
  });

  // ── handlePanTo ─────────────────────────────────────────────────────────

  describe('handlePanTo', () => {
    test('pans so the world point lands at the canvas center', () => {
      // canvasRect 800x600, zoom 1 → expected pan so world (100,200) centers:
      // pan.x = canvasW/2 - worldX*zoom = 400 - 100 = 300
      // pan.y = canvasH/2 - worldY*zoom = 300 - 200 = 100
      const harness = renderHook({
        elements: [],
        canvasRect: { left: 0, top: 0, width: 800, height: 600 },
        initialZoom: 1,
      });

      act(() => {
        harness.getResult().handlePanTo(100, 200);
      });

      expect(harness.setters.getPan()).toEqual({ x: 300, y: 100 });
      unmount(harness);
    });

    test('respects zoom when centering', () => {
      // zoom 2, canvas 800x600, world (50,50) → pan = (400 - 100, 300 - 100) = (300, 200)
      const harness = renderHook({
        elements: [],
        canvasRect: { left: 0, top: 0, width: 800, height: 600 },
        initialZoom: 2,
      });

      act(() => {
        harness.getResult().handlePanTo(50, 50);
      });

      expect(harness.setters.getPan()).toEqual({ x: 300, y: 200 });
      unmount(harness);
    });
  });
});

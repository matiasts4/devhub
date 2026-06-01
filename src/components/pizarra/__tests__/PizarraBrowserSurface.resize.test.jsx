/**
 * PizarraBrowserSurface — border resize contract (pizarra-drag-resize-polish).
 *
 * Parallels the CanvasTerminal resize contract: the Konva Transformer
 * is excluded for BROWSER shapes (composite type), and the element
 * exposes 8 border-based resize handles. The user resizes by
 * grabbing an edge or corner.
 *
 * Unique to the browser:
 * - The resize commits via `onUpdateElement({id, x, y, width, height})`
 *   instead of `onResize(bounds)`.
 * - The drag-handle button (top-left Move icon) MUST be excluded
 *   from the resize hit-area. handleResizeStart bails when the
 *   mousedown originates from the drag handle (closest() guard).
 * - The handles are only mounted when `selected={true}`.
 *
 * Test strategy: mirror the existing PizarraBrowserSurface.test.jsx
 * setup (WorkspaceBrowserPane mock, useNativeBrowserSurface mock,
 * JSDOM) and add the resize + handle-visibility scenarios.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync, act: flushSyncAct } = require('react-dom');
const { JSDOM } = require('jsdom');

let capturedWorkspacePaneProps = null;
let mockUseNativeBrowserCapability = () => null;

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/components/workspace/WorkspaceBrowserPane', () => ({
  __esModule: true,
  default: (props) => {
    const ReactLocal = require('react');
    capturedWorkspacePaneProps = props;
    return ReactLocal.createElement('div', {
      'data-testid': 'workspace-browser-pane',
    });
  },
}));

jest.mock('@/components/workspace/useNativeBrowserSurface', () => ({
  __esModule: true,
  useNativeBrowserCapability: () => mockUseNativeBrowserCapability(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

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

const SHAPE = { id: 'browser-resize-shape', label: 'Browser', url: 'http://localhost:3100/' };
const START_BOUNDS = { x: 20, y: 40, width: 400, height: 320 };

function renderBrowser({ onUpdateElement, selected = true } = {}) {
  const { default: PizarraBrowserSurface } = require('../PizarraBrowserSurface');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      React.createElement(PizarraBrowserSurface, {
        shape: SHAPE,
        bounds: START_BOUNDS,
        selected,
        onUpdateElement: onUpdateElement || jest.fn(),
      })
    );
  });
  return { container, root };
}

function unmountBrowser(harness) {
  flushSync(() => harness.root.unmount());
  harness.container.remove();
}

function getHandle(testid) {
  return document.querySelector(`[data-testid="${testid}"]`);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PizarraBrowserSurface — border resize (pizarra-drag-resize-polish)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    capturedWorkspacePaneProps = null;
    mockUseNativeBrowserCapability = () => null;
    jest.clearAllMocks();

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
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  test('e: mousedown on east handle + mousemove +50px → onUpdateElement width = oldW + 50', () => {
    const onUpdateElement = jest.fn();
    const harness = renderBrowser({ onUpdateElement });

    const handle = getHandle('pizarra-browser-resize-e');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 100, 100, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 150, 100, 0));
    });

    expect(onUpdateElement).toHaveBeenCalledWith(SHAPE.id, {
      x: 20,
      y: 40,
      width: 450, // 400 + 50
      height: 320,
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 150, 100, 0));
    });
    unmountBrowser(harness);
  });

  test('w: mousedown on west handle + mousemove +50px → onUpdateElement width = oldW - 50 AND x = oldX + 50', () => {
    const onUpdateElement = jest.fn();
    const harness = renderBrowser({ onUpdateElement });

    const handle = getHandle('pizarra-browser-resize-w');
    expect(handle).toBeTruthy();

    flushSync(() => {
      handle.dispatchEvent(makeMouseEvent('mousedown', 200, 100, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 250, 100, 0));
    });

    expect(onUpdateElement).toHaveBeenCalledWith(SHAPE.id, {
      x: 70, // 20 + (400 - 350)
      y: 40,
      width: 350, // 400 - 50
      height: 320,
    });

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 250, 100, 0));
    });
    unmountBrowser(harness);
  });

  test('drag-handle exclusion: mousedown on pizarra-drag-handle must NOT start a resize', () => {
    const onUpdateElement = jest.fn();
    const harness = renderBrowser({ onUpdateElement });

    const dragHandle = getHandle('pizarra-drag-handle');
    expect(dragHandle).toBeTruthy();

    // Dispatch mousedown on the drag handle (the Move icon button).
    // The resize handler's closest() guard must bail out.
    flushSync(() => {
      dragHandle.dispatchEvent(makeMouseEvent('mousedown', 30, 60, 0));
    });
    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 100, 200, 0));
    });

    // The drag handle is for moving the surface, not resizing. The
    // browser resize handler bails when the mousedown originates from
    // the drag handle. Therefore onUpdateElement must NOT be called
    // with bounds (it might be called by other code paths; we only
    // assert that no call had width/height changes consistent with
    // a resize).
    const resizeCalls = onUpdateElement.mock.calls.filter((call) => {
      const bounds = call[1];
      return bounds && typeof bounds === 'object' && ('width' in bounds || 'height' in bounds);
    });
    expect(resizeCalls).toHaveLength(0);

    flushSync(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup', 100, 200, 0));
    });
    unmountBrowser(harness);
  });

  test('selected-only: resize handles are NOT in DOM when selected={false}', () => {
    const onUpdateElement = jest.fn();
    const harness = renderBrowser({ onUpdateElement, selected: false });

    // All 8 handles must be absent.
    expect(getHandle('pizarra-browser-resize-n')).toBeNull();
    expect(getHandle('pizarra-browser-resize-s')).toBeNull();
    expect(getHandle('pizarra-browser-resize-e')).toBeNull();
    expect(getHandle('pizarra-browser-resize-w')).toBeNull();
    expect(getHandle('pizarra-browser-resize-nw')).toBeNull();
    expect(getHandle('pizarra-browser-resize-ne')).toBeNull();
    expect(getHandle('pizarra-browser-resize-sw')).toBeNull();
    expect(getHandle('pizarra-browser-resize-se')).toBeNull();

    unmountBrowser(harness);
  });

  test('selected-true: all 8 resize handles are in the DOM', () => {
    const onUpdateElement = jest.fn();
    const harness = renderBrowser({ onUpdateElement, selected: true });

    // All 8 handles must be present (4 edges + 4 corners).
    expect(getHandle('pizarra-browser-resize-n')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-s')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-e')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-w')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-nw')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-ne')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-sw')).toBeTruthy();
    expect(getHandle('pizarra-browser-resize-se')).toBeTruthy();

    // Sanity: the drag handle is also still present (it's a separate
    // UI element on the wrapper, not gated by selected).
    expect(getHandle('pizarra-drag-handle')).toBeTruthy();

    unmountBrowser(harness);
  });
});

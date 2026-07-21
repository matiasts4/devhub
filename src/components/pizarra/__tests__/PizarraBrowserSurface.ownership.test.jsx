/**
 * PizarraBrowserSurface — pizarra-exit-native-ownership-fix.
 *
 * Regression: after leaving pizarra (dockState.visible=false /
 * maximized=false), the browser surface stays warm-mounted inside the
 * collapsed right-dock layer. Its carried-browser bounds sync effect used
 * to re-fire on the canvas re-measure and call
 * setNativeBrowserVisibility({ visible: true, bounds }) with the shrunken
 * canvas rect, winning the race against the workspace pane that re-claims
 * the shared native guest — the browser then looked "collapsed" into the
 * right column in normal mode.
 *
 * Fix: PizarraLiveSurfaceLayer passes `pizarraOwnsLiveSurfaces` and the
 * surface stops writing native bounds/visibility when it does not own the
 * live surfaces.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { act } = require('react');
const { JSDOM } = require('jsdom');

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/components/workspace/WorkspaceBrowserPane', () => ({
  __esModule: true,
  default: () => {
    const ReactLocal = require('react');
    // The carried-sync effect queries this shell inside the surface root.
    return ReactLocal.createElement('div', { 'data-testid': 'browser-viewport-shell' });
  },
}));

jest.mock('@/components/workspace/useNativeBrowserSurface', () => ({
  __esModule: true,
  useNativeBrowserCapability: () => null,
}));

const mockRaiseNativeBrowser = jest.fn(() => Promise.resolve({}));
const mockResizeNativeBrowser = jest.fn(() => Promise.resolve({}));
const mockSetNativeBrowserVisibility = jest.fn(() => Promise.resolve({}));

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  __esModule: true,
  raiseNativeBrowser: (...args) => mockRaiseNativeBrowser(...args),
  resizeNativeBrowser: (...args) => mockResizeNativeBrowser(...args),
  setNativeBrowserVisibility: (...args) => mockSetNativeBrowserVisibility(...args),
}));

describe('PizarraBrowserSurface — native ownership guard on pizarra exit', () => {
  let container;
  let root;
  let dom;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
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

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  function patchShellRect() {
    const shell = container.querySelector('[data-testid="browser-viewport-shell"]');
    shell.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      width: 500,
      height: 400,
      right: 600,
      bottom: 500,
    });
    return shell;
  }

  function renderCarriedSurface({ pizarraOwnsLiveSurfaces, bounds }) {
    const { default: PizarraBrowserSurface } = require('../PizarraBrowserSurface');
    act(() => {
      root.render(
        React.createElement(PizarraBrowserSurface, {
          shape: {
            id: 'surface-1',
            label: 'Browser',
            url: 'http://localhost:3100/',
            // Carried from workspace: shares the workspace native panel id.
            panelId: 'browser-proj-ws1',
          },
          bounds,
          projectId: 'proj',
          workspaceId: 'ws1',
          pizarraOwnsLiveSurfaces,
        })
      );
    });
  }

  test('ownership=true: carried surface syncs native bounds and shows the guest', () => {
    jest.useFakeTimers();
    renderCarriedSurface({
      pizarraOwnsLiveSurfaces: true,
      bounds: { x: 0, y: 0, width: 400, height: 300 },
    });
    patchShellRect();

    // Trigger the effect again via a bounds change so the (now patched)
    // shell rect is written to the native guest.
    renderCarriedSurface({
      pizarraOwnsLiveSurfaces: true,
      bounds: { x: 10, y: 10, width: 400, height: 300 },
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockSetNativeBrowserVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'browser-proj-ws1', visible: true })
    );
  });

  test('ownership=false: carried surface never re-shows the guest after pizarra exit', () => {
    jest.useFakeTimers();
    renderCarriedSurface({
      pizarraOwnsLiveSurfaces: false,
      bounds: { x: 0, y: 0, width: 400, height: 300 },
    });
    patchShellRect();

    // Simulate the canvas re-measure while the dock layer collapses to the
    // right column after exiting pizarra.
    renderCarriedSurface({
      pizarraOwnsLiveSurfaces: false,
      bounds: { x: 900, y: 10, width: 220, height: 300 },
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    const visibleShows = mockSetNativeBrowserVisibility.mock.calls.filter(
      ([payload]) => payload?.visible === true
    );
    expect(visibleShows).toEqual([]);
    expect(mockResizeNativeBrowser).not.toHaveBeenCalled();
  });
});

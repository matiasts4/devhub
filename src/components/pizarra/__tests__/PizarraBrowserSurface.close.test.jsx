/**
 * PizarraBrowserSurface close button tests.
 *
 * Covers pizarra-close-buttons: the in-header X button must
 *   1. render with data-testid="pizarra-browser-close",
 *   2. call onClose once with the shape id when clicked,
 *   3. NOT trigger the top-left drag handle (mousedown stopPropagation
 *      keeps the move drag hook idle).
 *
 * Mirrors the rendering pattern in PizarraBrowserSurface.test.jsx
 * (JSDOM + react-dom/client + flushSync). The lucide-react, native
 * capability hook, and WorkspaceBrowserPane are mocked the same way.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
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
    const dockState = props.dockState || {};
    const browserUrl = dockState.browserUrl || 'about:blank';
    return ReactLocal.createElement(
      'div',
      { 'data-testid': 'workspace-browser-pane' },
      ReactLocal.createElement('input', {
        'data-testid': 'browser-url-input',
        defaultValue: browserUrl,
      }),
      ReactLocal.createElement('iframe', {
        'data-testid': 'pizarra-mock-iframe',
        src: browserUrl,
      })
    );
  },
}));

jest.mock('@/components/workspace/useNativeBrowserSurface', () => ({
  __esModule: true,
  useNativeBrowserCapability: () => mockUseNativeBrowserCapability(),
}));

// Spy on the drag hook so the "no drag triggered" assertion is
// grounded in real code, not an inferred side effect.
const dragHookSpy = jest.fn();
jest.mock('../usePizarraSurfaceDrag', () => ({
  __esModule: true,
  default: (config) => {
    dragHookSpy(config);
    return (event) => {
      config?.onSelect?.(config.surfaceId);
    };
  },
}));

describe('PizarraBrowserSurface close button', () => {
  let container;
  let root;
  let dom;

  beforeEach(() => {
    capturedWorkspacePaneProps = null;
    mockUseNativeBrowserCapability = () => null;
    dragHookSpy.mockClear();
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

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function renderSurface(extra = {}) {
    const { default: PizarraBrowserSurface } = require('../PizarraBrowserSurface');
    flushSync(() => {
      root.render(
        React.createElement(PizarraBrowserSurface, {
          shape: { id: 'browser-1', label: 'Browser', url: 'http://localhost:3100/' },
          bounds: { x: 20, y: 40, width: 400, height: 320 },
          ...extra,
        })
      );
    });
  }

  it('renders the close button with the expected testid when mounted', () => {
    renderSurface({ onClose: jest.fn() });

    const closeBtn = container.querySelector('[data-testid="pizarra-browser-close"]');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.getAttribute('data-pizarra-close-button')).toBe('true');
    expect(closeBtn.getAttribute('aria-label')).toBe('Cerrar navegador');
    expect(closeBtn.getAttribute('title')).toBe('Cerrar navegador');
    expect(closeBtn.getAttribute('type')).toBe('button');
  });

  it('calls onClose once with the shape id when the close button is clicked', () => {
    const onClose = jest.fn();
    renderSurface({ onClose });

    const closeBtn = container.querySelector('[data-testid="pizarra-browser-close"]');
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('browser-1');
  });

  it('does not trigger the drag handle when the close button is clicked', () => {
    const onMove = jest.fn();
    const onSelect = jest.fn();
    renderSurface({
      onClose: jest.fn(),
      onMove,
      onSelect,
    });

    const closeBtn = container.querySelector('[data-testid="pizarra-browser-close"]');
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    // The drag handler mock only fires when its returned function is
    // called (i.e., when a mousedown reaches the drag handle button).
    // The close button's stopPropagation must keep this from
    // happening. Assert onSelect (the drag hook's first action) and
    // onMove stay quiet.
    expect(onSelect).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });
});

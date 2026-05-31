const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockFocusNativeBrowser = jest.fn(() => Promise.resolve());

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const R = require('react');
    return R.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  focusNativeBrowser: mockFocusNativeBrowser,
}));

jest.mock('@/components/workspace/useNativeBrowserSurface', () => ({
  useNativeBrowserCapability: () => ({ ready: true }),
  useNativeBrowserSurface: () => ({ nativeRuntimeReady: true }),
}));

describe('PizarraBrowserSurface', () => {
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
  });

  test('uses the browser header as a drag handle without breaking native focus selection', async () => {
    const onMove = jest.fn();
    const onSelect = jest.fn();
    const { default: PizarraBrowserSurface } = require('../PizarraBrowserSurface');

    flushSync(() => {
      root.render(
        React.createElement(PizarraBrowserSurface, {
          shape: {
            id: 'browser-1',
            label: 'Browser',
            url: 'http://localhost:3200/',
          },
          bounds: { x: 20, y: 40, width: 400, height: 320 },
          onSelect,
          onMove,
        })
      );
    });

    const header = document.querySelector('[data-testid="pizarra-browser-header-browser-1"]');
    flushSync(() => {
      header.dispatchEvent(
        new window.MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: 12,
          clientY: 16,
        })
      );
    });
    flushSync(() => {
      window.dispatchEvent(
        new window.MouseEvent('mousemove', {
          bubbles: true,
          clientX: 27,
          clientY: 36,
        })
      );
    });
    flushSync(() => {
      window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    });

    const viewport = document.querySelector('[data-testid="pizarra-browser-native-runtime-shell-browser-1"]');
    flushSync(() => {
      viewport.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith('browser-1');
    expect(onMove).toHaveBeenCalledWith({
      id: 'browser-1',
      panelId: 'pizarra-browser-browser-1',
      deltaX: 15,
      deltaY: 20,
      totalDeltaX: 15,
      totalDeltaY: 20,
    });
    expect(mockFocusNativeBrowser).toHaveBeenCalledWith({ panelId: 'pizarra-browser-browser-1' });
  });
});
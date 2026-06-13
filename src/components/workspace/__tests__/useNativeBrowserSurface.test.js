/**
 * Regression: probe.ready must not skip native_browser_open (panel-not-found).
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

const mockOpen = jest.fn();
const mockLoad = jest.fn();
const mockResize = jest.fn();
const mockVisibility = jest.fn();
const mockFocus = jest.fn();
const mockClose = jest.fn();
const mockProbe = jest.fn();

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  openNativeBrowser: (...args) => mockOpen(...args),
  loadNativeBrowserUrl: (...args) => mockLoad(...args),
  resizeNativeBrowser: (...args) => mockResize(...args),
  setNativeBrowserVisibility: (...args) => mockVisibility(...args),
  focusNativeBrowser: (...args) => mockFocus(...args),
  closeNativeBrowser: (...args) => mockClose(...args),
  probeNativeBrowser: (...args) => mockProbe(...args),
}));

function Harness({ url = 'https://github.com/', active = true, visibleInLayout = true }) {
  const ref = React.useRef(null);
  const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
  const measureBounds = React.useCallback(
    () => ({
      x: 100,
      y: 80,
      width: 640,
      height: 480,
    }),
    []
  );

  const { nativeRuntimeReady, nativeError } = useNativeBrowserSurface({
    panelId: 'browser-test-ws',
    url,
    active,
    visibleInLayout,
    measureBounds,
    observeNode: ref,
  });

  return React.createElement(
    'div',
    {
      ref,
      'data-testid': 'browser-viewport',
      'data-ready': nativeRuntimeReady ? 'true' : 'false',
      'data-error': nativeError || '',
      style: { width: 640, height: 480 },
    },
    nativeError || 'ok'
  );
}

describe('useNativeBrowserSurface', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    jest.clearAllMocks();
    mockProbe.mockResolvedValue({
      ready: true,
      persistentProfile: true,
      capabilities: { persistentProfile: true },
    });
    mockOpen.mockResolvedValue({ opened: true, reason: null });
    mockLoad.mockResolvedValue({ loaded: true, reason: null });
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});
    mockFocus.mockResolvedValue({});
    mockClose.mockResolvedValue({});
  });

  test('recovers from panel-not-found on load by reopening', async () => {
    mockOpen
      .mockResolvedValueOnce({ opened: true, reason: null })
      .mockResolvedValueOnce({ opened: true, reason: null });
    mockLoad
      .mockResolvedValueOnce({ loaded: false, reason: 'panel-not-found' })
      .mockResolvedValueOnce({ loaded: true, reason: null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function RecoveryHarness() {
      const ref = React.useRef(null);
      const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
      const [url, setUrl] = React.useState('https://github.com/');
      const measureBounds = React.useCallback(
        () => ({ x: 100, y: 80, width: 640, height: 480 }),
        []
      );

      React.useEffect(() => {
        const timer = setTimeout(() => setUrl('https://example.com/docs'), 0);
        return () => clearTimeout(timer);
      }, []);

      const { nativeRuntimeReady, nativeError } = useNativeBrowserSurface({
        panelId: 'browser-test-ws',
        url,
        active: true,
        visibleInLayout: true,
        measureBounds,
        observeNode: ref,
      });

      return React.createElement('div', {
        ref,
        'data-testid': 'browser-viewport',
        'data-ready': nativeRuntimeReady ? 'true' : 'false',
        'data-error': nativeError || '',
      });
    }

    flushSync(() => {
      root.render(React.createElement(RecoveryHarness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(mockLoad).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="browser-viewport"]')?.dataset.error).toBe('');
    expect(container.querySelector('[data-testid="browser-viewport"]')?.dataset.ready).toBe('true');

    root.unmount();
    container.remove();
  });

  test('always opens native panel even when probe reports ready', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'browser-test-ws',
        url: 'https://github.com/',
        bounds: expect.objectContaining({ width: 640, height: 480 }),
      })
    );
    expect(mockLoad).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="browser-viewport"]')?.dataset.ready).toBe('true');

    root.unmount();
    container.remove();
  });

  afterEach(() => {
    dom?.window?.close();
  });
});
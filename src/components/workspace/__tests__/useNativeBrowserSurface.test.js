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

const mockRaise = jest.fn();
const mockAwaitSweep = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  openNativeBrowser: (...args) => mockOpen(...args),
  loadNativeBrowserUrl: (...args) => mockLoad(...args),
  resizeNativeBrowser: (...args) => mockResize(...args),
  setNativeBrowserVisibility: (...args) => mockVisibility(...args),
  focusNativeBrowser: (...args) => mockFocus(...args),
  closeNativeBrowser: (...args) => mockClose(...args),
  probeNativeBrowser: (...args) => mockProbe(...args),
  raiseNativeBrowser: (...args) => mockRaise(...args),
  awaitNativeBrowserStartupSweep: (...args) => mockAwaitSweep(...args),
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
    mockAwaitSweep.mockResolvedValue(undefined);
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
    mockRaise.mockResolvedValue({});
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOpen.mock.calls.length).toBeGreaterThanOrEqual(2);
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
    await new Promise((resolve) => setTimeout(resolve, 50));

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

  test('hides native panel when not visible in layout instead of closing it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function ToggleHarness() {
      const ref = React.useRef(null);
      const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
      const [visibleInLayout, setVisibleInLayout] = React.useState(true);
      const measureBounds = React.useCallback(
        () => ({ x: 100, y: 80, width: 640, height: 480 }),
        []
      );

      React.useEffect(() => {
        const timer = setTimeout(() => setVisibleInLayout(false), 0);
        return () => clearTimeout(timer);
      }, []);

      useNativeBrowserSurface({
        panelId: 'browser-test-ws',
        url: 'https://github.com/',
        active: true,
        visibleInLayout,
        measureBounds,
        observeNode: ref,
      });

      return React.createElement('div', { ref, 'data-testid': 'browser-viewport' });
    }

    flushSync(() => {
      root.render(React.createElement(ToggleHarness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOpen).toHaveBeenCalled();
    expect(mockVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'browser-test-ws', visible: false })
    );
    expect(mockClose).not.toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'browser-test-ws', reason: 'not-visible-in-layout' })
    );

    root.unmount();
    container.remove();
  });

  test('boundsArePlausible accepts full-height right dock panels', () => {
    const { boundsArePlausible } = require('../useNativeBrowserSurface');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    expect(
      boundsArePlausible({
        x: 1088,
        y: 52,
        width: 512,
        height: 848,
      })
    ).toBe(true);

    expect(
      boundsArePlausible({
        x: 0,
        y: 0,
        width: 1600,
        height: 900,
      })
    ).toBe(false);
  });

  test('awaits startup sweep before opening native panel', async () => {
    let releaseSweep;
    const sweepGate = new Promise((resolve) => {
      releaseSweep = resolve;
    });
    mockAwaitSweep.mockImplementation(() => sweepGate);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockAwaitSweep).toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();

    releaseSweep();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'browser-test-ws',
        url: 'https://github.com/',
      })
    );

    root.unmount();
    container.remove();
  });

  test('reopens when post-open visibility returns panel-not-found', async () => {
    mockOpen
      .mockResolvedValueOnce({ opened: true, reason: null })
      .mockResolvedValueOnce({ opened: true, reason: null });
    // First show after open: child already gone (startup purge race).
    mockVisibility.mockResolvedValueOnce({ reason: 'panel-not-found' }).mockResolvedValue({});
    mockResize.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    // Open throttle is 400ms after a successful open; wait past it for recovery reopen.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(mockOpen.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="browser-viewport"]')?.dataset.ready).toBe('true');

    root.unmount();
    container.remove();
  });

  test('reopens when resize returns panel-not-found after open', async () => {
    mockOpen
      .mockResolvedValueOnce({ opened: true, reason: null })
      .mockResolvedValueOnce({ opened: true, reason: null });
    mockResize.mockResolvedValueOnce({ reason: 'panel-not-found' }).mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(mockOpen.mock.calls.length).toBeGreaterThanOrEqual(2);

    root.unmount();
    container.remove();
  });

  test('resizes while occluded so reveal uses updated bounds', async () => {
    mockOpen.mockResolvedValue({ opened: true, reason: null });
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function OccludeHarness() {
      const ref = React.useRef(null);
      const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
      const [occlude, setOcclude] = React.useState(false);
      const [box, setBox] = React.useState({ x: 100, y: 80, width: 640, height: 480 });
      const measureBounds = React.useCallback(() => box, [box]);

      React.useEffect(() => {
        const t1 = setTimeout(() => setOcclude(true), 30);
        const t2 = setTimeout(() => setBox({ x: 100, y: 80, width: 400, height: 480 }), 60);
        const t3 = setTimeout(() => setOcclude(false), 100);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }, []);

      useNativeBrowserSurface({
        panelId: 'browser-test-ws',
        url: 'https://github.com/',
        active: true,
        visibleInLayout: true,
        measureBounds,
        observeNode: ref,
        occludeNative: occlude,
      });

      return React.createElement('div', { ref, 'data-testid': 'browser-viewport' });
    }

    flushSync(() => {
      root.render(React.createElement(OccludeHarness));
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const resizedHidden = mockResize.mock.calls.some((call) => call[0]?.bounds?.width === 400);
    expect(resizedHidden).toBe(true);
    expect(mockVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'browser-test-ws', visible: false })
    );
    expect(mockVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'browser-test-ws', visible: true })
    );

    root.unmount();
    container.remove();
  });

  test('clears lease when external close event fires', async () => {
    mockOpen.mockResolvedValue({ opened: true, reason: null });
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOpen).toHaveBeenCalledTimes(1);
    const opensAfterMount = mockOpen.mock.calls.length;

    window.dispatchEvent(
      new window.CustomEvent('devhub:native-browser-closed', {
        detail: { panelId: 'browser-test-ws', reason: 'dock-not-browser' },
      })
    );
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Intentional dock close must clear lease without auto-reopen fight.
    expect(mockOpen.mock.calls.length).toBe(opensAfterMount);

    root.unmount();
    container.remove();
  });

  test('applyNativeBounds drains latest request after in-flight IPC', async () => {
    const { applyNativeBounds } = require('../useNativeBrowserSurface');
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    mockResize.mockImplementationOnce(() => firstGate.then(() => ({})));
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const panelId = 'browser-coalesce-ws';
    const p1 = applyNativeBounds(panelId, { x: 10, y: 80, width: 300, height: 400 }, [], {
      visible: true,
      resizeOnly: false,
    });
    const p2 = applyNativeBounds(panelId, { x: 10, y: 80, width: 500, height: 400 }, [], {
      visible: true,
      resizeOnly: true,
    });

    await Promise.resolve();
    releaseFirst();
    await Promise.all([p1, p2]);

    const widths = mockResize.mock.calls.map((c) => c[0]?.bounds?.width);
    expect(widths).toContain(500);
    expect(widths[widths.length - 1]).toBe(500);
  });

  test('does not open until layoutReady is true', async () => {
    mockOpen.mockResolvedValue({ opened: true, reason: null });
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function LayoutGateHarness() {
      const ref = React.useRef(null);
      const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
      const [layoutReady, setLayoutReady] = React.useState(false);
      const measureBounds = React.useCallback(
        () => ({ x: 100, y: 80, width: 640, height: 480 }),
        []
      );

      React.useEffect(() => {
        const timer = setTimeout(() => setLayoutReady(true), 40);
        return () => clearTimeout(timer);
      }, []);

      useNativeBrowserSurface({
        panelId: 'browser-test-ws',
        url: 'https://github.com/',
        active: true,
        visibleInLayout: true,
        measureBounds,
        observeNode: ref,
        layoutReady,
      });

      return React.createElement('div', { ref, 'data-testid': 'browser-viewport' });
    }

    flushSync(() => {
      root.render(React.createElement(LayoutGateHarness));
    });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockOpen).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockOpen).toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  test('layoutSyncKey forces resize reapply even when CSS bounds are unchanged', async () => {
    mockOpen.mockResolvedValue({ opened: true, reason: null });
    mockLoad.mockResolvedValue({ loaded: true, reason: null });
    mockResize.mockResolvedValue({});
    mockVisibility.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const box = { x: 100, y: 80, width: 640, height: 480 };

    function SyncKeyHarness({ layoutSyncKey }) {
      const ref = React.useRef(null);
      const { useNativeBrowserSurface } = require('../useNativeBrowserSurface');
      const measureBounds = React.useCallback(() => box, []);

      useNativeBrowserSurface({
        panelId: 'browser-sync-key-ws',
        url: 'https://github.com/',
        active: true,
        visibleInLayout: true,
        measureBounds,
        observeNode: ref,
        layoutSyncKey,
        layoutReady: true,
      });

      return React.createElement('div', { ref, 'data-testid': 'browser-viewport' });
    }

    flushSync(() => {
      root.render(React.createElement(SyncKeyHarness, { layoutSyncKey: 1 }));
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockOpen).toHaveBeenCalled();
    const resizeAfterOpen = mockResize.mock.calls.length;
    expect(resizeAfterOpen).toBeGreaterThan(0);

    flushSync(() => {
      root.render(React.createElement(SyncKeyHarness, { layoutSyncKey: 2 }));
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(mockResize.mock.calls.length).toBeGreaterThan(resizeAfterOpen);
    expect(mockOpen.mock.calls.length).toBe(1);

    root.unmount();
    container.remove();
  });

  test('resolveSyncBounds accepts pizarra cards above the dock chrome gate', () => {
    const { resolveSyncBounds, boundsAreGood } = require('../useNativeBrowserSurface');
    const card = { x: 40, y: 12, width: 400, height: 300 };
    expect(boundsAreGood(card)).toBe(true);
    // Sync path must still return usable bounds so HWND can follow the card
    // even when y < 48 (dock open gate does not apply to ongoing resize).
    expect(resolveSyncBounds(card)).toEqual(card);
  });

  afterEach(() => {
    dom?.window?.close();
  });
});

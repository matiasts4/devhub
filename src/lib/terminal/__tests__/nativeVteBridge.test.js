const { JSDOM } = require('jsdom');

describe('nativeVteBridge', () => {
  let listenMock;
  let invokeMock;
  let dom;

  beforeEach(() => {
    jest.resetModules();
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    window.__TAURI_INTERNALS__ = {};

    listenMock = jest.fn();
    invokeMock = jest.fn();

    jest.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      listen: listenMock,
    }));
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.CustomEvent;
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('re-dispatches native session events back onto the browser window', async () => {
    let nativeListener;
    listenMock.mockImplementation(async (_eventName, handler) => {
      nativeListener = handler;
      return jest.fn();
    });

    const bridge = require('../nativeVteBridge');
    const detectedEvents = [];

    window.addEventListener('devhub:opencode-session-detected', (event) => {
      detectedEvents.push(event.detail);
    });

    await bridge.subscribeNativeVteEvents();
    nativeListener({ payload: { type: 'opencode-session-detected', panelId: 'p1', sessionId: 'oc-1' } });

    expect(detectedEvents).toEqual([
      expect.objectContaining({ panelId: 'p1', sessionId: 'oc-1' }),
    ]);
  });

  test('re-dispatches native Hermes session events back onto the browser window', async () => {
    let nativeListener;
    listenMock.mockImplementation(async (_eventName, handler) => {
      nativeListener = handler;
      return jest.fn();
    });

    const bridge = require('../nativeVteBridge');
    const detectedEvents = [];

    window.addEventListener('devhub:hermes-session-detected', (event) => {
      detectedEvents.push(event.detail);
    });

    await bridge.subscribeNativeVteEvents();
    nativeListener({ payload: { type: 'hermes-session-detected', panelId: 'p7', sessionId: 'hermes-p7' } });

    expect(detectedEvents).toEqual([
      expect.objectContaining({ panelId: 'p7', sessionId: 'hermes-p7' }),
    ]);
  });

  test('maps native terminal-exit payloads onto the existing browser contract', async () => {
    let nativeListener;
    listenMock.mockImplementation(async (_eventName, handler) => {
      nativeListener = handler;
      return jest.fn();
    });

    const bridge = require('../nativeVteBridge');
    const exitEvents = [];

    window.addEventListener('devhub:terminal-exit', (event) => {
      exitEvents.push(event.detail);
    });

    await bridge.subscribeNativeVteEvents();
    nativeListener({
      payload: {
        type: 'terminal-exit',
        panelId: 'p9',
        sessionId: 'ses_99',
        initialCommand: 'opencode --session ses_99',
        reason: 'child-exited:0',
      },
    });

    expect(exitEvents).toEqual([
      expect.objectContaining({
        id: 'p9',
        panelId: 'p9',
        sessionId: 'ses_99',
        initialCommand: 'opencode --session ses_99',
        reason: 'child-exited:0',
      }),
    ]);
  });

  test('routes generic native lifecycle events through the shared terminal native event channel', async () => {
    let nativeListener;
    listenMock.mockImplementation(async (_eventName, handler) => {
      nativeListener = handler;
      return jest.fn();
    });

    const bridge = require('../nativeVteBridge');
    const runtimeEvents = [];

    window.addEventListener('devhub:terminal-native-vte-event', (event) => {
      runtimeEvents.push(event.detail);
    });

    await bridge.subscribeNativeVteEvents();
    nativeListener({
      payload: {
        type: 'runtime-error',
        panelId: 'p2',
        reason: 'open-failed',
      },
    });

    expect(runtimeEvents).toEqual([
      expect.objectContaining({ panelId: 'p2', reason: 'open-failed', type: 'runtime-error' }),
    ]);
  });

  test('routes native panel activation events through the shared terminal native event channel', async () => {
    let nativeListener;
    listenMock.mockImplementation(async (_eventName, handler) => {
      nativeListener = handler;
      return jest.fn();
    });

    const bridge = require('../nativeVteBridge');
    const runtimeEvents = [];

    window.addEventListener('devhub:terminal-native-vte-event', (event) => {
      runtimeEvents.push(event.detail);
    });

    await bridge.subscribeNativeVteEvents();
    nativeListener({
      payload: {
        type: 'panel-activated',
        panelId: 'p-left',
      },
    });

    expect(runtimeEvents).toEqual([
      expect.objectContaining({ panelId: 'p-left', type: 'panel-activated' }),
    ]);
  });

  test('normalizes thrown registry attach errors into stable open-failed reasons', async () => {
    invokeMock.mockRejectedValueOnce(new Error('registry-attach-failed'));

    const bridge = require('../nativeVteBridge');

    await expect(
      bridge.openNativeVtePanel({ panelId: 'p3' })
    ).resolves.toEqual({ opened: false, reason: 'open-failed' });
  });

  test('preserves specific probe diagnostics instead of collapsing them into generic probe-failed', async () => {
    invokeMock.mockRejectedValueOnce(new Error('probe-missing-default-vbox'));

    const bridge = require('../nativeVteBridge');

    await expect(
      bridge.probeNativeVte({ panelId: 'p4', requestedMode: 'vte-experimental', tauriAvailable: true })
    ).resolves.toEqual({ ready: false, reason: 'probe-missing-default-vbox' });
  });

  test('wraps native VTE command payloads under the Rust request argument', async () => {
    invokeMock
      .mockResolvedValueOnce({ ready: true, reason: null })
      .mockResolvedValueOnce({ opened: true, reason: null });

    const bridge = require('../nativeVteBridge');
    const probePayload = {
      panelId: 'p5',
      requestedMode: 'vte-experimental',
      tauriAvailable: true,
    };
    const openPayload = {
      panelId: 'p5',
      sessionId: 'p5',
      bounds: { x: 0, y: 0, width: 800, height: 480 },
    };

    await bridge.probeNativeVte(probePayload);
    await bridge.openNativeVtePanel(openPayload);
    await bridge.focusNativeVtePanel({ panelId: 'p5' });
    await bridge.resizeNativeVtePanel(openPayload);
    await bridge.setNativeVtePanelVisibility({
      panelId: 'p5',
      visible: false,
      reason: 'suspended',
      bounds: { x: 12, y: 24, width: 800, height: 480 },
    });
    await bridge.closeNativeVtePanel({ panelId: 'p5', reason: 'test-cleanup' });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'native_vte_probe', { request: probePayload });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'native_vte_open', { request: openPayload });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'native_vte_focus', { request: { panelId: 'p5' } });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'native_vte_resize', { request: openPayload });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'native_vte_set_visibility', {
      request: {
        panelId: 'p5',
        visible: false,
        reason: 'suspended',
        bounds: { x: 12, y: 24, width: 800, height: 480 },
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'native_vte_close', {
      request: { panelId: 'p5', reason: 'test-cleanup' },
    });
  });

  test('preserves panel-scoped payloads for concurrent visible native panels', async () => {
    invokeMock.mockResolvedValue(undefined);

    const bridge = require('../nativeVteBridge');

    await bridge.focusNativeVtePanel({ panelId: 'left-panel' });
    await bridge.focusNativeVtePanel({ panelId: 'right-panel' });
    await bridge.resizeNativeVtePanel({
      panelId: 'left-panel',
      bounds: { x: 0, y: 0, width: 640, height: 720 },
    });
    await bridge.resizeNativeVtePanel({
      panelId: 'right-panel',
      bounds: { x: 640, y: 0, width: 640, height: 720 },
    });
    await bridge.setNativeVtePanelVisibility({ panelId: 'left-panel', visible: true });
    await bridge.setNativeVtePanelVisibility({ panelId: 'right-panel', visible: true });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'native_vte_focus', {
      request: { panelId: 'left-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'native_vte_focus', {
      request: { panelId: 'right-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'native_vte_resize', {
      request: { panelId: 'left-panel', bounds: { x: 0, y: 0, width: 640, height: 720 } },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'native_vte_resize', {
      request: { panelId: 'right-panel', bounds: { x: 640, y: 0, width: 640, height: 720 } },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'native_vte_set_visibility', {
      request: { panelId: 'left-panel', visible: true },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'native_vte_set_visibility', {
      request: { panelId: 'right-panel', visible: true },
    });
  });

  test('forwards close commands to the addressed panel only', async () => {
    invokeMock.mockResolvedValue(undefined);

    const bridge = require('../nativeVteBridge');

    await bridge.closeNativeVtePanel({ panelId: 'left-panel', reason: 'close-left-only' });

    expect(invokeMock).toHaveBeenCalledWith('native_vte_close', {
      request: { panelId: 'left-panel', reason: 'close-left-only' },
    });
    expect(invokeMock).not.toHaveBeenCalledWith('native_vte_close', {
      request: { panelId: 'right-panel', reason: expect.anything() },
    });
  });
});

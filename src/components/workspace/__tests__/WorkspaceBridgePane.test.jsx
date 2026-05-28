const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockInvoke = jest.fn();
const mockListen = jest.fn();

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
}));

jest.mock('@tauri-apps/api/event', () => ({
  listen: (...args) => mockListen(...args),
}));

const { COMMAND_ACTION, MESSAGE_TYPE, MONITOR_ACTION } = require('@emergentbase/visual-edits');
const WorkspaceBrowserPane = require('../WorkspaceBrowserPane').default;
const WorkspaceBridgePane = require('../WorkspaceBridgePane').default;

function WorkspaceBrowserPaneHarness({ initialDockState }) {
  const React = require('react');
  const [dockState, setDockState] = React.useState(initialDockState);

  return React.createElement(WorkspaceBrowserPane, {
    dockState,
    onDockStateChange: (nextState) => {
      setDockState((currentState) => (
        typeof nextState === 'function' ? nextState(currentState) : nextState
      ));
    },
  });
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://devhub.test' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.MessageEvent = dom.window.MessageEvent;
  global.localStorage = dom.window.localStorage;
  return dom;
}

const mountedRoots = [];
let usingFakeTimers = false;
let originalFetch = null;
let originalWindowFetch = null;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(element);
  });
  await flushEffects();
  return { container, root };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function dispatchLoad(element) {
  flushSync(() => {
    element.dispatchEvent(new window.Event('load'));
  });
  await flushEffects();
}

async function waitForAssertion(assertion, attempts = 20) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushEffects();
    }
  }
  throw lastError;
}

async function changeInput(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  flushSync(() => {
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flushEffects();
}

function createInspectableFrameRuntime() {
  const listeners = new Map();
  const document = {
    body: {},
    addEventListener: jest.fn((eventName, handler) => {
      listeners.set(eventName, handler);
    }),
    removeEventListener: jest.fn((eventName, handler) => {
      if (listeners.get(eventName) === handler) {
        listeners.delete(eventName);
      }
    }),
  };

  const contentWindow = {
    postMessage: jest.fn(),
    HTMLElement: window.HTMLElement,
    document,
    location: { href: 'https://devhub.test/preview' },
  };

  return {
    contentWindow,
    contentDocument: document,
    dispatch(eventName, event) {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(event);
      }
    },
    listeners,
  };
}

function installSameOriginIframe(iframe, runtime = createInspectableFrameRuntime()) {
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: runtime.contentDocument,
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: runtime.contentWindow,
  });
  return runtime;
}

function installCrossOriginIframe(iframe, options = {}) {
  const postMessage = options.postMessage || jest.fn();
  const href = options.href || 'https://example.com/';
  const contentWindow = {
    postMessage,
    location: { href },
    __DEVHUB_VISUAL_EDIT_PROTOCOL__: options.protocolReady || false,
    get document() {
      throw new Error('cross-origin');
    },
  };

  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get() {
      return null;
    },
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: contentWindow,
  });

  return { postMessage, contentWindow };
}

function getDiagnostics(container) {
  return {
    supportMode: container.querySelector('[data-testid="bridge-support-mode"]')?.textContent,
    supportReason: container.querySelector('[data-testid="bridge-support-reason"]')?.textContent,
    selectorState: container.querySelector('[data-testid="bridge-selector-state"]')?.textContent,
  };
}

function dispatchPreviewMessage(activeWindow, data) {
  window.dispatchEvent(new window.MessageEvent('message', {
    source: activeWindow,
    data,
  }));
}

describe('WorkspaceBridgePane', () => {
  beforeEach(() => {
    installDom();
    usingFakeTimers = false;
    jest.useRealTimers();
    mockInvoke.mockReset();
    mockListen.mockReset();
    originalFetch = global.fetch;
    originalWindowFetch = window.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    }));
    window.fetch = global.fetch;
  });

  afterEach(() => {
    if (usingFakeTimers) {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      usingFakeTimers = false;
    }

    while (mountedRoots.length) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => root.unmount());
      container.remove();
    }
    if (originalWindowFetch) {
      window.fetch = originalWindowFetch;
    } else {
      delete window.fetch;
    }
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    jest.restoreAllMocks();
  });

  test('activates inspect mode, captures selection metadata, and dispatches a Hermes run request', async () => {
    let runDetail = null;
    window.addEventListener('devhub:run-agent', (event) => {
      runDetail = event.detail;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBridgePane, {
        dockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
        },
        onDockStateChange: jest.fn(),
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const postMessage = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    expect(postMessage).toHaveBeenCalled();
    const activeIframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const activeWindow = activeIframe?.contentWindow || iframe.contentWindow;

    window.dispatchEvent(new window.MessageEvent('message', {
      source: activeWindow,
      data: {
        type: MESSAGE_TYPE.SITE_DEBUG,
        action: MONITOR_ACTION.ELEMENT_SELECTED,
        elementInfo: {
          tagName: 'section',
          className: 'pricing-card featured',
          rect: { width: 896, height: 1076 },
          attributes: {
            'x-file-name': 'src/components/PricingCard.tsx',
            'x-line-number': '42',
          },
        },
      },
    }));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('section.pricing-card.featured');
    expect(view.container.querySelector('[data-testid="bridge-source-hint"]')?.textContent).toContain('PricingCard.tsx');

    await changeInput(view.container.querySelector('[data-testid="bridge-change-input"]'), 'Subí el contraste del precio y agregá una insignia destacada.');
    expect(view.container.querySelector('[data-testid="bridge-submit"]')?.disabled).toBe(false);
    await click(view.container.querySelector('[data-testid="bridge-submit"]'));

    expect(runDetail).toBeTruthy();
    expect(runDetail.selectedAgent).toBe('hermes');
    expect(runDetail.command).toContain('hermes chat -q');
    expect(runDetail.promptSummary).toContain('Subí el contraste del precio');
    expect(runDetail.taskTitle).toContain('Visual Edit');
  });

  test('preloads the editable localhost preview as soon as visual edit mode opens', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBridgePane, {
        dockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
        },
        onDockStateChange: jest.fn(),
      })
    );

    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3200%2Fproducts%2Fbridgespace'
    );
  });

  test('falls back to same-origin selection mode when the preview never answers the protocol', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage: jest.fn() },
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        body: {},
      },
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-status-badge"]')?.textContent).toContain('Select an element');
  });

  test('falls back to iframe when native browser runtime is requested while edit mode is enabled', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: false } },
        };
      }
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: true,
        },
      })
    );

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-native-runtime-chip"]')?.textContent).toContain('Fallback activo: iframe');
    expect(view.container.querySelector('[data-testid="browser-native-runtime-chip"]')?.textContent).toContain('edit mode');
  });

  test('shows native runtime shell when native browser runtime is active', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_reload') return { reloaded: true, reason: null };
      if (command === 'native_browser_select_all' || command === 'native_browser_copy') {
        return { supported: true, reason: null };
      }
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: false,
        },
        onDockStateChange: jest.fn(),
      })
    );

    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-native-runtime-chip"]')?.textContent).toContain('native gtk');
    expect(mockInvoke).toHaveBeenCalledWith('native_browser_probe', expect.any(Object));
  });

  test('hides the native gtk panel when the browser pane stops being visible in layout', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          visible: true,
          activeTab: 'browser',
          editMode: false,
          maximized: false,
          maximizedView: 'browser',
        },
        onDockStateChange: jest.fn(),
      })
    );

    await flushEffects();
    mockInvoke.mockClear();

    flushSync(() => {
      view.root.render(
        React.createElement(WorkspaceBrowserPane, {
          dockState: {
            browserUrl: 'https://example.com',
            browserHistory: ['https://example.com'],
            browserHistoryIndex: 0,
            browserRuntime: 'native-gtk',
            visible: false,
            activeTab: 'browser',
            editMode: false,
            maximized: false,
            maximizedView: 'browser',
          },
          onDockStateChange: jest.fn(),
        })
      );
    });
    await flushEffects();

    expect(mockInvoke).toHaveBeenCalledWith('native_browser_set_visibility', {
      request: expect.objectContaining({
        panelId: 'browser-global-workspace',
        visible: false,
      }),
    });
  });

  test('hides the native gtk panel when workspace layout is window-maximized instead of browser-visible', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          visible: true,
          activeTab: 'browser',
          editMode: false,
          maximized: false,
          maximizedView: 'browser',
        },
        onDockStateChange: jest.fn(),
      })
    );

    await flushEffects();
    mockInvoke.mockClear();

    flushSync(() => {
      view.root.render(
        React.createElement(WorkspaceBrowserPane, {
          dockState: {
            browserUrl: 'https://example.com',
            browserHistory: ['https://example.com'],
            browserHistoryIndex: 0,
            browserRuntime: 'native-gtk',
            visible: true,
            activeTab: 'browser',
            editMode: false,
            maximized: true,
            maximizedView: 'window',
          },
          onDockStateChange: jest.fn(),
        })
      );
    });
    await flushEffects();

    expect(mockInvoke).toHaveBeenCalledWith('native_browser_set_visibility', {
      request: expect.objectContaining({
        panelId: 'browser-global-workspace',
        visible: false,
      }),
    });
  });

  test('closes a stale native gtk open that resolves after the workspace changed', async () => {
    window.__TAURI_INTERNALS__ = {};
    const deferredOpen = createDeferred();
    mockInvoke.mockImplementation((command) => {
      if (command === 'native_browser_probe') {
        return Promise.resolve({
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        });
      }
      if (command === 'native_browser_open') return deferredOpen.promise;
      if (command === 'native_browser_load_url') return Promise.resolve({ loaded: true, reason: null });
      return Promise.resolve(null);
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        projectId: 'project-1',
        workspaceId: 'ws1',
        dockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          visible: true,
          activeTab: 'browser',
          editMode: false,
          maximized: false,
          maximizedView: 'browser',
        },
        onDockStateChange: jest.fn(),
      })
    );

    flushSync(() => {
      view.root.render(
        React.createElement(WorkspaceBrowserPane, {
          projectId: 'project-1',
          workspaceId: 'ws2',
          dockState: {
            browserUrl: 'http://localhost:3200/',
            browserHistory: ['http://localhost:3200/'],
            browserHistoryIndex: 0,
            browserRuntime: 'iframe',
            visible: false,
            activeTab: 'browser',
            editMode: false,
            maximized: false,
            maximizedView: 'browser',
          },
          onDockStateChange: jest.fn(),
        })
      );
    });

    deferredOpen.resolve({ opened: true, reason: null });
    await flushEffects();

    expect(mockInvoke).toHaveBeenCalledWith('native_browser_close', {
      request: expect.objectContaining({
        panelId: 'browser-project-1-ws1',
        reason: 'stale-open-cancelled',
      }),
    });
  });

  test('exposes a runtime switch in the browser toolbar and lets QA turn on native gtk', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'iframe',
          editMode: false,
        },
      })
    );

    expect(view.container.querySelector('[data-testid="browser-runtime-toggle"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-runtime-option-iframe"]')?.getAttribute('aria-pressed')).toBe('true');

    await click(view.container.querySelector('[data-testid="browser-runtime-option-native-gtk"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-runtime-option-native-gtk"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-runtime-status"]')?.textContent).toContain('Activo: native gtk');
  });

  test('makes iframe fallback explicit when QA requests native gtk during edit mode', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: false } },
        };
      }
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'iframe',
          editMode: true,
        },
      })
    );

    await click(view.container.querySelector('[data-testid="browser-runtime-option-native-gtk"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-runtime-option-native-gtk"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('[data-testid="browser-runtime-status"]')?.textContent).toContain('Fallback activo: iframe');
    expect(view.container.querySelector('[data-testid="browser-runtime-status"]')?.textContent).toContain('edit mode');
  });

  test('keeps native runtime active in edit mode when selector capability is ready and shows native inspect status', async () => {
    window.__TAURI_INTERNALS__ = {};
    let nativeEventHandler = null;
    mockListen.mockImplementation(async (_eventName, handler) => {
      nativeEventHandler = handler;
      return jest.fn();
    });
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: true,
        },
      })
    );

    await flushEffects();

    const viewportShell = view.container.querySelector('[data-testid="browser-viewport-shell"]');
    const nativeInspectPanel = view.container.querySelector('[data-testid="bridge-native-inspect-panel"]');

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-runtime-status"]')?.textContent).toContain('Activo: native gtk');
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-status"]')?.textContent).toContain('Native inspect ready');
    expect(nativeInspectPanel).not.toBeNull();
    expect(viewportShell?.contains(nativeInspectPanel)).toBe(false);
    expect(view.container.querySelector('[data-testid="bridge-change-input"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-native-switch-to-iframe"]')).not.toBeNull();

    nativeEventHandler?.({
      payload: {
        panelId: 'browser-global-workspace',
        type: 'selector-selected',
        element: {
          tagName: 'button',
          className: 'cta-primary',
          rect: { width: 120, height: 44, x: 12, y: 24 },
          attributes: { id: 'buy-now' },
        },
      },
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('button#buy-now.cta-primary');
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-status"]')?.textContent).toContain('Native inspect active');
  });

  test('does not show native inspect dock while native gtk edit mode is off', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockListen.mockImplementation(async () => jest.fn());
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: false,
        },
      })
    );

    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-change-input"]')).toBeNull();
  });

  test('toggling the pencil on in native gtk shows the inspect dock outside the viewport shell', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockListen.mockImplementation(async () => jest.fn());
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: false,
        },
      })
    );

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    const browserPaneBody = view.container.querySelector('[data-testid="browser-pane-body"]');
    const viewportShell = view.container.querySelector('[data-testid="browser-viewport-shell"]');
    const nativeInspectDock = view.container.querySelector('[data-testid="bridge-native-inspect-dock"]');
    const nativeInspectPanel = view.container.querySelector('[data-testid="bridge-native-inspect-panel"]');

    expect(browserPaneBody?.style.display).toBe('flex');
    expect(browserPaneBody?.style.flexDirection).toBe('column');
    expect(browserPaneBody?.style.minHeight).toBe('0');
    expect(viewportShell?.style.flex).toBe('1 1 auto');
    expect(viewportShell?.style.minHeight).toBe('0');
    expect(nativeInspectDock).not.toBeNull();
    expect(nativeInspectPanel).not.toBeNull();
    expect(viewportShell?.contains(nativeInspectPanel)).toBe(false);
    expect(view.container.querySelector('[data-testid="bridge-change-input"]')).toBeNull();
  });

  test('toggling the pencil off in native gtk deactivates selector, clears selection, and hides the inspect dock', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockListen.mockImplementation(async () => jest.fn());
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: true,
        },
      })
    );

    await flushEffects();
    mockInvoke.mockClear();

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    expect(mockInvoke).toHaveBeenCalledWith('native_browser_selector_command', {
      request: { panelId: 'browser-global-workspace', action: 'deactivate' },
    });
    expect(mockInvoke).toHaveBeenCalledWith('native_browser_selector_command', {
      request: { panelId: 'browser-global-workspace', action: 'clear-selection' },
    });
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-native-inspect-panel"]')).toBeNull();
  });

  test('surfaces honest native inspect-only messaging when native inspect is active', async () => {
    window.__TAURI_INTERNALS__ = {};
    let nativeEventHandler = null;
    mockListen.mockImplementation(async (_eventName, handler) => {
      nativeEventHandler = handler;
      return jest.fn();
    });
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: true,
        },
      })
    );

    await flushEffects();

    nativeEventHandler?.({
      payload: {
        panelId: 'browser-global-workspace',
        type: 'selector-selected',
        element: {
          tagName: 'div',
          className: 'hero-card',
          rect: { width: 320, height: 180, x: 0, y: 0 },
          attributes: {},
        },
      },
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-native-unsupported-copy"]')?.textContent).toContain('inspect/select only');
    expect(view.container.querySelector('[data-testid="bridge-native-unsupported-copy"]')?.textContent).toContain('Switch to iframe');
  });

  test('switches native inspect mode back to iframe for real visual edit controls', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      if (command === 'native_browser_selector_command') return { supported: true, reason: null };
      return null;
    });

    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'native-gtk',
          editMode: true,
        },
      })
    );

    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-change-input"]')).toBeNull();

    await click(view.container.querySelector('[data-testid="bridge-native-switch-to-iframe"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-native-runtime-shell"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-change-input"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-submit"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-runtime-option-iframe"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('does not render the top toolbar Ventana button', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'iframe',
          editMode: false,
        },
      })
    );

    expect(view.container.querySelector('[data-testid="browser-open-dedicated"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Ventana');
  });

  test('does not render the toolbar Go button but keeps url form intact', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          browserRuntime: 'iframe',
          editMode: false,
        },
      })
    );

    expect(view.container.querySelector('[data-testid="browser-url-input"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="browser-go"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Go');
  });

  test('keeps the preview interactive while inspect is connecting', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installCrossOriginIframe(iframe, {
      href: 'https://example.com/',
      protocolReady: true,
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(view.container.querySelector('[data-testid="bridge-connecting-overlay"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-status-badge"]')?.textContent).toContain('Preparing editable preview');
  });

  test('primes the localhost proxy when edit mode is enabled after mount', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3300/',
          browserHistory: ['http://localhost:3300/'],
          browserHistoryIndex: 0,
          editMode: false,
        },
      })
    );

    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe('http://localhost:3300/');

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3300%2F'
    );
  });

  test('clicking the pencil also requests selector activation', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3300/',
          browserHistory: ['http://localhost:3300/'],
          browserHistoryIndex: 0,
          editMode: false,
        },
      })
    );

    const postMessage = jest.fn();
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentDocument', {
      configurable: true,
      get() {
        return null;
      },
    });
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        return {
          postMessage,
          HTMLElement: window.HTMLElement,
          location: { href: 'http://localhost:3300/' },
          __DEVHUB_VISUAL_EDIT_PROTOCOL__: false,
          get document() {
            throw new Error('cross-origin');
          },
        };
      },
    });

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    await waitForAssertion(() => {
      expect(postMessage.mock.calls).toEqual(expect.arrayContaining([
        [expect.objectContaining({ action: COMMAND_ACTION.ACTIVATE }), '*'],
        [expect.objectContaining({ action: COMMAND_ACTION.SET_INTERACTION_MODE }), '*'],
      ]));
    });
    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3300%2F'
    );
  });

  test('starts inspect mode without swapping away from the primed proxy iframe', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3300/',
          browserHistory: ['http://localhost:3300/'],
          browserHistoryIndex: 0,
          editMode: false,
        },
      })
    );

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    const iframeBeforeInspect = view.container.querySelector('[data-testid="browser-iframe"]');
    const postMessage = jest.fn();
    Object.defineProperty(iframeBeforeInspect, 'contentDocument', {
      configurable: true,
      value: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        body: {},
      },
    });
    Object.defineProperty(iframeBeforeInspect, 'contentWindow', {
      configurable: true,
      value: {
        postMessage,
        HTMLElement: window.HTMLElement,
      },
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(iframeBeforeInspect);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.any(String) }),
      '*'
    );
  });

  test('classifies same-origin previews as DOM-supported before activation completes', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://devhub.test/preview',
          browserHistory: ['https://devhub.test/preview'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installSameOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'same-origin-dom',
      supportReason: 'same-origin-access',
      selectorState: 'armed',
    });
  });

  test('keeps same-origin selector readiness stable across repeated load events for the same location', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://devhub.test/preview',
          browserHistory: ['https://devhub.test/preview'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installSameOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    await dispatchLoad(iframe);
    await dispatchLoad(iframe);

    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'same-origin-dom',
      supportReason: 'same-origin-access',
      selectorState: 'armed',
    });
    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')).toBeNull();
  });

  test('classifies localhost bridge previews as proxy-supported', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBridgePane, {
        dockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
        },
        onDockStateChange: jest.fn(),
      })
    );

    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'localhost-proxy',
      supportReason: 'proxy-active',
      selectorState: 'connecting',
    });
  });

  test('keeps supported localhost proxy loads armed without re-sending protocol activation after DOM fallback is ready', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const runtime = installSameOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    await flushEffects();
    await flushEffects();

    runtime.contentWindow.postMessage.mockClear();
    await dispatchLoad(iframe);
    await flushEffects();

    expect(runtime.contentWindow.postMessage).not.toHaveBeenCalled();
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'localhost-proxy',
      supportReason: 'proxy-active',
      selectorState: 'armed',
    });
  });

  test('classifies remote instrumented previews as protocol-supported after handshake', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://remote-preview.example.com',
          browserHistory: ['https://remote-preview.example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installCrossOriginIframe(iframe, {
      href: 'https://remote-preview.example.com/page',
      protocolReady: true,
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    dispatchPreviewMessage(iframe.contentWindow, {
      type: MESSAGE_TYPE.SITE_DEBUG,
      action: MONITOR_ACTION.MODE_ACTIVATED,
    });
    await flushEffects();

    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'remote-protocol',
      supportReason: 'protocol-active',
      selectorState: 'armed',
    });
  });

  test('keeps remote instrumented previews supported after instrumented navigation re-evaluation', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://remote-preview.example.com/page-one',
          browserHistory: ['https://remote-preview.example.com/page-one'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const initialRuntime = installCrossOriginIframe(iframe, {
      href: 'https://remote-preview.example.com/page-one',
      protocolReady: true,
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    dispatchPreviewMessage(initialRuntime.contentWindow, {
      type: MESSAGE_TYPE.SITE_DEBUG,
      action: MONITOR_ACTION.MODE_ACTIVATED,
    });
    await flushEffects();

    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'remote-protocol',
      supportReason: 'protocol-active',
      selectorState: 'armed',
    });

    iframe.setAttribute('src', 'https://remote-preview.example.com/page-two');
    const navigatedRuntime = installCrossOriginIframe(iframe, {
      href: 'https://remote-preview.example.com/page-two',
      protocolReady: true,
      postMessage: initialRuntime.postMessage,
    });
    await dispatchLoad(iframe);

    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')).toBeNull();
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'remote-protocol',
      supportReason: 'protocol-active',
      selectorState: 'connecting',
    });

    const navigatedIframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const activeNavigatedRuntime = installCrossOriginIframe(navigatedIframe, {
      href: 'https://remote-preview.example.com/page-two',
      protocolReady: true,
      postMessage: initialRuntime.postMessage,
    });

    dispatchPreviewMessage(activeNavigatedRuntime.contentWindow, {
      type: MESSAGE_TYPE.SITE_DEBUG,
      action: MONITOR_ACTION.MODE_ACTIVATED,
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')).toBeNull();
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'remote-protocol',
      supportReason: 'protocol-active',
      selectorState: 'armed',
    });
  });

  test('rejects unsupported remote previews immediately instead of pretending inspect is active', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installCrossOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')?.textContent).toContain(
      'did not respond to supported visual-edit activation'
    );
    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')?.textContent).toContain(
      'localhost previews through the DevHub proxy'
    );
    expect(view.container.querySelector('[data-testid="bridge-inspect-toggle"]')?.textContent).toContain('Inspect');
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'unsupported',
      supportReason: 'cross-origin-no-instrumentation',
      selectorState: 'unsupported',
    });
  });

  test('does not emit protocol activation commands for unsupported remote previews', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const runtime = installCrossOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(runtime.postMessage).not.toHaveBeenCalled();
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'unsupported',
      supportReason: 'cross-origin-no-instrumentation',
      selectorState: 'unsupported',
    });
  });

  test('does not crash when a cross-origin frame blocks protocol property access during inspect classification', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const { contentWindow } = installCrossOriginIframe(iframe, {
      href: 'https://example.com/',
    });

    Object.defineProperty(contentWindow, '__DEVHUB_VISUAL_EDIT_PROTOCOL__', {
      configurable: true,
      get() {
        throw new window.DOMException(
          'Blocked a frame with origin "https://devhub.test" from accessing a cross-origin frame.',
          'SecurityError'
        );
      },
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(view.container.querySelector('[data-testid="bridge-inspect-toggle"]')?.textContent).toContain('Inspect');
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'unsupported',
      supportReason: 'cross-origin-no-instrumentation',
      selectorState: 'unsupported',
    });
  });

  test('captures supported preview clicks as selection input instead of plain browsing', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'https://devhub.test/preview',
          browserHistory: ['https://devhub.test/preview'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const runtime = installSameOriginIframe(iframe);
    const target = document.createElement('section');
    target.className = 'hero-card';
    target.getBoundingClientRect = () => ({ width: 320, height: 180, x: 20, y: 30 });
    target.getAttribute = jest.fn((name) => {
      if (name === 'data-source-file') return 'src/components/HeroCard.jsx';
      return null;
    });

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    runtime.dispatch('click', {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      target,
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('section.hero-card');
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'same-origin-dom',
      supportReason: 'same-origin-access',
      selectorState: 'selected',
    });
  });

  test('keeps unsupported previews out of active selection semantics after inspect is requested', async () => {
    const onDockStateChange = jest.fn();
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: {
          browserUrl: 'https://example.com',
          browserHistory: ['https://example.com'],
          browserHistoryIndex: 0,
          editMode: true,
        },
        onDockStateChange,
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installCrossOriginIframe(iframe);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));

    expect(view.container.querySelector('[data-testid="bridge-inspect-toggle"]')?.textContent).toContain('Inspect');
    expect(onDockStateChange).not.toHaveBeenCalledWith(expect.any(Function));
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'unsupported',
      supportReason: 'cross-origin-no-instrumentation',
      selectorState: 'unsupported',
    });
  });

  test('forceEditMode auto-starts inspect through the same support classifier path', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBridgePane, {
        dockState: {
          browserUrl: 'https://devhub.test/preview',
          browserHistory: ['https://devhub.test/preview'],
          browserHistoryIndex: 0,
        },
        onDockStateChange: jest.fn(),
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    installSameOriginIframe(iframe);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-inspect-toggle"]')?.textContent).toContain('Selecting');
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'same-origin-dom',
      supportReason: 'same-origin-access',
      selectorState: 'armed',
    });
  });

  test('clears proxy-backed selection immediately when navigation escapes the proxy path', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspaceBrowserPaneHarness, {
        initialDockState: {
          browserUrl: 'http://localhost:3200/products/bridgespace',
          browserHistory: ['http://localhost:3200/products/bridgespace'],
          browserHistoryIndex: 0,
          editMode: true,
        },
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    const runtime = installSameOriginIframe(iframe);
    const target = document.createElement('div');
    target.className = 'pricing-card';
    target.getBoundingClientRect = () => ({ width: 640, height: 480, x: 12, y: 16 });
    target.getAttribute = jest.fn(() => null);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
    runtime.dispatch('click', {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      target,
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('div.pricing-card');

    iframe.setAttribute('src', 'https://example.com/escaped');
    installCrossOriginIframe(iframe, { href: 'https://example.com/escaped' });
    await dispatchLoad(iframe);
    await waitForAssertion(() => {
      expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('Seleccioná un nodo');
      expect(getDiagnostics(view.container)).toEqual({
        supportMode: 'unsupported',
        supportReason: 'proxy-escaped',
        selectorState: 'unsupported',
      });
    });

    await waitForAssertion(() => {
      const unsupportedCopy = view.container.querySelector('[data-testid="bridge-unsupported-copy"]');
      expect(unsupportedCopy).not.toBeNull();
      expect(unsupportedCopy?.textContent).toContain('left the proxied localhost preview');
    });
  });

});

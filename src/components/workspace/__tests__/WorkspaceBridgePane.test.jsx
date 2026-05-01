const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

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
        return {
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          body: {},
        };
      },
    });
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        return {
          postMessage,
          HTMLElement: window.HTMLElement,
        };
      },
    });

    await click(view.container.querySelector('[data-testid="browser-edit-toggle"]'));

    expect(postMessage.mock.calls).toEqual(expect.arrayContaining([
      [expect.objectContaining({ action: COMMAND_ACTION.ACTIVATE }), '*'],
      [expect.objectContaining({ action: COMMAND_ACTION.SET_INTERACTION_MODE }), '*'],
    ]));
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
    iframe.dispatchEvent(new window.Event('load'));
    await flushEffects();

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
    const runtime = installSameOriginIframe(iframe);
    const target = document.createElement('div');
    target.className = 'pricing-card';
    target.getBoundingClientRect = () => ({ width: 640, height: 480, x: 12, y: 16 });
    target.getAttribute = jest.fn(() => null);

    await click(view.container.querySelector('[data-testid="bridge-inspect-toggle"]'));
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
    iframe.dispatchEvent(new window.Event('load'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')?.textContent).toContain('Seleccioná un nodo');
    expect(view.container.querySelector('[data-testid="bridge-unsupported-copy"]')?.textContent).toContain('left the proxied localhost preview');
    expect(getDiagnostics(view.container)).toEqual({
      supportMode: 'unsupported',
      supportReason: 'proxy-escaped',
      selectorState: 'unsupported',
    });
  });

});

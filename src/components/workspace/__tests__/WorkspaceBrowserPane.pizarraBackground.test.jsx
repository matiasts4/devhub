const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const domHarness = require('@/test-support/domHarness');

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  closeNativeBrowser: jest.fn(() => Promise.resolve()),
  focusNativeBrowser: jest.fn(() => Promise.resolve()),
}));

jest.mock('../useNativeBrowserSurface', () => ({
  useNativeBrowserCapability: () => ({ supported: false, ready: false }),
  useNativeBrowserSurface: () => ({
    nativeRuntimeReady: false,
    nativeError: null,
    retryNative: jest.fn(),
  }),
}));

jest.mock('../hooks/useBrowserTabs', () => ({
  useBrowserTabs: () => ({
    tabs: [],
    activeTabId: null,
    selectTab: jest.fn(),
    closeTab: jest.fn(),
    addTab: jest.fn(),
  }),
}));

jest.mock('../useBrowserPreviewController', () => {
  const ReactLocal = require('react');
  const SELECTOR_STATE = {
    IDLE: 'idle',
    SELECTING: 'selecting',
    SELECTED: 'selected',
  };
  return {
    __esModule: true,
    SELECTOR_STATE,
    default: ({ dockState }) => ({
      browserError: null,
      canSubmit: true,
      changeRequest: '',
      dimensions: null,
      effectiveEditMode: false,
      handleEditModeToggle: jest.fn(),
      handleIframeError: jest.fn(),
      handleIframeLoad: jest.fn(),
      handleInspectToggle: jest.fn(),
      handleLaunch: jest.fn(),
      handleReload: jest.fn(),
      handleSubmit: jest.fn((event) => event?.preventDefault?.()),
      iframeRef: ReactLocal.createRef(),
      iframeSrc: dockState.browserUrl,
      isInspecting: false,
      isLoading: false,
      lastLaunchMeta: null,
      reloadKey: 0,
      selectedAgent: 'hermes',
      selectedElement: null,
      selectedSummary: null,
      selectorState: SELECTOR_STATE.IDLE,
      setChangeRequest: jest.fn(),
      setSelectedAgent: jest.fn(),
      sourceHint: null,
      statusLabel: 'Ready',
      supportState: { mode: 'unsupported', reason: 'not-requested' },
      unsupportedCopy: null,
      urlInputRef: ReactLocal.createRef(),
    }),
  };
});

const WorkspaceBrowserPane = require('../WorkspaceBrowserPane').default;

let dom;
const mountedRoots = [];

function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(element);
  });
  return { container, root };
}

function makeDockState(overrides = {}) {
  return {
    visible: true,
    activeTab: 'browser',
    maximized: false,
    maximizedView: 'browser',
    browserUrl: 'https://example.com',
    browserHistory: ['https://example.com'],
    browserHistoryIndex: 0,
    browserRuntime: 'iframe',
    editMode: false,
    browserLoadFallback: false,
    ...overrides,
  };
}

describe('WorkspaceBrowserPane pizarra browser background', () => {
  beforeEach(() => {
    dom = domHarness.installDom();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => root.unmount());
      container.remove();
    }
    if (dom?.window?.close) {
      dom.window.close();
    }
  });

  test('uses a dark iframe placeholder while rendered in pizarra context', () => {
    const view = renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: makeDockState(),
        onDockStateChange: jest.fn(),
        isPizarraContext: true,
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    expect(iframe).toBeTruthy();
    expect(iframe.className).toContain('bg-[#050814]');
    expect(iframe.style.backgroundColor).toBe('rgb(5, 8, 20)');
  });

  test('keeps the default white iframe placeholder outside pizarra context', () => {
    const view = renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState: makeDockState(),
        onDockStateChange: jest.fn(),
      })
    );

    const iframe = view.container.querySelector('[data-testid="browser-iframe"]');
    expect(iframe).toBeTruthy();
    expect(iframe.className).toContain('bg-white');
    expect(iframe.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });
});

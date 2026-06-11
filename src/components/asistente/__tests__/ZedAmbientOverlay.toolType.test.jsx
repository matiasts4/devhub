'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const { flushSync } = require('react-dom');
const { createRoot } = require('react-dom/client');

let mockUseReducedMotionValue = true;

jest.mock('framer-motion', () => {
  const React = require('react');
  const mockEl =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  return {
    motion: { div: mockEl('div'), span: mockEl('span') },
    AnimatePresence: ({ children }) => children,
    useReducedMotion: () => mockUseReducedMotionValue,
  };
});

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy(
    {},
    {
      get: (_, key) => icon(String(key)),
    }
  );
});

const mockUseZedChat = jest.fn();
const mockUseZedOverlay = jest.fn();

jest.mock('@/lib/asistente/useZedChat', () => ({
  useZedChat: (...args) => mockUseZedChat(...args),
}));

jest.mock('@/lib/asistente/useZedOverlay', () => ({
  useZedOverlay: (...args) => mockUseZedOverlay(...args),
}));

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  return dom;
}

function renderOverlay() {
  const ZedAmbientOverlay = require('../ZedAmbientOverlay').default;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(ZedAmbientOverlay));
  });
  return { container, root };
}

function baseChatMock(overrides = {}) {
  return {
    input: '',
    setInput: jest.fn(),
    isLoading: false,
    handleSend: jest.fn(),
    handleStop: jest.fn(),
    handleKeyDown: jest.fn(),
    handlePaste: jest.fn(),
    lastAssistantMessage: null,
    lastToolType: null,
    ...overrides,
  };
}

describe('ZedAmbientOverlay — tool-type wiring (ZAA-4)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    jest.clearAllMocks();
    mockUseReducedMotionValue = false;
    mockUseZedOverlay.mockReturnValue({
      isOpen: false,
      close: jest.fn(),
      toggle: jest.fn(),
    });
    mockUseZedChat.mockReturnValue(baseChatMock());
  });

  afterEach(() => {
    dom.window.close();
  });

  test('terminal tool: data-tool="terminal" + zed-aura-pulse-terminal class', () => {
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: 'terminal' }));
    const { container, root } = renderOverlay();
    const inner = container.querySelector('.zed-aura-root');
    expect(inner).not.toBeNull();
    expect(inner.getAttribute('data-tool')).toBe('terminal');
    expect(inner.className).toContain('zed-aura-pulse-terminal');
    root.unmount();
  });

  test('browser tool: data-tool="browser" + zed-aura-pulse-browser class', () => {
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: 'browser' }));
    const { container, root } = renderOverlay();
    const inner = container.querySelector('.zed-aura-root');
    expect(inner).not.toBeNull();
    expect(inner.getAttribute('data-tool')).toBe('browser');
    expect(inner.className).toContain('zed-aura-pulse-browser');
    root.unmount();
  });

  test('no tool: data-tool="null" and no per-tool pulse class', () => {
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: null }));
    const { container, root } = renderOverlay();
    const inner = container.querySelector('.zed-aura-root');
    expect(inner).not.toBeNull();
    expect(inner.getAttribute('data-tool')).toBe('null');
    expect(inner.className).not.toMatch(/zed-aura-pulse-(terminal|browser|file)\b/);
    root.unmount();
  });

  test('executing phase: inner div exposes --accent-* CSS vars (ZAA-004 / Decision 5)', () => {
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: 'terminal' }));
    const { container, root } = renderOverlay();
    const inner = container.querySelector('.zed-aura-root');
    expect(inner).not.toBeNull();
    const style = inner.getAttribute('style') || '';
    expect(style).toContain('--accent-terminal');
    expect(style).toContain('--accent-browser');
    expect(style).toContain('--accent-file');
    root.unmount();
  });

  test('reduced motion: no per-tool pulse class even with a tool type', () => {
    mockUseReducedMotionValue = true;
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: 'terminal' }));
    const { container, root } = renderOverlay();
    const inner = container.querySelector('.zed-aura-root');
    expect(inner).not.toBeNull();
    expect(inner.className).not.toMatch(/zed-aura-pulse-(terminal|browser|file)\b/);
    root.unmount();
  });

  test('z-index and pointer-events are preserved on the wrapper (NFR-P05)', () => {
    mockUseZedChat.mockReturnValue(baseChatMock({ isLoading: true, lastToolType: 'terminal' }));
    const { container, root } = renderOverlay();
    const wrapper = container.querySelector('[data-testid="zed-ambient-aura"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain('z-[248]');
    expect(wrapper.className).toContain('pointer-events-none');
    root.unmount();
  });
});

const React = require('react');
const { JSDOM } = require('jsdom');
const { flushSync } = require('react-dom');
const { act } = require('react-dom/test-utils');

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
  const { createRoot } = require('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ZedAmbientOverlay));
  });
  return { container, root };
}

describe('ZedAmbientOverlay', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    jest.clearAllMocks();
    mockUseZedOverlay.mockReturnValue({
      isOpen: false,
      close: jest.fn(),
      toggle: jest.fn(),
    });
    mockUseZedChat.mockReturnValue({
      input: '',
      setInput: jest.fn(),
      isLoading: false,
      handleSend: jest.fn(),
      handleStop: jest.fn(),
      handleKeyDown: jest.fn(),
      handlePaste: jest.fn(),
      lastAssistantMessage: null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    dom.window.close();
  });

  test('renders executing pill when loading without open overlay', () => {
    mockUseZedChat.mockReturnValue({
      input: '',
      setInput: jest.fn(),
      isLoading: true,
      handleSend: jest.fn(),
      handleStop: jest.fn(),
      handleKeyDown: jest.fn(),
      handlePaste: jest.fn(),
      lastAssistantMessage: null,
    });

    const { container, root } = renderOverlay();

    expect(container.textContent).toMatch(/Zed/i);
    expect(container.querySelector('[data-testid="zed-ambient-aura"]')).not.toBeNull();
    root.unmount();
  });

  test('status line auto-dismisses after a few seconds', () => {
    jest.useFakeTimers();
    mockUseZedChat.mockReturnValue({
      input: '',
      setInput: jest.fn(),
      isLoading: false,
      handleSend: jest.fn(),
      handleStop: jest.fn(),
      handleKeyDown: jest.fn(),
      handlePaste: jest.fn(),
      lastAssistantMessage: {
        role: 'assistant',
        content: 'Listo.',
        timestamp: '2026-06-09T22:01:00.000Z',
        tool_results: [
          {
            tool: 'open_terminal',
            result: {
              workspace: true,
              program: 'opencode',
              command_sent: 'opencode --agent gentle-orchestrator',
            },
          },
        ],
      },
    });

    const { container, root } = renderOverlay();
    expect(container.textContent).toContain('Listo. Abrí OpenCode.');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(container.textContent).not.toContain('Listo. Abrí OpenCode.');

    act(() => {
      root.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  test('shows assistant feedback in collapsed pill after a turn', () => {
    mockUseZedChat.mockReturnValue({
      input: '',
      setInput: jest.fn(),
      isLoading: false,
      handleSend: jest.fn(),
      handleStop: jest.fn(),
      handleKeyDown: jest.fn(),
      handlePaste: jest.fn(),
      lastAssistantMessage: {
        role: 'assistant',
        content: 'Listo, abrí GitHub en el navegador integrado.',
        timestamp: '2026-06-09T22:00:00.000Z',
        tool_results: [
          { tool: 'open_url', result: { url: 'https://github.com/', label: 'GitHub' } },
        ],
      },
    });

    const { container, root } = renderOverlay();

    expect(container.textContent).toContain('Listo. Abrí GitHub en pizarra.');
    expect(container.querySelector('textarea')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test('renders input when overlay is open', () => {
    mockUseZedOverlay.mockReturnValue({
      isOpen: true,
      close: jest.fn(),
      toggle: jest.fn(),
    });

    const { container, root } = renderOverlay();

    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.textContent).toContain('Ctrl+Shift+Z');
    root.unmount();
  });
});

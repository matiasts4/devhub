const React = require('react');
const { JSDOM } = require('jsdom');
const { act } = require('react');

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
const mockUseVoiceCapture = jest.fn();
const mockUseVoiceTts = jest.fn();

jest.mock('@/lib/asistente/useZedChat', () => ({
  useZedChat: (...args) => mockUseZedChat(...args),
}));

jest.mock('@/lib/asistente/useZedOverlay', () => ({
  useZedOverlay: (...args) => mockUseZedOverlay(...args),
}));

jest.mock('@/lib/voice/useVoiceCapture', () => ({
  useVoiceCapture: (...args) => mockUseVoiceCapture(...args),
}));

jest.mock('@/lib/voice/useVoiceTts', () => ({
  useVoiceTts: (...args) => mockUseVoiceTts(...args),
}));

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return dom;
}

function renderOverlay(props = {}) {
  const ZedAmbientOverlay = require('../ZedAmbientOverlay').default;
  const { createRoot } = require('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ZedAmbientOverlay, props));
  });
  return { container, root };
}

function defaultZedChatMock(overrides = {}) {
  return {
    messages: [],
    input: '',
    setInput: jest.fn(),
    isLoading: false,
    handleSend: jest.fn(),
    handleStop: jest.fn(),
    handleKeyDown: jest.fn(),
    handlePaste: jest.fn(),
    textareaRef: { current: null },
    lastAssistantMessage: null,
    lastToolType: null,
    currentStep: null,
    activityExpanded: false,
    setActivityExpanded: jest.fn(),
    pendingApproval: null,
    auditTrail: [],
    handleApproveCommand: jest.fn(),
    handleRejectApproval: jest.fn(),
    quickSuggestions: ['abrir una terminal', 'cerrar todas las terminales'],
    ...overrides,
  };
}

describe('ZedAmbientOverlay', () => {
  let dom;

  function defaultVoiceCaptureMock(overrides = {}) {
    return {
      recording: false,
      available: false,
      engineReady: false,
      enginePhase: 'idle',
      statusText: '',
      errorText: '',
      liveTranscript: '',
      vuLevel: 0,
      micPermission: 'prompt',
      audioDevices: [],
      toggleRecording: jest.fn(),
      startEngine: jest.fn(),
      ...overrides,
    };
  }

  function defaultVoiceTtsMock(overrides = {}) {
    return {
      speak: jest.fn(),
      speaking: false,
      stopSpeaking: jest.fn(),
      ttsError: '',
      clearTtsError: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    dom = installDom();
    jest.clearAllMocks();
    mockUseZedOverlay.mockReturnValue({
      isOpen: false,
      close: jest.fn(),
      toggle: jest.fn(),
    });
    mockUseZedChat.mockReturnValue(defaultZedChatMock());
    mockUseVoiceCapture.mockReturnValue(defaultVoiceCaptureMock());
    mockUseVoiceTts.mockReturnValue(defaultVoiceTtsMock());
  });

  afterEach(() => {
    jest.useRealTimers();
    dom.window.close();
  });

  test('renders executing pill when loading without open overlay', () => {
    mockUseZedChat.mockReturnValue(defaultZedChatMock({ isLoading: true }));

    const { container, root } = renderOverlay();

    expect(container.textContent).toMatch(/Zed/i);
    expect(container.querySelector('[data-testid="zed-ambient-aura"]')).not.toBeNull();
    act(() => root.unmount());
  });

  test('status line auto-dismisses after a few seconds', () => {
    jest.useFakeTimers();
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
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
      })
    );

    const { container, root } = renderOverlay();
    expect(container.textContent).toContain('Listo. Abrí OpenCode.');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(container.textContent).not.toContain('Listo. Abrí OpenCode.');

    act(() => {
      root.unmount();
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  test('shows assistant feedback in collapsed pill after a turn', () => {
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
        lastAssistantMessage: {
          role: 'assistant',
          content: 'Listo, abrí GitHub en el navegador integrado.',
          timestamp: '2026-06-09T22:00:00.000Z',
          tool_results: [
            { tool: 'open_url', result: { url: 'https://github.com/', label: 'GitHub' } },
          ],
        },
      })
    );

    const { container, root } = renderOverlay();

    expect(container.textContent).toContain('Listo. Abrí GitHub en pizarra.');
    expect(container.querySelector('textarea')).toBeNull();

    act(() => root.unmount());
  });

  test('renders input when overlay is open', () => {
    mockUseZedOverlay.mockReturnValue({
      isOpen: true,
      close: jest.fn(),
      toggle: jest.fn(),
    });

    const { container, root } = renderOverlay();

    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.textContent).toContain('Probá');
    expect(container.textContent).not.toContain('Ctrl+Shift+Z');
    expect(container.querySelectorAll('button').length).toBeLessThan(5);
    act(() => root.unmount());
  });

  test('does not show the pill on cold boot when overlay is closed', () => {
    // Ctrl+R must not resurface assistant chrome from chat history alone.
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
        restoredFromStorage: true,
        activityExpanded: true,
        messages: [
          {
            role: 'assistant',
            timestamp: '2026-06-09T22:01:00.000Z',
            content: 'Turno previo en sessionStorage',
          },
        ],
        lastAssistantMessage: {
          role: 'assistant',
          timestamp: '2026-06-09T22:01:00.000Z',
          content: 'Turno previo en sessionStorage',
        },
      })
    );

    const { container, root } = renderOverlay();

    expect(container.querySelector('[data-testid="zed-ambient-pill"]')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    act(() => root.unmount());
  });

  test('closes and hides chrome when Terminales manager is soft-mounted off-route', () => {
    const close = jest.fn();
    mockUseZedOverlay.mockReturnValue({
      isOpen: true,
      close,
      open: jest.fn(),
      toggle: jest.fn(),
    });
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
        isLoading: true,
        currentStep: { tool: 'open_terminal', label: 'Abrir', status: 'running' },
      })
    );

    const { container, root } = renderOverlay({ managerVisible: false });

    expect(close).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="zed-ambient-pill"]')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    act(() => root.unmount());
  });

  test('shows voice capture error on collapsed pill while recording', () => {
    mockUseVoiceCapture.mockReturnValue(
      defaultVoiceCaptureMock({
        recording: true,
        enginePhase: 'error',
        errorText: 'Micrófono no detectado',
      })
    );

    const { container, root } = renderOverlay();

    expect(container.textContent).toContain('Micrófono no detectado');
    act(() => root.unmount());
  });

  test('does not show mic permission errors while Zed is closed', () => {
    mockUseVoiceCapture.mockReturnValue(
      defaultVoiceCaptureMock({
        enginePhase: 'error',
        errorText: 'Permiso de micrófono denegado. Verificá los permisos del sistema.',
      })
    );

    const { container, root } = renderOverlay();

    expect(container.querySelector('[data-testid="zed-ambient-pill"]')).toBeNull();
    expect(container.textContent).not.toContain('Permiso de micrófono denegado');
    act(() => root.unmount());
  });

  test('keeps a TTS error visible until it is cleared', () => {
    jest.useFakeTimers();
    mockUseVoiceTts.mockReturnValue(
      defaultVoiceTtsMock({
        ttsError: 'No hay un motor de voz disponible',
      })
    );

    const { container, root } = renderOverlay();
    expect(container.textContent).toContain('No hay un motor de voz disponible');

    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(container.textContent).toContain('No hay un motor de voz disponible');
    act(() => root.unmount());
  });

  test('shows stop-speaking button when TTS is active', () => {
    mockUseVoiceTts.mockReturnValue(
      defaultVoiceTtsMock({
        speaking: true,
      })
    );

    mockUseZedOverlay.mockReturnValue({
      isOpen: true,
      close: jest.fn(),
      toggle: jest.fn(),
    });

    const { container, root } = renderOverlay();

    const stopBtn = [...container.querySelectorAll('button')].find((b) =>
      b.getAttribute('aria-label')?.includes('Detener voz')
    );
    expect(stopBtn).toBeTruthy();
    act(() => root.unmount());
  });

  test('speaks a concise terminal digest automatically', () => {
    const speak = jest.fn();
    const message = {
      role: 'assistant',
      timestamp: 'terminal-turn-1',
      content:
        'En Kimi, lo último que veo es:\nPrimera línea extensa\nSegunda línea\nResultado final correcto',
      tool_results: [{ tool: 'summarize_terminal', result: { status: 'idle' } }],
    };
    mockUseVoiceTts.mockReturnValue(defaultVoiceTtsMock({ speak }));
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
        voiceSettings: { ttsEnabled: true, voiceEnabled: false },
        lastAssistantMessage: message,
        messages: [message],
      })
    );

    const { root } = renderOverlay();

    expect(speak).toHaveBeenCalledWith(
      'En Kimi, lo último que veo es: Segunda línea. Resultado final correcto.'
    );
    act(() => root.unmount());
  });

  test('replays the full latest response from the collapsed pill', () => {
    const speak = jest.fn();
    const message = {
      role: 'assistant',
      timestamp: 'turn-replay',
      content: 'Esta es la respuesta completa para volver a escuchar.',
    };
    mockUseVoiceTts.mockReturnValue(defaultVoiceTtsMock({ speak }));
    mockUseZedChat.mockReturnValue(
      defaultZedChatMock({
        voiceSettings: { ttsEnabled: true, voiceEnabled: false },
        lastAssistantMessage: message,
        messages: [message],
      })
    );

    const { container, root } = renderOverlay();
    speak.mockClear();
    const replay = container.querySelector('[aria-label="Escuchar última respuesta"]');
    expect(replay).not.toBeNull();

    act(() => replay.click());
    expect(speak).toHaveBeenCalledWith(message.content, { full: true });
    act(() => root.unmount());
  });
});

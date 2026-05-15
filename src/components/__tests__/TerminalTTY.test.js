/**
 * TerminalTTY unit tests — terminal-ux-redesign
 *
 * Per Extract-Before-Mock rule, we test pure functions extracted from TerminalTTY.
 *
 * Spec requirements:
 * - xterm container wraps with fade-in animation (opacity 0→1, 150ms)
 * - No inline hex colors override CSS var–derived theme
 *
 * We test the exported pure helper `getXtermContainerAnimProps(connected)`.
 */

const {
  fitTerminalViewport,
  getXtermContainerAnimProps,
  refreshTerminalViewport,
  resolveTerminalConnectionCloseState,
  shouldShowTerminalStatusOverlay,
  shouldShowTerminalViewport,
  shouldAutoReconnectTerminal,
  stabilizeTerminalRenderer,
  TERMINAL_VIEWPORT_SHELL_STYLE,
} = require('../TerminalTTY.jsx');

describe('getXtermContainerAnimProps()', () => {
  test('returns opacity 0 as initial when connected=false', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.initial.opacity).toBe(0);
  });

  test('returns opacity 1 as animate when connected=true', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition duration is 0.15s (150ms ease-out)', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.transition.duration).toBe(0.15);
    expect(props.transition.ease).toBe('easeOut');
  });

  test('when connected=false, animate keeps opacity 0 (still loading)', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.animate.opacity).toBe(0);
  });
});

describe('shouldShowTerminalViewport()', () => {
  test('shows the viewport once initialization finishes without init error', () => {
    expect(shouldShowTerminalViewport(false, null)).toBe(true);
  });

  test('keeps the viewport hidden while initializing or after init failure', () => {
    expect(shouldShowTerminalViewport(true, null)).toBe(false);
    expect(shouldShowTerminalViewport(false, 'boom')).toBe(false);
  });
});

describe('shouldShowTerminalStatusOverlay()', () => {
  test('shows overlay for terminated sessions after initialization', () => {
    expect(shouldShowTerminalStatusOverlay(false, null, 'terminated')).toBe(true);
  });

  test('shows overlay for init errors and recoverable connection failures', () => {
    expect(shouldShowTerminalStatusOverlay(false, 'falló init', 'idle')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'error')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'disconnected')).toBe(true);
  });

  test('does not show overlay while initializing or when connected', () => {
    expect(shouldShowTerminalStatusOverlay(true, null, 'connecting')).toBe(false);
    expect(shouldShowTerminalStatusOverlay(false, null, 'connected')).toBe(false);
  });
});

describe('refreshTerminalViewport()', () => {
  test('refreshes every visible row when the terminal has a rendered buffer', () => {
    const term = {
      rows: 24,
      refresh: jest.fn(),
    };

    expect(refreshTerminalViewport(term)).toBe(true);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  test('skips repaint when the terminal has no visible rows yet', () => {
    const term = {
      rows: 0,
      refresh: jest.fn(),
    };

    expect(refreshTerminalViewport(term)).toBe(false);
    expect(term.refresh).not.toHaveBeenCalled();
  });
});

describe('stabilizeTerminalRenderer()', () => {
  test('clears the xterm texture atlas before repainting when supported', () => {
    const term = {
      rows: 24,
      clearTextureAtlas: jest.fn(),
      refresh: jest.fn(),
    };

    expect(stabilizeTerminalRenderer(term)).toBe(true);
    expect(term.clearTextureAtlas).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  test('still repaints terminals that do not expose clearTextureAtlas', () => {
    const term = {
      rows: 12,
      refresh: jest.fn(),
    };

    expect(stabilizeTerminalRenderer(term)).toBe(true);
    expect(term.refresh).toHaveBeenCalledWith(0, 11);
  });
});

describe('fitTerminalViewport()', () => {
  test('fits, repaints, and emits resize when the viewport is visible and socket is open', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    };
    const fitAddon = { fit: jest.fn() };
    const term = {
      cols: 132,
      rows: 40,
      clearTextureAtlas: jest.fn(),
      refresh: jest.fn(),
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
      })
    ).toBe(true);
    expect(fitAddon.fit).toHaveBeenCalledTimes(1);
    expect(term.clearTextureAtlas).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledWith(0, 39);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'resize',
        cols: 132,
        rows: 40,
      })
    );
  });

  test('does nothing when the container is still hidden', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 0, height: 320 }),
    };
    const fitAddon = { fit: jest.fn() };
    const term = {
      cols: 80,
      rows: 24,
      refresh: jest.fn(),
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
      })
    ).toBe(false);
    expect(fitAddon.fit).not.toHaveBeenCalled();
    expect(term.refresh).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe('resolveTerminalConnectionCloseState()', () => {
  test('marks the terminal as terminated after a process exit event', () => {
    expect(resolveTerminalConnectionCloseState('connected', true)).toBe('terminated');
  });

  test('preserves error state when the socket closes without a process exit', () => {
    expect(resolveTerminalConnectionCloseState('error', false)).toBe('error');
  });

  test('marks the terminal as disconnected for recoverable socket closes', () => {
    expect(resolveTerminalConnectionCloseState('connected', false)).toBe('disconnected');
  });
});

describe('shouldAutoReconnectTerminal()', () => {
  test('reconnects recoverable disconnected terminals when focused', () => {
    expect(shouldAutoReconnectTerminal('disconnected', true)).toBe(true);
    expect(shouldAutoReconnectTerminal('error', true)).toBe(true);
  });

  test('does not reconnect terminated sessions or background tabs', () => {
    expect(shouldAutoReconnectTerminal('terminated', true)).toBe(false);
    expect(shouldAutoReconnectTerminal('disconnected', false)).toBe(false);
  });
});

describe('TERMINAL_VIEWPORT_SHELL_STYLE', () => {
  test('keeps only isolation to avoid aggressive compositor hints around xterm canvas', () => {
    expect(TERMINAL_VIEWPORT_SHELL_STYLE).toEqual({
      isolation: 'isolate',
    });
  });
});

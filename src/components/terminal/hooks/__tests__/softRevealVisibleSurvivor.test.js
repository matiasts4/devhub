/**
 * @jest-environment jsdom
 */

const { softRevealVisibleSurvivor } = require('../useTerminalLayoutChurnRecovery');

describe('softRevealVisibleSurvivor', () => {
  function makeCtx(overrides = {}) {
    const term = {
      cols: 80,
      rows: 24,
      refresh: jest.fn(),
      resize: jest.fn(),
    };
    const socket = { readyState: 1, send: jest.fn() };
    const fitFn = jest.fn();
    const nudgeFn = jest.fn();
    return {
      term,
      fitFn,
      nudgeFn,
      socket,
      ctx: {
        termRef: { current: term },
        containerRef: { current: { clientWidth: 800, clientHeight: 600 } },
        fitRef: { current: { proposeDimensions: () => ({ cols: 80, rows: 24 }) } },
        wsRef: { current: socket },
        lastPtySizeRef: { current: { cols: 80, rows: 24 } },
        fitTerminalViewport: fitFn,
        stabilizeTerminalRenderer: jest.fn(),
        nudgeTerminalPtyResize: nudgeFn,
        coalescedForceRepaint: jest.fn(),
        logViewportDiagnostic: jest.fn(),
        tuiSessionActiveRef: { current: false },
        initialCommand: null,
        kimiReadyNotifiedRef: { current: false },
        hasConnectedOnceRef: { current: true },
        windowSwitchTuiRecoverAtRef: { current: 0 },
        operationalRendererModeRef: { current: 'xterm-webgl' },
        webglAddonRef: { current: null },
        disposeWebglAddonForContextLoss: jest.fn(),
        scheduleWorkspaceShowRecovery: jest.fn(),
        ...overrides,
      },
    };
  }

  test('fits empty shells but skips fit for live TUI and force-nudges PTY', () => {
    const shell = makeCtx();
    softRevealVisibleSurvivor(shell.ctx, 'test-shell');
    expect(shell.fitFn).toHaveBeenCalled();
    expect(shell.nudgeFn).not.toHaveBeenCalled();

    const tui = makeCtx({
      tuiSessionActiveRef: { current: true },
      windowSwitchTuiRecoverAtRef: { current: 0 },
    });
    softRevealVisibleSurvivor(tui.ctx, 'test-tui');
    expect(tui.fitFn).not.toHaveBeenCalled();
    expect(tui.nudgeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        term: tui.term,
        socket: tui.socket,
      })
    );
  });
});

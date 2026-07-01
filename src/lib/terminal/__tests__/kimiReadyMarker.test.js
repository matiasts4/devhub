const {
  detectKimiReadyFromTerminalBuffer,
  detectKimiTuiReady,
  isKimiLaunchCommand,
  isKimiTuiLive,
  normalizeKimiLaunchCommand,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  shouldSkipKimiTuiPtyResize,
} = require('../kimiReadyMarker.js');

describe('kimiReadyMarker', () => {
  test('isKimiLaunchCommand matches kimi swarm inner commands', () => {
    expect(
      isKimiLaunchCommand('/home/matias/.kimi-code/bin/kimi --yolo --auto --skills-dir /skills')
    ).toBe(true);
    expect(isKimiLaunchCommand('opencode --agent swarm-coder')).toBe(false);
  });

  test('normalizeKimiLaunchCommand strips recovery suffix', () => {
    expect(normalizeKimiLaunchCommand('kimi run #recovery-42')).toBe('kimi run');
  });

  test('detectKimiTuiReady matches welcome banner and window title', () => {
    expect(detectKimiTuiReady('Welcome to Kimi Code')).toBe(true);
    expect(detectKimiTuiReady('Kimi Code CLI v0.9.0')).toBe(true);
    expect(detectKimiTuiReady('\x1b]0;kimi\x07')).toBe(true);
    expect(detectKimiTuiReady('booting shell')).toBe(false);
  });

  test('detectKimiTuiReady matches kimi chrome beyond welcome banner', () => {
    expect(detectKimiTuiReady('MCP / Status')).toBe(true);
    expect(detectKimiTuiReady('ctrl+p commands')).toBe(true);
    expect(detectKimiTuiReady('session_abc12345-dead-beef')).toBe(true);
    expect(detectKimiTuiReady('k2.5 code')).toBe(true);
    expect(detectKimiTuiReady('thinking / 12.3% (tokens)')).toBe(true);
  });

  test('isKimiTuiLive requires launch command and readiness or connected tui session', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(isKimiTuiLive({ initialCommand: kimiCmd, kimiReady: true })).toBe(true);
    expect(
      isKimiTuiLive({
        initialCommand: kimiCmd,
        kimiReady: false,
        tuiSessionActive: true,
        hasConnectedOnce: true,
      })
    ).toBe(true);
    expect(
      isKimiTuiLive({
        initialCommand: kimiCmd,
        kimiReady: false,
        tuiSessionActive: false,
        hasConnectedOnce: true,
      })
    ).toBe(false);
    expect(isKimiTuiLive({ initialCommand: 'opencode', kimiReady: true })).toBe(false);
  });

  test('shouldFreezeKimiTuiViewportOnWorkspaceShow freezes only when dims match container', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(
      shouldFreezeKimiTuiViewportOnWorkspaceShow({
        initialCommand: kimiCmd,
        proposedDimsMatch: true,
      })
    ).toBe(true);
    expect(
      shouldFreezeKimiTuiViewportOnWorkspaceShow({
        initialCommand: kimiCmd,
        proposedDimsMatch: false,
      })
    ).toBe(false);
    expect(shouldFreezeKimiTuiViewportOnWorkspaceShow({ initialCommand: 'opencode' })).toBe(false);
  });

  test('shouldSkipKimiTuiPtyResize requires connected kimi session', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(
      shouldSkipKimiTuiPtyResize({
        initialCommand: kimiCmd,
        hasConnectedOnce: true,
      })
    ).toBe(false);
    expect(
      shouldSkipKimiTuiPtyResize({
        initialCommand: kimiCmd,
        hasConnectedOnce: false,
      })
    ).toBe(false);
    expect(
      shouldSkipKimiTuiPtyResize({
        initialCommand: 'opencode',
        hasConnectedOnce: true,
      })
    ).toBe(false);
  });

  test('detectKimiReadyFromTerminalBuffer scans scrollback tail', () => {
    const term = {
      buffer: {
        active: {
          length: 2,
          getLine: (index) => ({
            translateToString: () => (index === 1 ? 'Welcome to Kimi Code' : 'booting'),
          }),
        },
      },
    };
    expect(detectKimiReadyFromTerminalBuffer(term)).toBe(true);
    expect(detectKimiReadyFromTerminalBuffer(null)).toBe(false);
  });
});

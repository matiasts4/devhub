const {
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

  test('isKimiTuiLive requires launch command and readiness flag', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(isKimiTuiLive({ initialCommand: kimiCmd, kimiReady: true })).toBe(true);
    expect(isKimiTuiLive({ initialCommand: kimiCmd, kimiReady: false })).toBe(false);
    expect(isKimiTuiLive({ initialCommand: 'opencode', kimiReady: true })).toBe(false);
  });

  test('shouldFreezeKimiTuiViewportOnWorkspaceShow freezes live kimi on any workspace show', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(
      shouldFreezeKimiTuiViewportOnWorkspaceShow({
        initialCommand: kimiCmd,
        kimiReady: true,
      })
    ).toBe(true);
    expect(
      shouldFreezeKimiTuiViewportOnWorkspaceShow({
        initialCommand: kimiCmd,
        kimiReady: false,
      })
    ).toBe(false);
    expect(
      shouldFreezeKimiTuiViewportOnWorkspaceShow({
        initialCommand: 'opencode',
        kimiReady: true,
      })
    ).toBe(false);
  });

  test('shouldSkipKimiTuiPtyResize mirrors live kimi detection', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(
      shouldSkipKimiTuiPtyResize({
        initialCommand: kimiCmd,
        kimiReady: true,
      })
    ).toBe(true);
    expect(
      shouldSkipKimiTuiPtyResize({
        initialCommand: 'opencode',
        kimiReady: true,
      })
    ).toBe(false);
  });
});

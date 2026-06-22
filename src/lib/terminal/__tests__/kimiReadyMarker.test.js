const {
  detectKimiTuiReady,
  isKimiLaunchCommand,
  normalizeKimiLaunchCommand,
  shouldInjectKimiWheelScroll,
} = require('../kimiReadyMarker.js');

describe('kimiReadyMarker', () => {
  test('isKimiLaunchCommand matches kimi swarm inner commands', () => {
    expect(
      isKimiLaunchCommand(
        '/home/matias/.kimi-code/bin/kimi --yolo --auto --skills-dir /skills'
      )
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

  test('shouldInjectKimiWheelScroll requires kimi command, readiness, and active panel', () => {
    const kimiCmd = '/home/matias/.kimi-code/bin/kimi --yolo --auto';
    expect(
      shouldInjectKimiWheelScroll({
        initialCommand: kimiCmd,
        kimiReady: true,
        isActivePanel: true,
      })
    ).toBe(true);
    expect(
      shouldInjectKimiWheelScroll({
        initialCommand: kimiCmd,
        kimiReady: false,
        isActivePanel: true,
      })
    ).toBe(false);
    expect(
      shouldInjectKimiWheelScroll({
        initialCommand: 'opencode',
        kimiReady: true,
        isActivePanel: true,
      })
    ).toBe(false);
  });
});
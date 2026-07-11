const {
  detectGrokTuiReady,
  detectGrokSessionFromOutput,
  detectGrokReadyFromTerminalBuffer,
  isGrokLaunchCommand,
} = require('../grokReadyMarker.js');

describe('grokReadyMarker', () => {
  test('isGrokLaunchCommand matches grok invocations', () => {
    expect(isGrokLaunchCommand('grok')).toBe(true);
    expect(isGrokLaunchCommand('grok --yolo #recovery-1')).toBe(true);
    expect(isGrokLaunchCommand('opencode --agent coder')).toBe(false);
    expect(isGrokLaunchCommand('')).toBe(false);
  });

  test('detectGrokTuiReady matches chrome hints', () => {
    expect(detectGrokTuiReady('Shift+Tab mode')).toBe(true);
    expect(detectGrokTuiReady('ctrl+c:cancel')).toBe(true);
    expect(detectGrokTuiReady('booting')).toBe(false);
  });

  test('detectGrokSessionFromOutput matches title and chrome', () => {
    expect(detectGrokSessionFromOutput('\x1b]0;grok\x07')).toBe(true);
    expect(detectGrokSessionFromOutput('Shift+Tab mode')).toBe(true);
    expect(detectGrokSessionFromOutput('shell ready')).toBe(false);
  });

  test('detectGrokReadyFromTerminalBuffer scans scrollback tail', () => {
    const term = {
      buffer: {
        active: {
          length: 2,
          getLine: (index) =>
            index === 1
              ? { translateToString: () => 'Shift+Tab mode  ctrl+c cancel' }
              : { translateToString: () => '' },
        },
      },
    };
    expect(detectGrokReadyFromTerminalBuffer(term)).toBe(true);
    expect(detectGrokReadyFromTerminalBuffer(null)).toBe(false);
  });
});

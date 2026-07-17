/**
 * @jest-environment node
 */

const {
  normalizeBootstrapText,
  isBootstrapReady,
  runNativeTuiBootstrapPaste,
  BOOTSTRAP_ENTER,
  DEFAULT_BOOTSTRAP_TIMEOUT_MS,
} = require('../nativeTuiBootstrapPaste');

describe('normalizeBootstrapText', () => {
  test('strips trailing newlines and keeps body', () => {
    expect(normalizeBootstrapText('hello world\n')).toBe('hello world');
    expect(normalizeBootstrapText('line1\nline2\r\n')).toBe('line1\nline2');
  });

  test('empty for non-string', () => {
    expect(normalizeBootstrapText(null)).toBe('');
    expect(normalizeBootstrapText(undefined)).toBe('');
  });
});

describe('isBootstrapReady', () => {
  test('grok requires grokReady', () => {
    expect(isBootstrapReady({ program: 'grok', signals: { tuiActive: true } })).toBe(false);
    expect(isBootstrapReady({ program: 'grok', signals: { grokReady: true } })).toBe(true);
  });

  test('kimi requires kimiReady', () => {
    expect(isBootstrapReady({ program: 'kimi', signals: { tuiActive: true } })).toBe(false);
    expect(isBootstrapReady({ program: 'kimi', signals: { kimiReady: true } })).toBe(true);
  });

  test('opencode requires footer-ready, not launch-heuristic tuiActive', () => {
    // tuiSessionActiveRef starts true for agent launch commands — must not paste yet
    expect(isBootstrapReady({ program: 'opencode', signals: { tuiActive: true } })).toBe(false);
    expect(isBootstrapReady({ program: 'opencode', signals: { opencodeFooterReady: true } })).toBe(
      true
    );
    expect(isBootstrapReady({ program: 'opencode', signals: {} })).toBe(false);
  });

  test('unknown ignores bare tuiActive heuristic', () => {
    expect(isBootstrapReady({ program: 'hermes', signals: { tuiActive: true } })).toBe(false);
    expect(isBootstrapReady({ program: 'hermes', signals: { opencodeFooterReady: true } })).toBe(
      true
    );
  });
});

describe('runNativeTuiBootstrapPaste', () => {
  test('skips empty text', async () => {
    const sendInput = jest.fn();
    const result = await runNativeTuiBootstrapPaste({
      getSignals: () => ({ grokReady: true }),
      program: 'grok',
      text: '  \n',
      formatPayload: (t) => t,
      sendInput,
    });
    expect(result.status).toBe('skipped');
    expect(sendInput).not.toHaveBeenCalled();
  });

  test('pastes formatted payload then Enter after ready', async () => {
    let ready = false;
    const sends = [];
    const result = await runNativeTuiBootstrapPaste({
      getSignals: () => ({ grokReady: ready }),
      program: 'grok',
      text: 'do the thing\n',
      timeoutMs: 1000,
      formatPayload: (t) => `\x1b[200~${t}\x1b[201~`,
      sendInput: (data) => {
        sends.push(data);
        return true;
      },
      sleep: async () => {
        ready = true;
      },
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
    });

    expect(result.status).toBe('pasted');
    expect(sends).toHaveLength(2);
    expect(sends[0]).toContain('do the thing');
    expect(sends[0]).toContain('\x1b[200~');
    expect(sends[0]).not.toMatch(/do the thing\n$/);
    expect(sends[1]).toBe(BOOTSTRAP_ENTER);
  });

  test('timeout without readiness does not send', async () => {
    const sendInput = jest.fn();
    let t = 0;
    const result = await runNativeTuiBootstrapPaste({
      getSignals: () => ({ grokReady: false }),
      program: 'grok',
      text: 'never',
      timeoutMs: 100,
      formatPayload: (x) => x,
      sendInput,
      sleep: async () => {},
      now: () => {
        t += 60;
        return t;
      },
    });
    expect(result.status).toBe('timeout');
    expect(sendInput).not.toHaveBeenCalled();
  });

  test('send_failed on paste', async () => {
    const result = await runNativeTuiBootstrapPaste({
      getSignals: () => ({ opencodeFooterReady: true }),
      program: 'opencode',
      text: 'x',
      formatPayload: (x) => x,
      sendInput: () => false,
      sleep: async () => {},
    });
    expect(result.status).toBe('send_failed');
    expect(result.reason).toBe('paste');
  });

  test('exports default timeout constant', () => {
    expect(DEFAULT_BOOTSTRAP_TIMEOUT_MS).toBe(15_000);
  });
});

const {
  detectAgentTuiReady,
  detectAgentTuiDetachedFromOutput,
  detectGrokSessionFromOutput,
  isAgentTuiInteractionLive,
  isLikelyTuiInitialCommand,
  resolveAgentProgramFromCommand,
} = require('../agentTui.js');
const { shouldPassthroughNativeTuiWheel } = require('../tuiAdapter.js');

describe('resolveAgentProgramFromCommand', () => {
  test('extracts agent program tokens', () => {
    expect(resolveAgentProgramFromCommand('kimi')).toBe('kimi');
    expect(resolveAgentProgramFromCommand('codex')).toBe('codex');
    expect(resolveAgentProgramFromCommand('bash -lc opencode --session ses_1')).toBe('opencode');
    expect(resolveAgentProgramFromCommand('npm run dev')).toBeNull();
  });
});

describe('detectAgentTuiReady', () => {
  test('detects kimi welcome banner and session footer', () => {
    expect(detectAgentTuiReady('Welcome to Kimi Code', 'kimi')).toBe(true);
    expect(
      detectAgentTuiReady('session_b6699564-32c1-4858-9c8f-f69f31f1345b', 'kimi')
    ).toBe(true);
    expect(detectAgentTuiReady('K2.7 Code thinking 0.0% (0/262.1k)', 'kimi')).toBe(true);
  });

  test('detects codex window title', () => {
    expect(detectAgentTuiReady('\x1b]0;codex\x07', 'codex')).toBe(true);
  });

  test('detects ink mouse + alternate screen for agent launches', () => {
    const chunk = '\x1b[?1049h\x1b[?1000h\x1b[?1006h';
    expect(detectAgentTuiReady(chunk, 'kimi')).toBe(true);
  });
});

describe('shouldPassthroughNativeTuiWheel — global agents', () => {
  test('kimi uses synthetic wheel (not passthrough) when agent chrome is ready', () => {
    expect(
      shouldPassthroughNativeTuiWheel({
        initialCommand: 'kimi',
        agentTuiReady: true,
      })
    ).toBe(false);
    expect(
      shouldPassthroughNativeTuiWheel({
        initialCommand: 'kimi',
        agentTuiReady: false,
      })
    ).toBe(false);
  });

  test('codex uses synthetic wheel when agent chrome is ready', () => {
    expect(
      shouldPassthroughNativeTuiWheel({
        initialCommand: 'codex',
        agentTuiReady: true,
      })
    ).toBe(false);
  });

  test('grok still uses grok ready ref', () => {
    expect(
      shouldPassthroughNativeTuiWheel({
        initialCommand: 'grok',
        isGrokSession: true,
        grokTuiReady: true,
      })
    ).toBe(true);
  });

  test('opencode still uses footer confirmed ref', () => {
    expect(
      shouldPassthroughNativeTuiWheel({
        initialCommand: 'opencode',
        opencodeFooterConfirmed: true,
      })
    ).toBe(true);
  });
});

describe('isLikelyTuiInitialCommand', () => {
  test('includes kimi and codex', () => {
    expect(isLikelyTuiInitialCommand('kimi')).toBe(true);
    expect(isLikelyTuiInitialCommand('codex')).toBe(true);
    expect(detectGrokSessionFromOutput('\x1b]0;grok\x07')).toBe(true);
  });
});

describe('detectAgentTuiDetachedFromOutput', () => {
  test('detects alternate-screen off after agent was ready', () => {
    expect(detectAgentTuiDetachedFromOutput('\x1b[?1049l', { wasAgentReady: true })).toBe(true);
    expect(detectAgentTuiDetachedFromOutput('\x1b[?1049l', { wasAgentReady: false })).toBe(false);
  });

  test('detects shell prompt return', () => {
    const prompt = '\r\n\u001b[1m\u001b[7m% \u001b[27m\u001b[1m\u001b[0m\r\n\r\n-(matias@kali)-[~/devhub]\r\n$ ';
    expect(detectAgentTuiDetachedFromOutput(prompt, { wasAgentReady: true })).toBe(true);
  });
});

describe('isAgentTuiInteractionLive', () => {
  test('requires live session and not detached', () => {
    expect(
      isAgentTuiInteractionLive({
        initialCommand: 'kimi',
        tuiSessionActive: true,
        agentTuiDetached: false,
        agentTuiReady: true,
      })
    ).toBe(true);
    expect(
      isAgentTuiInteractionLive({
        initialCommand: 'kimi',
        tuiSessionActive: true,
        agentTuiDetached: true,
        agentTuiReady: true,
      })
    ).toBe(false);
    expect(
      isAgentTuiInteractionLive({
        initialCommand: 'kimi',
        tuiSessionActive: true,
        agentTuiDetached: false,
        agentTuiReady: false,
      })
    ).toBe(false);
  });
});

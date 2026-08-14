const {
  isExplicitNonAgentLaunch,
  shouldPromoteAgentFromOutput,
  MIN_PROMOTING_SIGNALS,
} = require('../agentOutputPromotion.js');

describe('agentOutputPromotion', () => {
  describe('isExplicitNonAgentLaunch', () => {
    test('true for explicit non-agent commands', () => {
      expect(isExplicitNonAgentLaunch({ initialCommand: 'pnpm electron:up' })).toBe(true);
      expect(isExplicitNonAgentLaunch({ initialCommand: 'npm run dev' })).toBe(true);
      expect(isExplicitNonAgentLaunch({ initialCommand: 'vim .qoder/AGENTS.md' })).toBe(true);
    });

    test('false for agent launch commands', () => {
      expect(isExplicitNonAgentLaunch({ initialCommand: 'opencode' })).toBe(false);
      expect(isExplicitNonAgentLaunch({ initialCommand: 'kimi --yolo' })).toBe(false);
      expect(isExplicitNonAgentLaunch({ initialCommand: 'claude --session abc' })).toBe(false);
    });

    test('false when there is no explicit command', () => {
      expect(isExplicitNonAgentLaunch({ initialCommand: null })).toBe(false);
      expect(isExplicitNonAgentLaunch({ initialCommand: '' })).toBe(false);
      expect(isExplicitNonAgentLaunch({})).toBe(false);
      expect(isExplicitNonAgentLaunch(null)).toBe(false);
    });
  });

  describe('shouldPromoteAgentFromOutput — the pnpm electron:up regression', () => {
    const devLauncherLogs = [
      '[sidecar] MCP / status ready',
      'session_907f6b63-2a35-46c4-93d1-35bef8f405d6 attached',
    ].join('\n');

    test('never promotes a session with an explicit non-agent initialCommand', () => {
      const session = { initialCommand: 'pnpm electron:up' };
      expect(shouldPromoteAgentFromOutput(session, 'kimi', devLauncherLogs)).toBe(false);
      expect(shouldPromoteAgentFromOutput(session, 'opencode', devLauncherLogs)).toBe(false);
    });

    test('guard wins even over strong signals on non-agent launches', () => {
      const session = { initialCommand: 'pnpm electron:up' };
      expect(shouldPromoteAgentFromOutput(session, 'kimi', 'Welcome to Kimi Code')).toBe(false);
    });

    test('single weak footer hint never promotes, even without initialCommand', () => {
      // MCP status line + generic session id: only ONE promoting weak signal
      // (session_<hex> is log-prone and deliberately excluded).
      expect(shouldPromoteAgentFromOutput({}, 'kimi', devLauncherLogs)).toBe(false);
      expect(shouldPromoteAgentFromOutput({}, 'opencode', devLauncherLogs)).toBe(false);
    });
  });

  describe('shouldPromoteAgentFromOutput — legitimate agents still promote', () => {
    test('kimi strong signals promote alone', () => {
      expect(shouldPromoteAgentFromOutput({}, 'kimi', 'Welcome to Kimi Code')).toBe(true);
      expect(shouldPromoteAgentFromOutput({}, 'kimi', 'Kimi Code CLI v0.9.0')).toBe(true);
      expect(shouldPromoteAgentFromOutput({}, 'kimi', 'k2.5 code')).toBe(true);
    });

    test('kimi promotes on >=2 distinct weak footer signals in one chunk', () => {
      const footer = '⊙ 3 MCP servers   esc interrupt   ctrl+p commands';
      expect(shouldPromoteAgentFromOutput({}, 'kimi', footer)).toBe(true);
      expect(
        shouldPromoteAgentFromOutput({}, 'kimi', 'MCP / status\nesc interrupt')
      ).toBe(true);
    });

    test('kimi does NOT promote on exactly one weak signal', () => {
      expect(shouldPromoteAgentFromOutput({}, 'kimi', 'esc interrupt')).toBe(false);
      expect(shouldPromoteAgentFromOutput({}, 'kimi', 'session_abc12345-dead-beef')).toBe(false);
      expect(
        shouldPromoteAgentFromOutput({}, 'kimi', 'thinking / 12.3% (tokens)')
      ).toBe(false);
    });

    test('opencode strong signal promotes alone', () => {
      expect(
        shouldPromoteAgentFromOutput({}, 'opencode', 'minimax.io MiniMax-M2')
      ).toBe(true);
    });

    test('opencode promotes on >=2 distinct weak signals, not on generic version row', () => {
      expect(
        shouldPromoteAgentFromOutput({}, 'opencode', 'MCP / status\nesc interrupt')
      ).toBe(true);
      // '/status 1.16.2' is generic (log-prone) — excluded from promoting set.
      expect(
        shouldPromoteAgentFromOutput({}, 'opencode', 'MCP / status   /status 1.16.2')
      ).toBe(false);
    });

    test('grok/agy/qodercli detectors pass through, still guarded by initialCommand', () => {
      expect(shouldPromoteAgentFromOutput({}, 'agy', '? for shortcuts')).toBe(true);
      expect(
        shouldPromoteAgentFromOutput({ initialCommand: 'pnpm electron:up' }, 'agy', '? for shortcuts')
      ).toBe(false);
      expect(shouldPromoteAgentFromOutput({}, 'unknown-kind', 'anything')).toBe(false);
    });

    test('empty or non-string text never promotes', () => {
      expect(shouldPromoteAgentFromOutput({}, 'kimi', '')).toBe(false);
      expect(shouldPromoteAgentFromOutput({}, 'kimi', null)).toBe(false);
      expect(MIN_PROMOTING_SIGNALS).toBe(2);
    });
  });
});

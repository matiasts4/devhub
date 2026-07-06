const {
  detectAgentState,
  hasManifest,
  normalizeAgentType,
  AgentStateMachine,
} = require('../index.js');

describe('agentStateDetection', () => {
  describe('normalizeAgentType', () => {
    test.each([
      ['kimi', 'kimi'],
      ['Kimi Code', 'kimi'],
      ['kimi-code', 'kimi'],
      ['claude', 'claude'],
      ['claude-code', 'claude'],
      ['codex', 'codex'],
      ['opencode', 'opencode'],
      ['open-code', 'opencode'],
      ['grok', 'grok'],
      ['groc', 'grok'],
      ['hermes', 'hermes'],
      ['unknown-agent', 'unknown-agent'],
      [null, null],
    ])('normalizeAgentType(%j) === %j', (input, expected) => {
      expect(normalizeAgentType(input)).toBe(expected);
    });
  });

  describe('hasManifest', () => {
    test.each(['kimi', 'claude', 'codex', 'opencode', 'grok'])('has manifest for %s', (type) => {
      expect(hasManifest(type)).toBe(true);
    });

    test('returns false for unsupported agents', () => {
      expect(hasManifest('hermes')).toBe(false);
      expect(hasManifest('bash')).toBe(false);
    });
  });

  describe('detectAgentState', () => {
    test('returns unknown for unsupported agents', () => {
      const result = detectAgentState('bash', 'thinking...');
      expect(result.state).toBe('unknown');
      expect(result.visibleWorking).toBe(false);
      expect(result.visibleIdle).toBe(false);
      expect(result.visibleBlocker).toBe(false);
    });

    test('returns unknown when no rule matches', () => {
      const result = detectAgentState('kimi', 'plain unrelated output');
      expect(result.state).toBe('unknown');
    });

    test('kimi detects approval blocker', () => {
      const screen = ['run this command?', '↵ confirm', ' choose', 'approve   reject'].join('\n');
      const result = detectAgentState('kimi', screen);
      expect(result.state).toBe('blocked');
      expect(result.visibleBlocker).toBe(true);
    });

    test('kimi detects moon spinner as running', () => {
      const result = detectAgentState('kimi', '🌕');
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('claude detects permission blocker', () => {
      const screen = ['do you want to proceed?', 'esc to cancel', '❯ 1. yes', '  2. no'].join('\n');
      const result = detectAgentState('claude', screen);
      expect(result.state).toBe('blocked');
      expect(result.visibleBlocker).toBe(true);
    });

    test('codex detects working from OSC title', () => {
      const result = detectAgentState('codex', '', { oscTitle: '⠋ codex' });
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('opencode detects permission blocker', () => {
      const screen = ['△ Permission required', 'enter confirm', 'esc dismiss'].join('\n');
      const result = detectAgentState('opencode', screen);
      expect(result.state).toBe('blocked');
      expect(result.visibleBlocker).toBe(true);
    });

    test('grok detects spinner with stop chip as running', () => {
      const screen = '⠧ Waiting on subagent… 2.8s   13s ⇣29.7k [stop]\n';
      const result = detectAgentState('grok', screen);
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('grok detects idle prompt footer', () => {
      const screen = '\nctrl+.:shortcuts\n';
      const result = detectAgentState('grok', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleIdle).toBe(true);
    });

    test('grok detects option dialog blocked', () => {
      const screen = '┃  2 (○) Yes, proceed\n';
      const result = detectAgentState('grok', screen);
      expect(result.state).toBe('blocked');
    });

    test('claude detects osc_progress idle', () => {
      const result = detectAgentState('claude', '', { oscProgress: '4;0' });
      expect(result.state).toBe('idle');
    });
  });

  describe('AgentStateMachine', () => {
    test('publishes first state change', () => {
      const sm = new AgentStateMachine();
      const published = sm.publish({
        state: 'running',
        visibleIdle: false,
        visibleWorking: true,
        visibleBlocker: false,
      });
      expect(published).toEqual({
        state: 'running',
        visibleIdle: false,
        visibleWorking: true,
        visibleBlocker: false,
      });
      expect(sm.state).toBe('running');
    });

    test('holds running -> idle transition briefly', () => {
      const sm = new AgentStateMachine();
      sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        0
      );
      const held = sm.publish(
        { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
        10
      );
      expect(held).toBeNull();
      expect(sm.state).toBe('running');
    });

    test('allows running -> idle after enough confirmations', () => {
      const sm = new AgentStateMachine();
      sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        0
      );
      sm.publish(
        { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
        10
      );
      sm.publish(
        { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
        20
      );
      sm.publish(
        { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
        30
      );
      const final = sm.publish(
        { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
        40
      );
      expect(final).toEqual({
        state: 'idle',
        visibleIdle: false,
        visibleWorking: false,
        visibleBlocker: false,
      });
      expect(sm.state).toBe('idle');
    });

    test('refreshes stable blocker periodically', () => {
      const sm = new AgentStateMachine();
      sm.publish(
        { state: 'blocked', visibleIdle: false, visibleWorking: false, visibleBlocker: true },
        0
      );
      const refresh = sm.publish(
        { state: 'blocked', visibleIdle: false, visibleWorking: false, visibleBlocker: true },
        1000
      );
      expect(refresh).toEqual({
        state: 'blocked',
        visibleIdle: false,
        visibleWorking: false,
        visibleBlocker: true,
      });
    });

    test('does not publish identical state without refresh', () => {
      const sm = new AgentStateMachine();
      sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        0
      );
      const again = sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        10
      );
      expect(again).toBeNull();
    });
  });
});

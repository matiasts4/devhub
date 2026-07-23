const fs = require('fs');
const path = require('path');
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

    test('returns idle fallback for known agents with no rule match', () => {
      const result = detectAgentState('kimi', 'plain unrelated output');
      expect(result.state).toBe('idle');
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

    test('agy detects braille spinner verb as running', () => {
      const result = detectAgentState('agy', '⠋ Thinking');
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('agy detects permission prompt as blocked', () => {
      const screen = ['requesting permission for:', '  $ npm test', 'do you want to proceed?'].join(
        '\n'
      );
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('blocked');
      expect(result.visibleBlocker).toBe(true);
    });

    test('agy alias antigravity resolves to the same manifest', () => {
      const result = detectAgentState('antigravity', '⠋ Working');
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('agy falls back to idle with no rule match', () => {
      const result = detectAgentState('agy', 'plain unrelated output');
      expect(result.state).toBe('idle');
    });

    test('agy does not stay running from stale spinner lines in scrollback', () => {
      // Stream model: after the agent stops, old spinner lines remain in the
      // buffer but the fresh prompt lines at the bottom must win.
      const screen = [
        '⠋ Thinking',
        '· 2 tasks running',
        'some final answer text',
        'another output line',
        '> ',
      ].join('\n');
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleWorking).toBe(false);
    });

    test('agy detects working from esc-to-cancel footer (agy 1.1.x)', () => {
      const screen = [
        'writing a story…',
        '',
        'esc to cancel',
        'accept-edits · Gemini 3.5 Flash',
      ].join('\n');
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('agy detects working from esc to interrupt footer', () => {
      const screen = [
        'building project assets…',
        '',
        'esc to interrupt',
        'accept-edits · Gemini 3.5 Flash',
      ].join('\n');
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('agy detects idle from shortcuts footer (agy 1.1.x)', () => {
      const screen = ['OK', '', '? for shortcuts', 'accept-edits · Gemini 3.5 Flash'].join('\n');
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleIdle).toBe(true);
    });

    test('agy does not stay blocked from answered permission prompt in scrollback', () => {
      const screen = [
        'requesting permission for:',
        '  $ npm test',
        'do you want to proceed?',
        'user selected: Yes',
        'executing command...',
        'Command completed successfully.',
        'line 7',
        'line 8',
        'line 9',
        'line 10',
        'antigravity>',
      ].join('\n');
      const result = detectAgentState('agy', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleBlocker).toBe(false);
      expect(result.visibleIdle).toBe(true);
    });

    test('kimi does not stay running from stale moon spinner in scrollback', () => {
      const screen = ['🌕', 'final response text', 'more output', 'ctrl+p commands', '> '].join(
        '\n'
      );
      const result = detectAgentState('kimi', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleWorking).toBe(false);
    });

    test('kimi detects moon spinner as running even with ANSI erase codes', () => {
      const result = detectAgentState('kimi', '\x1b[2K\x1b[G🌕');
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('kimi detects working from working-footer fixture', () => {
      const fixturePath = path.resolve(
        __dirname,
        '../../../../../tests/fixtures/agent-screens/kimi-working-footer.txt'
      );
      const screen = fs.readFileSync(fixturePath, 'utf8');
      const result = detectAgentState('kimi', screen);
      expect(result.state).toBe('running');
      expect(result.visibleWorking).toBe(true);
    });

    test('kimi detects idle from idle-prompt fixture', () => {
      const fixturePath = path.resolve(
        __dirname,
        '../../../../../tests/fixtures/agent-screens/kimi-idle-prompt.txt'
      );
      const screen = fs.readFileSync(fixturePath, 'utf8');
      const result = detectAgentState('kimi', screen);
      expect(result.state).toBe('idle');
      expect(result.visibleIdle).toBe(true);
    });

    test('kimi detects blocked from blocked-approval fixture', () => {
      const fixturePath = path.resolve(
        __dirname,
        '../../../../../tests/fixtures/agent-screens/kimi-blocked-approval.txt'
      );
      const screen = fs.readFileSync(fixturePath, 'utf8');
      const result = detectAgentState('kimi', screen);
      expect(result.state).toBe('blocked');
      expect(result.visibleBlocker).toBe(true);
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
      for (let i = 1; i <= 6; i++) {
        sm.publish(
          { state: 'idle', visibleIdle: false, visibleWorking: false, visibleBlocker: false },
          i * 1000
        );
      }
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

    test('refreshes stable working state periodically', () => {
      const sm = new AgentStateMachine();
      sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        0
      );
      const refresh = sm.publish(
        { state: 'running', visibleIdle: false, visibleWorking: true, visibleBlocker: false },
        1000
      );
      expect(refresh).toEqual({
        state: 'running',
        visibleIdle: false,
        visibleWorking: true,
        visibleBlocker: false,
      });
    });
  });
});

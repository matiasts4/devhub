/**
 * @jest-environment node
 *
 * quickActionRegistry — registry shape + filterQuickActions contract.
 */

const {
  QUICK_ACTIONS,
  QUICK_ACTION_GROUPS,
  filterQuickActions,
} = require('../quickActionRegistry');

describe('quickActionRegistry', () => {
  test('exports a non-empty frozen action list', () => {
    expect(Array.isArray(QUICK_ACTIONS)).toBe(true);
    expect(QUICK_ACTIONS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(QUICK_ACTIONS)).toBe(true);
  });

  test('every action has the required shape', () => {
    for (const action of QUICK_ACTIONS) {
      expect(typeof action.id).toBe('string');
      expect(action.id.length).toBeGreaterThan(0);
      expect(typeof action.label).toBe('string');
      expect(typeof action.description).toBe('string');
      expect(typeof action.icon).toBe('string');
      expect(['terminal', 'browser']).toContain(action.type);
      expect(Object.values(QUICK_ACTION_GROUPS)).toContain(action.group);
    }
  });

  test('terminal actions define command (string or null), browser actions define url', () => {
    for (const action of QUICK_ACTIONS) {
      if (action.type === 'terminal') {
        expect(action.command === null || typeof action.command === 'string').toBe(true);
      }
      if (action.type === 'browser') {
        expect(typeof action.url).toBe('string');
        expect(action.url.startsWith('https://')).toBe(true);
      }
    }
  });

  test('ids are unique', () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('includes the expected agent + tool actions', () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'terminal-plain',
        'agent-claude',
        'agent-antigravity',
        'agent-opencode',
        'agent-kimi',
        'agent-codex',
        'agent-qodercli',
        'browser',
      ])
    );
  });

  test('agent-qodercli launches the qodercli binary', () => {
    const action = QUICK_ACTIONS.find((a) => a.id === 'agent-qodercli');
    expect(action).toBeDefined();
    expect(action.type).toBe('terminal');
    expect(action.command).toBe('qodercli');
    expect(action.group).toBe(QUICK_ACTION_GROUPS.AGENTS);
  });

  describe('filterQuickActions', () => {
    test('empty/blank query returns all actions', () => {
      expect(filterQuickActions('')).toHaveLength(QUICK_ACTIONS.length);
      expect(filterQuickActions('   ')).toHaveLength(QUICK_ACTIONS.length);
      expect(filterQuickActions(undefined)).toHaveLength(QUICK_ACTIONS.length);
    });

    test('matches label case-insensitively', () => {
      const result = filterQuickActions('claude');
      expect(result.some((a) => a.id === 'agent-claude')).toBe(true);

      const upper = filterQuickActions('CLAUDE');
      expect(upper.some((a) => a.id === 'agent-claude')).toBe(true);
    });

    test('matches description', () => {
      const result = filterQuickActions('anthropic');
      expect(result.some((a) => a.id === 'agent-claude')).toBe(true);
    });

    test('"qoder" matches the Qoder CLI agent action', () => {
      const result = filterQuickActions('qoder');
      expect(result.some((a) => a.id === 'agent-qodercli')).toBe(true);
    });

    test('returns empty array when nothing matches', () => {
      expect(filterQuickActions('zzz-no-such-action')).toEqual([]);
    });

    test('"terminal" matches the plain terminal and agent terminals (via description)', () => {
      const result = filterQuickActions('terminal');
      expect(result.some((a) => a.id === 'terminal-plain')).toBe(true);
      // Agent descriptions contain "Terminal ·".
      expect(result.some((a) => a.id === 'agent-claude')).toBe(true);
    });
  });
});

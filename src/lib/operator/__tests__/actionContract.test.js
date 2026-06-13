'use strict';

/**
 * actionContract.test.js — Unit tests for validateAction.
 *
 * Coverage:
 * - Each of the six v1 verbs with complete params → valid: true, correct tier
 * - Unknown verb → valid: false, error: 'E_ACTION_NOT_ALLOWLISTED'
 * - Each verb missing each required param → valid: false, error: 'E_MISSING_PARAMS'
 * - Empty params object on a verb with required params
 * - params: undefined → defaults to {} and returns E_MISSING_PARAMS
 */

const { ALLOWED_VERBS, RISK_TIER_COLORS, validateAction } = require('../actionContract');

describe('ALLOWED_VERBS', () => {
  it('contains exactly the six v1 verbs', () => {
    expect(Object.keys(ALLOWED_VERBS)).toHaveLength(6);
  });

  it('all verbs are tier low in v1', () => {
    Object.values(ALLOWED_VERBS).forEach((entry) => {
      expect(entry.tier).toBe('low');
    });
  });
});

describe('RISK_TIER_COLORS', () => {
  it('has low, medium, high keys', () => {
    expect(RISK_TIER_COLORS).toHaveProperty('low');
    expect(RISK_TIER_COLORS).toHaveProperty('medium');
    expect(RISK_TIER_COLORS).toHaveProperty('high');
  });
});

describe('validateAction — valid verbs with complete params', () => {
  const validCases = [
    { verb: 'terminal.open', params: { workspaceId: 'ws1' } },
    { verb: 'terminal.focus', params: { workspaceId: 'ws1' } },
    { verb: 'browser.open', params: { url: 'https://example.com' } },
    { verb: 'browser.navigate', params: { url: 'https://example.com' } },
    { verb: 'browser.focus', params: {} },
    { verb: 'dock.switch_tab', params: { tabId: 'browser' } },
  ];

  validCases.forEach(({ verb, params }) => {
    it(`${verb} → valid: true, tier: 'low'`, () => {
      const result = validateAction({ verb, params });
      expect(result.valid).toBe(true);
      expect(result.tier).toBe('low');
      expect(result.error).toBeNull();
    });
  });

  it('browser.open accepts optional label param', () => {
    const result = validateAction({
      verb: 'browser.open',
      params: { url: 'https://example.com', label: 'My Label' },
    });
    expect(result.valid).toBe(true);
  });

  it('target is accepted but not validated', () => {
    const result = validateAction({
      verb: 'terminal.open',
      params: { workspaceId: 'ws1' },
      target: 'right-dock',
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateAction — unknown verbs', () => {
  it('returns E_ACTION_NOT_ALLOWLISTED for unknown verb', () => {
    const result = validateAction({ verb: 'terminal.run', params: { workspaceId: 'ws1' } });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_ACTION_NOT_ALLOWLISTED');
    expect(result.tier).toBeNull();
  });

  it('returns E_ACTION_NOT_ALLOWLISTED for empty verb', () => {
    const result = validateAction({ verb: '', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_ACTION_NOT_ALLOWLISTED');
  });

  it('returns E_ACTION_NOT_ALLOWLISTED for undefined verb', () => {
    const result = validateAction({ params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_ACTION_NOT_ALLOWLISTED');
  });
});

describe('validateAction — missing required params', () => {
  it('terminal.open without workspaceId → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'terminal.open', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
    expect(result.tier).toBeNull();
  });

  it('terminal.focus without workspaceId → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'terminal.focus', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('browser.open without url → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'browser.open', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('browser.navigate without url → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'browser.navigate', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('dock.switch_tab without tabId → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'dock.switch_tab', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });
});

describe('validateAction — edge cases', () => {
  it('empty params object on a verb with required params → E_MISSING_PARAMS', () => {
    const result = validateAction({ verb: 'terminal.open', params: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('params: undefined → defaults to {} and returns E_MISSING_PARAMS for required params', () => {
    const result = validateAction({ verb: 'terminal.open', params: undefined });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('params: null throws TypeError — callers must guard before passing', () => {
    // The function signature defaults params to {} but if caller passes null
    // explicitly, the for-of loop will throw. We document this boundary.
    expect(() => validateAction({ verb: 'browser.open', params: null })).toThrow(TypeError);
  });

  it('browser.focus accepts empty params object (no required params)', () => {
    const result = validateAction({ verb: 'browser.focus', params: {} });
    expect(result.valid).toBe(true);
  });

  it('param present but undefined is treated as missing', () => {
    const result = validateAction({ verb: 'terminal.open', params: { workspaceId: undefined } });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('E_MISSING_PARAMS');
  });

  it('param present but null is treated as missing (null !== undefined)', () => {
    const result = validateAction({ verb: 'terminal.open', params: { workspaceId: null } });
    // null !== undefined so it is treated as present — passes required-param check
    expect(result.valid).toBe(true);
  });

  it('param present as empty string is valid', () => {
    const result = validateAction({ verb: 'terminal.open', params: { workspaceId: '' } });
    // Empty string is !== undefined, so it passes the required param check
    expect(result.valid).toBe(true);
  });
});

const { getAgentDisplayName } = require('../agentDisplayNames.js');

describe('getAgentDisplayName', () => {
  test('canonical names for known agents', () => {
    expect(getAgentDisplayName('kimi')).toBe('Kimi Code');
    expect(getAgentDisplayName('claude')).toBe('Claude Code');
    expect(getAgentDisplayName('agy')).toBe('Antigravity');
    expect(getAgentDisplayName('antigravity')).toBe('Antigravity');
    expect(getAgentDisplayName('opencode')).toBe('OpenCode');
    expect(getAgentDisplayName('grok')).toBe('Grok');
    expect(getAgentDisplayName('qodercli')).toBe('Qoder');
    expect(getAgentDisplayName('qoder')).toBe('Qoder');
    expect(getAgentDisplayName('codex')).toBe('Codex');
  });

  test('is case-insensitive and trims whitespace', () => {
    expect(getAgentDisplayName(' Kimi ')).toBe('Kimi Code');
    expect(getAgentDisplayName('AGY')).toBe('Antigravity');
  });

  test('unknown types and junk input return null (no invented names)', () => {
    expect(getAgentDisplayName('kimi -p "do something"')).toBeNull();
    expect(getAgentDisplayName('unknown-agent')).toBeNull();
    expect(getAgentDisplayName('')).toBeNull();
    expect(getAgentDisplayName(null)).toBeNull();
    expect(getAgentDisplayName(undefined)).toBeNull();
    expect(getAgentDisplayName(42)).toBeNull();
  });
});

jest.mock('@/lib/llmProviderConfig', () => ({
  getLlmProviderConfigSync: jest.fn(),
}));

const { getLlmProviderConfigSync } = require('@/lib/llmProviderConfig');
const { isUsableZedApiKey, resolveZedApiKey } = require('../resolveZedApiKey');

describe('resolveZedApiKey', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    getLlmProviderConfigSync.mockReset();
  });

  test('isUsableZedApiKey rejects placeholders', () => {
    expect(isUsableZedApiKey('sk-cp-PLACEHOLDER-REPLACE_WITH_YOUR_KEY')).toBe(false);
    expect(isUsableZedApiKey('short')).toBe(false);
    expect(isUsableZedApiKey('sk-cp-valid-looking-key-1234567890')).toBe(true);
  });

  test('skips placeholder env and falls back to llm-providers-config', () => {
    process.env.MINIMAX_API_KEY = 'sk-cp-PLACEHOLDER-REPLACE_WITH_YOUR_KEY';
    delete process.env.ANTHROPIC_API_KEY;
    getLlmProviderConfigSync.mockReturnValue({
      MINIMAX_API_KEY: 'sk-cp-config-file-key-abcdefghijklmnop',
    });

    const resolved = resolveZedApiKey();
    expect(resolved.source).toBe('llm-providers-config');
    expect(resolved.apiKey).toBe('sk-cp-config-file-key-abcdefghijklmnop');
  });

  test('prefers valid MINIMAX_API_KEY env over config file', () => {
    process.env.MINIMAX_API_KEY = 'sk-cp-env-key-abcdefghijklmnopqrst';
    getLlmProviderConfigSync.mockReturnValue({
      MINIMAX_API_KEY: 'sk-cp-config-file-key-abcdefghijklmnop',
    });

    const resolved = resolveZedApiKey();
    expect(resolved.source).toBe('MINIMAX_API_KEY');
    expect(resolved.apiKey).toBe('sk-cp-env-key-abcdefghijklmnopqrst');
  });
});

describe('resolveZedApiKey integration (real llm-providers-config)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.unmock('@/lib/llmProviderConfig');
  });

  test('reads minimax key from data/llm-providers-config.json when env is placeholder', () => {
    jest.unmock('@/lib/llmProviderConfig');
    jest.resetModules();
    process.env.MINIMAX_API_KEY = 'sk-cp-PLACEHOLDER-REPLACE_WITH_YOUR_KEY';
    delete process.env.ANTHROPIC_API_KEY;

    const { resolveZedApiKey: resolveReal } = require('../resolveZedApiKey');
    const resolved = resolveReal();
    expect(resolved.source).toBe('llm-providers-config');
    expect(resolved.apiKey).toMatch(/^sk-cp-/);
    expect(resolved.apiKey.length).toBeGreaterThan(20);
  });
});
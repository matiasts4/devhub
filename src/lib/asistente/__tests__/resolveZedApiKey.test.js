jest.mock('@/lib/llmProviderConfig', () => ({
  getLlmProviderConfigSync: jest.fn(),
  getRawLlmProviderSync: jest.fn(),
  getZedSettingsSync: jest.fn(),
}));

const {
  getLlmProviderConfigSync,
  getRawLlmProviderSync,
  getZedSettingsSync,
} = require('@/lib/llmProviderConfig');
const { isUsableZedApiKey, resolveZedApiKey, resolveZedLlmConfig } = require('../resolveZedApiKey');
const { KIMI_CODE_BASE_URL } = require('../grokClient');

describe('resolveZedApiKey', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    getLlmProviderConfigSync.mockReset();
    getRawLlmProviderSync.mockReset();
    getZedSettingsSync.mockReset();
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
});

describe('resolveZedLlmConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ZED_LLM_PROVIDER;
    delete process.env.KIMI_CODE_API_KEY;
    delete process.env.XAI_API_KEY;
    getLlmProviderConfigSync.mockReset();
    getRawLlmProviderSync.mockReset();
    getZedSettingsSync.mockReset();
  });

  test('uses kimi_code when explicitly selected', async () => {
    getZedSettingsSync.mockReturnValue({ provider: 'kimi_code' });
    getRawLlmProviderSync.mockImplementation((key) => {
      if (key === 'kimi_code') {
        return { KIMI_CODE_API_KEY: 'kimi-subscription-key-1234567890', enabled: true };
      }
      return null;
    });

    const resolved = await resolveZedLlmConfig();
    expect(resolved.provider).toBe('kimi_code');
    expect(resolved.model).toBe('kimi-for-coding');
    expect(resolved.baseUrl).toBe(KIMI_CODE_BASE_URL);
    expect(resolved.apiKey).toBe('kimi-subscription-key-1234567890');
  });

  test('respects ZED_LLM_PROVIDER=minimax override', async () => {
    process.env.ZED_LLM_PROVIDER = 'minimax';
    getLlmProviderConfigSync.mockReturnValue({
      MINIMAX_API_KEY: 'sk-cp-minimax-key-abcdefghijklmnop',
    });

    const resolved = await resolveZedLlmConfig();
    expect(resolved.provider).toBe('minimax');
    expect(resolved.apiKey).toMatch(/^sk-cp-minimax/);
  });

  test('legacy auto prefers xai when configured', async () => {
    getZedSettingsSync.mockReturnValue({});
    getRawLlmProviderSync.mockImplementation((key) => {
      if (key === 'xai') {
        return { XAI_API_KEY: 'xai-key-1234567890123456', enabled: true };
      }
      return null;
    });

    const resolved = await resolveZedLlmConfig();
    expect(resolved.provider).toBe('xai');
    expect(resolved.apiKey).toBe('xai-key-1234567890123456');
  });

  test('uses SuperGrok OAuth access token when XAI_AUTH_MODE=oauth', async () => {
    getZedSettingsSync.mockReturnValue({ provider: 'xai' });
    getRawLlmProviderSync.mockImplementation((key) => {
      if (key === 'xai') {
        return {
          enabled: true,
          XAI_AUTH_MODE: 'oauth',
          XAI_MODEL: 'grok-build-0.1',
          XAI_OAUTH_ACCESS_TOKEN: 'oauth-access-token-123456789012',
          XAI_OAUTH_REFRESH_TOKEN: 'oauth-refresh-token-123456789012',
          XAI_OAUTH_EXPIRES_AT: Date.now() + 60 * 60 * 1000,
        };
      }
      return null;
    });

    const resolved = await resolveZedLlmConfig();
    expect(resolved.provider).toBe('xai');
    expect(resolved.authMode).toBe('oauth');
    expect(resolved.model).toBe('grok-build-0.1');
    expect(resolved.apiKey).toBe('oauth-access-token-123456789012');
    expect(resolved.source).toBe('xai-oauth');
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

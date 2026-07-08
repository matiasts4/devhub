/**
 * @jest-environment node
 */

// Regression test: saving LLM provider config from the Settings UI writes
// data/llm-providers-config.json on disk but `src/lib/llmProviderConfig.js`
// caches that file in-memory for synchronous callers (e.g. resolveZedApiKey).
// Without invalidating that cache after a save, a freshly-entered Grok API
// key would not take effect until the server restarted.

jest.mock('@/lib/llmProviderConfig', () => ({
  invalidateLlmProviderConfigCache: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(() => Promise.reject(new Error('no file yet'))),
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
}));

const { invalidateLlmProviderConfigCache } = require('@/lib/llmProviderConfig');
const { POST } = require('../route');

describe('POST /api/settings/llm-providers', () => {
  afterEach(() => jest.clearAllMocks());

  test('invalidates the llmProviderConfig cache after a successful save', async () => {
    const res = await POST({
      json: async () => ({
        providers: { xai: { XAI_API_KEY: 'xai-new-key', enabled: true } },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(invalidateLlmProviderConfigCache).toHaveBeenCalledTimes(1);
  });
});

/**
 * @jest-environment node
 */

const { POST } = require('../route');

describe('POST /api/settings/llm-providers/test — xai', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('calls the xAI chat/completions endpoint with the given key/model', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    const res = await POST({
      json: async () => ({
        provider: 'xai',
        config: { XAI_API_KEY: 'xai-test-key', XAI_MODEL: 'grok-4.3' },
      }),
    });

    const body = await res.json();
    expect(body).toEqual({ valid: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer xai-test-key' }),
      })
    );
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).model).toBe('grok-4.3');
  });

  test('surfaces upstream error messages when the key is invalid', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      })
    );

    const res = await POST({
      json: async () => ({
        provider: 'xai',
        config: { XAI_AUTH_MODE: 'api_key', XAI_API_KEY: 'bad-key' },
      }),
    });

    const body = await res.json();
    expect(body).toEqual({ valid: false, error: 'Invalid API key' });
  });

  test('oauth mode validates SuperGrok tokens via /models', async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/models')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      // chat probe
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const res = await POST({
      json: async () => ({
        provider: 'xai',
        config: {
          XAI_AUTH_MODE: 'oauth',
          XAI_OAUTH_ACCESS_TOKEN: 'oauth-access-token-1234567890',
          XAI_OAUTH_REFRESH_TOKEN: 'oauth-refresh-token-1234567890',
          XAI_OAUTH_EXPIRES_AT: Date.now() + 60 * 60 * 1000,
          XAI_MODEL: 'grok-build-0.1',
        },
      }),
    });

    const body = await res.json();
    expect(body).toEqual({ valid: true });
  });
});

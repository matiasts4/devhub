/**
 * @jest-environment node
 */

const {
  startXaiDeviceFlow,
  pollXaiDeviceFlow,
  refreshXaiAccessToken,
  resolveXaiOAuthAccessToken,
  isXaiOAuthMode,
  XAI_OAUTH_CLIENT_ID,
  XAI_DEVICE_CODE_URL,
  XAI_TOKEN_URL,
} = require('../xai-oauth');

describe('xai-oauth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('isXaiOAuthMode detects explicit oauth and tokens', () => {
    expect(isXaiOAuthMode({ XAI_AUTH_MODE: 'oauth' })).toBe(true);
    expect(isXaiOAuthMode({ XAI_AUTH_MODE: 'api_key' })).toBe(false);
    expect(isXaiOAuthMode({ XAI_OAUTH_REFRESH_TOKEN: 'refresh-token-abcdefghijklmnop' })).toBe(
      true
    );
    expect(isXaiOAuthMode({ XAI_API_KEY: 'xai-only' })).toBe(false);
  });

  test('startXaiDeviceFlow posts client_id + scopes to xAI', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          device_code: 'dev-code',
          user_code: 'ABCD-1234',
          verification_uri: 'https://accounts.x.ai/oauth2/device',
          interval: 5,
          expires_in: 1800,
        }),
      })
    );

    const data = await startXaiDeviceFlow();
    expect(data.user_code).toBe('ABCD-1234');
    expect(global.fetch).toHaveBeenCalledWith(
      XAI_DEVICE_CODE_URL,
      expect.objectContaining({ method: 'POST' })
    );
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body).toContain(`client_id=${XAI_OAUTH_CLIENT_ID}`);
    expect(opts.body).toContain('offline_access');
  });

  test('pollXaiDeviceFlow returns pending while waiting', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ error: 'authorization_pending' }),
      })
    );
    const result = await pollXaiDeviceFlow('device');
    expect(result).toEqual({ status: 'pending' });
  });

  test('pollXaiDeviceFlow returns tokens on success', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          access_token: 'access-xyz',
          refresh_token: 'refresh-xyz',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      })
    );
    const result = await pollXaiDeviceFlow('device');
    expect(result.status).toBe('success');
    expect(result.access_token).toBe('access-xyz');
    expect(result.refresh_token).toBe('refresh-xyz');
    expect(result.expires_at).toBeGreaterThan(Date.now());
  });

  test('refreshXaiAccessToken posts refresh_token grant', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 1800,
        }),
      })
    );
    const data = await refreshXaiAccessToken('old-refresh');
    expect(data.access_token).toBe('new-access');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body).toContain('grant_type=refresh_token');
    expect(opts.body).toContain('refresh_token=old-refresh');
    expect(XAI_TOKEN_URL).toContain('auth.x.ai');
  });

  test('resolveXaiOAuthAccessToken returns fresh access without refresh', async () => {
    const result = await resolveXaiOAuthAccessToken({
      XAI_OAUTH_ACCESS_TOKEN: 'fresh-access-token-123456',
      XAI_OAUTH_REFRESH_TOKEN: 'refresh-token-1234567890',
      XAI_OAUTH_EXPIRES_AT: Date.now() + 30 * 60 * 1000,
    });
    expect(result.accessToken).toBe('fresh-access-token-123456');
    expect(result.source).toBe('xai-oauth');
    expect(result.updated).toBeUndefined();
  });

  test('listXaiChatModels merges API + CLI catalogs and pins Composer/Grok 4.5', async () => {
    const { listXaiChatModels } = require('../xai-oauth');
    global.fetch = jest.fn((url) => {
      if (String(url).includes('cli-chat-proxy')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 'grok-4.5', name: 'Grok 4.5' },
              { id: 'grok-composer-2.5-fast', name: 'Composer 2.5' },
            ],
          }),
        });
      }
      // api.x.ai/v1/models
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ id: 'grok-build-0.1' }, { id: 'grok-4.3' }, { id: 'grok-imagine-image' }],
        }),
      });
    });

    const result = await listXaiChatModels({
      accessToken: 'token-abc',
      includeSubscriptionCatalog: true,
      pinSubscriptionModels: true,
    });

    expect(result.models).toContain('grok-4.5');
    expect(result.models).toContain('grok-composer-2.5-fast');
    expect(result.models).toContain('grok-build-0.1');
    expect(result.models).not.toContain('grok-imagine-image');
    expect(result.sources.join(' ')).toMatch(/api\.x\.ai|cli-chat-proxy|pinned/);
  });
});

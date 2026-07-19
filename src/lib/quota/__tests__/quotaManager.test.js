import { quotaManager } from '../quotaManager.js';
import { detectProviderFromSession } from '../activeSessionSensor.js';
import { PROVIDERS } from '../types.js';
import { fetchGrokQuota } from '../server/grok.js';

describe('QuotaManager & ActiveSessionSensor', () => {
  beforeAll(() => {
    global.fetch = jest.fn().mockImplementation((_url) => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            providerId: 'grok',
            displayName: 'Grok',
            primaryRemainingPercent: 85,
            windows: [],
          }),
      });
    });
  });

  afterEach(() => {
    quotaManager.stopPolling();
  });

  test('detects correct provider from session title', () => {
    expect(detectProviderFromSession('grok agent run')).toBe(PROVIDERS.GROK);
    expect(detectProviderFromSession('claude code -p "fix"')).toBe(PROVIDERS.CLAUDE);
    expect(detectProviderFromSession('agy terminal')).toBe(PROVIDERS.ANTIGRAVITY);
    expect(detectProviderFromSession('kimi code')).toBe(PROVIDERS.KIMI);
    expect(detectProviderFromSession('opencode')).toBe(PROVIDERS.OPENCODE);
    expect(detectProviderFromSession('codex cli')).toBe(PROVIDERS.CODEX);
    expect(detectProviderFromSession('bash terminal')).toBe(PROVIDERS.GROK);
  });

  test('subscribes to quota updates and receives status', (done) => {
    let called = false;
    const unsubscribe = quotaManager.subscribe((allQuotas) => {
      expect(allQuotas).toBeDefined();
      expect(typeof allQuotas).toBe('object');
      if (!called) {
        called = true;
        done();
      }
    });
    unsubscribe();
  });

  test('fetches provider quota status via API', async () => {
    const grokStatus = await quotaManager.fetchProvider(PROVIDERS.GROK);
    expect(grokStatus).toBeDefined();
    expect(grokStatus.providerId).toBe(PROVIDERS.GROK);
    expect(grokStatus.primaryRemainingPercent).toBe(85);
  });

  test('server grok provider executes safely in Node', async () => {
    const grokStatus = await fetchGrokQuota();
    expect(grokStatus).toBeDefined();
    expect(grokStatus.providerId).toBe(PROVIDERS.GROK);
  });
});

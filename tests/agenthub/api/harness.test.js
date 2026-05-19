const path = require('path');

const HARNESS_PATH = path.resolve(__dirname, './harness.js');

describe('getAgentHubBaseUrl()', () => {
  const originalBaseUrl = process.env.AGENTHUB_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.AGENTHUB_BASE_URL;
    } else {
      process.env.AGENTHUB_BASE_URL = originalBaseUrl;
    }
    global.fetch = originalFetch;
    jest.resetModules();
  });

  test('defaults to the canonical AgentHub runtime port when env is unset', () => {
    delete process.env.AGENTHUB_BASE_URL;

    const { getAgentHubBaseUrl } = require(HARNESS_PATH);

    expect(getAgentHubBaseUrl()).toBe('http://localhost:3100');
  });

  test('uses AGENTHUB_BASE_URL override unchanged when provided', () => {
    process.env.AGENTHUB_BASE_URL = 'http://127.0.0.1:4100/custom';

    const { getAgentHubBaseUrl } = require(HARNESS_PATH);

    expect(getAgentHubBaseUrl()).toBe('http://127.0.0.1:4100/custom');
  });
});

describe('isAgentHubServerReachable()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  test('returns true when the AgentHub probe endpoint responds successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const {
      isAgentHubServerReachable,
      resetAgentHubServerReachabilityCache,
    } = require(HARNESS_PATH);

    resetAgentHubServerReachabilityCache();

    await expect(
      isAgentHubServerReachable('http://localhost:3100', { fresh: true })
    ).resolves.toBe(true);
  });

  test('returns false when the AgentHub probe fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    const {
      isAgentHubServerReachable,
      resetAgentHubServerReachabilityCache,
    } = require(HARNESS_PATH);

    resetAgentHubServerReachabilityCache();

    await expect(
      isAgentHubServerReachable('http://localhost:3100', { fresh: true })
    ).resolves.toBe(false);
  });
});

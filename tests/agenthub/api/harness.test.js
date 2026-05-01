const path = require('path');

const HARNESS_PATH = path.resolve(__dirname, './harness.js');

describe('getAgentHubBaseUrl()', () => {
  const originalBaseUrl = process.env.AGENTHUB_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.AGENTHUB_BASE_URL;
    } else {
      process.env.AGENTHUB_BASE_URL = originalBaseUrl;
    }
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

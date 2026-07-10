/**
 * @jest-environment node
 */

jest.mock('@/lib/asistente/resolveZedApiKey', () => ({
  resolveZedLlmConfig: jest.fn(),
}));

const { resolveZedLlmConfig } = require('@/lib/asistente/resolveZedApiKey');
const { GET } = require('../route');

describe('GET /api/assistant/zed-provider-status', () => {
  afterEach(() => jest.clearAllMocks());

  test('reports the resolved provider without leaking the api key', async () => {
    resolveZedLlmConfig.mockResolvedValue({
      apiKey: 'xai-super-secret',
      source: 'llm-providers-config',
      provider: 'xai',
      model: 'grok-4.20-0309-non-reasoning',
      authMode: 'api_key',
    });

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({
      provider: 'xai',
      source: 'llm-providers-config',
      model: 'grok-4.20-0309-non-reasoning',
      hasKey: true,
      authMode: 'api_key',
    });
    expect(JSON.stringify(body)).not.toMatch(/xai-super-secret/);
  });

  test('reports hasKey=false when no provider has a usable key', async () => {
    resolveZedLlmConfig.mockResolvedValue({
      apiKey: null,
      source: null,
      provider: 'minimax',
      model: 'minimax-coding-plan/MiniMax-M3',
    });

    const res = await GET();
    const body = await res.json();
    expect(body.hasKey).toBe(false);
    expect(body.provider).toBe('minimax');
  });
});

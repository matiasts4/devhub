const originalFetch = global.fetch;

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('GET /api/agenthub/mcp/status compatibility contract', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockRejectedValue(new Error('unavailable'));
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('labels fallback MCP data as inferred and stale', async () => {
    const { GET } = require('../../src/app/api/agenthub/mcp/status/route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authority).toBe('inferred');
    expect(body.freshness).toBe('stale');
    expect(body.observed_at).toEqual(expect.any(String));
    expect(body.servers[0]).toMatchObject({
      authority: 'inferred',
      freshness: 'stale',
    });
  });

  test('keeps live MCP payload authoritative when upstream responds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }] },
      ],
    });

    const { GET } = require('../../src/app/api/agenthub/mcp/status/route');
    const response = await GET();
    const body = await response.json();

    expect(body.authority).toBe('authoritative');
    expect(body.freshness).toBe('current');
    expect(body.servers[0].authority).toBe('authoritative');
  });
});

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

  test('returns doctor, list-tools, smoke and legacy servers from the durable-first snapshot', async () => {
    const { GET } = require('../../src/app/api/agenthub/mcp/status/route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authority).toBe('durable');
    expect(body.freshness).toBe('current');
    expect(body.observed_at).toEqual(expect.any(String));
    expect(body.doctor.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'inventory', status: 'degraded', authority: 'configured' }),
      ])
    );
    expect(body.list_tools.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'list_projects', authority: 'durable' }),
        expect.objectContaining({ name: 'read_file', authority: 'configured', safe_action: false }),
      ])
    );
    expect(body.smoke).toEqual(
      expect.objectContaining({
        status: 'degraded',
      })
    );
    expect(body.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'filesystem' }),
        expect.objectContaining({ name: 'devhub-control-plane' }),
      ])
    );
  });

  test('keeps live MCP inventory explicit without promoting executor-local tools to control-plane actions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          name: 'filesystem',
          status: 'connected',
          tools: [{ name: 'read_file', description: 'Read files' }],
        },
      ],
    });

    const { GET } = require('../../src/app/api/agenthub/mcp/status/route');
    const response = await GET();
    const body = await response.json();

    expect(body.authority).toBe('durable');
    expect(body.freshness).toBe('current');
    expect(body.doctor.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'inventory', status: 'healthy', authority: 'live' }),
      ])
    );
    expect(body.list_tools.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'read_file', authority: 'live', safe_action: false }),
      ])
    );
    expect(body.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'filesystem', authority: 'live' }),
      ])
    );
  });
});

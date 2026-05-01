jest.mock('@/lib/db/localDb.js', () => ({
  getSessionUsage: jest.fn(),
  tables: {
    agent_hub_sessions: {
      single: jest.fn(),
    },
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return Response.json(body, init);
    },
  },
}));

const { getSessionUsage, tables } = require('../../src/lib/db/localDb');
const { GET } = require('../../src/app/api/agenthub/sessions/[sessionId]/usage/route');

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(url) {
      this.url = url;
    }
  };
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status ?? 200;
    }

    static json(body, init = {}) {
      return new Response(body, init);
    }

    async json() {
      return this._body;
    }
  };
}

describe('GET /api/agenthub/sessions/[sessionId]/usage', () => {
  beforeEach(() => {
    getSessionUsage.mockReset();
    tables.agent_hub_sessions.single.mockReset();
  });

  test('returns normalized context usage with a fallback context window', async () => {
    getSessionUsage.mockReturnValue({
      prompt_tokens: 1200,
      completion_tokens: 3800,
      total_tokens: 5000,
      context_utilization: 0,
      context_window_size: null,
      tool_calls_count: 3,
      total_duration_ms: 400,
    });
    tables.agent_hub_sessions.single.mockReturnValue({ agent_model: 'gpt-4o' });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        prompt_tokens: 1200,
        completion_tokens: 3800,
        total_tokens: 5000,
        context_window_size: 128000,
        context_utilization: 3.9,
        model: 'gpt-4o',
      })
    );
  });

  test('returns zeroed usage payload when the session has no usage yet', async () => {
    getSessionUsage.mockReturnValue(null);
    tables.agent_hub_sessions.single.mockReturnValue(null);

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ sessionId: 'session-empty' }),
    });
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        context_window_size: 200000,
        context_utilization: 0,
        model: null,
      })
    );
  });

  test('preserves a provider-aware stored context window even when the session model is generic', async () => {
    getSessionUsage.mockReturnValue({
      prompt_tokens: 2100,
      completion_tokens: 900,
      total_tokens: 3000,
      context_utilization: 0.0234375,
      context_window_size: 128000,
      tool_calls_count: 1,
      total_duration_ms: 120,
    });
    tables.agent_hub_sessions.single.mockReturnValue({ agent_model: 'Gentleman' });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ sessionId: 'session-copilot' }),
    });
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        total_tokens: 3000,
        context_window_size: 128000,
        context_utilization: 2.3,
      })
    );
  });
});

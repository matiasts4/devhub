const mockCreate = jest.fn();
const mockUpsertSessionUsage = jest.fn();
const mockGetToolTracesBySession = jest.fn(() => []);
const mockReadFile = jest.fn();
const { ReadableStream: NodeReadableStream } = require('node:stream/web');

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }))
);

jest.mock('fs/promises', () => ({
  readFile: (...args) => mockReadFile(...args),
}));

jest.mock('@/lib/db/localDb.js', () => ({
  upsertSessionUsage: (...args) => mockUpsertSessionUsage(...args),
  getToolTracesBySession: (...args) => mockGetToolTracesBySession(...args),
}));

jest.mock('@/lib/copilot-token', () => ({
  getCopilotToken: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return Response.json(body, init);
    },
  },
}));

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this.headers = init.headers || {};
      this._body = init.body || null;
      this.signal = init.signal || { addEventListener() {} };
    }

    async json() {
      return this._body ? JSON.parse(this._body) : null;
    }
  };
}

global.ReadableStream = global.ReadableStream || NodeReadableStream;

if (typeof Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.headers = new Map(Object.entries(init.headers || {}));
    }

    static json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers || {}) },
      });
    }

    async text() {
      if (typeof this.body === 'string') return this.body;
      if (!this.body) return '';

      const reader = this.body.getReader();
      const decoder = new TextDecoder();
      let output = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
      }

      output += decoder.decode();
      return output;
    }

    async json() {
      return JSON.parse(await this.text());
    }
  };
}

describe('agenthub chat usage telemetry helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockReset();
    mockUpsertSessionUsage.mockReset();
    mockGetToolTracesBySession.mockReset();
    mockGetToolTracesBySession.mockReturnValue([]);
    mockReadFile.mockReset();
  });

  test('normalizeUsageTelemetry maps provider and OpenCode token shapes', async () => {
    const { normalizeUsageTelemetry } = require('../../src/app/api/agenthub/chat/route');

    expect(
      normalizeUsageTelemetry({
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
        accumulated_total: 140,
      })
    ).toEqual({
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
      accumulated_total: 140,
    });

    expect(
      normalizeUsageTelemetry({
        input: 9,
        output: 6,
        accumulated_total: 50,
      })
    ).toEqual({
      prompt_tokens: 9,
      completion_tokens: 6,
      total_tokens: 15,
      accumulated_total: 50,
    });
  });

  test('POST includes usage in stream and persists session snapshot', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        priorityOrder: ['direct'],
        providers: {
          direct: {
            LLM_BASE_URL: 'https://llm.example.test/v1',
            LLM_API_KEY: 'test-key',
            LLM_MODEL: 'test-model',
          },
        },
      })
    );

    mockCreate.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Hola' } }] };
        yield {
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
            accumulated_total: 250,
          },
        };
      })()
    );

    const { POST } = require('../../src/app/api/agenthub/chat/route');

    const req = new Request('http://localhost/api/agenthub/chat', {
      method: 'POST',
      body: JSON.stringify({
        project_id: 'project-1',
        session_id: 'session-1',
        messages: [{ role: 'user', content: 'hola' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const lines = [];
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');
    const parser = createAgentHubStreamParser({
      onEvent: (event) => lines.push(event),
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }

    parser.push(decoder.decode());
    parser.flush();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        stream_options: { include_usage: true },
      })
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'meta', model_used: 'test-model' }),
        expect.objectContaining({ type: 'chunk', content: 'Hola' }),
        expect.objectContaining({
          type: 'usage',
          usage: expect.objectContaining({
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 250,
            accumulated_total: 250,
            context_window_size: 200000,
            context_utilization: 0.1,
          }),
        }),
      ])
    );

    expect(mockUpsertSessionUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 250,
        context_window_size: 200000,
        context_utilization: 0.00125,
      })
    );
  });

  test('POST resolves usage context with the display model when Copilot transport model is remapped', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        priorityOrder: ['copilot'],
        providers: {
          copilot: {
            COPILOT_OAUTH_TOKEN: 'oauth-token',
            COPILOT_MODEL: 'gpt-4o',
          },
        },
      })
    );

    const { getCopilotToken } = require('../../src/lib/copilot-token');
    getCopilotToken.mockResolvedValue('copilot-access-token');

    mockCreate.mockResolvedValue(
      (async function* () {
        yield {
          usage: {
            prompt_tokens: 1200,
            completion_tokens: 300,
            total_tokens: 1500,
          },
        };
      })()
    );

    const { POST } = require('../../src/app/api/agenthub/chat/route');

    const req = new Request('http://localhost/api/agenthub/chat', {
      method: 'POST',
      body: JSON.stringify({
        project_id: 'project-1',
        session_id: 'session-2',
        modelOverride: 'GPT-5.4 mini',
        messages: [{ role: 'user', content: 'hola' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }

    parser.push(decoder.decode());
    parser.flush();

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'meta', model_used: 'GPT-5.4 mini' }),
        expect.objectContaining({
          type: 'usage',
          usage: expect.objectContaining({
            model: 'GPT-5.4 mini',
            display_model: 'GPT-5.4 mini',
            transport_model: 'gpt-4o-mini',
            context_window_size: 128000,
            context_utilization: 1.2,
          }),
        }),
      ])
    );

    expect(mockUpsertSessionUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-2',
        total_tokens: 1500,
        context_window_size: 128000,
      })
    );
  });

  test('stream parser still captures trailing usage event without final newline', async () => {
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');

    const body =
      `${JSON.stringify({ type: 'meta', model_used: 'test-model' })}\n` +
      `${JSON.stringify({ type: 'chunk', content: 'Hola' })}\n` +
      JSON.stringify({
        type: 'usage',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      });

    const events = [];
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
    });

    parser.push(body);
    parser.flush();

    expect(events).toEqual([
      { type: 'meta', model_used: 'test-model' },
      { type: 'chunk', content: 'Hola' },
      {
        type: 'usage',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      },
    ]);
  });
});

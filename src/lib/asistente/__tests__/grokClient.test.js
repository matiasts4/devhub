/**
 * @jest-environment node
 */

const { callGrok, callGrokOnce, BASE_URL } = require('../grokClient');

function mockFetch(sequence) {
  let idx = 0;
  return jest.fn(() => {
    const next = sequence[idx++];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 500),
      text: () => Promise.resolve(next.text || ''),
      json: () => Promise.resolve(next.json ?? {}),
    });
  });
}

describe('callGrokOnce', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns Anthropic-shaped content blocks on success', async () => {
    global.fetch = mockFetch([
      {
        ok: true,
        json: {
          id: 'chatcmpl-1',
          model: 'grok-4.20-0309-non-reasoning',
          choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { total_tokens: 5 },
        },
      },
    ]);
    const data = await callGrokOnce({
      model: 'grok-4.20-0309-non-reasoning',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hey' }],
      apiKey: 'key',
    });
    expect(data.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(data.stop_reason).toBe('stop');
    expect(global.fetch).toHaveBeenCalledWith(
      BASE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      })
    );
  });

  test('translates system + Anthropic tool_use/tool_result turns to OpenAI messages', async () => {
    global.fetch = mockFetch([
      {
        ok: true,
        json: { choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] },
      },
    ]);
    await callGrokOnce({
      model: 'grok-4.20-0309-non-reasoning',
      maxTokens: 100,
      system: 'You are Zed.',
      messages: [
        { role: 'user', content: 'run ls' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'list_terminals', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"processes":[]}' }],
        },
      ],
      apiKey: 'key',
      tools: [{ name: 'list_terminals', description: 'list', input_schema: { type: 'object' } }],
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are Zed.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'run ls' });
    expect(body.messages[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'list_terminals', arguments: '{}' },
        },
      ],
    });
    expect(body.messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"processes":[]}',
    });
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'list_terminals', description: 'list', parameters: { type: 'object' } },
      },
    ]);
  });

  test('throws retryable GrokError on 503', async () => {
    global.fetch = mockFetch([{ ok: false, status: 503, text: 'overloaded' }]);
    await expect(
      callGrokOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({ name: 'GrokError', upstream_status: 503, retryable: true });
  });

  test('throws non-retryable GrokError on 400', async () => {
    global.fetch = mockFetch([{ ok: false, status: 400, text: 'bad request' }]);
    await expect(
      callGrokOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({ name: 'GrokError', upstream_status: 400, retryable: false });
  });
});

describe('callGrok', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.ZED_GROK_MAX_RETRIES;
    delete process.env.ZED_GROK_TIMEOUT_MS;
  });

  test('does not retry on 400', async () => {
    global.fetch = mockFetch([{ ok: false, status: 400, text: 'bad' }]);
    await expect(
      callGrok({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key', maxRetries: 2 })
    ).rejects.toMatchObject({ upstream_status: 400, attempt: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on 502 and succeeds on second attempt', async () => {
    global.fetch = mockFetch([
      { ok: false, status: 502, text: 'bad gateway' },
      { ok: true, json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } },
    ]);
    const data = await callGrok({
      model: 'test',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
      maxRetries: 2,
    });
    expect(data.content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('reconstructs tool_use blocks from choices[0].message.tool_calls', async () => {
    global.fetch = mockFetch([
      {
        ok: true,
        json: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_2',
                    type: 'function',
                    function: { name: 'echo', arguments: '{"value":"hi"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      },
    ]);
    const data = await callGrok({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' });
    expect(data.content).toEqual([
      { id: 'call_2', type: 'tool_use', name: 'echo', input: { value: 'hi' } },
    ]);
  });
});

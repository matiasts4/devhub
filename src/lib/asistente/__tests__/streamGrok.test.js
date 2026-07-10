/**
 * @jest-environment node
 */

const { streamGrokOnce, streamGrok } = require('../streamGrok');

// OpenAI-style SSE: plain `data: {...}` lines (no `event:` field), terminated
// by `data: [DONE]`.
function sseLines(...dataPayloads) {
  const payload =
    dataPayloads.map((data) => `data: ${JSON.stringify(data)}`).join('\n\n') +
    '\n\ndata: [DONE]\n\n';
  const chunks = [];
  for (let i = 0; i < payload.length; i += 9) {
    chunks.push(payload.slice(i, i + 9));
  }
  return chunks.map((s) => new TextEncoder().encode(s));
}

function mockReadableStream(chunks) {
  let idx = 0;
  return {
    getReader: () => ({
      read() {
        if (idx < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[idx++] });
        }
        return Promise.resolve({ done: true });
      },
      releaseLock() {},
    }),
  };
}

function mockFetchForStream(chunks) {
  return jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: mockReadableStream(chunks),
    })
  );
}

describe('streamGrokOnce', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('streams text deltas and returns reconstructed response', async () => {
    const deltas = [];
    global.fetch = mockFetchForStream(
      sseLines(
        {
          id: 'chatcmpl-1',
          model: 'grok-4.20-0309-non-reasoning',
          choices: [{ delta: { role: 'assistant' } }],
        },
        { id: 'chatcmpl-1', choices: [{ delta: { content: 'Hola ' } }] },
        { id: 'chatcmpl-1', choices: [{ delta: { content: 'mundo' } }] },
        { id: 'chatcmpl-1', choices: [{ delta: {}, finish_reason: 'stop' }] }
      )
    );

    const result = await streamGrokOnce({
      model: 'test-model',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'key',
      onTextDelta: (text) => deltas.push(text),
    });

    expect(result.text).toBe('Hola mundo');
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe('stop');
    expect(result.messageId).toBe('chatcmpl-1');
    expect(result.model).toBe('grok-4.20-0309-non-reasoning');
    expect(deltas).toEqual(['Hola ', 'mundo']);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"stream":true'),
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      })
    );
  });

  test('reconstructs tool_calls accumulated by index across chunks', async () => {
    global.fetch = mockFetchForStream(
      sseLines(
        {
          id: 'chatcmpl-2',
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'echo', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          id: 'chatcmpl-2',
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: '{"value":"' } }] } },
          ],
        },
        {
          id: 'chatcmpl-2',
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'hello"}' } }] } }],
        },
        { id: 'chatcmpl-2', choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      )
    );

    const result = await streamGrokOnce({
      model: 'test-model',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
    });

    expect(result.text).toBe('');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'echo', input: { value: 'hello' } }]);
    expect(result.stopReason).toBe('tool_calls');
  });

  test('throws retryable GrokError on start HTTP error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve('overloaded'),
      })
    );

    await expect(
      streamGrokOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({ name: 'GrokError', upstream_status: 503, retryable: true });
  });

  test('throws non-retryable GrokError on 400 start error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      })
    );

    await expect(
      streamGrokOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({ name: 'GrokError', upstream_status: 400, retryable: false });
  });
});

describe('streamGrok', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.ZED_GROK_MAX_RETRIES;
  });

  test('retries on 502 and succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('bad gateway'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: mockReadableStream(
          sseLines(
            { id: 'chatcmpl-r', choices: [{ delta: { content: 'ok' } }] },
            { id: 'chatcmpl-r', choices: [{ delta: {}, finish_reason: 'stop' }] }
          )
        ),
      });

    const result = await streamGrok({
      model: 'test',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
      maxRetries: 1,
    });
    expect(result.text).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('does not retry after stream starts', async () => {
    const chunks = sseLines({ id: 'chatcmpl-fail', choices: [{ delta: { role: 'assistant' } }] });
    let idx = 0;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read() {
              if (idx < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[idx++] });
              }
              return Promise.reject(new Error('mid-stream failure'));
            },
            releaseLock() {},
          }),
        },
      })
    );

    await expect(
      streamGrok({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key', maxRetries: 2 })
    ).rejects.toMatchObject({ name: 'GrokError' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

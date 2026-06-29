/**
 * @jest-environment node
 */

const { streamMinimaxOnce, streamMinimax } = require('../streamMinimax');

function sseLines(...events) {
  const payload =
    events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}`).join('\n\n') +
    '\n\n';
  // Split into small chunks to exercise incremental parsing.
  const chunks = [];
  for (let i = 0; i < payload.length; i += 7) {
    chunks.push(payload.slice(i, i + 7));
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

describe('streamMinimaxOnce', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('streams text and returns reconstructed response', async () => {
    const deltas = [];
    global.fetch = mockFetchForStream(
      sseLines(
        {
          event: 'message_start',
          data: { type: 'message_start', message: { id: 'msg-1', model: 'm' } },
        },
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hola ' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'mundo' },
          },
        },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 2 },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } }
      )
    );

    const result = await streamMinimaxOnce({
      model: 'test-model',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'key',
      onTextDelta: (text) => deltas.push(text),
    });

    expect(result.text).toBe('Hola mundo');
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe('end_turn');
    expect(result.messageId).toBe('msg-1');
    expect(result.model).toBe('m');
    expect(deltas).toEqual(['Hola ', 'mundo']);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"stream":true'),
        headers: expect.objectContaining({ 'x-api-key': 'key' }),
      })
    );
  });

  test('reconstructs tool_use from streaming deltas', async () => {
    global.fetch = mockFetchForStream(
      sseLines(
        { event: 'message_start', data: { type: 'message_start', message: { id: 'msg-2' } } },
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tu-1', name: 'echo', input: {} },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"value":"' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: 'hello"}' },
          },
        },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
        { event: 'message_stop', data: { type: 'message_stop' } }
      )
    );

    const result = await streamMinimaxOnce({
      model: 'test-model',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
    });

    expect(result.text).toBe('');
    expect(result.toolCalls).toEqual([{ id: 'tu-1', name: 'echo', input: { value: 'hello' } }]);
  });

  test('throws retryable MinimaxError on start HTTP error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve('overloaded'),
      })
    );

    await expect(
      streamMinimaxOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({
      name: 'MinimaxError',
      upstream_status: 503,
      retryable: true,
    });
  });

  test('throws non-retryable MinimaxError on 400 start error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      })
    );

    await expect(
      streamMinimaxOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({
      name: 'MinimaxError',
      upstream_status: 400,
      retryable: false,
    });
  });
});

describe('streamMinimax', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.ZED_MINIMAX_MAX_RETRIES;
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
            { event: 'message_start', data: { type: 'message_start', message: { id: 'msg-r' } } },
            {
              event: 'content_block_start',
              data: {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              },
            },
            {
              event: 'content_block_delta',
              data: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'ok' },
              },
            },
            { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
            { event: 'message_stop', data: { type: 'message_stop' } }
          )
        ),
      });

    const result = await streamMinimax({
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
    const chunks = sseLines(
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg-fail' } } },
      {
        event: 'content_block_start',
        data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      }
    );

    let idx = 0;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read() {
              if (idx < chunks.length)
                return Promise.resolve({ done: false, value: chunks[idx++] });
              return Promise.reject(new Error('mid-stream failure'));
            },
            releaseLock() {},
          }),
        },
      })
    );

    await expect(
      streamMinimax({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key', maxRetries: 2 })
    ).rejects.toMatchObject({ name: 'MinimaxError' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

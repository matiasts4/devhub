/**
 * @jest-environment node
 */

const { callMinimax, callMinimaxOnce, BASE_URL } = require('../minimaxClient');

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

describe('callMinimaxOnce', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns JSON on success', async () => {
    global.fetch = mockFetch([{ ok: true, json: { content: [{ type: 'text', text: 'hi' }] } }]);
    const data = await callMinimaxOnce({
      model: 'test',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
    });
    expect(data.content[0].text).toBe('hi');
    expect(global.fetch).toHaveBeenCalledWith(
      BASE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'key' }),
      })
    );
  });

  test('throws retryable MinimaxError on 503', async () => {
    global.fetch = mockFetch([{ ok: false, status: 503, text: 'overloaded' }]);
    await expect(
      callMinimaxOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({
      name: 'MinimaxError',
      upstream_status: 503,
      retryable: true,
    });
  });

  test('throws non-retryable MinimaxError on 400', async () => {
    global.fetch = mockFetch([{ ok: false, status: 400, text: 'bad request' }]);
    await expect(
      callMinimaxOnce({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key' })
    ).rejects.toMatchObject({
      name: 'MinimaxError',
      upstream_status: 400,
      retryable: false,
    });
  });

  test('throws retryable error on abort/timeout', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('The operation was aborted')));
    await expect(
      callMinimaxOnce({
        model: 'test',
        maxTokens: 100,
        messages: [],
        apiKey: 'key',
        timeoutMs: 1,
      })
    ).rejects.toMatchObject({
      name: 'MinimaxError',
      retryable: true,
    });
  });
});

describe('callMinimax', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.ZED_MINIMAX_MAX_RETRIES;
    delete process.env.ZED_MINIMAX_TIMEOUT_MS;
  });

  test('does not retry on 400', async () => {
    global.fetch = mockFetch([{ ok: false, status: 400, text: 'bad' }]);
    await expect(
      callMinimax({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key', maxRetries: 2 })
    ).rejects.toMatchObject({ upstream_status: 400, attempt: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on 502 and succeeds on second attempt', async () => {
    global.fetch = mockFetch([
      { ok: false, status: 502, text: 'bad gateway' },
      { ok: true, json: { content: [{ type: 'text', text: 'ok' }] } },
    ]);
    const data = await callMinimax({
      model: 'test',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
      maxRetries: 2,
    });
    expect(data.content[0].text).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws after exhausting retries', async () => {
    global.fetch = mockFetch([
      { ok: false, status: 503, text: 'a' },
      { ok: false, status: 503, text: 'b' },
      { ok: false, status: 503, text: 'c' },
    ]);
    await expect(
      callMinimax({ model: 'test', maxTokens: 100, messages: [], apiKey: 'key', maxRetries: 2 })
    ).rejects.toMatchObject({ upstream_status: 503, attempt: 3, retryable: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('retries on network errors', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ content: [{ type: 'text', text: 'net ok' }] }),
      });
    const data = await callMinimax({
      model: 'test',
      maxTokens: 100,
      messages: [],
      apiKey: 'key',
      maxRetries: 1,
    });
    expect(data.content[0].text).toBe('net ok');
  });
});

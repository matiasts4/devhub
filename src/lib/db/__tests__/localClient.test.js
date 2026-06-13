import { createClient } from '@/lib/db/localClient';

function createJsonErrorResponse(payload, { status = 500, statusText = 'Internal Server Error' } = {}) {
  return {
    ok: false,
    status,
    statusText,
    headers: {
      get: jest.fn(() => 'application/json'),
    },
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn(),
  };
}

describe('localClient error normalization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('returns a serializable error when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await createClient().from('projects').select('*');

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      message: 'Failed to fetch',
      name: 'TypeError',
    });
  });

  test('falls back to a string message when API returns a non-string error payload', async () => {
    global.fetch = jest.fn().mockResolvedValue(createJsonErrorResponse({ error: {} }));

    const result = await createClient().from('projects').select('*');

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      message: 'Query failed',
      status: 500,
      statusText: 'Internal Server Error',
    });
  });
});
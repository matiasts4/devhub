/**
 * route.test.js — T-022 RED test for the [id]/capture route handler.
 *
 * Next.js 15+ passes `params` as a Promise in route handlers. The pre-15
 * shape `const { id } = params` resolves `params` to a Promise object and
 * `id` becomes `undefined`, which the handler then rejects with HTTP 400
 * `{ error: "session_id required" }`.
 *
 * This test asserts the handler awaits `params` before destructuring, so
 * a Next.js 16 invocation shape (`params: Promise<{ id }>`) yields 200.
 *
 * Test FAILS before the fix because the handler still does
 * `const { id } = params || {}` and reads `id = undefined`.
 */

const mockGetSessionOutput = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

jest.mock('@/lib/terminal/ttyServer', () => ({
  getSessionOutput: (...args) => mockGetSessionOutput(...args),
}));

const { NextResponse } = require('next/server');

describe('GET /api/terminal/session/[id]/capture (T-022)', () => {
  let GET;

  beforeEach(() => {
    jest.clearAllMocks();
    NextResponse.json.mockImplementation((body, init) => ({
      body,
      status: init?.status || 200,
    }));
    mockGetSessionOutput.mockReturnValue('hello\n');
    jest.isolateModules(() => {
      // Re-require after mocks reset to pick up the route handler.
      GET = require('../route.js').GET;
    });
  });

  test('returns 200 with output when params is a Promise (Next.js 15+ shape)', async () => {
    const request = { url: 'http://localhost/api/terminal/session/sess-123/capture' };
    const context = { params: Promise.resolve({ id: 'sess-123' }) };

    const response = await GET(request, context);

    expect(mockGetSessionOutput).toHaveBeenCalledWith('sess-123');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ output: 'hello\n', session_id: 'sess-123' });
  });

  test('returns 400 with session_id required when params is empty/missing', async () => {
    const request = { url: 'http://localhost/api/terminal/session//capture' };
    const context = { params: Promise.resolve({}) };

    const response = await GET(request, context);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'session_id required' });
  });
});

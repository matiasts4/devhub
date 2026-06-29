/**
 * @jest-environment node
 */

const { checkZedRateLimit, ANONYMOUS_USER } = require('../zedRateLimit');

describe('checkZedRateLimit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ZED_RATE_LIMIT_CALLS;
    delete process.env.ZED_ANON_RATE_LIMIT_CALLS;
    delete process.env.ZED_RATE_LIMIT_WINDOW_MS;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  test('allows requests under the limit and blocks after', async () => {
    process.env.ZED_RATE_LIMIT_CALLS = '3';
    process.env.ZED_RATE_LIMIT_WINDOW_MS = '60000';

    for (let i = 0; i < 3; i++) {
      const result = await checkZedRateLimit('user-1');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(3);
    }

    const blocked = await checkZedRateLimit('user-1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test('anonymous users get a separate lower limit', async () => {
    process.env.ZED_ANON_RATE_LIMIT_CALLS = '2';
    process.env.ZED_RATE_LIMIT_CALLS = '10';
    process.env.ZED_RATE_LIMIT_WINDOW_MS = '60000';

    const anonFirst = await checkZedRateLimit(ANONYMOUS_USER);
    expect(anonFirst.allowed).toBe(true);
    expect(anonFirst.limit).toBe(2);

    await checkZedRateLimit(ANONYMOUS_USER);
    const anonBlocked = await checkZedRateLimit(ANONYMOUS_USER);
    expect(anonBlocked.allowed).toBe(false);

    const userOk = await checkZedRateLimit('user-2');
    expect(userOk.allowed).toBe(true);
    expect(userOk.limit).toBe(10);
  });

  test('users are isolated', async () => {
    process.env.ZED_RATE_LIMIT_CALLS = '1';
    process.env.ZED_RATE_LIMIT_WINDOW_MS = '60000';

    const a = await checkZedRateLimit('user-a');
    expect(a.allowed).toBe(true);

    const aBlocked = await checkZedRateLimit('user-a');
    expect(aBlocked.allowed).toBe(false);

    const b = await checkZedRateLimit('user-b');
    expect(b.allowed).toBe(true);
  });

  test('missing user defaults to anonymous', async () => {
    process.env.ZED_ANON_RATE_LIMIT_CALLS = '5';
    process.env.ZED_RATE_LIMIT_WINDOW_MS = '60000';

    const result = await checkZedRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
  });
});

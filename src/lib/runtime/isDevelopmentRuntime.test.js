const { isDevelopmentRuntime } = require('./isDevelopmentRuntime');

describe('isDevelopmentRuntime', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('returns true outside production', () => {
    process.env.NODE_ENV = 'test';

    expect(isDevelopmentRuntime()).toBe(true);
  });

  test('returns false in production', () => {
    process.env.NODE_ENV = 'production';

    expect(isDevelopmentRuntime()).toBe(false);
  });
});

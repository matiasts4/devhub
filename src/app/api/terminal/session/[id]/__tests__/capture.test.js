const { getSessionOutput } = require('@/lib/terminal/ttyServer');

describe('terminal capture route', () => {
  test('getSessionOutput is exported by ttyServer', () => {
    expect(typeof getSessionOutput).toBe('function');
  });

  test('getSessionOutput returns null for an unknown session', () => {
    expect(getSessionOutput('nope-not-a-session')).toBe(null);
  });
});

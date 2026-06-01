const { pushSessionInput } = require('@/lib/terminal/ttyServer');

describe('terminal input route', () => {
  test('pushSessionInput is exported by ttyServer', () => {
    expect(typeof pushSessionInput).toBe('function');
  });

  test('pushSessionInput returns false for an unknown session (no throw)', () => {
    expect(pushSessionInput('nope-not-a-session', 'ls\n')).toBe(false);
  });
});

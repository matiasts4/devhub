const { acquire, DISPLAY_NAME_POOL, DISPLAY_NAME_POOL_LENGTH } = require('./displayNamePool');

describe('displayNamePool.acquire', () => {
  test('returns the first pool entry when usedNames is empty', () => {
    expect(acquire(new Set())).toBe('Alex');
  });

  test('returns entries in alphabetical order', () => {
    expect(acquire(new Set(['Alex']))).toBe('Avery');
    expect(acquire(new Set(['Alex', 'Avery']))).toBe('Blake');
    expect(acquire(new Set(['Alex', 'Avery', 'Blake']))).toBe('Cameron');
  });

  test('treats usedNames case-insensitively', () => {
    expect(acquire(new Set(['ALEX', 'aVeRy']))).toBe('Blake');
  });

  test('is pure — two parallel calls with the same used set return distinct names', () => {
    const a = acquire(new Set());
    const b = acquire(new Set([a]));
    expect(a).toBe('Alex');
    expect(b).toBe('Avery');
  });
});

describe('displayNamePool constants', () => {
  test('DISPLAY_NAME_POOL has exactly 30 entries', () => {
    expect(DISPLAY_NAME_POOL_LENGTH).toBe(30);
    expect(DISPLAY_NAME_POOL.length).toBe(30);
  });

  test('all entries are unique', () => {
    expect(new Set(DISPLAY_NAME_POOL).size).toBe(DISPLAY_NAME_POOL.length);
  });

  test('all entries match the validator regex', () => {
    const re = /^[a-zA-Z0-9_-]+$/;
    for (const name of DISPLAY_NAME_POOL) {
      expect(name).toMatch(re);
    }
  });
});

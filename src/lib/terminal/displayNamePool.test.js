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

describe('displayNamePool.acquire exhaustion fallback', () => {
  test('returns Panel-31 when all 30 pool names are used', () => {
    const used = new Set(DISPLAY_NAME_POOL);
    expect(acquire(used)).toBe('Panel-31');
  });

  test('exhaustion is case-insensitive — 30 names regardless of casing yields Panel-31', () => {
    const used = new Set(DISPLAY_NAME_POOL.map((n) => n.toUpperCase()));
    expect(acquire(used)).toBe('Panel-31');
  });

  test('returns Panel-N where N is usedNames.size + 1 for larger used sets', () => {
    const used = new Set([...DISPLAY_NAME_POOL, 'extra1', 'extra2', 'extra3']);
    expect(acquire(used)).toBe('Panel-34');
  });
});

/**
 * Tests for the pure name→terminalId resolver.
 * Covers ZTT-001 scenarios + a few defensive edge cases.
 */

const { resolve, resolveTerminalByName, nameFromId } = require('../zedTerminalResolver');

const T = (processes) => resolve('Chase', processes);

describe('zedTerminalResolver.resolve — ZTT-001', () => {
  test('case-insensitive exact match returns ok with the right terminalId', () => {
    const result = resolve('chase', [
      { terminalId: 'p1', displayName: 'Nate' },
      { terminalId: 'p2', displayName: 'Chase' },
    ]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase' });
  });

  test('exact match with mixed case in input also wins', () => {
    const result = resolve('ChAsE', [{ terminalId: 'p2', displayName: 'chase' }]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'chase' });
  });

  test('Levenshtein ≤ 1 fallback (e.g. "Chaze" → "Chase")', () => {
    const result = resolve('Chaze', [{ terminalId: 'p2', displayName: 'Chase' }]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase' });
  });

  test('Levenshtein > 1 returns not_found (e.g. "Chazza" → "Chase")', () => {
    const result = resolve('Chazza', [{ terminalId: 'p2', displayName: 'Chase' }]);
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  test('ambiguous: two terminals within distance 1 returns candidates sorted by distance then alpha', () => {
    // No exact "Chaze" entry — both Chase (distance 1) and Chaze (distance 1)
    // are close; this exercises the tie-break path.
    const result = resolve('Chaze', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Chaze' },
    ]);
    // Exact match wins against p2 first.
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chaze' });
  });

  test('ambiguous: two close matches with no exact hit returns candidates sorted by distance', () => {
    // Neither name is exactly "Chasee", but both Chase and Chaser are within
    // distance 1. Sorted by distance asc (both are 1), then alpha.
    const result = resolve('Chasee', [
      { terminalId: 'p1', displayName: 'Chaser' }, // distance 1
      { terminalId: 'p2', displayName: 'Chase' },  // distance 1
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ambiguous');
    // Both at distance 1; alphabetical tie-break: Chase (p2) < Chaser (p1)
    expect(result.candidates.map((c) => c.terminalId)).toEqual(['p2', 'p1']);
  });

  test('ambiguous: two close matches with no exact hit returns candidates sorted by distance', () => {
    // Neither name is exactly "Chasee", but both Chase and Chaser are within
    // distance 1. Sorted by distance asc (both are 1), then alpha.
    const result = resolve('Chasee', [
      { terminalId: 'p1', displayName: 'Chaser' }, // distance 1
      { terminalId: 'p2', displayName: 'Chase' },  // distance 1
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ambiguous');
    // Both at distance 1; alphabetical tie-break: Chase (p2) < Chaser (p1)
    expect(result.candidates.map((c) => c.terminalId)).toEqual(['p2', 'p1']);
  });

  test('"Chase" exact wins even when "Chaser" (distance 2) also exists', () => {
    const result = resolve('Chase', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Chaser' },
    ]);
    // exact match wins; the Chaser entry is distance 2 anyway
    expect(result).toEqual({ ok: true, terminalId: 'p1', displayName: 'Chase' });
  });

  test('empty string returns not_found', () => {
    expect(resolve('', [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('whitespace-only string returns not_found', () => {
    expect(resolve('   ', [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('non-string name returns not_found', () => {
    expect(resolve(null, [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(resolve(undefined, [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(resolve(42, [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('invalid format (length > 24, space, slash) returns not_found', () => {
    const longName = 'x'.repeat(25);
    expect(resolve(longName, [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(resolve('with space', [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(resolve('with/slash', [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('empty terminals list returns not_found', () => {
    expect(resolve('Chase', [])).toEqual({ ok: false, code: 'not_found' });
  });

  test('terminals list with one entry missing displayName returns not_found (does not crash)', () => {
    expect(resolve('Chase', [{ terminalId: 'p1' }])).toEqual({ ok: false, code: 'not_found' });
  });

  test('skips entries without displayName when looking for close matches', () => {
    const result = resolve('Chase', [
      { terminalId: 'p1' }, // no displayName
      { terminalId: 'p2', displayName: 'Chase' },
    ]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase' });
  });
});

describe('zedTerminalResolver — alias + helpers', () => {
  test('resolveTerminalByName is an alias for resolve', () => {
    const processes = [{ terminalId: 'p2', displayName: 'Chase' }];
    expect(resolveTerminalByName('Chase', processes)).toEqual(resolve('Chase', processes));
  });

  test('nameFromId derives a stable pool-style display name from a terminalId', () => {
    // Default pool: 0=Alex, 1=Avery, 2=Blake, 3=Cameron, 4=Casey, 5=Cesar, 6=Chase, ...
    expect(nameFromId('p1')).toBe('Alex');
    expect(nameFromId('p3')).toBe('Blake');
    expect(nameFromId('p7')).toBe('Chase');
    // Unknown shape → fall back to first entry.
    expect(nameFromId('garbage')).toBe('Alex');
  });
});

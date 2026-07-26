/**
 * Tests for the pure name→terminalId resolver.
 * Covers ZTT-001 scenarios + a few defensive edge cases.
 */

import { resolve, resolveTerminalByName, nameFromId } from '../zedTerminalResolver';

describe('zedTerminalResolver.resolve — ZTT-001', () => {
  test('case-insensitive exact match returns ok with the right terminalId', () => {
    const result = resolve('chase', [
      { terminalId: 'p1', displayName: 'Nate' },
      { terminalId: 'p2', displayName: 'Chase' },
    ]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase', match: 'exact' });
  });

  test('exact match with mixed case in input also wins', () => {
    const result = resolve('ChAsE', [{ terminalId: 'p2', displayName: 'chase' }]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'chase', match: 'exact' });
  });

  test('Levenshtein ≤ 1 fallback (e.g. "Chaze" → "Chase")', () => {
    const result = resolve('Chaze', [{ terminalId: 'p2', displayName: 'Chase' }]);
    expect(result.ok).toBe(true);
    expect(result.terminalId).toBe('p2');
    expect(result.displayName).toBe('Chase');
  });

  test('Levenshtein > 1 returns not_found when multiple panels (e.g. "Chazza" → "Chase")', () => {
    const result = resolve('Chazza', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Nova' },
    ]);
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
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chaze', match: 'exact' });
  });

  test('dictation elongation Chasee resolves to Chase when prefix is unique', () => {
    const result = resolve('Chasee', [
      { terminalId: 'p1', displayName: 'Chaser' },
      { terminalId: 'p2', displayName: 'Chase' },
    ]);
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase', match: 'prefix' });
  });

  test('ambiguous when two panels share the same prefix stem', () => {
    const result = resolve('Cha', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Chaser' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ambiguous');
  });

  test('"Chase" exact wins even when "Chaser" (distance 2) also exists', () => {
    const result = resolve('Chase', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Chaser' },
    ]);
    // exact match wins; the Chaser entry is distance 2 anyway
    expect(result).toEqual({ ok: true, terminalId: 'p1', displayName: 'Chase', match: 'exact' });
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

  test('César (dictation accent) matches Cesar', () => {
    const result = resolve('César', [{ terminalId: 'p3', displayName: 'Cesar' }]);
    expect(result).toEqual({
      ok: true,
      terminalId: 'p3',
      displayName: 'Cesar',
      match: 'exact',
    });
  });

  test('partial prefix Ces matches Cesar when unique', () => {
    const result = resolve('Ces', [{ terminalId: 'p3', displayName: 'Cesar' }]);
    expect(result.ok).toBe(true);
    expect(result.displayName).toBe('Cesar');
  });

  test('dictation typo Cas matches Cesar when it is the only panel', () => {
    const result = resolve('Cas', [{ terminalId: 'p3', displayName: 'Cesar' }]);
    expect(result.ok).toBe(true);
    expect(result.displayName).toBe('Cesar');
  });

  test('STT typo Chace matches Chase', () => {
    const result = resolve('Chace', [{ terminalId: 'p2', displayName: 'Chase' }]);
    expect(result.ok).toBe(true);
    expect(result.displayName).toBe('Chase');
  });

  test('invalid format (length > 48) returns not_found', () => {
    const longName = 'x'.repeat(49);
    expect(resolve(longName, [{ terminalId: 'p2', displayName: 'Chase' }])).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('garbled phrase without match returns not_found', () => {
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
    expect(result).toEqual({ ok: true, terminalId: 'p2', displayName: 'Chase', match: 'exact' });
  });

  test('resolves "primera terminal" to first entry', () => {
    const result = resolve('primera terminal', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Cesar' },
    ]);
    expect(result).toEqual({
      ok: true,
      terminalId: 'p1',
      displayName: 'Chase',
      match: 'position_index',
    });
  });

  test('resolves "terminal 2" to second entry', () => {
    const result = resolve('terminal 2', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Cesar' },
    ]);
    expect(result).toEqual({
      ok: true,
      terminalId: 'p2',
      displayName: 'Cesar',
      match: 'position_index',
    });
  });

  test('resolves "última" to last entry', () => {
    const result = resolve('última', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Cesar' },
      { terminalId: 'p3', displayName: 'Nova' },
    ]);
    expect(result).toEqual({
      ok: true,
      terminalId: 'p3',
      displayName: 'Nova',
      match: 'position_last',
    });
  });

  test('position out of range returns not_found', () => {
    const result = resolve('terminal 5', [
      { terminalId: 'p1', displayName: 'Chase' },
      { terminalId: 'p2', displayName: 'Cesar' },
    ]);
    expect(result).toEqual({ ok: false, code: 'not_found' });
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

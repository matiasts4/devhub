const {
  formatFreshnessLabel,
  getAuthorityLabel,
  getHealthStatusLabel,
  getHealthTone,
} = require('../../src/lib/operations/presenters');

describe('operations presenters', () => {
  test('formats freshness in operator-friendly relative labels', () => {
    expect(formatFreshnessLabel(15_000)).toBe('15s');
    expect(formatFreshnessLabel(5 * 60_000)).toBe('5m');
  });

  test('maps canonical authority and status labels consistently', () => {
    expect(getAuthorityLabel('authoritative')).toBe('Autoritativo');
    expect(getAuthorityLabel('inferred')).toBe('Inferido');
    expect(getHealthStatusLabel('stale')).toBe('Stale');
    expect(getHealthTone('offline')).toBe('danger');
  });
});

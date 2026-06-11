const { AURA_INTENSITY, clampZedAuraIntensity } = require('../zedAuraBudget');

describe('zedAuraBudget', () => {
  test('AURA_INTENSITY is a frozen map of four phases', () => {
    expect(AURA_INTENSITY).toEqual({
      idle: 0.1,
      open: 0.18,
      responding: 0.3,
      executing: 0.35,
    });
    expect(Object.isFrozen(AURA_INTENSITY)).toBe(true);
  });

  test('clampZedAuraIntensity returns the documented opacity for each phase', () => {
    expect(clampZedAuraIntensity('idle')).toBe(0.1);
    expect(clampZedAuraIntensity('open')).toBe(0.18);
    expect(clampZedAuraIntensity('responding')).toBe(0.3);
    expect(clampZedAuraIntensity('executing')).toBe(0.35);
  });

  test('clampZedAuraIntensity falls back to idle (0.10) for unknown phases', () => {
    expect(clampZedAuraIntensity('unknown')).toBe(0.1);
    expect(clampZedAuraIntensity('')).toBe(0.1);
    expect(clampZedAuraIntensity(null)).toBe(0.1);
    expect(clampZedAuraIntensity(undefined)).toBe(0.1);
  });

  test('clampZedAuraIntensity never exceeds the executing budget (0.35)', () => {
    expect(clampZedAuraIntensity('executing')).toBeLessThanOrEqual(0.35);
    expect(clampZedAuraIntensity('responding')).toBeLessThanOrEqual(0.3);
    expect(clampZedAuraIntensity('open')).toBeLessThanOrEqual(0.18);
    expect(clampZedAuraIntensity('idle')).toBeLessThanOrEqual(0.1);
  });

  test('AURA_INTENSITY values are all non-negative', () => {
    Object.values(AURA_INTENSITY).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

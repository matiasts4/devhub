const {
  DENSITY,
  FONT_FAMILY,
  FONT_SCALE,
  UI_TOKENS,
} = require('../../src/components/ui/system/ui-tokens');

describe('ui-tokens', () => {
  test('exports DENSITY enum with compact and comfortable values', () => {
    expect(DENSITY.COMPACT).toBe('compact');
    expect(DENSITY.COMFORTABLE).toBe('comfortable');
  });

  test('exports FONT_FAMILY enum with sans and mono values', () => {
    expect(FONT_FAMILY.SANS).toBe('Inter');
    expect(FONT_FAMILY.SYSTEM).toBe('system-ui');
    expect(FONT_FAMILY.MONO).toBe('JetBrains Mono');
  });

  test('exports FONT_SCALE enum with expected scale values', () => {
    expect(FONT_SCALE.XS).toBe(0.75);
    expect(FONT_SCALE.SM).toBe(0.875);
    expect(FONT_SCALE.BASE).toBe(1);
    expect(FONT_SCALE.LG).toBe(1.125);
    expect(FONT_SCALE.XL).toBe(1.25);
    expect(FONT_SCALE.XXL).toBe(1.5);
  });

  test('UI_TOKENS schema defines all appearance keys', () => {
    expect(UI_TOKENS.fontFamily).toBeDefined();
    expect(UI_TOKENS.fontScale).toBeDefined();
    expect(UI_TOKENS.zoom).toBeDefined();
    expect(UI_TOKENS.density).toBeDefined();
  });

  test('FONT_SCALE values are positive numbers', () => {
    Object.values(FONT_SCALE).forEach((value) => {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    });
  });

  test('UI_TOKENS schema values are strings', () => {
    Object.values(UI_TOKENS).forEach((value) => {
      expect(typeof value).toBe('string');
    });
  });
});

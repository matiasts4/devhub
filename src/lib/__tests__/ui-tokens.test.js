const { TYPOGRAPHY_SCALE, typographyClass } = require('../ui-tokens');

describe('ui-tokens — typography scale', () => {
  test('TYPOGRAPHY_SCALE has 7 entries', () => {
    expect(Object.keys(TYPOGRAPHY_SCALE)).toEqual(
      expect.arrayContaining(['caption-xs', 'caption-sm', 'caption-md', 'label', 'body', 'title', 'display'])
    );
    expect(Object.keys(TYPOGRAPHY_SCALE)).toHaveLength(7);
  });

  test('every entry has fontSize, lineHeight, letterSpacing', () => {
    for (const [token, entry] of Object.entries(TYPOGRAPHY_SCALE)) {
      expect(entry.fontSize).toMatch(/(px|rem)$/);
      expect(entry.lineHeight).toBeDefined();
      expect(entry.letterSpacing).toBeDefined();
      // sanity: each token resolves to a Tailwind class
      expect(typographyClass(token)).toBe(`text-${token}`);
    }
  });

  test('typographyClass returns the Tailwind class', () => {
    expect(typographyClass('caption-xs')).toBe('text-caption-xs');
    expect(typographyClass('display')).toBe('text-display');
  });

  test('typographyClass throws on unknown token', () => {
    expect(() => typographyClass('nope')).toThrow(/Unknown typography token/);
  });
});

const {
  SCENERY_CATALOG,
  SCENERY_CATEGORIES,
  SCENERY_CATEGORY_META,
  getSceneryById,
  getSceneriesByCategory,
  isImageScenery,
} = require('../sceneryCatalog');

describe('sceneryCatalog', () => {
  test('exposes a non-empty catalog with unique ids', () => {
    expect(Array.isArray(SCENERY_CATALOG)).toBe(true);
    expect(SCENERY_CATALOG.length).toBeGreaterThanOrEqual(12);

    const ids = SCENERY_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every scenery has the required shape (gradient layers OR image src)', () => {
    for (const scenery of SCENERY_CATALOG) {
      expect(typeof scenery.id).toBe('string');
      expect(scenery.id.length).toBeGreaterThan(0);
      expect(typeof scenery.name).toBe('string');
      expect(typeof scenery.subtitle).toBe('string');
      expect(Object.values(SCENERY_CATEGORIES)).toContain(scenery.category);
      expect(typeof scenery.accent).toBe('string');
      expect(typeof scenery.base).toBe('string');

      const hasLayers = Array.isArray(scenery.layers) && scenery.layers.length > 0;
      const hasSrc = typeof scenery.src === 'string' && scenery.src.length > 0;
      // A scenery renders either a gradient stack or a bundled image.
      expect(hasLayers || hasSrc).toBe(true);

      if (hasLayers) {
        // every layer must be a valid CSS gradient function
        for (const layer of scenery.layers) {
          expect(layer).toMatch(/^(radial|linear|conic)-gradient\(/);
        }
      }
    }
  });

  test('getSceneryById returns the matching scenery or null', () => {
    const first = SCENERY_CATALOG[0];
    expect(getSceneryById(first.id)).toEqual(first);
    expect(getSceneryById('does-not-exist')).toBeNull();
    expect(getSceneryById(null)).toBeNull();
    expect(getSceneryById(undefined)).toBeNull();
  });

  test('getSceneriesByCategory filters correctly', () => {
    const night = getSceneriesByCategory(SCENERY_CATEGORIES.NIGHT);
    expect(night.length).toBeGreaterThan(0);
    for (const s of night) {
      expect(s.category).toBe(SCENERY_CATEGORIES.NIGHT);
    }
  });

  test('every category in the catalog has display metadata', () => {
    const usedCategories = new Set(SCENERY_CATALOG.map((s) => s.category));
    for (const category of usedCategories) {
      expect(SCENERY_CATEGORY_META[category]).toBeDefined();
      expect(typeof SCENERY_CATEGORY_META[category].label).toBe('string');
    }
  });

  describe('bundled image sceneries', () => {
    test('ships several image sceneries under the photo category', () => {
      const photos = getSceneriesByCategory(SCENERY_CATEGORIES.PHOTO);
      expect(photos.length).toBeGreaterThanOrEqual(6);
      for (const s of photos) {
        expect(isImageScenery(s)).toBe(true);
      }
    });

    test('image sceneries resolve src to a bundled asset reference', () => {
      const photos = getSceneriesByCategory(SCENERY_CATEGORIES.PHOTO);
      for (const s of photos) {
        // `src` is a static asset import: a bundled media URL at build time,
        // a string stub under Jest. Either way it must be a non-empty string.
        expect(typeof s.src).toBe('string');
        expect(s.src.length).toBeGreaterThan(0);
      }
    });

    test('isImageScenery is false for gradient sceneries and null', () => {
      const gradient = SCENERY_CATALOG.find((s) => Array.isArray(s.layers));
      expect(isImageScenery(gradient)).toBe(false);
      expect(isImageScenery(null)).toBe(false);
      expect(isImageScenery(undefined)).toBe(false);
    });
  });
});

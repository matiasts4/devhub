const { JSDOM } = require('jsdom');

const {
  ACCENTS,
  ACCENT_OPTIONS,
  ACCENT_STORAGE_KEY,
  MORPHOLOGIES,
  MORPHOLOGY_OPTIONS,
  MORPHOLOGY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEMES,
  applyAccentToDocument,
  applyMorphologyToDocument,
  getStoredAccent,
  getStoredMorphology,
  normalizeAccent,
  normalizeMorphology,
  setAccent,
  setMorphology,
} = require('../themes.js');

describe('theme morphology helpers', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-morphology');
    document.documentElement.removeAttribute('data-accent');
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
  });

  test('normalizes supported morphology values', () => {
    expect(normalizeMorphology(MORPHOLOGIES.DEFAULT)).toBe(MORPHOLOGIES.DEFAULT);
    expect(normalizeMorphology(MORPHOLOGIES.BRUTALIST_STAGE)).toBe(
      MORPHOLOGIES.BRUTALIST_STAGE
    );
  });

  test('normalizes supported accent values', () => {
    expect(normalizeAccent(ACCENTS.THEME)).toBe(ACCENTS.THEME);
    expect(normalizeAccent(ACCENTS.AMBER)).toBe(ACCENTS.AMBER);
  });

  test('falls back safely when stored morphology is unsupported', () => {
    window.localStorage.setItem(MORPHOLOGY_STORAGE_KEY, 'unknown-morphology');

    expect(getStoredMorphology()).toBe(MORPHOLOGIES.DEFAULT);
  });

  test('falls back safely when stored accent is unsupported', () => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, 'unknown-accent');

    expect(getStoredAccent()).toBe(ACCENTS.THEME);
  });

  test('persists morphology without mutating the stored theme selection', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, THEMES.DRACULA);

    const result = setMorphology(MORPHOLOGIES.BRUTALIST_STAGE);

    expect(result).toBe(MORPHOLOGIES.BRUTALIST_STAGE);
    expect(window.localStorage.getItem(MORPHOLOGY_STORAGE_KEY)).toBe(
      MORPHOLOGIES.BRUTALIST_STAGE
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEMES.DRACULA);
  });

  test('applies morphology to the document html attribute', () => {
    applyMorphologyToDocument(MORPHOLOGIES.BRUTALIST_STAGE);

    expect(document.documentElement.getAttribute('data-morphology')).toBe(
      MORPHOLOGIES.BRUTALIST_STAGE
    );
  });

  test('persists accent without mutating the stored theme selection', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, THEMES.DRACULA);

    const result = setAccent(ACCENTS.AMBER);

    expect(result).toBe(ACCENTS.AMBER);
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe(ACCENTS.AMBER);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEMES.DRACULA);
  });

  test('applies accent to the document html attribute', () => {
    applyAccentToDocument(ACCENTS.AMBER);

    expect(document.documentElement.getAttribute('data-accent')).toBe(ACCENTS.AMBER);
  });

  test('exposes brutalist stage as a first-class morphology option', () => {
    expect(MORPHOLOGY_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MORPHOLOGIES.DEFAULT }),
        expect.objectContaining({ id: MORPHOLOGIES.BRUTALIST_STAGE }),
      ])
    );
  });

  test('exposes preview accent overrides as first-class accent options', () => {
    expect(ACCENT_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ACCENTS.THEME }),
        expect.objectContaining({ id: ACCENTS.AMBER }),
        expect.objectContaining({ id: ACCENTS.MINT }),
        expect.objectContaining({ id: ACCENTS.VIOLET }),
        expect.objectContaining({ id: ACCENTS.ORANGE }),
        expect.objectContaining({ id: ACCENTS.ROSE }),
      ])
    );
  });
});

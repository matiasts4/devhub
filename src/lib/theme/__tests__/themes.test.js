const { JSDOM } = require('jsdom');

const {
  ACCENTS,
  ACCENT_OPTIONS,
  ACCENT_STORAGE_KEY,
  MORPHOLOGIES,
  MORPHOLOGY_OPTIONS,
  MORPHOLOGY_STORAGE_KEY,
  PALETTES,
  PALETTE_OPTIONS,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEMES,
  applyAccentToDocument,
  applyMorphologyToDocument,
  applyPaletteToDocument,
  getStoredAccent,
  getStoredMorphology,
  getStoredPalette,
  normalizeAccent,
  normalizeMorphology,
  normalizePalette,
  setAccent,
  setMorphology,
  setPalette,
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
    expect(normalizeMorphology(MORPHOLOGIES.SWITCHYARD)).toBe(MORPHOLOGIES.SWITCHYARD);
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

  test('exposes brutalist stage and switchyard as first-class morphology options', () => {
    expect(MORPHOLOGY_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MORPHOLOGIES.DEFAULT }),
        expect.objectContaining({ id: MORPHOLOGIES.BRUTALIST_STAGE }),
        expect.objectContaining({ id: MORPHOLOGIES.SWITCHYARD }),
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

  test('exposes switchyard as a first-class theme option', () => {
    expect(THEMES.SWITCHYARD).toBe('switchyard');
  });
});

describe('palette helpers (Switchyard sub-axis)', () => {
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
    document.body.removeAttribute('data-palette');
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
  });

  test('normalizePalette normalizes valid values and falls back to MINERAL', () => {
    expect(normalizePalette(PALETTES.MINERAL)).toBe(PALETTES.MINERAL);
    expect(normalizePalette(PALETTES.COBALT)).toBe(PALETTES.COBALT);
    expect(normalizePalette(PALETTES.ALLOY)).toBe(PALETTES.ALLOY);
  });

  test('normalizePalette falls back to MINERAL for unknown values', () => {
    expect(normalizePalette('unknown-palette')).toBe(PALETTES.MINERAL);
    expect(normalizePalette(null)).toBe(PALETTES.MINERAL);
    expect(normalizePalette(undefined)).toBe(PALETTES.MINERAL);
  });

  test('getStoredPalette returns MINERAL when nothing is stored', () => {
    expect(getStoredPalette()).toBe(PALETTES.MINERAL);
  });

  test('getStoredPalette returns stored palette value', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, PALETTES.COBALT);
    expect(getStoredPalette()).toBe(PALETTES.COBALT);
  });

  test('getStoredPalette falls back to MINERAL for unknown stored value', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'invalid-palette');
    expect(getStoredPalette()).toBe(PALETTES.MINERAL);
  });

  test('setPalette persists to localStorage via PALETTE_STORAGE_KEY', () => {
    setPalette(PALETTES.ALLOY);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe(PALETTES.ALLOY);
  });

  test('setPalette normalizes unknown values to MINERAL before persisting', () => {
    setPalette('unknown');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe(PALETTES.MINERAL);
  });

  test('applyPaletteToDocument sets data-palette on document.body', () => {
    applyPaletteToDocument(PALETTES.COBALT);
    expect(document.body.getAttribute('data-palette')).toBe(PALETTES.COBALT);
  });

  test('applyPaletteToDocument normalizes unknown values to MINERAL', () => {
    applyPaletteToDocument('unknown-palette');
    expect(document.body.getAttribute('data-palette')).toBe(PALETTES.MINERAL);
  });

  test('PALETTE_OPTIONS includes MINERAL, COBALT, ALLOY with correct primary colors', () => {
    const mineral = PALETTE_OPTIONS.find((p) => p.id === PALETTES.MINERAL);
    const cobalt = PALETTE_OPTIONS.find((p) => p.id === PALETTES.COBALT);
    const alloy = PALETTE_OPTIONS.find((p) => p.id === PALETTES.ALLOY);

    expect(mineral).toBeDefined();
    expect(mineral.primary).toBe('#63d0c2');

    expect(cobalt).toBeDefined();
    expect(cobalt.primary).toBe('#7a93ff');

    expect(alloy).toBeDefined();
    expect(alloy.primary).toBe('#d4a16a');
  });

  test('setPalette applies to document and persists to storage', () => {
    const result = setPalette(PALETTES.COBALT);
    expect(result).toBe(PALETTES.COBALT);
    expect(document.body.getAttribute('data-palette')).toBe(PALETTES.COBALT);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe(PALETTES.COBALT);
  });
});

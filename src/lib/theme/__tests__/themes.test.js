const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const {
  ACCENTS,
  ACCENT_OPTIONS,
  ACCENT_STORAGE_KEY,
  APPEARANCE_STORAGE_KEY,
  MORPHOLOGIES,
  MORPHOLOGY_OPTIONS,
  MORPHOLOGY_STORAGE_KEY,
  OPENCODE_DESKTOP_PRESET,
  PALETTES,
  PALETTE_OPTIONS,
  PALETTE_STORAGE_KEY,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  THEMES,
  WARNING,
  applyAccentToDocument,
  applyMotionModeToDocument,
  applyMorphologyToDocument,
  applyOpenCodeDesktopPreset,
  applyPaletteToDocument,
  applyWarning,
  getStoredAccent,
  getStoredAppearance,
  getStoredMorphology,
  getStoredMotionMode,
  getStoredPalette,
  getStoredTheme,
  MOTION_MODES,
  MOTION_MODE_STORAGE_KEY,
  normalizeAccent,
  normalizeMotionMode,
  normalizeMorphology,
  normalizePalette,
  normalizeTheme,
  restoreAppearanceSnapshot,
  setAccent,
  setDensity,
  setMotionMode,
  setMorphology,
  setPalette,
  setStoredAppearance,
  setStoredMotionMode,
  setTheme,
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
    expect(normalizeMorphology(MORPHOLOGIES.BRUTALIST_STAGE)).toBe(MORPHOLOGIES.BRUTALIST_STAGE);
    expect(normalizeMorphology(MORPHOLOGIES.SWITCHYARD)).toBe(MORPHOLOGIES.SWITCHYARD);
    expect(normalizeMorphology(MORPHOLOGIES.CURSOR)).toBe(MORPHOLOGIES.CURSOR);
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
    expect(window.localStorage.getItem(MORPHOLOGY_STORAGE_KEY)).toBe(MORPHOLOGIES.BRUTALIST_STAGE);
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

  test('exposes brutalist stage, switchyard, and cursor as first-class morphology options', () => {
    expect(MORPHOLOGY_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MORPHOLOGIES.DEFAULT }),
        expect.objectContaining({ id: MORPHOLOGIES.BRUTALIST_STAGE }),
        expect.objectContaining({ id: MORPHOLOGIES.SWITCHYARD }),
        expect.objectContaining({ id: MORPHOLOGIES.CURSOR, label: 'Cursor' }),
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

  test('exposes opencode as a first-class theme option', () => {
    expect(THEMES.OPENCODE).toBe('opencode');
    expect(THEME_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: THEMES.OPENCODE,
          label: expect.stringMatching(/opencode/i),
          terminalBg: expect.objectContaining({
            bg: expect.stringMatching(/^#1[0-6]/),
            fg: expect.any(String),
            headerBg: expect.stringMatching(/^#1[0-6]/),
          }),
        }),
      ])
    );
  });

  test('normalizeTheme accepts opencode and rejects unknown values', () => {
    expect(normalizeTheme('opencode')).toBe('opencode');
    expect(normalizeTheme(THEMES.OPENCODE)).toBe(THEMES.OPENCODE);
    expect(normalizeTheme('garbage')).toBe(THEMES.DEEP_SEA);
  });

  test('WARNING.opencode is a non-empty CSS color string', () => {
    expect(typeof WARNING[THEMES.OPENCODE]).toBe('string');
    expect(WARNING[THEMES.OPENCODE].length).toBeGreaterThan(0);
    expect(WARNING.opencode).toBe(WARNING[THEMES.OPENCODE]);
  });

  test('setTheme(opencode) applies data-theme and matching WARNING inline', () => {
    const result = setTheme(THEMES.OPENCODE);
    expect(result).toBe(THEMES.OPENCODE);
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.OPENCODE);
    expect(document.documentElement.style.getPropertyValue('--warning')).toBe(
      WARNING[THEMES.OPENCODE]
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEMES.OPENCODE);
  });

  test('exposes opencode-desktop as a first-class morphology option', () => {
    expect(MORPHOLOGIES.OPENCODE_DESKTOP).toBe('opencode-desktop');
    expect(MORPHOLOGY_OPTIONS).toHaveLength(6);
    expect(MORPHOLOGY_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: MORPHOLOGIES.OPENCODE_DESKTOP,
          label: expect.stringMatching(/opencode/i),
        }),
      ])
    );
  });

  test('normalizeMorphology accepts opencode-desktop and rejects unknown values', () => {
    expect(normalizeMorphology('opencode-desktop')).toBe('opencode-desktop');
    expect(normalizeMorphology(MORPHOLOGIES.OPENCODE_DESKTOP)).toBe(
      MORPHOLOGIES.OPENCODE_DESKTOP
    );
    expect(normalizeMorphology('garbage-morph')).toBe(MORPHOLOGIES.DEFAULT);
  });

  test('setMorphology(opencode-desktop) does not change theme', () => {
    setTheme(THEMES.OPENCODE);
    const result = setMorphology(MORPHOLOGIES.OPENCODE_DESKTOP);

    expect(result).toBe(MORPHOLOGIES.OPENCODE_DESKTOP);
    expect(document.documentElement.getAttribute('data-morphology')).toBe(
      MORPHOLOGIES.OPENCODE_DESKTOP
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.OPENCODE);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEMES.OPENCODE);
    expect(window.localStorage.getItem(MORPHOLOGY_STORAGE_KEY)).toBe(
      MORPHOLOGIES.OPENCODE_DESKTOP
    );
  });
});

describe('OpenCode Desktop preset + density helpers', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-morphology');
    document.documentElement.removeAttribute('data-density');
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
  });

  test('OPENCODE_DESKTOP_PRESET targets opencode + opencode-desktop + compact', () => {
    expect(OPENCODE_DESKTOP_PRESET).toEqual({
      theme: THEMES.OPENCODE,
      morphology: MORPHOLOGIES.OPENCODE_DESKTOP,
      density: 'compact',
    });
  });

  test('applyOpenCodeDesktopPreset applies all three axes and returns prior snapshot', () => {
    setTheme(THEMES.DRACULA);
    setMorphology(MORPHOLOGIES.CURSOR);
    setStoredAppearance({
      fontFamily: 'Inter',
      fontScale: 1.1,
      density: 'comfortable',
      zoom: 1,
    });

    const snapshot = applyOpenCodeDesktopPreset();

    expect(snapshot).toEqual({
      theme: THEMES.DRACULA,
      morphology: MORPHOLOGIES.CURSOR,
      appearance: expect.objectContaining({
        density: 'comfortable',
        fontFamily: 'Inter',
        fontScale: 1.1,
      }),
    });

    expect(getStoredTheme()).toBe(THEMES.OPENCODE);
    expect(getStoredMorphology()).toBe(MORPHOLOGIES.OPENCODE_DESKTOP);
    expect(getStoredAppearance().density).toBe('compact');
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.OPENCODE);
    expect(document.documentElement.getAttribute('data-morphology')).toBe(
      MORPHOLOGIES.OPENCODE_DESKTOP
    );
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).density).toBe(
      'compact'
    );
  });

  test('restoreAppearanceSnapshot restores theme, morphology, and appearance', () => {
    setTheme(THEMES.DRACULA);
    setMorphology(MORPHOLOGIES.CURSOR);
    setStoredAppearance({
      fontFamily: 'Inter',
      fontScale: 1.1,
      density: 'comfortable',
      zoom: 1.2,
    });

    const snapshot = applyOpenCodeDesktopPreset();
    restoreAppearanceSnapshot(snapshot);

    expect(getStoredTheme()).toBe(THEMES.DRACULA);
    expect(getStoredMorphology()).toBe(MORPHOLOGIES.CURSOR);
    expect(getStoredAppearance()).toEqual(
      expect.objectContaining({
        density: 'comfortable',
        fontFamily: 'Inter',
        fontScale: 1.1,
        zoom: 1.2,
      })
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DRACULA);
    expect(document.documentElement.getAttribute('data-morphology')).toBe(MORPHOLOGIES.CURSOR);
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });

  test('setDensity updates density without changing theme or morphology', () => {
    setTheme(THEMES.NORD);
    setMorphology(MORPHOLOGIES.DEFAULT);
    setStoredAppearance({ density: 'comfortable', fontFamily: 'Inter', fontScale: 1, zoom: 1 });

    const result = setDensity('compact');

    expect(result).toBe('compact');
    expect(getStoredAppearance().density).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(getStoredTheme()).toBe(THEMES.NORD);
    expect(getStoredMorphology()).toBe(MORPHOLOGIES.DEFAULT);
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.NORD);
  });

  test('setDensity normalizes unsupported values to comfortable', () => {
    setStoredAppearance({ density: 'compact', fontFamily: 'Inter', fontScale: 1, zoom: 1 });

    const result = setDensity('ultra');

    expect(result).toBe('comfortable');
    expect(getStoredAppearance().density).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });

  test('post-preset independent theme change leaves morphology and density', () => {
    setTheme(THEMES.DEEP_SEA);
    setMorphology(MORPHOLOGIES.DEFAULT);
    setStoredAppearance({ density: 'comfortable', fontFamily: 'Inter', fontScale: 1, zoom: 1 });

    applyOpenCodeDesktopPreset();
    setTheme(THEMES.DRACULA);

    expect(getStoredTheme()).toBe(THEMES.DRACULA);
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DRACULA);
    expect(getStoredMorphology()).toBe(MORPHOLOGIES.OPENCODE_DESKTOP);
    expect(getStoredAppearance().density).toBe('compact');
    expect(document.documentElement.getAttribute('data-morphology')).toBe(
      MORPHOLOGIES.OPENCODE_DESKTOP
    );
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
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

describe('warning token helper (FR-D06)', () => {
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

  test('applyWarning sets --warning on documentElement', () => {
    applyWarning('oklch(0.79 0.16 80)');
    expect(document.documentElement.style.getPropertyValue('--warning')).toBe(
      'oklch(0.79 0.16 80)'
    );
  });

  test('applyWarning overwrites an existing --warning value', () => {
    applyWarning('oklch(0.5 0.1 60)');
    applyWarning('oklch(0.9 0.2 30)');
    expect(document.documentElement.style.getPropertyValue('--warning')).toBe('oklch(0.9 0.2 30)');
  });

  test('setTheme applies the matching theme --warning value inline', () => {
    setTheme(THEMES.DRACULA);
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DRACULA);
    expect(document.documentElement.style.getPropertyValue('--warning')).toBe(
      WARNING[THEMES.DRACULA]
    );
  });
});

describe('cursor morphology token block', () => {
  const globalsCssPath = path.resolve(__dirname, '../../../app/globals.css');

  test('globals.css defines a cursor morphology token block with expected values', async () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    const root = postcss.parse(css);

    const cursorRule = root.nodes.find(
      (node) => node.type === 'rule' && node.selector === "[data-morphology='cursor']"
    );

    expect(cursorRule).toBeDefined();

    const declarations = Object.fromEntries(
      cursorRule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
    );

    expect(declarations['--chrome-radius-panel']).toBe('18px');
    expect(declarations['--chrome-radius-control']).toBe('8px');
    expect(declarations['--chrome-border-width']).toBe('1px');
    expect(declarations['--accent-primary']).toBe('oklch(0.74 0.16 57)');
    expect(declarations['--accent-glow']).toBe('rgba(227, 179, 65, 0.16)');
  });

  test('cursor token block uses morphology chrome variables and warm amber accent', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    const root = postcss.parse(css);

    const cursorRule = root.nodes.find(
      (node) => node.type === 'rule' && node.selector === "[data-morphology='cursor']"
    );

    const declarations = Object.fromEntries(
      cursorRule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
    );

    expect(declarations['--chrome-panel-fill']).toBeDefined();
    expect(declarations['--chrome-panel-fill-emphasis']).toBeDefined();
    expect(declarations['--chrome-control-fill']).toBeDefined();
    expect(declarations['--chrome-control-fill-hover']).toBeDefined();
    expect(declarations['--chrome-shadow-panel']).toBeDefined();
    expect(declarations['--chrome-shadow-control']).toBeDefined();
  });

  test('existing morphology token blocks are unchanged (R6 default-radius exception)', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    const root = postcss.parse(css);

    const getBlock = (selector) =>
      root.nodes.find((node) => node.type === 'rule' && node.selector === selector);

    const defaultBlock = getBlock("[data-morphology='default']");
    const brutalistBlock = getBlock("[data-morphology='brutalist-stage']");
    const auraBlock = getBlock("[data-morphology='aura']");
    const switchyardBlock = getBlock("[data-morphology='switchyard']");

    expect(defaultBlock).toBeDefined();
    expect(brutalistBlock).toBeDefined();
    expect(auraBlock).toBeDefined();
    expect(switchyardBlock).toBeDefined();

    const defaultDecls = Object.fromEntries(
      defaultBlock.nodes
        .filter((node) => node.type === 'decl')
        .map((node) => [node.prop, node.value])
    );

    // R6 amendment: default MAY set --chrome-radius-panel: 0 to preserve
    // the legacy Ajustes square look. All other default tokens remain at
    // pre-cursor values.
    expect(defaultDecls['--chrome-radius-panel']).toBe('0');
    expect(defaultDecls['--chrome-radius-control']).toBe('999px');

    const switchyardDecls = Object.fromEntries(
      switchyardBlock.nodes
        .filter((node) => node.type === 'decl')
        .map((node) => [node.prop, node.value])
    );

    expect(switchyardDecls['--chrome-radius-panel']).toBe('18px');
    expect(switchyardDecls['--accent-primary']).toBe('#63d0c2');
  });
});

describe('motion mode preference helpers', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    document.documentElement.removeAttribute('data-motion-mode');
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
  });

  test('exposes the devhub:motion-mode storage key and three mode constants', () => {
    expect(MOTION_MODE_STORAGE_KEY).toBe('devhub:motion-mode');
    expect(MOTION_MODES).toEqual({
      REDUCED: 'reduced',
      NORMAL: 'normal',
      AMPLIFIED: 'amplified',
    });
  });

  test('normalizeMotionMode returns each supported mode unchanged', () => {
    expect(normalizeMotionMode('reduced')).toBe('reduced');
    expect(normalizeMotionMode('normal')).toBe('normal');
    expect(normalizeMotionMode('amplified')).toBe('amplified');
  });

  test('normalizeMotionMode falls back to normal for unknown, null, or undefined', () => {
    expect(normalizeMotionMode('bouncy')).toBe('normal');
    expect(normalizeMotionMode(null)).toBe('normal');
    expect(normalizeMotionMode(undefined)).toBe('normal');
    expect(normalizeMotionMode('')).toBe('normal');
  });

  test('getStoredMotionMode returns normal when nothing is stored', () => {
    expect(getStoredMotionMode()).toBe('normal');
  });

  test('getStoredMotionMode returns the stored mode value', () => {
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'amplified');
    expect(getStoredMotionMode()).toBe('amplified');
  });

  test('getStoredMotionMode falls back to normal for an unknown stored value', () => {
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'bouncy');
    expect(getStoredMotionMode()).toBe('normal');
  });

  test('setStoredMotionMode persists a normalized mode under the motion-mode key', () => {
    setStoredMotionMode('amplified');
    expect(window.localStorage.getItem(MOTION_MODE_STORAGE_KEY)).toBe('amplified');
  });

  test('setStoredMotionMode normalizes unknown values to normal before persisting', () => {
    setStoredMotionMode('bouncy');
    expect(window.localStorage.getItem(MOTION_MODE_STORAGE_KEY)).toBe('normal');
  });

  test('applyMotionModeToDocument sets data-motion-mode on documentElement', () => {
    applyMotionModeToDocument('reduced');
    expect(document.documentElement.getAttribute('data-motion-mode')).toBe('reduced');
  });

  test('applyMotionModeToDocument normalizes unknown values to normal', () => {
    applyMotionModeToDocument('bouncy');
    expect(document.documentElement.getAttribute('data-motion-mode')).toBe('normal');
  });

  test('setMotionMode applies to document, persists, and returns the normalized mode', () => {
    const result = setMotionMode('amplified');
    expect(result).toBe('amplified');
    expect(document.documentElement.getAttribute('data-motion-mode')).toBe('amplified');
    expect(window.localStorage.getItem(MOTION_MODE_STORAGE_KEY)).toBe('amplified');
  });

  test('setMotionMode does not mutate the stored theme selection', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, THEMES.DRACULA);

    const result = setMotionMode('reduced');

    expect(result).toBe('reduced');
    expect(window.localStorage.getItem(MOTION_MODE_STORAGE_KEY)).toBe('reduced');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEMES.DRACULA);
  });
});

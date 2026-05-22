const { JSDOM } = require('jsdom');

const {
  APPEARANCE_STORAGE_KEY,
  getStoredAppearance,
  setStoredAppearance,
  applyAppearanceSettings,
  normalizeAppearance,
} = require('../../src/lib/theme/themes');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  return dom;
}

describe('themes appearance helpers', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.removeProperty('--font-scale');
    document.documentElement.style.removeProperty('--font-family-ui');
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  test('getStoredAppearance returns defaults when nothing stored', () => {
    const appearance = getStoredAppearance();
    expect(appearance.fontFamily).toBe('Inter');
    expect(appearance.fontScale).toBe(1);
    expect(appearance.density).toBe('comfortable');
    expect(appearance.zoom).toBe(1);
  });

  test('setStoredAppearance persists to localStorage', () => {
    setStoredAppearance({
      fontFamily: 'system-ui',
      fontScale: 1.25,
      density: 'compact',
      zoom: 1.2,
    });
    const stored = JSON.parse(window.localStorage.getItem('devhub:appearance'));
    expect(stored.fontFamily).toBe('system-ui');
    expect(stored.fontScale).toBe(1.25);
    expect(stored.density).toBe('compact');
  });

  test('getStoredAppearance reads back persisted values', () => {
    setStoredAppearance({
      fontFamily: 'JetBrains Mono',
      fontScale: 0.875,
      density: 'compact',
      zoom: 1,
    });
    const appearance = getStoredAppearance();
    expect(appearance.fontFamily).toBe('JetBrains Mono');
    expect(appearance.fontScale).toBe(0.875);
    expect(appearance.density).toBe('compact');
  });

  test('applyAppearanceSettings writes CSS vars and data-density to html element', () => {
    applyAppearanceSettings({ fontFamily: 'Inter', fontScale: 1.125, density: 'compact', zoom: 1 });

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.125');
    expect(document.documentElement.style.getPropertyValue('--font-family-ui')).toBe('Inter');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  test('normalizeAppearance clamps invalid density to comfortable', () => {
    const result = normalizeAppearance({ density: 'invalid', fontScale: 2 });
    expect(result.density).toBe('comfortable');
    expect(result.fontScale).toBe(1.5);
  });

  test('applyAppearanceSettings overwrites previous CSS vars', () => {
    applyAppearanceSettings({
      fontFamily: 'system-ui',
      fontScale: 1.25,
      density: 'compact',
      zoom: 1,
    });
    applyAppearanceSettings({
      fontFamily: 'Inter',
      fontScale: 0.875,
      density: 'comfortable',
      zoom: 1,
    });

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.875');
    expect(document.documentElement.style.getPropertyValue('--font-family-ui')).toBe('Inter');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });

  test('normalizeAppearance handles JSON string input', () => {
    const result = normalizeAppearance('{"fontScale":1.25,"density":"compact"}');
    expect(result.fontScale).toBe(1.25);
    expect(result.density).toBe('compact');
    expect(result.fontFamily).toBe('Inter');
  });
});

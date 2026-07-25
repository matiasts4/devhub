const domHarness = require('@/test-support/domHarness');

const {
  SCENERY_STORAGE_KEY,
  SCENERY_CHANGED_EVENT,
  SCENERY_SCOPES,
  readSceneryPrefs,
  writeSceneryPrefs,
  normalizeSceneryPrefs,
  setActiveScenery,
  setSceneryScope,
  resolveSceneryStyle,
  resolveSceneryOverlayStyle,
  resolveTerminalTintColor,
  setSceneryTerminalTint,
  isSceneryActiveForScope,
} = require('../sceneryPreferences');

let dom;

describe('sceneryPreferences', () => {
  beforeEach(() => {
    dom = domHarness.installDom();
  });

  afterEach(() => {
    if (dom?.window?.close) dom.window.close();
  });

  describe('normalizeSceneryPrefs', () => {
    test('returns defaults for invalid input', () => {
      const defaults = normalizeSceneryPrefs(null);
      expect(defaults.sceneryId).toBeNull();
      expect(defaults.scope).toBe(SCENERY_SCOPES.BOTH);
      expect(defaults.overlayOpacity).toBe(0.35);
      expect(defaults.blur).toBe(0);
      expect(defaults.terminalTint).toBe(0.3);
      expect(defaults.customImageUrl).toBeNull();
    });

    test('clamps overlayOpacity and blur into valid ranges', () => {
      const prefs = normalizeSceneryPrefs({
        sceneryId: 'meadow',
        scope: 'pizarra',
        overlayOpacity: 5,
        blur: -3,
      });
      expect(prefs.overlayOpacity).toBe(1);
      expect(prefs.blur).toBe(0);
    });

    test('clamps terminalTint into the 0..1 range and defaults when missing', () => {
      expect(normalizeSceneryPrefs({ sceneryId: 'meadow', terminalTint: 7 }).terminalTint).toBe(1);
      expect(normalizeSceneryPrefs({ sceneryId: 'meadow', terminalTint: -2 }).terminalTint).toBe(0);
      expect(normalizeSceneryPrefs({ sceneryId: 'meadow' }).terminalTint).toBe(0.3);
    });

    test('falls back to default scope for unknown values', () => {
      const prefs = normalizeSceneryPrefs({ sceneryId: 'meadow', scope: 'bogus' });
      expect(prefs.scope).toBe(SCENERY_SCOPES.BOTH);
    });
  });

  describe('persistence round-trip', () => {
    test('write then read returns normalized prefs', () => {
      writeSceneryPrefs({
        sceneryId: 'night-meadow',
        scope: SCENERY_SCOPES.TERMINAL,
        overlayOpacity: 0.5,
        blur: 4,
        customImageUrl: null,
      });

      const stored = readSceneryPrefs();
      expect(stored.sceneryId).toBe('night-meadow');
      expect(stored.scope).toBe(SCENERY_SCOPES.TERMINAL);
      expect(stored.overlayOpacity).toBe(0.5);
      expect(stored.blur).toBe(4);
    });

    test('persists under the expected storage key', () => {
      writeSceneryPrefs({ sceneryId: 'aurora' });
      const raw = window.localStorage.getItem(SCENERY_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).sceneryId).toBe('aurora');
    });
  });

  describe('event broadcast', () => {
    test('writeSceneryPrefs dispatches a change event with the normalized detail', () => {
      const received = [];
      const listener = (event) => received.push(event.detail);
      window.addEventListener(SCENERY_CHANGED_EVENT, listener);

      writeSceneryPrefs({ sceneryId: 'lakeside', scope: 'both' });

      window.removeEventListener(SCENERY_CHANGED_EVENT, listener);
      expect(received).toHaveLength(1);
      expect(received[0].sceneryId).toBe('lakeside');
    });

    test('setActiveScenery preserves other prefs and broadcasts', () => {
      writeSceneryPrefs({ sceneryId: 'meadow', overlayOpacity: 0.8, blur: 2 });
      setActiveScenery('halcyon');

      const stored = readSceneryPrefs();
      expect(stored.sceneryId).toBe('halcyon');
      expect(stored.overlayOpacity).toBe(0.8);
      expect(stored.blur).toBe(2);
    });

    test('setSceneryScope updates only the scope', () => {
      writeSceneryPrefs({ sceneryId: 'meadow', scope: 'both' });
      setSceneryScope(SCENERY_SCOPES.PIZARRA);
      expect(readSceneryPrefs().scope).toBe(SCENERY_SCOPES.PIZARRA);
    });

    test('setSceneryTerminalTint updates only the tint', () => {
      writeSceneryPrefs({ sceneryId: 'meadow', overlayOpacity: 0.5 });
      setSceneryTerminalTint(0.8);
      const stored = readSceneryPrefs();
      expect(stored.terminalTint).toBe(0.8);
      expect(stored.overlayOpacity).toBe(0.5);
    });
  });

  describe('resolveTerminalTintColor', () => {
    test('builds a dark rgba from the tint intensity', () => {
      expect(resolveTerminalTintColor({ terminalTint: 0.7 })).toBe('rgba(8, 10, 16, 0.7)');
    });

    test('falls back to the default tint for invalid input', () => {
      expect(resolveTerminalTintColor(null)).toBe('rgba(8, 10, 16, 0.3)');
      expect(resolveTerminalTintColor({ terminalTint: 'x' })).toBe('rgba(8, 10, 16, 0.3)');
    });
  });

  describe('resolveSceneryStyle', () => {
    test('returns null when scenery is disabled', () => {
      expect(resolveSceneryStyle({ sceneryId: null }, 'pizarra')).toBeNull();
    });

    test('scope gate: pizarra-only scenery does not apply to terminal', () => {
      const prefs = { sceneryId: 'meadow', scope: SCENERY_SCOPES.PIZARRA, customImageUrl: null };
      expect(resolveSceneryStyle(prefs, 'pizarra')).not.toBeNull();
      expect(resolveSceneryStyle(prefs, 'terminal')).toBeNull();
      expect(isSceneryActiveForScope(prefs, 'terminal')).toBe(false);
    });

    test('scope both applies to every surface', () => {
      const prefs = { sceneryId: 'meadow', scope: SCENERY_SCOPES.BOTH, customImageUrl: null };
      expect(resolveSceneryStyle(prefs, 'pizarra')).not.toBeNull();
      expect(resolveSceneryStyle(prefs, 'terminal')).not.toBeNull();
    });

    test('custom image url takes priority over catalog layers', () => {
      const prefs = {
        sceneryId: 'meadow',
        scope: SCENERY_SCOPES.BOTH,
        customImageUrl: 'https://example.com/bg.jpg',
      };
      const style = resolveSceneryStyle(prefs, 'pizarra');
      expect(style.backgroundImage).toBe('url(https://example.com/bg.jpg)');
      expect(style.backgroundSize).toBe('cover');
    });

    test('catalog scenery resolves to its gradient stack', () => {
      const prefs = { sceneryId: 'aurora', scope: SCENERY_SCOPES.BOTH, customImageUrl: null };
      const style = resolveSceneryStyle(prefs, 'terminal');
      expect(style.backgroundImage).toContain('gradient');
      expect(style.backgroundColor).toBeTruthy();
    });

    test('bundled image scenery resolves to a cover url()', () => {
      const prefs = { sceneryId: 'photo-aurora', scope: SCENERY_SCOPES.BOTH, customImageUrl: null };
      const style = resolveSceneryStyle(prefs, 'pizarra');
      // `src` is a static asset import (bundled media URL / Jest stub), so
      // assert the url() wrapper + cover sizing rather than a literal path.
      expect(style.backgroundImage).toMatch(/^url\(.+\)$/);
      expect(style.backgroundSize).toBe('cover');
      expect(style.backgroundPosition).toBe('center');
    });

    test('unknown scenery id resolves to null', () => {
      const prefs = { sceneryId: 'nope', scope: SCENERY_SCOPES.BOTH, customImageUrl: null };
      expect(resolveSceneryStyle(prefs, 'pizarra')).toBeNull();
    });
  });

  describe('resolveSceneryOverlayStyle', () => {
    test('returns null when disabled', () => {
      expect(resolveSceneryOverlayStyle({ sceneryId: null })).toBeNull();
    });

    test('builds a dim overlay from opacity', () => {
      const style = resolveSceneryOverlayStyle({
        sceneryId: 'meadow',
        overlayOpacity: 0.4,
        blur: 0,
      });
      expect(style.backgroundColor).toBe('rgba(8, 10, 16, 0.4)');
      expect(style.backdropFilter).toBeUndefined();
    });

    test('includes backdrop blur when set', () => {
      const style = resolveSceneryOverlayStyle({ sceneryId: 'meadow', overlayOpacity: 0, blur: 8 });
      expect(style.backdropFilter).toBe('blur(8px)');
    });
  });

  describe('scenery image preloading', () => {
    test('preloadActiveSceneryPrefs preloads image sceneries without error', () => {
      const {
        preloadActiveSceneryPrefs,
        preloadSceneryImage,
        warmAllBundledWallpapers,
      } = require('../sceneryPreferences');
      expect(() => preloadActiveSceneryPrefs({ sceneryId: 'photo-aurora' })).not.toThrow();
      expect(() =>
        preloadActiveSceneryPrefs({
          sceneryId: 'photo-aurora',
          customImageUrl: 'https://example.com/custom.jpg',
        })
      ).not.toThrow();
      expect(() => preloadSceneryImage('https://example.com/test.jpg')).not.toThrow();
      expect(() => warmAllBundledWallpapers()).not.toThrow();
    });
  });
});

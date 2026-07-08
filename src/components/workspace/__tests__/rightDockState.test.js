const {
  DEFAULT_RIGHT_DOCK_STATE,
  normalizeBrowserUrl,
  readRightDockState,
  rightDockStatesEqual,
  sanitizeRightDockState,
  writeRightDockState,
} = require('../rightDockState');

describe('rightDockState normalizeBrowserUrl', () => {
  test('accepts single-label hostnames used in local/LAN development', () => {
    expect(normalizeBrowserUrl('devbox:3000')).toBe('http://devbox:3000/');
    expect(normalizeBrowserUrl('workspace-node.local:4173')).toBe(
      'http://workspace-node.local:4173/'
    );
  });

  test('defaults plain public domains to https', () => {
    expect(normalizeBrowserUrl('arxonlabs.com')).toBe('https://arxonlabs.com/');
    expect(normalizeBrowserUrl('www.arxonlabs.com/docs')).toBe('https://www.arxonlabs.com/docs');
  });

  test('rejects malformed explicit URLs with free-text whitespace', () => {
    expect(normalizeBrowserUrl('http://bad host:3000')).toBe('');
  });

  test('rejects malformed explicit hostnames that are not valid searchable free text', () => {
    expect(normalizeBrowserUrl('http://-bad-host:3000')).toBe('');
  });
});

describe('rightDockState sanitizeRightDockState', () => {
  test('resolveDefaultBrowserUrl avoids embedding the DevHub shell origin', () => {
    const { resolveDefaultBrowserUrl, isDevHubShellBrowserUrl } = require('../rightDockState');
    expect(isDevHubShellBrowserUrl('http://127.0.0.1:3100/')).toBe(true);
    expect(isDevHubShellBrowserUrl('https://duckduckgo.com/')).toBe(false);
    expect(resolveDefaultBrowserUrl()).toBe('https://example.com/');
  });

  test('sanitize migrates persisted shell self-URL to external home', () => {
    const result = sanitizeRightDockState({
      browserUrl: 'http://127.0.0.1:3100/',
      browserHistory: ['http://127.0.0.1:3100/'],
    });
    expect(result.browserUrl).toBe('https://example.com/');
    expect(result.browserHistory[0]).toBe('https://example.com/');
  });

  test('sanitize upgrades unpinned iframe to native-gtk on non-Windows', () => {
    const result = sanitizeRightDockState({ browserRuntime: 'iframe' });
    expect(result.browserRuntime).toBe('native-gtk');
    expect(result.browserRuntimePinned).toBe(false);
  });

  test('sanitize resets stale auto-pinned iframe back to native-gtk', () => {
    const result = sanitizeRightDockState({
      browserRuntime: 'iframe',
      browserRuntimePinned: true,
    });
    expect(result.browserRuntime).toBe('native-gtk');
    expect(result.browserRuntimePinned).toBe(false);
  });

  test('sanitize keeps iframe when user explicitly picked it', () => {
    const result = sanitizeRightDockState({
      browserRuntime: 'iframe',
      browserRuntimePinned: true,
      browserRuntimeUserPick: true,
    });
    expect(result.browserRuntime).toBe('iframe');
    expect(result.browserRuntimePinned).toBe(true);
    expect(result.browserRuntimeUserPick).toBe(true);
  });

  test('readRightDockState rewrites unpinned iframe in storage to native-gtk', () => {
    const storage = {
      data: {},
      getItem(key) {
        return this.data[key] ?? null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
    };
    storage.setItem(
      'devhub_right_dock_project-1_ws1',
      JSON.stringify({ browserRuntime: 'iframe', visible: true })
    );
    const state = readRightDockState(storage, 'project-1', 'ws1');
    expect(state.browserRuntime).toBe('native-gtk');
    const persisted = JSON.parse(storage.data['devhub_right_dock_project-1_ws1']);
    expect(persisted.browserRuntime).toBe('native-gtk');
  });

  test('sanitizeRightDockState accepts activeTab: "pizarra"', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra' });
    expect(result.activeTab).toBe('pizarra');
  });

  test('sanitizeRightDockState accepts maximizedView: "pizarra"', () => {
    const result = sanitizeRightDockState({ maximizedView: 'pizarra' });
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState with pizarra activeTab and maximizedView preserves both', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra', maximizedView: 'pizarra' });
    expect(result.activeTab).toBe('pizarra');
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState with pizarra as activeTab sets default maximizedView to pizarra', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra', maximizedView: 'invalid' });
    expect(result.activeTab).toBe('pizarra');
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState falls back to browser for unknown activeTab', () => {
    const result = sanitizeRightDockState({ activeTab: 'unknown-tab' });
    expect(result.activeTab).toBe('browser');
  });
});

describe('rightDockState — browserLoadFallback whitelist (pizarra-ux-overhaul 2.2)', () => {
  test('sanitizeRightDockState preserves browserLoadFallback: true', () => {
    const result = sanitizeRightDockState({ browserLoadFallback: true });
    expect(result.browserLoadFallback).toBe(true);
  });

  test('readRightDockState defaults browserLoadFallback to false when absent', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const state = readRightDockState(storage, 'p-1', 'ws-1');
    expect(state.browserLoadFallback).toBe(false);
    // Sanity: also asserted on the default export.
    expect(DEFAULT_RIGHT_DOCK_STATE.browserLoadFallback).toBe(false);
  });

  test('coerces non-boolean values to false', () => {
    expect(sanitizeRightDockState({ browserLoadFallback: 1 }).browserLoadFallback).toBe(false);
    expect(sanitizeRightDockState({ browserLoadFallback: 'true' }).browserLoadFallback).toBe(false);
    expect(sanitizeRightDockState({ browserLoadFallback: null }).browserLoadFallback).toBe(false);
    expect(sanitizeRightDockState({ browserLoadFallback: undefined }).browserLoadFallback).toBe(
      false
    );
  });

  test('round-trip via writeRightDockState preserves the field', () => {
    const store = new Map();
    const storage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };

    writeRightDockState(storage, 'p-1', 'ws-1', { browserLoadFallback: true });
    const read = readRightDockState(storage, 'p-1', 'ws-1');
    expect(read.browserLoadFallback).toBe(true);
  });
});

describe('rightDockStatesEqual', () => {
  test('returns true for sanitized-equivalent states', () => {
    const a = sanitizeRightDockState(DEFAULT_RIGHT_DOCK_STATE);
    const b = sanitizeRightDockState({ ...DEFAULT_RIGHT_DOCK_STATE });
    expect(rightDockStatesEqual(a, b)).toBe(true);
  });

  test('returns false when browserUrl changes', () => {
    const a = sanitizeRightDockState({
      browserUrl: 'https://github.com/',
      browserHistory: ['https://github.com/'],
      browserHistoryIndex: 0,
    });
    const b = sanitizeRightDockState({
      browserUrl: 'https://example.com/',
      browserHistory: ['https://example.com/'],
      browserHistoryIndex: 0,
    });
    expect(rightDockStatesEqual(a, b)).toBe(false);
  });
});

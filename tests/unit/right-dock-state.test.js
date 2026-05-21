const {
  DEFAULT_RIGHT_DOCK_STATE,
  buildRightDockStorageKey,
  normalizeBrowserUrl,
  readRightDockState,
  sanitizeRightDockState,
  writeRightDockState,
} = require('../../src/components/workspace/rightDockState');

describe('rightDockState helpers', () => {
  test('readRightDockState keeps dock hidden by default when nothing is stored', () => {
    const storage = {
      getItem() {
        return null;
      },
    };

    expect(readRightDockState(storage, 'project-empty')).toEqual(DEFAULT_RIGHT_DOCK_STATE);
  });

  test('normalizeBrowserUrl prefixes localhost-like values with http', () => {
    expect(normalizeBrowserUrl('localhost:4173')).toBe('http://localhost:4173/');
    expect(normalizeBrowserUrl('127.0.0.1:3000/demo')).toBe('http://127.0.0.1:3000/demo');
  });

  test('normalizeBrowserUrl turns free-text terms into a web search', () => {
    expect(normalizeBrowserUrl('cocleo')).toBe('https://duckduckgo.com/?q=cocleo');
    expect(normalizeBrowserUrl('buscar workspace responsive')).toBe(
      'https://duckduckgo.com/?q=buscar%20workspace%20responsive'
    );
  });

  test('normalizeBrowserUrl rejects malformed explicit URLs instead of searching for them', () => {
    expect(normalizeBrowserUrl('http://bad host:3000')).toBe('');
  });

  test('normalizeBrowserUrl keeps valid single-label local hosts navigable', () => {
    expect(normalizeBrowserUrl('devbox:3000')).toBe('http://devbox:3000/');
    expect(normalizeBrowserUrl(':4173/demo')).toBe('http://localhost:4173/demo');
  });

  test('sanitizeRightDockState keeps normalized browser history and clamps the active entry', () => {
    const state = sanitizeRightDockState({
      visible: 'yes',
      activeTab: 'notes',
      size: 92,
      browserUrl: 'localhost:52827/#community',
      browserHistory: ['localhost:52827/#community', '', 'nota-url'],
      browserHistoryIndex: 99,
    });

    expect(state.visible).toBe(false);
    expect(state.activeTab).toBe('browser');
    expect(state.maximized).toBe(false);
    expect(state.size).toBe(82);
    expect(state.browserUrl).toBe('https://duckduckgo.com/?q=nota-url');
    expect(state.browserHistory).toEqual([
      'http://localhost:52827/#community',
      'https://duckduckgo.com/?q=nota-url',
    ]);
    expect(state.browserHistoryIndex).toBe(1);
  });

  test('sanitizeRightDockState migrates legacy bridge state into browser edit mode', () => {
    const state = sanitizeRightDockState({
      visible: true,
      activeTab: 'bridge',
      maximized: false,
      size: 40,
      browserUrl: 'localhost:3200',
      browserHistory: ['localhost:3200'],
      browserHistoryIndex: 0,
    });

    expect(state.activeTab).toBe('browser');
    expect(state.editMode).toBe(true);
    expect(state.visible).toBe(true);
    expect(state.browserUrl).toBe('http://localhost:3200/');
  });

  test('read/write round-trips project-scoped dock state', () => {
    const storage = {
      data: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
    };

    writeRightDockState(storage, 'project-123', undefined, {
      visible: true,
      activeTab: 'bridge',
      maximized: true,
      size: 41,
      browserUrl: 'localhost:3200',
      browserHistory: ['localhost:3200'],
      browserHistoryIndex: 0,
    });

    expect(Object.keys(storage.data)).toEqual([buildRightDockStorageKey('project-123')]);

    expect(readRightDockState(storage, 'project-123')).toEqual({
      ...DEFAULT_RIGHT_DOCK_STATE,
      visible: true,
      activeTab: 'browser',
      editMode: true,
      maximized: true,
      size: 41,
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/'],
      browserHistoryIndex: 0,
    });
  });

  test('stores independent dock state per project key', () => {
    const storage = {
      data: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
    };

    writeRightDockState(storage, 'project-a', undefined, {
      visible: true,
      activeTab: 'browser',
      size: 33,
      browserUrl: 'localhost:4173',
      browserHistory: ['localhost:4173'],
      browserHistoryIndex: 0,
    });

    writeRightDockState(storage, 'project-b', undefined, {
      visible: true,
      activeTab: 'bridge',
      size: 51,
      browserUrl: 'localhost:3200',
      browserHistory: ['localhost:3200'],
      browserHistoryIndex: 0,
    });

    expect(readRightDockState(storage, 'project-a')).toMatchObject({
      visible: true,
      activeTab: 'browser',
      size: 33,
      browserUrl: 'http://localhost:4173/',
    });
    expect(readRightDockState(storage, 'project-b')).toMatchObject({
      visible: true,
      activeTab: 'browser',
      editMode: true,
      size: 51,
      browserUrl: 'http://localhost:3200/',
    });
  });
});

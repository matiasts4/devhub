/**
 * Tests for panelDisplayName — per-workspace displayName persistence.
 * TDD: written BEFORE production code (T3 RED).
 *
 * SSR contract: getDisplayName / setDisplayName must NOT crash when
 * `window` is undefined (Node / SSR pre-hydration). Each storage-touching
 * path is guarded by `typeof window !== 'undefined'`.
 *
 * localStorage is provided via a hand-rolled mock on globalThis — this
 * file is exercised under `testEnvironment: 'node'`, NOT jsdom.
 */

function makeLocalStorageMock() {
  const store = new Map();
  return {
    getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: jest.fn((key) => {
      store.delete(key);
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
    _store: store,
  };
}

let localStorageMock;

beforeEach(() => {
  localStorageMock = makeLocalStorageMock();
  globalThis.localStorage = localStorageMock;
  // jsdom's `window` is undefined under testEnvironment: node; tests that
  // exercise the SSR safety path will temporarily set/clear it explicitly.
  if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window;
  }
  jest.resetModules();
});

afterEach(() => {
  if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window;
  }
  delete globalThis.localStorage;
});

function loadModule() {
  // Re-require after resetting modules so the module-level Map starts fresh.
  return require('./panelDisplayName');
}

describe('panelDisplayName.validator regex', () => {
  test.each([
    ['Alex', true],
    ['avery', true],
    ['panel-1', true],
    ['panel_1', true],
    ['1234', true],
    ['a', true],
    ['a'.repeat(24), true],
    ['a'.repeat(25), false],
    ['Panel 1', false],
    ['panel/1', false],
    ['café', false],
    ['', false],
  ])('DISPLAY_NAME_VALIDATOR_RE.test(%p) === %p', (input, expected) => {
    const { DISPLAY_NAME_VALIDATOR_RE } = loadModule();
    expect(DISPLAY_NAME_VALIDATOR_RE.test(input)).toBe(expected);
  });

  test('DISPLAY_NAME_VALIDATOR_RE is exactly /^[a-zA-Z0-9_-]{1,24}$/', () => {
    const { DISPLAY_NAME_VALIDATOR_RE } = loadModule();
    expect(DISPLAY_NAME_VALIDATOR_RE.source).toBe('^[a-zA-Z0-9_-]{1,24}$');
  });
});

describe('panelDisplayName.panelDisplayNameStorageKey', () => {
  test('returns devhub:panel-names:<workspaceId>', () => {
    const { panelDisplayNameStorageKey } = loadModule();
    expect(panelDisplayNameStorageKey('ws1')).toBe('devhub:panel-names:ws1');
    expect(panelDisplayNameStorageKey('ws-abc')).toBe('devhub:panel-names:ws-abc');
  });
});

describe('panelDisplayName.getDisplayName', () => {
  test('returns null when nothing is stored', () => {
    const { getDisplayName } = loadModule();
    expect(getDisplayName('p1', 'ws1')).toBeNull();
  });

  test('returns the stored name after setDisplayName', () => {
    const { setDisplayName, getDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    expect(getDisplayName('p1', 'ws1')).toBe('Chase');
  });

  test('isolates by workspaceId', () => {
    const { setDisplayName, getDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    setDisplayName('p1', 'ws2', 'Nate');
    expect(getDisplayName('p1', 'ws1')).toBe('Chase');
    expect(getDisplayName('p1', 'ws2')).toBe('Nate');
  });

  test('returns null for a panelId never set', () => {
    const { setDisplayName, getDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    expect(getDisplayName('p999', 'ws1')).toBeNull();
  });
});

describe('panelDisplayName.setDisplayName', () => {
  test('accepts a valid name and returns { ok: true }', () => {
    const { setDisplayName } = loadModule();
    const result = setDisplayName('p1', 'ws1', 'Chase');
    expect(result.ok).toBe(true);
  });

  test('writes the panelId -> name entry to localStorage under devhub:panel-names:<wsId>', () => {
    const { setDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'devhub:panel-names:ws1',
      expect.stringContaining('Chase')
    );
    const stored = JSON.parse(localStorageMock._store.get('devhub:panel-names:ws1'));
    expect(stored.p1).toBe('Chase');
  });

  test('rejects empty string with { ok: false, error: "empty-name" }', () => {
    const { setDisplayName } = loadModule();
    const result = setDisplayName('p1', 'ws1', '');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty-name');
  });

  test('rejects whitespace-only string with { ok: false, error: "empty-name" }', () => {
    const { setDisplayName } = loadModule();
    const result = setDisplayName('p1', 'ws1', '   ');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty-name');
  });

  test('rejects names > 24 chars with { ok: false, error: "invalid-name" }', () => {
    const { setDisplayName } = loadModule();
    const result = setDisplayName('p1', 'ws1', 'a'.repeat(25));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid-name');
  });

  test('rejects names with disallowed chars (space, dot, slash)', () => {
    const { setDisplayName } = loadModule();
    expect(setDisplayName('p1', 'ws1', 'Panel 1').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', 'panel.one').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', 'panel/one').ok).toBe(false);
  });

  test('rejects case-insensitive collision against other panels in the same workspace', () => {
    const { setDisplayName } = loadModule();
    expect(setDisplayName('p1', 'ws1', 'Chase').ok).toBe(true);
    const result = setDisplayName('p2', 'ws1', 'chase');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('name-in-use');
  });

  test('allows re-setting the same panelId to the same name (no self-collision)', () => {
    const { setDisplayName } = loadModule();
    expect(setDisplayName('p1', 'ws1', 'Chase').ok).toBe(true);
    expect(setDisplayName('p1', 'ws1', 'Chase').ok).toBe(true);
  });

  test('allows the same name in a different workspace', () => {
    const { setDisplayName } = loadModule();
    expect(setDisplayName('p1', 'ws1', 'Chase').ok).toBe(true);
    expect(setDisplayName('p1', 'ws2', 'Chase').ok).toBe(true);
  });

  test('does not write to localStorage on rejection', () => {
    const { setDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    localStorageMock.setItem.mockClear();
    const result = setDisplayName('p2', 'ws1', 'chase');
    expect(result.ok).toBe(false);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe('panelDisplayName.removeDisplayName', () => {
  test('removes a stored entry so getDisplayName returns null', () => {
    const { setDisplayName, removeDisplayName, getDisplayName } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    removeDisplayName('p1', 'ws1');
    expect(getDisplayName('p1', 'ws1')).toBeNull();
  });

  test('removing a non-existent entry is a no-op (does not throw)', () => {
    const { removeDisplayName } = loadModule();
    expect(() => removeDisplayName('p404', 'ws1')).not.toThrow();
  });
});

describe('panelDisplayName.usedNamesInWorkspace', () => {
  test('returns an empty Set when nothing is stored', () => {
    const { usedNamesInWorkspace } = loadModule();
    const result = usedNamesInWorkspace('ws1');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  test('returns the stored names (lowercased) for the workspace', () => {
    const { setDisplayName, usedNamesInWorkspace } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    setDisplayName('p2', 'ws1', 'Nate');
    const used = usedNamesInWorkspace('ws1');
    expect(used.size).toBe(2);
    expect(used.has('chase')).toBe(true);
    expect(used.has('nate')).toBe(true);
  });
});

describe('panelDisplayName.nextDisplayNameForPanel', () => {
  test('skips used names and returns the first available pool entry', () => {
    const { setDisplayName, nextDisplayNameForPanel } = loadModule();
    setDisplayName('p1', 'ws1', 'Chase');
    setDisplayName('p2', 'ws1', 'Nate');
    // After Chase + Nate, the next alphabetical pool entry is the
    // first pool entry that is not in { chase, nate }.
    const next = nextDisplayNameForPanel('ws1');
    expect(typeof next).toBe('string');
    expect(next.toLowerCase()).not.toBe('chase');
    expect(next.toLowerCase()).not.toBe('nate');
  });

  test('returns Panel-N when the pool is exhausted', () => {
    const { setDisplayName, nextDisplayNameForPanel, DISPLAY_NAME_POOL } = loadModule();
    // Exhaust the pool by inserting 30 names that lowercase-collide with
    // every pool entry.
    const pool = DISPLAY_NAME_POOL;
    pool.forEach((name, idx) => {
      setDisplayName(`p${idx}`, 'ws1', name);
    });
    const fallback = nextDisplayNameForPanel('ws1');
    expect(fallback).toMatch(/^Panel-\d+$/);
  });
});

describe('panelDisplayName SSR safety', () => {
  test('getDisplayName returns null when window is undefined', () => {
    // Re-require fresh, then delete window to simulate SSR.
    const { getDisplayName } = require('./panelDisplayName');
    const savedWindow = globalThis.window;
    delete globalThis.window;
    try {
      expect(getDisplayName('p1', 'ws1')).toBeNull();
    } finally {
      if (typeof savedWindow !== 'undefined') globalThis.window = savedWindow;
    }
  });

  test('setDisplayName is a no-op (returns ok) when window is undefined', () => {
    const { setDisplayName } = require('./panelDisplayName');
    const savedWindow = globalThis.window;
    delete globalThis.window;
    try {
      const result = setDisplayName('p1', 'ws1', 'Chase');
      expect(result.ok).toBe(true);
    } finally {
      if (typeof savedWindow !== 'undefined') globalThis.window = savedWindow;
    }
  });
});

/**
 * Unit tests for src/lib/suggestions/cache.js
 * TDD — tests written BEFORE implementation
 *
 * Tests: get/set/invalidate, TTL expiry, key prefix, browser-only guard.
 * Uses a manual localStorage mock.
 */

// ── localStorage mock ─────────────────────────────────────────────────────

function makeLocalStorageMock() {
  const store = {};
  return {
    getItem(key) {
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    _store: store,
  };
}

// We inject the mock into global before requiring the module
global.localStorage = makeLocalStorageMock();

// Require after setting up global mock
const cache = require('../../../src/lib/suggestions/cache');

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSuggestions(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s-${i}`,
    title: `Suggestion ${i}`,
    description: 'desc',
    type: 'tip',
    action_hint: 'hint',
  }));
}

const TTL_MS = 30 * 60 * 1000; // 30 min

// ── Tests ─────────────────────────────────────────────────────────────────

describe('cache — set + get', () => {
  beforeEach(() => {
    global.localStorage = makeLocalStorageMock();
  });

  test('set + get immediately returns stored suggestions', () => {
    const { get, set } = cache;
    const suggestions = makeSuggestions(3);
    set('proj-1', suggestions);
    const result = get('proj-1');
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('s-0');
  });

  test('get returns null for missing key', () => {
    const { get } = cache;
    const result = get('non-existent-project');
    expect(result).toBeNull();
  });

  test('different projectIds are isolated', () => {
    const { get, set } = cache;
    set('proj-a', makeSuggestions(1));
    set('proj-b', makeSuggestions(3));

    const a = get('proj-a');
    const b = get('proj-b');
    expect(a).not.toBeNull();
    expect(a.length).toBe(1);
    expect(b).not.toBeNull();
    expect(b.length).toBe(3);
  });
});

describe('cache — key prefix', () => {
  beforeEach(() => {
    global.localStorage = makeLocalStorageMock();
  });

  test('uses correct key prefix ss_{projectId}', () => {
    const mockStorage = makeLocalStorageMock();
    global.localStorage = mockStorage;
    const { set } = cache;
    set('my-project', makeSuggestions(1));
    const keys = Object.keys(mockStorage._store);
    expect(keys.length).toBe(1);
    expect(keys[0]).toBe('ss_my-project');
  });
});

describe('cache — TTL', () => {
  beforeEach(() => {
    global.localStorage = makeLocalStorageMock();
  });

  test('get returns null after TTL expires (31 minutes)', () => {
    const { get } = cache;
    const suggestions = makeSuggestions(2);

    // Simulate entry stored 31 minutes ago
    const expiredEntry = {
      ts: Date.now() - (TTL_MS + 60 * 1000), // 31 min ago
      data: suggestions,
    };
    global.localStorage.setItem('ss_proj-expired', JSON.stringify(expiredEntry));

    const result = get('proj-expired');
    expect(result).toBeNull();
  });

  test('get returns data when TTL is still valid (29 minutes old)', () => {
    const { get } = cache;
    const suggestions = makeSuggestions(2);

    // Simulate entry stored 29 minutes ago
    const validEntry = {
      ts: Date.now() - (TTL_MS - 60 * 1000), // 29 min ago
      data: suggestions,
    };
    global.localStorage.setItem('ss_proj-valid', JSON.stringify(validEntry));

    const result = get('proj-valid');
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
  });
});

describe('cache — invalidate', () => {
  beforeEach(() => {
    global.localStorage = makeLocalStorageMock();
  });

  test('invalidate makes get return null', () => {
    const { get, set, invalidate } = cache;
    const suggestions = makeSuggestions(2);
    set('proj-inv', suggestions);

    // Confirm it's there
    expect(get('proj-inv')).not.toBeNull();

    invalidate('proj-inv');
    expect(get('proj-inv')).toBeNull();
  });

  test('invalidate on missing key does not throw', () => {
    const { invalidate } = cache;
    expect(() => invalidate('never-set-project')).not.toThrow();
  });
});

describe('cache — error handling', () => {
  beforeEach(() => {
    global.localStorage = makeLocalStorageMock();
  });

  test('get returns null for malformed JSON in localStorage', () => {
    const { get } = cache;
    global.localStorage.setItem('ss_broken', 'not-valid-json{{{');
    const result = get('broken');
    expect(result).toBeNull();
  });
});

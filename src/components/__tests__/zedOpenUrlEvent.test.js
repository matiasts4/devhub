/**
 * T-WSR-zed-003 (slice 3, ZEB-003/ZEB-004/ZEB-005/ZEB-006): unit tests
 * for the new `devhub:zed-open-url` helper module.
 *
 * Spec coverage (tasks.md 1.3):
 *   - `isValidZedOpenUrlEvent({ url: 'https://x' })` → true
 *   - `isValidZedOpenUrlEvent({ url: 'javascript:alert(1)' })` → false
 *     (rejected by `isSafeHttpUrl`)
 *   - `isValidZedOpenUrlEvent(null)` → false
 *   - `resolveZedOpenUrlBrowserShape({ label: 'repo' })` → 'repo'
 *   - `resolveZedOpenUrlBrowserShape({})` → null
 *
 * Pattern mirrors `zedOpenTerminalEvent.test.js` (Jest + JSDOM, no
 * module-level `window` access in the helper itself).
 */

const {
  isValidZedOpenUrlEvent,
  resolveZedOpenUrlBrowserShape,
  dispatchZedOpenUrl,
} = require('../zedOpenUrlEvent.js');

describe('isValidZedOpenUrlEvent (T-WSR-zed-003)', () => {
  test('accepts { url: "https://x" } (https scheme)', () => {
    expect(isValidZedOpenUrlEvent({ url: 'https://x' })).toBe(true);
  });

  test('rejects { url: "javascript:alert(1)" } (unsafe scheme)', () => {
    expect(isValidZedOpenUrlEvent({ url: 'javascript:alert(1)' })).toBe(false);
  });

  test('rejects null detail', () => {
    expect(isValidZedOpenUrlEvent(null)).toBe(false);
  });

  test('rejects undefined detail', () => {
    expect(isValidZedOpenUrlEvent(undefined)).toBe(false);
  });

  test('rejects { url: "not-a-url" } (malformed)', () => {
    expect(isValidZedOpenUrlEvent({ url: 'not-a-url' })).toBe(false);
  });

  test('rejects { } (no url field)', () => {
    expect(isValidZedOpenUrlEvent({})).toBe(false);
  });
});

describe('resolveZedOpenUrlBrowserShape (T-WSR-zed-003)', () => {
  test('returns "repo" for { label: "repo" }', () => {
    expect(resolveZedOpenUrlBrowserShape({ label: 'repo' })).toBe('repo');
  });

  test('returns null for {} (no label)', () => {
    expect(resolveZedOpenUrlBrowserShape({})).toBeNull();
  });

  test('returns null for null detail', () => {
    expect(resolveZedOpenUrlBrowserShape(null)).toBeNull();
  });

  test('returns null for empty-string label (defensive)', () => {
    expect(resolveZedOpenUrlBrowserShape({ label: '' })).toBeNull();
  });

  test('returns null for non-string label (defensive)', () => {
    expect(resolveZedOpenUrlBrowserShape({ label: 42 })).toBeNull();
  });
});

describe('dispatchZedOpenUrl (T-WSR-zed-003, ZEB-005/ZEB-006)', () => {
  let savedWindow;

  beforeEach(() => {
    savedWindow = global.window;
  });

  afterEach(() => {
    if (savedWindow === undefined) {
      delete global.window;
    } else {
      global.window = savedWindow;
    }
  });

  test('SSR: window === undefined → no throw, no error', () => {
    // The helper MUST be SSR-safe (ZEB-006). Removing `window` simulates
    // a Node.js / Server Component runtime. The helper is a no-op.
    delete global.window;
    expect(() => dispatchZedOpenUrl({ url: 'https://x' })).not.toThrow();
  });

  test('happy path: window defined → exactly one CustomEvent "devhub:zed-open-url" with the right detail', () => {
    // JSDOM exposes a `window`; the test file is run under node + jsdom
    // because the file lives in src/components/__tests__/ and is matched
    // by jest.config.js (default node testEnvironment). To get a real
    // `window` + `CustomEvent` for this test, we attach a tiny JSDOM
    // window via the shared installDom helper.
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.CustomEvent = dom.window.CustomEvent;

    const dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');

    dispatchZedOpenUrl({ url: 'https://github.com/foo/bar', label: 'repo', focus: true });

    const calls = dispatchSpy.mock.calls.filter(
      (call) => call[0] && call[0].type === 'devhub:zed-open-url'
    );
    expect(calls).toHaveLength(1);
    const ev = calls[0][0];
    expect(ev).toBeInstanceOf(dom.window.CustomEvent);
    expect(ev.detail).toEqual({
      url: 'https://github.com/foo/bar',
      label: 'repo',
      focus: true,
    });

    dispatchSpy.mockRestore();
    delete global.CustomEvent;
    dom.window.close();
  });

  test('invalid URL: dispatchZedOpenUrl does NOT call window.dispatchEvent (silently dropped)', () => {
    // ZEB-005 contract: the helper re-validates and drops malformed
    // payloads so a misbehaving caller (e.g. a future dispatch site that
    // forgets the isSafeHttpUrl pre-check) cannot leak a `javascript:`
    // URL into the event bus.
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.CustomEvent = dom.window.CustomEvent;

    const dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');

    dispatchZedOpenUrl({ url: 'javascript:alert(1)' });
    expect(dispatchSpy).not.toHaveBeenCalled();

    dispatchSpy.mockRestore();
    delete global.CustomEvent;
    dom.window.close();
  });
});

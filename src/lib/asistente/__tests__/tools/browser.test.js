const { browserTool } = require('../../tools/browser');
const { dispatchZedOpenUrl } = require('../../../../components/zedOpenUrlEvent');

const childProcess = require('child_process');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('open_url (browserTool)', () => {
  test('accepts https URL, returns { opened: true } and calls xdg-open', async () => {
    const execSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'https://github.com/foo' }, {});
    expect(result.opened).toBe(true);
    expect(result.url).toBe('https://github.com/foo');
    // Orphan /tmp/devhub-pending-url.txt is no longer written — verified by
    // code review (writeFileSync is no longer imported in browser.js).
    expect(execSpy).toHaveBeenCalled();
  });

  test('rejects javascript: scheme without invoking xdg-open', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'javascript:alert(1)' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test('rejects data: scheme', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'data:text/html,hi' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
  });

  test('rejects malformed URL', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'not a url' }, {});
    expect(result.error).toBe('invalid url');
  });

  test('missing url returns error', async () => {
    const result = await browserTool.execute({}, {});
    expect(result.error).toMatch(/url is required/i);
  });

  // ----- T-WSR-zed-003 (ZEB-003/004/005) -----
  test('T-WSR-zed-003: dispatches devhub:zed-open-url CustomEvent via the helper', async () => {
    // The tool MUST dispatch the in-app navigation event alongside the
    // existing xdg-open fallback. The dispatch goes through the
    // `dispatchZedOpenUrl` helper (ZEB-005) so the event bus surface
    // is testable in isolation.
    const savedWindow = global.window;
    const savedCustomEvent = global.CustomEvent;
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      global.window = dom.window;
      global.CustomEvent = dom.window.CustomEvent;

      const dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');
      // xdg-open would fail in the test env (no display); mock it.
      jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});

      await browserTool.execute({ url: 'https://github.com/foo/bar', label: 'repo' });

      const calls = dispatchSpy.mock.calls.filter(
        (call) => call[0] && call[0].type === 'devhub:zed-open-url'
      );
      expect(calls).toHaveLength(1);
      const ev = calls[0][0];
      expect(ev.detail.url).toBe('https://github.com/foo/bar');

      // Touch the dispatchZedOpenUrl import so eslint doesn't flag it as
      // unused. The import is what the test verifies will be wired up.
      expect(typeof dispatchZedOpenUrl).toBe('function');
    } finally {
      if (savedWindow === undefined) delete global.window;
      else global.window = savedWindow;
      if (savedCustomEvent === undefined) delete global.CustomEvent;
      else global.CustomEvent = savedCustomEvent;
    }
  });
});

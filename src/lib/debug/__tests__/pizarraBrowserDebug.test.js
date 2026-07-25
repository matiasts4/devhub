const { JSDOM } = require('jsdom');

describe('pizarraBrowserDebug', () => {
  let dom;
  let mod;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.sessionStorage = dom.window.sessionStorage;
    jest.resetModules();
    mod = require('../pizarraBrowserDebug');
    dom.window.__DEVHUB_PIZARRA_BROWSER_DEBUG__ = true;
    mod.clearPizarraBrowserLogs();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.sessionStorage;
  });

  test('stores trace entries in sessionStorage', () => {
    mod.logPizarraBrowser('test-step', { ok: true });
    const logs = mod.readPizarraBrowserLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].step).toBe('test-step');
    expect(logs[0].ok).toBe(true);
  });
});

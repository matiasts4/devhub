const { JSDOM } = require('jsdom');

describe('terminalSessionDebug', () => {
  let dom;
  let mod;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.sessionStorage = dom.window.sessionStorage;
    jest.resetModules();
    mod = require('../terminalSessionDebug');
    dom.window.__DEVHUB_TERMINAL_SESSION_DEBUG__ = true;
    mod.clearTerminalSessionLogs();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.sessionStorage;
  });

  test('stores trace entries in sessionStorage', () => {
    mod.logTerminalSession('startup-restore-plan', { actionCount: 2 });
    const logs = mod.readTerminalSessionLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].step).toBe('startup-restore-plan');
    expect(logs[0].actionCount).toBe(2);
  });
});

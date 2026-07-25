/**
 * @jest-environment node
 *
 * executeQuickAction — maps registry actions to the correct workspace event.
 *
 * Terminal actions must dispatch `devhub:zed-open-terminal` (command/cwd/focus/
 * displayName). Browser actions must dispatch `devhub:zed-open-url`
 * (url/label/focus). Uses a real JSDOM window to capture the events, mirroring
 * the contract tests in zedOpenTerminalEvent.test.js.
 */

const { executeQuickAction } = require('../executeQuickAction');

function installDom() {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.CustomEvent = dom.window.CustomEvent;
  return dom;
}

function eventsOfType(spy, type) {
  return spy.mock.calls.filter((call) => call[0] && call[0].type === type);
}

describe('executeQuickAction', () => {
  let dom;
  let dispatchSpy;

  beforeEach(() => {
    dom = installDom();
    dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    delete global.window;
    delete global.CustomEvent;
    try {
      dom.window.close();
    } catch {
      // ignore
    }
  });

  test('terminal action with command dispatches devhub:zed-open-terminal', () => {
    const action = {
      id: 'agent-claude',
      type: 'terminal',
      command: 'claude',
      label: 'Claude Code',
    };

    const ok = executeQuickAction(action, { cwd: '/tmp/project' });

    expect(ok).toBe(true);
    const calls = eventsOfType(dispatchSpy, 'devhub:zed-open-terminal');
    expect(calls).toHaveLength(1);
    expect(calls[0][0].detail).toEqual({
      command: 'claude',
      cwd: '/tmp/project',
      focus: false,
      displayName: 'Claude Code',
    });
  });

  test('plain terminal action (command null) dispatches with command null', () => {
    const action = { id: 'terminal-plain', type: 'terminal', command: null, label: 'Terminal' };

    executeQuickAction(action, { cwd: '/tmp/project' });

    const calls = eventsOfType(dispatchSpy, 'devhub:zed-open-terminal');
    expect(calls).toHaveLength(1);
    expect(calls[0][0].detail.command).toBeNull();
    // focus:false → opens as a normal split panel, not zen/focus mode.
    expect(calls[0][0].detail.focus).toBe(false);
  });

  test('browser action dispatches devhub:zed-open-url', () => {
    const action = {
      id: 'browser',
      type: 'browser',
      url: 'https://duckduckgo.com/',
      label: 'Browser',
    };

    const ok = executeQuickAction(action, {});

    expect(ok).toBe(true);
    const calls = eventsOfType(dispatchSpy, 'devhub:zed-open-url');
    expect(calls).toHaveLength(1);
    expect(calls[0][0].detail.url).toBe('https://duckduckgo.com/');
    expect(calls[0][0].detail.focus).toBe(true);
  });

  test('cwd defaults to null when not provided', () => {
    const action = { id: 'terminal-plain', type: 'terminal', command: null, label: 'Terminal' };

    executeQuickAction(action);

    const calls = eventsOfType(dispatchSpy, 'devhub:zed-open-terminal');
    expect(calls[0][0].detail.cwd).toBeNull();
  });

  test('invalid action returns false and dispatches nothing', () => {
    expect(executeQuickAction(null)).toBe(false);
    expect(executeQuickAction({ type: 'unknown' })).toBe(false);
    expect(eventsOfType(dispatchSpy, 'devhub:zed-open-terminal')).toHaveLength(0);
    expect(eventsOfType(dispatchSpy, 'devhub:zed-open-url')).toHaveLength(0);
  });
});

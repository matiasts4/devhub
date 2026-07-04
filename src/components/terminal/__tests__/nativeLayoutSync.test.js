const { JSDOM } = require('jsdom');
const {
  dispatchTerminalLayoutSettled,
  getTerminalLayoutSettledGeneration,
} = require('../nativeLayoutSync.js');

describe('nativeLayoutSync', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.CustomEvent = dom.window.CustomEvent;
    global.document = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.CustomEvent;
    delete global.document;
  });

  test('dispatchTerminalLayoutSettled dispatches with detail', () => {
    const received = [];
    const handler = (event) => received.push(event.detail);
    window.addEventListener('devhub:terminal-layout-settled', handler);

    dispatchTerminalLayoutSettled({ reason: 'test-settle' });

    window.removeEventListener('devhub:terminal-layout-settled', handler);

    expect(received).toHaveLength(1);
    expect(received[0].reason).toBe('test-settle');
    expect(typeof received[0].at).toBe('number');
    expect(typeof received[0].generation).toBe('number');
  });

  test('getTerminalLayoutSettledGeneration increments on each dispatch', () => {
    const before = getTerminalLayoutSettledGeneration();
    dispatchTerminalLayoutSettled({ reason: 'first' });
    const afterFirst = getTerminalLayoutSettledGeneration();
    dispatchTerminalLayoutSettled({ reason: 'second' });
    const afterSecond = getTerminalLayoutSettledGeneration();

    expect(afterFirst).toBe(before + 1);
    expect(afterSecond).toBe(before + 2);
  });
});

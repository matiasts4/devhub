const { JSDOM } = require('jsdom');
const {
  dispatchTerminalLayoutSettled,
  dispatchTerminalSurvivorRecover,
  filterLegacySurvivorPanelIds,
  getTerminalLayoutSettledGeneration,
  scheduleSurvivorRecoverAfterClose,
  SURVIVOR_RECOVER_DELAYS_MS,
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

  test('filterLegacySurvivorPanelIds excludes terminal-engine-v2 panels', () => {
    const engineV2PanelIds = new Set(['p-v2', 'p-v2b']);
    expect(filterLegacySurvivorPanelIds(['p-v1', 'p-v2', 'p-v1b'], engineV2PanelIds)).toEqual([
      'p-v1',
      'p-v1b',
    ]);
    expect(filterLegacySurvivorPanelIds([], engineV2PanelIds)).toEqual([]);
    expect(filterLegacySurvivorPanelIds(['p-v2'], engineV2PanelIds)).toEqual([]);
  });

  test('dispatchTerminalSurvivorRecover dispatches survivor recover event', () => {
    const received = [];
    const handler = (event) => received.push(event.detail);
    window.addEventListener('devhub:terminal-survivor-recover', handler);

    dispatchTerminalSurvivorRecover({ panelIds: ['p1', 'p2'], reason: 'workspace-removed' });

    window.removeEventListener('devhub:terminal-survivor-recover', handler);

    expect(received).toHaveLength(1);
    expect(received[0].panelIds).toEqual(['p1', 'p2']);
    expect(received[0].reason).toBe('workspace-removed');
  });

  test('scheduleSurvivorRecoverAfterClose staggers recover events and can cancel', () => {
    jest.useFakeTimers();
    window.requestAnimationFrame = (cb) => window.setTimeout(cb, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    const received = [];
    window.addEventListener('devhub:terminal-survivor-recover', (event) =>
      received.push(event.detail)
    );
    let lifecycleRuns = 0;
    const cancel = scheduleSurvivorRecoverAfterClose({
      panelIds: ['p1'],
      workspaceId: 'ws-a',
      reason: 'workspace-removed',
      onLifecycleSync: () => {
        lifecycleRuns += 1;
        return () => {
          lifecycleRuns += 10;
        };
      },
    });

    expect(lifecycleRuns).toBe(0);
    jest.runAllTimers();
    expect(lifecycleRuns).toBe(1);
    expect(received).toHaveLength(SURVIVOR_RECOVER_DELAYS_MS.length);
    expect(received.every((d) => d.panelIds.includes('p1'))).toBe(true);

    cancel();
    expect(lifecycleRuns).toBe(11);
    jest.useRealTimers();
  });
});

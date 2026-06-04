const { JSDOM } = require('jsdom');
const {
  dispatchTerminalLayoutSettled,
  dispatchNativeVteWorkspaceSync,
  scheduleNativeSurfaceActivation,
  schedulePostLayoutNativeSync,
} = require('../nativeLayoutSync.js');

describe('nativeLayoutSync', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
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
  });

  test('dispatchNativeVteWorkspaceSync dispatches workspace sync event', () => {
    const received = [];
    const handler = (event) => received.push(event.detail);
    window.addEventListener('devhub:native-vte-workspace-sync', handler);

    dispatchNativeVteWorkspaceSync({ activePanelIds: ['p1'] });

    window.removeEventListener('devhub:native-vte-workspace-sync', handler);

    expect(received).toHaveLength(1);
    expect(received[0].activePanelIds).toEqual(['p1']);
  });

  test('scheduleNativeSurfaceActivation runs sync immediately and returns cleanup', () => {
    const runs = [];
    const cleanup = scheduleNativeSurfaceActivation(() => runs.push(runs.length));

    expect(runs).toEqual([0]);
    cleanup();
  });

  test('schedulePostLayoutNativeSync dispatches layout settled and workspace sync', () => {
    const layoutEvents = [];
    const workspaceEvents = [];

    window.addEventListener('devhub:terminal-layout-settled', (event) =>
      layoutEvents.push(event.detail)
    );
    window.addEventListener('devhub:native-vte-workspace-sync', (event) =>
      workspaceEvents.push(event.detail)
    );

    schedulePostLayoutNativeSync({
      layoutReason: 'internal-split-drag-end',
      workspaceDetail: { activePanelIds: ['p1'], reason: 'internal-split-drag-end' },
    });

    expect(layoutEvents[0].reason).toBe('internal-split-drag-end');
    expect(workspaceEvents[0].activePanelIds).toEqual(['p1']);
  });
});
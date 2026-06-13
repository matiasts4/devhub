const { JSDOM } = require('jsdom');
const {
  dispatchTerminalLayoutSettled,
  dispatchNativeVteWorkspaceSync,
  scheduleNativeSurfaceActivation,
  schedulePostLayoutNativeSync,
  createNativeLayoutSyncQueue,
  isNativeReattachReason,
  NATIVE_REATTACH_REASONS,
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

  test('schedulePostLayoutNativeSync can skip follow-up passes for workspace-switch', () => {
    const layoutEvents = [];

    window.addEventListener('devhub:terminal-layout-settled', (event) =>
      layoutEvents.push(event.detail)
    );

    schedulePostLayoutNativeSync({
      layoutReason: 'workspace-switch',
      workspaceDetail: { activePanelIds: ['p1'], reason: 'workspace-switch' },
      includeFollowUpPasses: false,
    });

    expect(layoutEvents).toHaveLength(1);
    expect(layoutEvents[0].reason).toBe('workspace-switch');
  });

  describe('createNativeLayoutSyncQueue (A.3 serialized IPC)', () => {
    test('isNativeReattachReason recognizes the mode reattach reasons only', () => {
      expect(NATIVE_REATTACH_REASONS).toEqual(['pizarra-mode-enter', 'pizarra-mode-exit']);
      expect(isNativeReattachReason('pizarra-mode-enter')).toBe(true);
      expect(isNativeReattachReason('pizarra-mode-exit')).toBe(true);
      expect(isNativeReattachReason('panel-group-layout')).toBe(false);
    });

    test('applies syncs immediately when not animating (legacy behavior preserved)', () => {
      const applied = [];
      const queue = createNativeLayoutSyncQueue({ apply: (reason) => applied.push(reason) });

      queue.enqueue('panel-group-layout');
      queue.enqueue('workspace-switch');

      expect(applied).toEqual(['panel-group-layout', 'workspace-switch']);
    });

    test('buffers while animating and flushes ordered, with a single final reattach', () => {
      const applied = [];
      const queue = createNativeLayoutSyncQueue({ apply: (reason) => applied.push(reason) });

      // Mode flip begins.
      queue.setAnimating(true);
      // A reattach is requested, and panel-group-layout keeps firing mid-anim.
      queue.enqueue('pizarra-mode-enter');
      queue.enqueue('panel-group-layout');
      queue.enqueue('panel-group-layout'); // coalesced (same reason)
      queue.enqueue('popup-avoid-rects');

      // Nothing applied yet — all buffered.
      expect(applied).toEqual([]);
      expect(queue.isAnimating()).toBe(true);

      queue.flushOnIdle();

      // Non-reattach reasons first (insertion order), reattach LAST and once.
      expect(applied).toEqual([
        'panel-group-layout',
        'popup-avoid-rects',
        'pizarra-mode-enter',
      ]);
      expect(queue.isAnimating()).toBe(false);
      expect(queue._pendingSize()).toBe(0);
    });

    test('multiple reattach reasons collapse to the LAST one seen', () => {
      const applied = [];
      const queue = createNativeLayoutSyncQueue({ apply: (reason) => applied.push(reason) });

      queue.setAnimating(true);
      queue.enqueue('pizarra-mode-enter');
      queue.enqueue('pizarra-mode-exit'); // user toggled back mid-transition
      queue.flushOnIdle();

      const reattachApplied = applied.filter((r) => isNativeReattachReason(r));
      expect(reattachApplied).toEqual(['pizarra-mode-exit']);
    });

    test('cancel() runs the cleanup returned by the last applied sync', () => {
      const cleanup = jest.fn();
      const queue = createNativeLayoutSyncQueue({ apply: () => cleanup });

      queue.enqueue('panel-group-layout');
      queue.enqueue('workspace-switch'); // cancels the previous cleanup first
      expect(cleanup).toHaveBeenCalledTimes(1);

      queue.cancel();
      expect(cleanup).toHaveBeenCalledTimes(2);
    });

    test('flushOnIdle with nothing buffered is a no-op', () => {
      const applied = [];
      const queue = createNativeLayoutSyncQueue({ apply: (reason) => applied.push(reason) });
      queue.setAnimating(true);
      queue.flushOnIdle();
      expect(applied).toEqual([]);
      expect(queue.isAnimating()).toBe(false);
    });
  });
});

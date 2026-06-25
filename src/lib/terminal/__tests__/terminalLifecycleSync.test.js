import { JSDOM } from 'jsdom';
import {
  LIFECYCLE_BURST_PHASES,
  PANEL_LIFECYCLE_REASONS,
  scheduleSwarmProjectionReadyBurst,
  scheduleTerminalLifecycleSync,
  shouldSuppressPanelGroupLayoutOnWindowSwitch,
} from '../terminalLifecycleSync.js';

describe('scheduleTerminalLifecycleSync', () => {
  let dom;
  let rafQueue;
  let rafIdSeq;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    rafQueue = new Map();
    rafIdSeq = 0;
    global.requestAnimationFrame = (callback) => {
      const id = ++rafIdSeq;
      rafQueue.set(id, callback);
      return id;
    };
    global.cancelAnimationFrame = (id) => {
      rafQueue.delete(id);
    };
    jest.useFakeTimers();
  });

  async function flushRafPasses(count = 2) {
    for (let pass = 0; pass < count; pass += 1) {
      const callbacks = [...rafQueue.values()];
      rafQueue.clear();
      callbacks.forEach((callback) => callback(performance.now()));
      await Promise.resolve();
    }
  }

  afterEach(() => {
    jest.useRealTimers();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  test('immediate and raf phases fire dispatch with correct reason', async () => {
    const dispatch = jest.fn();
    const notifyNative = jest.fn();

    scheduleTerminalLifecycleSync({
      reason: PANEL_LIFECYCLE_REASONS.SWARM_LAUNCH,
      workspaceId: 'ws-1',
      panelIds: ['p1', 'p2'],
      phases: { delayMs: [] },
      notifyNative,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      reason: 'swarm-launch',
      workspaceId: 'ws-1',
      panelIds: ['p1', 'p2'],
      phase: 'immediate',
    });
    expect(notifyNative).toHaveBeenCalledWith('swarm-launch');

    await flushRafPasses(2);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({
      reason: 'swarm-launch',
      workspaceId: 'ws-1',
      panelIds: ['p1', 'p2'],
      phase: 'raf',
    });
  });

  test('cleanup cancels pending timers and raf passes', async () => {
    const dispatch = jest.fn();

    const cleanup = scheduleTerminalLifecycleSync({
      reason: PANEL_LIFECYCLE_REASONS.PANEL_CLOSED,
      workspaceId: 'ws-2',
      panelIds: ['p3'],
      phases: { delayMs: [120, 340] },
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].phase).toBe('immediate');

    cleanup();

    await flushRafPasses(2);
    jest.runAllTimers();

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('empty panelIds returns noop cleanup', () => {
    const dispatch = jest.fn();

    const cleanup = scheduleTerminalLifecycleSync({
      reason: PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
      workspaceId: 'ws-3',
      panelIds: [],
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  test('PANEL_LIFECYCLE_REASONS exposes lifecycle reason strings', () => {
    expect(PANEL_LIFECYCLE_REASONS).toEqual({
      SWARM_LAUNCH: 'swarm-launch',
      WORKSPACE_CREATED: 'workspace-created',
      PANEL_CLOSED: 'panel-closed',
      PANEL_SPLIT: 'panel-split',
      PANEL_RELAUNCH: 'panel-relaunch',
      PANEL_FOCUS: 'panel-focus-toggle',
      PANEL_GROUP_LAYOUT: 'panel-group-layout',
      WORKSPACE_REMOVED: 'workspace-removed',
      WORKSPACE_WINDOW_SWITCH: 'workspace-window-switch',
    });
  });

  test('WORKSPACE_CREATED burst phases match workspace modal bootstrap contract', () => {
    expect(LIFECYCLE_BURST_PHASES[PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED]).toEqual({
      immediate: true,
      raf: true,
      delayMs: [],
    });
  });

  test('LIFECYCLE_BURST_PHASES defines presets for each lifecycle reason', () => {
    expect(LIFECYCLE_BURST_PHASES['swarm-launch'].delayMs).toEqual([120, 340]);
    expect(LIFECYCLE_BURST_PHASES['workspace-created'].delayMs).toEqual([]);
    expect(LIFECYCLE_BURST_PHASES['panel-focus-toggle'].delayMs).toEqual([120, 340]);
    expect(LIFECYCLE_BURST_PHASES['panel-group-layout'].delayMs).toEqual([120, 340, 500]);
    expect(LIFECYCLE_BURST_PHASES['panel-closed'].delayMs).toEqual([120, 340]);
    expect(LIFECYCLE_BURST_PHASES['workspace-removed'].raf).toBe(false);
    expect(LIFECYCLE_BURST_PHASES['workspace-window-switch']).toEqual({
      immediate: true,
      raf: true,
      delayMs: [80, 180, 340],
    });
  });

  test('scheduleSwarmProjectionReadyBurst emits projection-ready reasons for all panelIds', async () => {
    const dispatch = jest.fn();

    scheduleSwarmProjectionReadyBurst({
      workspaceId: 'ws-swarm',
      panelIds: ['p1', 'p2', 'p3'],
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith({
      reason: 'shared-surface-projection-ready',
      workspaceId: 'ws-swarm',
      panelIds: ['p1', 'p2', 'p3'],
      phase: 'immediate',
    });

    await flushRafPasses(2);
    jest.runAllTimers();

    const reasons = dispatch.mock.calls.map((call) => call[0].reason);
    expect(reasons).toContain('shared-surface-projection-ready-raf');
    expect(reasons).toContain('shared-surface-projection-ready-delay');
  });
});

describe('shouldSuppressPanelGroupLayoutOnWindowSwitch', () => {
  test('suppresses panel-group-layout sync during the window-switch grace window', () => {
    expect(shouldSuppressPanelGroupLayoutOnWindowSwitch(1000, 1320)).toBe(true);
    expect(shouldSuppressPanelGroupLayoutOnWindowSwitch(1320, 1320)).toBe(false);
    expect(shouldSuppressPanelGroupLayoutOnWindowSwitch(1500, 1320)).toBe(false);
  });
});

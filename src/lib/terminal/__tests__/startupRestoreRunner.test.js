const { JSDOM } = require('jsdom');
const { RESTORE_ACTION } = require('../startupRestoreCoordinator');
const {
  dispatchStartupRestoreQueue,
  shouldBumpRelaunchCommand,
  buildOpenCodeResumeCommand,
  waitForRestoreMutexClear,
  shouldRunStartupRestoreThisPageLoad,
  markStartupRestoreCompletedForSession,
  STARTUP_RESTORE_SESSION_KEY,
} = require('../startupRestoreRunner');
const {
  markPanelInitialCommandDispatched,
  clearPanelInitialCommandLifecycle,
} = require('../panelInitialCommandLifecycle');

describe('startupRestoreRunner', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });
    global.window = dom.window;
    global.localStorage = dom.window.localStorage;
    global.sessionStorage = dom.window.sessionStorage;
    global.localStorage.clear();
    global.sessionStorage.clear();
  });

  afterEach(() => {
    global.window?.close?.();
    delete global.window;
    delete global.localStorage;
    delete global.sessionStorage;
  });

  test('shouldRunStartupRestoreThisPageLoad skips after session is marked completed', () => {
    expect(shouldRunStartupRestoreThisPageLoad(global.sessionStorage)).toBe(true);
    markStartupRestoreCompletedForSession(global.sessionStorage);
    expect(shouldRunStartupRestoreThisPageLoad(global.sessionStorage)).toBe(false);
    expect(global.sessionStorage.getItem(STARTUP_RESTORE_SESSION_KEY)).toBe('1');
  });

  test('shouldBumpRelaunchCommand is false when command already matches', () => {
    expect(shouldBumpRelaunchCommand('opencode --session abc', 'opencode --session abc')).toBe(
      false
    );
  });

  test('buildOpenCodeResumeCommand prefers panel command', () => {
    expect(
      buildOpenCodeResumeCommand(
        { initialCommand: 'opencode --session panel-1' },
        { opencodeSessionId: 'fallback' }
      )
    ).toBe('opencode --session panel-1');
  });

  test('buildOpenCodeResumeCommand returns null for swarm panels', () => {
    expect(
      buildOpenCodeResumeCommand(
        {
          initialCommand: 'bash /tmp/devhub-launch-launch-abc-coder.sh',
          swarmContext: { isSwarmRole: true, launchId: 'launch-abc', roleKey: 'coder' },
        },
        { sessionKind: 'swarm' }
      )
    ).toBeNull();
  });

  test('dispatchStartupRestoreQueue skips relaunch when inject intent already satisfied', async () => {
    clearPanelInitialCommandLifecycle('p1');
    markPanelInitialCommandDispatched('p1', 'opencode --session oc-1');
    const relaunched = [];
    const panel = { id: 'p1', initialCommand: 'opencode --session oc-1', cwd: '/tmp' };

    await dispatchStartupRestoreQueue({
      actions: [
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'p1',
          opencodeSessionId: 'oc-1',
        },
      ],
      getPanel: () => panel,
      onRelaunch: async (action) => {
        relaunched.push(action.terminalId);
      },
      delayMs: 0,
    });

    expect(relaunched).toEqual([]);
  });

  test('dispatchStartupRestoreQueue runs relaunches with bounded concurrency', async () => {
    // Clear any dispatch lifecycle marks left by earlier tests in this file —
    // otherwise the inject-intent gate skips the relaunch as already satisfied.
    clearPanelInitialCommandLifecycle('p1');
    clearPanelInitialCommandLifecycle('p2');
    const relaunched = [];
    const panel = { id: 'p1', initialCommand: null, cwd: '/tmp' };

    await dispatchStartupRestoreQueue({
      actions: [
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'p1',
          opencodeSessionId: 'oc-1',
        },
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'p2',
          opencodeSessionId: 'oc-2',
        },
      ],
      getPanel: (id) => (id === 'p1' ? panel : { id: 'p2', initialCommand: null }),
      onRelaunch: async (action) => {
        relaunched.push(action.terminalId);
      },
      maxConcurrency: 1,
      delayMs: 0,
    });

    expect(relaunched).toEqual(['p1', 'p2']);
  });

  test('dispatchStartupRestoreQueue relaunches active workspace panels first', async () => {
    ['w1', 'w2', 'w3'].forEach(clearPanelInitialCommandLifecycle);
    const relaunched = [];
    const panels = {
      w1: { id: 'w1', initialCommand: null, cwd: '/tmp' },
      w2: { id: 'w2', initialCommand: null, cwd: '/tmp' },
      w3: { id: 'w3', initialCommand: null, cwd: '/tmp' },
    };

    await dispatchStartupRestoreQueue({
      actions: [
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'w1',
          workspaceId: 'ws-other',
          opencodeSessionId: 'oc-w1',
        },
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'w2',
          workspaceId: 'ws-active',
          opencodeSessionId: 'oc-w2',
        },
        {
          action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
          terminalId: 'w3',
          workspaceId: 'ws-other',
          opencodeSessionId: 'oc-w3',
        },
      ],
      activeWorkspaceId: 'ws-active',
      getPanel: (id) => panels[id],
      onRelaunch: async (action) => {
        relaunched.push(action.terminalId);
      },
      maxConcurrency: 1,
      delayMs: 0,
    });

    expect(relaunched).toEqual(['w2', 'w1', 'w3']);
  });

  test('waitForRestoreMutexClear resolves when mutex is absent', async () => {
    const cleared = await waitForRestoreMutexClear(global.localStorage, {
      timeoutMs: 500,
      pollMs: 50,
    });
    expect(cleared).toBe(true);
  });
});

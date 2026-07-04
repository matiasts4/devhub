const { spawnSync } = require('child_process');

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 0 })),
}));

jest.mock('os', () => ({
  homedir: () => '/mock-home',
  platform: () => 'linux',
}));

const {
  resolvePanelTmuxSessionName,
  killPanelTmuxSessionBestEffort,
  abortOpenCodeSessionBestEffort,
  teardownPanelSessionProcesses,
} = require('../panelSessionTeardown.js');

describe('panelSessionTeardown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  test('resolvePanelTmuxSessionName prefers explicit tmuxSession', () => {
    expect(resolvePanelTmuxSessionName({ tmuxSession: 'devhub-p9', id: 'p1' })).toBe('devhub-p9');
  });

  test('resolvePanelTmuxSessionName falls back to panel id', () => {
    expect(resolvePanelTmuxSessionName({ id: 'p12' })).toBe('devhub-p12');
  });

  test('killPanelTmuxSessionBestEffort issues tmux kill-session', () => {
    const killed = killPanelTmuxSessionBestEffort(
      { id: 'p3', tmuxSession: 'devhub-p3' },
      { hasTmux: () => true, spawnSyncImpl: spawnSync }
    );

    expect(killed).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'devhub-p3'], {
      stdio: 'ignore',
      timeout: 5000,
    });
  });

  test('abortOpenCodeSessionBestEffort posts to the local OpenCode abort endpoint', () => {
    abortOpenCodeSessionBestEffort('oc-panel-1', { fetchImpl: global.fetch });

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4154/session/oc-panel-1/abort', {
      method: 'POST',
    });
  });

  test('teardownPanelSessionProcesses aborts OpenCode and kills tmux', () => {
    teardownPanelSessionProcesses(
      { id: 'p7', tmuxSession: 'devhub-p7', opencodeSessionId: 'oc-7' },
      { hasTmux: () => true, spawnSyncImpl: spawnSync, fetchImpl: global.fetch }
    );

    expect(global.fetch).toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'devhub-p7'], {
      stdio: 'ignore',
      timeout: 5000,
    });
  });

  test('teardownPanelSessionProcesses does not block on process-tree cleanup', () => {
    const start = Date.now();
    teardownPanelSessionProcesses(
      { id: 'p8', tmuxSession: 'devhub-p8', opencodeSessionId: 'oc-8', ptyPid: 1234 },
      { hasTmux: () => true, spawnSyncImpl: spawnSync, fetchImpl: global.fetch }
    );
    const elapsed = Date.now() - start;

    // The function must return immediately; the async grace-period sleep
    // happens in the background and must not freeze this call.
    expect(elapsed).toBeLessThan(50);
    // Only tmux kill should have run synchronously, not pgrep/process kill.
    const tmuxCalls = spawnSync.mock.calls.filter(([cmd]) => cmd === 'tmux');
    expect(tmuxCalls.length).toBeGreaterThanOrEqual(1);
    const processTreeCalls = spawnSync.mock.calls.filter(([cmd]) => cmd === 'pgrep');
    expect(processTreeCalls.length).toBe(0);
  });
});

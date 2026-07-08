'use strict';

const { spawnSync } = require('child_process');

jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const child = {
      unref: jest.fn(),
      on: jest.fn(),
    };
    return child;
  }),
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
  resolveSessionKillPid,
  killProcessTreeBestEffort,
} = require('../panelSessionTeardown.js');

const { spawn } = require('child_process');

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

  test('resolveSessionKillPid prefers ptyPid then nested pids', () => {
    expect(resolveSessionKillPid({ ptyPid: 42 })).toBe(42);
    expect(resolveSessionKillPid({ pty: { pid: 99 } })).toBe(99);
    expect(resolveSessionKillPid({ ptyProcess: { pid: 7 } })).toBe(7);
    expect(resolveSessionKillPid({})).toBeNull();
  });

  test('killPanelTmuxSessionBestEffort issues non-blocking tmux kill-session', () => {
    const killed = killPanelTmuxSessionBestEffort(
      { id: 'p3', tmuxSession: 'devhub-p3' },
      { hasTmux: () => true, spawnImpl: spawn }
    );
    expect(killed).toBe(true);
    expect(spawn).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'devhub-p3'], {
      stdio: 'ignore',
      detached: true,
    });
  });

  test('abortOpenCodeSessionBestEffort posts to the local OpenCode abort endpoint', () => {
    abortOpenCodeSessionBestEffort('oc-panel-1', { fetchImpl: global.fetch });
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4154/session/oc-panel-1/abort', {
      method: 'POST',
    });
  });

  test('teardownPanelSessionProcesses does not block on process-tree cleanup', () => {
    const start = Date.now();
    teardownPanelSessionProcesses(
      { id: 'p8', tmuxSession: 'devhub-p8', opencodeSessionId: 'oc-8', ptyPid: 1234 },
      { hasTmux: () => true, spawnSyncImpl: spawnSync, fetchImpl: global.fetch }
    );
    const elapsed = Date.now() - start;
    // Must return immediately; tmux + process-tree kill run on setImmediate.
    expect(elapsed).toBeLessThan(50);
    expect(global.fetch).toHaveBeenCalled();
    // Nothing synchronous for process tree / tmux at call time.
    const processTreeCalls = spawnSync.mock.calls.filter(
      ([cmd]) => cmd === 'pgrep' || cmd === 'taskkill'
    );
    expect(processTreeCalls.length).toBe(0);
  });

  test('killProcessTreeBestEffort hard-kills with SIGKILL on Unix', () => {
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    spawnSync.mockImplementation((cmd) => {
      if (cmd === 'pgrep') return { status: 1, stdout: '' };
      return { status: 0 };
    });

    const ok = killProcessTreeBestEffort(4242, { spawnSyncImpl: spawnSync });
    expect(ok).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(killSpy).toHaveBeenCalledWith(4242, 'SIGKILL');
    // No SIGTERM path — immediate hard kill only.
    expect(killSpy.mock.calls.some(([, signal]) => signal === 'SIGTERM')).toBe(false);

    killSpy.mockRestore();
  });
});

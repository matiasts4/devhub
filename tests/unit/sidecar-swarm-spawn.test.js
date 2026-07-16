// buildSidecarSpawnConfig branches on os.platform() and probes `tmux -V`.
// Pin both to the Linux+tmux contract so the test is deterministic on any
// host (on Windows the real code disables tmux entirely — that branch is
// covered implicitly by production, not asserted here).
jest.mock('os', () => {
  const actual = jest.requireActual('os');
  return { ...actual, platform: () => 'linux' };
});
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawnSync: (cmd, ...rest) => (cmd === 'tmux' ? { status: 0 } : actual.spawnSync(cmd, ...rest)),
  };
});

const {
  buildSidecarSpawnConfig,
  buildSwarmTmuxSessionName,
} = require('../../sidecar-backend/sessionSpawn');

describe('sidecar swarm tmux spawn', () => {
  test('buildSwarmTmuxSessionName matches DevHub swarm convention', () => {
    expect(buildSwarmTmuxSessionName('launch-81dbeafb', 'director')).toBe(
      'devhub-swarm-launch-81dbeafb-director'
    );
  });

  test('swarm panels spawn into a named tmux session with DEVHUB_TMUX_SESSION', () => {
    const config = buildSidecarSpawnConfig({
      sessionId: 'p10198',
      cwd: '/tmp/worktree/director',
      isSwarmRole: true,
      launchId: 'launch-81dbeafb',
      roleKey: 'director',
      env: { SHELL: '/usr/bin/zsh', HOME: '/home/tester' },
    });

    expect(config.tmuxSession).toBe('devhub-swarm-launch-81dbeafb-director');
    expect(config.env.DEVHUB_TMUX_SESSION).toBe('devhub-swarm-launch-81dbeafb-director');
    expect(config.args).toEqual(
      expect.arrayContaining([
        '-lc',
        expect.stringContaining("tmux new-session -A -s 'devhub-swarm-launch-81dbeafb-director'"),
      ])
    );
  });

  test('non-swarm panels keep plain shell spawn', () => {
    const config = buildSidecarSpawnConfig({
      sessionId: 'p10203',
      cwd: '/home/tester',
      isSwarmRole: false,
      env: { SHELL: '/usr/bin/zsh', HOME: '/home/tester' },
    });

    expect(config.tmuxSession).toBeNull();
    expect(config.args).toEqual([]);
    expect(config.env.DEVHUB_TMUX_SESSION).toBeUndefined();
  });

  test('shell env strips sidecar --max-old-space-size but keeps other NODE_OPTIONS', () => {
    const config = buildSidecarSpawnConfig({
      sessionId: 'p10204',
      cwd: '/home/tester',
      isSwarmRole: false,
      env: {
        SHELL: '/usr/bin/zsh',
        HOME: '/home/tester',
        NODE_OPTIONS: '--max-old-space-size=384 --trace-warnings',
      },
    });

    expect(config.env.NODE_OPTIONS).toBe('--trace-warnings');
  });

  test('shell env removes NODE_OPTIONS entirely when only --max-old-space-size was set', () => {
    const config = buildSidecarSpawnConfig({
      sessionId: 'p10205',
      cwd: '/home/tester',
      isSwarmRole: false,
      env: {
        SHELL: '/usr/bin/zsh',
        HOME: '/home/tester',
        NODE_OPTIONS: '--max-old-space-size=384',
      },
    });

    expect(config.env.NODE_OPTIONS).toBeUndefined();
  });
});

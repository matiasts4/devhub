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
});

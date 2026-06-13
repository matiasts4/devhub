const {
  inferPanelSessionKind,
  isSwarmLaunchWrapperCommand,
  buildSwarmTmuxAttachCommand,
} = require('../restorePolicyResolver');

describe('restorePolicyResolver swarm helpers', () => {
  test('detects swarm launch wrapper commands', () => {
    expect(isSwarmLaunchWrapperCommand('bash /tmp/devhub-launch-launch-abc-coder.sh')).toBe(true);
    expect(isSwarmLaunchWrapperCommand('opencode --session abc')).toBe(false);
  });

  test('infers swarm session kind from panel swarmContext', () => {
    expect(
      inferPanelSessionKind({
        initialCommand: 'bash /tmp/devhub-launch-launch-abc-director.sh',
        panel: {
          swarmContext: { isSwarmRole: true, launchId: 'launch-abc', roleKey: 'director' },
        },
      })
    ).toBe('swarm');
  });

  test('buildSwarmTmuxAttachCommand composes attach target', () => {
    expect(buildSwarmTmuxAttachCommand('launch-abc', 'devops')).toBe(
      'tmux attach-session -t devhub-swarm-launch-abc-devops'
    );
    expect(buildSwarmTmuxAttachCommand('', 'coder')).toBeNull();
  });
});

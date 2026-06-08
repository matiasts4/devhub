/**
 * Regression tests for visible swarm launch command construction.
 * Verifies the two fixes that unblock OpenCode startup:
 *   1. disableTmuxWrap — panel already has a devhub-swarm-* tmux session
 *   2. interactive bootstrap — OpenCode TUI starts without --prompt
 */

const { buildAgentLaunchCommand } = require('../../src/lib/agentLaunchCommand');

describe('swarm launch inner command', () => {
  test('uses bare opencode when disableTmuxWrap is true (no nested tmux attach)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-director',
      modelId: 'minimax-coding-plan/MiniMax-M2.7',
      tmuxSessionName: 'devhub-swarm-launch-abc-director',
      disableTmuxWrap: true,
      opencodePure: true,
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('/home/matias/.opencode/bin/opencode --pure --agent swarm-director');
    expect(inner).toContain('--model minimax-coding-plan/MiniMax-M2.7');
    expect(inner).not.toContain('--prompt');
    expect(inner).not.toContain('tmux new-session');
    expect(inner).not.toContain('tmux attach-session');
  });

  test('without disableTmuxWrap still wraps in tmux (legacy path)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-coder',
      modelId: 'minimax-coding-plan/MiniMax-M2.7',
      tmuxSessionName: 'devhub-swarm-launch-abc-coder',
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('tmux new-session');
    expect(inner).toContain('tmux attach-session');
  });
});
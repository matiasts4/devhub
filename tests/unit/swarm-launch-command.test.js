/**
 * Regression tests for visible swarm launch command construction.
 * Verifies the two fixes that unblock OpenCode startup:
 *   1. disableTmuxWrap — panel already has a devhub-swarm-* tmux session
 *   2. interactive bootstrap — OpenCode TUI starts without --prompt
 */

const { buildAgentLaunchCommand } = require('../../src/lib/agentLaunchCommand.shared');

describe('swarm launch inner command', () => {
  test('uses bare opencode when disableTmuxWrap is true (no nested tmux attach)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-director',
      modelId: 'minimax-coding-plan/MiniMax-M3',
      tmuxSessionName: 'devhub-swarm-launch-abc-director',
      disableTmuxWrap: true,
      opencodePure: true,
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('/home/matias/.opencode/bin/opencode --agent swarm-director');
    expect(inner).toContain('--model minimax-coding-plan/MiniMax-M3');
    expect(inner).not.toContain('--prompt');
    expect(inner).not.toContain('tmux new-session');
    expect(inner).not.toContain('tmux attach-session');
  });

  test('without disableTmuxWrap still wraps in tmux (legacy path)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-coder',
      modelId: 'minimax-coding-plan/MiniMax-M3',
      tmuxSessionName: 'devhub-swarm-launch-abc-coder',
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('tmux new-session');
    expect(inner).toContain('tmux attach-session');
  });

  test('uses bare kimi in yolo mode with skills-dir for swarm bootstrap', () => {
    const inner = buildAgentLaunchCommand('kimi', 'mission prompt', {
      opencodeAgent: 'swarm-director',
      role: 'director',
      modelId: 'kimi-code/kimi-for-coding',
      tmuxSessionName: 'devhub-swarm-launch-abc-director',
      disableTmuxWrap: true,
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('/home/matias/.kimi-code/bin/kimi --yolo');
    expect(inner).not.toContain('--auto');
    expect(inner).toContain('--skills-dir');
    expect(inner).toContain('/home/matias/.kimi-code/skills/devhub-zed-orchestrator');
    expect(inner).toContain('--model');
    expect(inner).toContain('kimi-code/kimi-for-coding');
    expect(inner).not.toContain('--prompt');
    expect(inner).not.toContain('-p ');
    expect(inner).not.toContain('tmux new-session');
  });

  test('kimi one-off launch uses -p prompt without yolo', () => {
    const inner = buildAgentLaunchCommand('kimi', 'do work', {
      role: 'coder',
      disableTmuxWrap: true,
    });

    expect(inner).toContain('/home/matias/.kimi-code/bin/kimi -p');
    expect(inner).toContain('do work');
    expect(inner).not.toContain('--yolo');
  });
});

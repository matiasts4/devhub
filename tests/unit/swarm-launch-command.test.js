/**
 * Regression tests for visible swarm launch command construction.
 * Verifies the two fixes that unblock OpenCode startup:
 *   1. disableTmuxWrap — panel already has a devhub-swarm-* tmux session
 *   2. interactive bootstrap — OpenCode TUI starts without --prompt
 */

const {
  buildAgentLaunchCommand,
  resolveAgentProgramExecutable,
} = require('../../src/lib/agentLaunchCommand.shared');

describe('swarm launch inner command', () => {
  test('uses bare opencode when disableTmuxWrap is true (no nested tmux attach)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-director',
      modelId: 'minimax/MiniMax-M3',
      tmuxSessionName: 'devhub-swarm-launch-abc-director',
      disableTmuxWrap: true,
      opencodePure: true,
      interactiveBootstrapPrompt: true,
    });

    // The executable is host-dependent (env override / ~/.opencode/bin / PATH),
    // so derive the expectation from the same resolver the builder uses.
    const opencodeBin = resolveAgentProgramExecutable('opencode');
    expect(inner).toContain(`${opencodeBin} --agent swarm-director`);
    expect(inner).toContain('--model minimax/MiniMax-M3');
    expect(inner).not.toContain('--prompt');
    expect(inner).not.toContain('tmux new-session');
    expect(inner).not.toContain('tmux attach-session');
  });

  test('without disableTmuxWrap still wraps in tmux (legacy path)', () => {
    const inner = buildAgentLaunchCommand('opencode', 'mission prompt', {
      opencodeAgent: 'swarm-coder',
      modelId: 'minimax/MiniMax-M3',
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

    // kimi-code rejects combining --yolo with --auto
    expect(inner).toMatch(/kimi(?:\.exe)? --yolo(?:\s|$)/);
    expect(inner).toContain('--yolo');
    expect(inner).not.toContain('--auto');
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

    expect(inner).toMatch(/kimi(?:\.exe)? -p/);
    expect(inner).toContain('do work');
    expect(inner).not.toContain('--yolo');
  });

  test('uses bare agy executable for antigravity swarm launches (W8)', () => {
    const inner = buildAgentLaunchCommand('agy', 'mission prompt', {
      role: 'coder',
      tmuxSessionName: 'devhub-swarm-launch-abc-coder',
      disableTmuxWrap: true,
      interactiveBootstrapPrompt: true,
    });

    const agyBin = resolveAgentProgramExecutable('agy');
    expect(inner).toBe(agyBin);
    // agy has no assumed non-interactive prompt flag — the bootstrap prompt
    // is injected post-launch via tmux send-keys by the wrapper.
    expect(inner).not.toContain('--prompt');
    expect(inner).not.toContain('tmux new-session');
  });

  test('antigravity alias resolves to the same bare launch', () => {
    const inner = buildAgentLaunchCommand('antigravity', 'mission prompt', {
      role: 'coder',
      disableTmuxWrap: true,
      interactiveBootstrapPrompt: true,
    });

    const agyBin = resolveAgentProgramExecutable('antigravity');
    expect(inner).toBe(agyBin);
    expect(inner).toMatch(/\b(?:agy|antigravity)\b/);
  });

  test('agy launch still wraps in tmux when a session name is provided', () => {
    const inner = buildAgentLaunchCommand('agy', 'mission prompt', {
      role: 'coder',
      tmuxSessionName: 'devhub-swarm-launch-abc-coder',
    });

    expect(inner).toContain('tmux new-session');
    expect(inner).toContain('tmux attach-session');
    expect(inner).toContain(resolveAgentProgramExecutable('agy'));
  });

  test('qodercli swarm launch uses interactive TUI with bypass_permissions and -m model', () => {
    const inner = buildAgentLaunchCommand('qodercli', 'mission prompt', {
      role: 'coder',
      modelId: 'Auto',
      tmuxSessionName: 'devhub-swarm-launch-abc-coder',
      disableTmuxWrap: true,
      interactiveBootstrapPrompt: true,
    });

    const qoderBin = resolveAgentProgramExecutable('qodercli');
    expect(inner).toContain(`${qoderBin} --permission-mode bypass_permissions`);
    expect(inner).toContain("-m 'Auto'");
    expect(inner).not.toContain('-p ');
    expect(inner).not.toContain('--yolo');
    expect(inner).not.toContain('tmux new-session');
  });

  test('qodercli one-off launch uses -p print mode with optional model', () => {
    const inner = buildAgentLaunchCommand('qodercli', 'do work', {
      role: 'coder',
      modelId: 'DeepSeek-V4-Flash',
      disableTmuxWrap: true,
    });

    const qoderBin = resolveAgentProgramExecutable('qodercli');
    expect(inner).toContain(`${qoderBin} -p`);
    expect(inner).toContain('do work');
    expect(inner).toContain("-m 'DeepSeek-V4-Flash'");
    expect(inner).not.toContain('--permission-mode');
  });

  test('qodercli launch without model omits the -m flag', () => {
    const inner = buildAgentLaunchCommand('qodercli', 'mission prompt', {
      role: 'coder',
      disableTmuxWrap: true,
      interactiveBootstrapPrompt: true,
    });

    expect(inner).toContain('--permission-mode bypass_permissions');
    expect(inner).not.toContain('-m ');
  });
});

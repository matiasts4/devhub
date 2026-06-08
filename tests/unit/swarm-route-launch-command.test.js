/**
 * Route-level regression: visible swarm launch must not double-wrap tmux
 * and must pass --pure for OpenCode workers.
 */

const { buildLaunchCommand } = require('../../src/app/api/agenthub/operations/health/route');

describe('route buildLaunchCommand (visible swarm)', () => {
  test('opencode roles use --pure without nested tmux attach', () => {
    const inner = buildLaunchCommand(
      'opencode',
      'mission prompt',
      'director',
      'minimax-coding-plan/MiniMax-M2.7',
      'launch-test1234',
      '/tmp/worktree/director'
    );

    expect(inner).toContain('/home/matias/.opencode/bin/opencode --pure --agent');
    expect(inner).not.toContain('tmux new-session');
    expect(inner).not.toContain('tmux attach-session');
    expect(inner).not.toContain('--prompt');
  });

  test('wrapper path includes inner b64 logging marker', () => {
    const wrapper = buildLaunchCommand(
      'opencode',
      'mission prompt',
      'coder',
      'minimax-coding-plan/MiniMax-M2.7',
      'launch-test5678',
      '/tmp/worktree/coder'
    );

    expect(wrapper).toContain('[AGENT] Inner command (b64):');
    expect(wrapper).toContain('DEVHUB_AGENT_ID="launch-test5678-coder"');
  });
});
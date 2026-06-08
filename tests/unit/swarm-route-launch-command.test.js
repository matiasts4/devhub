/**
 * Route-level regression: visible swarm launch must materialize wrapper scripts
 * and expose only a one-line bash launcher to the terminal PTY.
 */

const fs = require('fs');

const { buildLaunchCommand } = require('../../src/app/api/agenthub/operations/health/route');

describe('route buildLaunchCommand (visible swarm)', () => {
  const createdPaths = [];

  afterEach(() => {
    for (const scriptPath of createdPaths.splice(0)) {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // Best-effort cleanup.
      }
    }
  });

  test('materializes wrapper and returns one-line bash launcher for opencode director', () => {
    const launch = buildLaunchCommand(
      'opencode',
      'mission prompt',
      'director',
      'minimax-coding-plan/MiniMax-M2.7',
      'launch-test1234',
      '/tmp/worktree/director'
    );

    createdPaths.push(launch.wrapperScriptPath);

    expect(launch.command).toBe('bash /tmp/devhub-launch-launch-test1234-director.sh');
    expect(launch.wrapper).toContain('/home/matias/.opencode/bin/opencode --agent swarm-director');
    expect(launch.wrapper).not.toContain('--prompt');

    const script = fs.readFileSync(launch.wrapperScriptPath, 'utf8');
    expect(script).toBe(launch.wrapper);
  });

  test('wrapper includes agent identity markers for workers', () => {
    const launch = buildLaunchCommand(
      'opencode',
      'mission prompt',
      'coder',
      'minimax-coding-plan/MiniMax-M2.7',
      'launch-test5678',
      '/tmp/worktree/coder'
    );

    createdPaths.push(launch.wrapperScriptPath);

    expect(launch.command).toBe('bash /tmp/devhub-launch-launch-test5678-coder.sh');
    expect(launch.wrapper).toContain('DEVHUB_AGENT_ID="launch-test5678-coder"');
    expect(launch.wrapper).toContain('/home/matias/.opencode/bin/opencode --agent swarm-coder');
  });
});

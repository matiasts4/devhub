/**
 * Route-level regression: visible swarm launch must materialize wrapper scripts
 * and expose only a one-line bash launcher to the terminal PTY.
 *
 * Expectations are derived from the same path/executable resolvers the route
 * uses, so the test is portable across hosts (Linux /tmp vs Windows temp dir).
 */

const fs = require('fs');

const { buildLaunchCommand } = require('../../src/app/api/agenthub/operations/health/route');
const {
  resolveLaunchWrapperScriptPath,
  toBashAccessiblePath,
} = require('../../src/lib/operations/materializeLaunchWrapper');
const { resolveAgentProgramExecutable } = require('../../src/lib/agentLaunchCommand.shared');

const opencodeBin = resolveAgentProgramExecutable('opencode');

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
      'minimax-coding-plan/MiniMax-M3',
      'launch-test1234',
      '/tmp/worktree/director'
    );

    createdPaths.push(launch.wrapperScriptPath);

    const expectedScriptPath = resolveLaunchWrapperScriptPath('launch-test1234', 'director');
    expect(launch.wrapperScriptPath).toBe(expectedScriptPath);
    expect(launch.command).toBe(`bash ${toBashAccessiblePath(expectedScriptPath)}`);
    expect(launch.wrapper).toContain(`${opencodeBin} --agent swarm-director`);
    expect(launch.wrapper).not.toContain('tmux attach-session');
    expect(launch.wrapper).not.toContain('--prompt');
    expect(launch.wrapper).toContain('DEVHUB_AGENT_PID');
    expect(launch.wrapper).toContain('_devhub_bootstrap_prompt');

    const script = fs.readFileSync(launch.wrapperScriptPath, 'utf8');
    expect(script).toBe(launch.wrapper);
  });

  test('wrapper includes agent identity markers for workers', () => {
    const launch = buildLaunchCommand(
      'opencode',
      'mission prompt',
      'coder',
      'minimax-coding-plan/MiniMax-M3',
      'launch-test5678',
      '/tmp/worktree/coder'
    );

    createdPaths.push(launch.wrapperScriptPath);

    const expectedScriptPath = resolveLaunchWrapperScriptPath('launch-test5678', 'coder');
    expect(launch.command).toBe(`bash ${toBashAccessiblePath(expectedScriptPath)}`);
    expect(launch.wrapper).toContain('DEVHUB_AGENT_ID="launch-test5678-coder"');
    expect(launch.wrapper).toContain(`${opencodeBin} --agent swarm-coder`);
  });
});

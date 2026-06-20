/**
 * @jest-environment node
 */

jest.mock('@/lib/agentLaunchCommand.shared.js', () => ({
  buildAgentLaunchCommand: jest.fn((program, prompt) => `${program} --prompt "${prompt}"`),
}));

const { launchAgentSessionTool, launchSwarmTool } = require('../tools/agentLauncher');

describe('agentLauncher tools', () => {
  test('launch_agent_session builds command for opencode', async () => {
    const result = await launchAgentSessionTool.execute({
      program: 'opencode',
      prompt: 'refactorizar el router',
    });
    expect(result.opened).toBe(true);
    expect(result.program).toBe('opencode');
    expect(result.command_sent).toContain('refactorizar el router');
  });

  test('launch_agent_session rejects invalid program', async () => {
    const result = await launchAgentSessionTool.execute({
      program: 'invalid',
      prompt: 'x',
    });
    expect(result.error).toBe('invalid_program');
  });

  test('launch_agent_session requires prompt', async () => {
    const result = await launchAgentSessionTool.execute({ program: 'codex' });
    expect(result.error).toBe('missing_prompt');
  });

  test('launch_swarm returns not_implemented', async () => {
    const result = await launchSwarmTool.execute({ draft: {} });
    expect(result.error).toBe('not_implemented');
  });
});

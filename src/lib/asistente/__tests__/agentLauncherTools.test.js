/**
 * @jest-environment node
 */

jest.mock('@/lib/agentLaunchCommand.shared.js', () => ({
  buildAgentLaunchCommand: jest.fn((program, prompt) => `${program} --prompt "${prompt}"`),
}));

const { launchAgentSessionTool, launchSwarmTool } = require('../tools/agentLauncher');

describe('agentLauncher tools', () => {
  test('launch_agent_session builds interactive command + bootstrap_input for opencode', async () => {
    const { buildAgentLaunchCommand } = require('@/lib/agentLaunchCommand.shared.js');
    buildAgentLaunchCommand.mockImplementation((program, prompt, options = {}) => {
      if (options.interactiveBootstrapPrompt) return `${program} --interactive`;
      return `${program} --prompt "${prompt}"`;
    });
    const result = await launchAgentSessionTool.execute({
      program: 'opencode',
      prompt: 'refactorizar el router',
    });
    expect(result.opened).toBe(true);
    expect(result.program).toBe('opencode');
    expect(result.command_sent).not.toContain('refactorizar el router');
    expect(result.bootstrap_input).toMatch(/refactorizar el router/);
    expect(buildAgentLaunchCommand).toHaveBeenCalledWith(
      'opencode',
      '',
      expect.objectContaining({ interactiveBootstrapPrompt: true })
    );
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

  test('launch_agent_session accepts grok (interactive TUI)', async () => {
    const result = await launchAgentSessionTool.execute({
      program: 'grok',
      prompt: 'hola probando',
    });
    expect(result.error).toBeUndefined();
    expect(result.opened).toBe(true);
    expect(result.program).toBe('grok');
    expect(result.command_sent).toBeTruthy();
    expect(result.bootstrap_input).toMatch(/hola probando/);
  });

  test('launch_agent_session allows empty prompt for grok', async () => {
    const result = await launchAgentSessionTool.execute({ program: 'grok' });
    expect(result.error).toBeUndefined();
    expect(result.opened).toBe(true);
    expect(result.program).toBe('grok');
  });

  test('launch_swarm returns not_implemented', async () => {
    const result = await launchSwarmTool.execute({ draft: {} });
    expect(result.error).toBe('not_implemented');
  });
});

const { buildZedActivationPrompt, resolveOrchestratorTmuxSession } = require('../swarmKickoff.js');

describe('swarmKickoff', () => {
  test('buildZedActivationPrompt includes proof-of-delegation rules', () => {
    const prompt = buildZedActivationPrompt('empeza con terminal-fix');
    expect(prompt).toContain('ACTIVACION');
    expect(prompt).toContain('inbox_row_id');
    expect(prompt).toContain('empeza con terminal-fix');
    expect(prompt).toContain('DEVHUB_PROJECT_ID');
  });

  test('resolveOrchestratorTmuxSession uses zed role by default', () => {
    expect(resolveOrchestratorTmuxSession('launch-abc')).toBe('devhub-swarm-launch-abc-zed');
  });
});

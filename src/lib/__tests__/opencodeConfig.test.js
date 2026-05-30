import fs from 'node:fs';
import path from 'node:path';

const ROOT_CONFIG_PATH = path.resolve(process.cwd(), 'opencode.json');

function extractFileReference(value) {
  const match = /^\{file:(.+)\}$/.exec(String(value || '').trim());
  return match ? match[1] : null;
}

describe('repo opencode config', () => {
  test('defines visible swarm agents as primary and points them at repo prompt files', () => {
    const raw = fs.readFileSync(ROOT_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);

    const expectedAgents = {
      'swarm-director': 'docs/prompts/swarm/swarm-director-v2.md',
      'swarm-coder': 'docs/prompts/swarm/swarm-coder-v2.md',
      'swarm-devops': 'docs/prompts/swarm/swarm-devops-v2.md',
      'swarm-architect': 'docs/prompts/swarm/swarm-architect-v2.md',
      'swarm-auditor': 'docs/prompts/swarm/swarm-auditor-v2.md',
      'swarm-reviewer': 'docs/prompts/swarm/swarm-reviewer-v2.md',
      'swarm-explorer': 'docs/prompts/swarm/swarm-explorer-v2.md',
      'swarm-qa': 'docs/prompts/swarm/swarm-qa-v2.md',
    };

    Object.entries(expectedAgents).forEach(([agentName, promptPath]) => {
      const agent = config.agent?.[agentName];
      expect(agent).toEqual(
        expect.objectContaining({
          hidden: false,
          mode: 'primary',
          model: 'minimax-coding-plan/MiniMax-M2.7',
        })
      );

      const fileRef = extractFileReference(agent.prompt);
      expect(fileRef).toBe(`./${promptPath}`);
      expect(path.resolve(process.cwd(), fileRef)).toBe(path.resolve(process.cwd(), promptPath));
      expect(fs.existsSync(path.resolve(process.cwd(), promptPath))).toBe(true);
    });
  });
});
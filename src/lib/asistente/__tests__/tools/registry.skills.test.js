/**
 * @jest-environment node
 */

const { ToolRegistry } = require('../../tools/registry');
const { SkillRegistry } = require('../../skillRegistry');

describe('ToolRegistry skill integration', () => {
  test('registerFromSkillRegistry adds qualified skill tools', () => {
    const skills = new SkillRegistry();
    skills.registerSkill(
      {
        name: 'math',
        version: '1.0.0',
        permissions: [],
        tools: [
          {
            name: 'add',
            description: 'Add two numbers',
            parameters: {
              a: { type: 'number', required: true },
              b: { type: 'number', required: true },
            },
          },
        ],
      },
      {
        add: async ({ a, b }) => ({ result: a + b }),
      }
    );

    const registry = new ToolRegistry();
    registry.registerFromSkillRegistry(skills);

    expect(registry.get('math:add')).toBeDefined();
    expect(registry.get('math:add').parameters).toHaveProperty('a');
  });

  test('registerFromSkillRegistry throws for non-skill-registry', () => {
    const registry = new ToolRegistry();
    expect(() => registry.registerFromSkillRegistry(null)).toThrow(/SkillRegistry/);
    expect(() => registry.registerFromSkillRegistry({})).toThrow(/SkillRegistry/);
  });

  test('registerSkillManifest registers a one-off skill', () => {
    const registry = new ToolRegistry();
    registry.registerSkillManifest(
      {
        name: 'oneoff',
        version: '0.0.1',
        tools: [{ name: 'ping', description: 'Ping', parameters: {} }],
      },
      { ping: async () => ({ ok: true }) }
    );

    expect(registry.get('oneoff:ping')).toBeDefined();
  });

  test('registerSkillManifest throws on invalid manifest', () => {
    const registry = new ToolRegistry();
    expect(() => registry.registerSkillManifest({ name: '' }, { ping: async () => ({}) })).toThrow(
      /Skill registration failed/
    );
  });

  test('executes a skill tool registered via SkillRegistry', async () => {
    const skills = new SkillRegistry();
    skills.registerSkill(
      {
        name: 'echo',
        version: '1.0.0',
        tools: [{ name: 'shout', description: 'Echo', parameters: { text: { type: 'string' } } }],
      },
      { shout: async ({ text }) => ({ text: text.toUpperCase() }) }
    );

    const registry = new ToolRegistry();
    registry.registerFromSkillRegistry(skills);

    const result = await registry.execute('echo:shout', { text: 'hello' });
    expect(result.text).toBe('HELLO');
  });
});

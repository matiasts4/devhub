/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSkillRegistry } from '../skillRegistry';
import { ToolRegistry } from '../tools/registry';

describe('SkillRegistry', () => {
  test('registers a valid skill', () => {
    const registry = createSkillRegistry();
    const result = registry.registerSkill({
      name: 'example-skill',
      version: '1.0.0',
      permissions: ['terminal'],
      tools: [
        {
          name: 'hello',
          description: 'Say hello',
          parameters: { name: { type: 'string', required: true } },
        },
      ],
    }, {
      hello: async ({ name }) => ({ greeting: `Hello ${name}` }),
    });

    expect(result.success).toBe(true);
    expect(registry.list()).toHaveLength(1);
  });

  test('rejects invalid manifest', () => {
    const registry = createSkillRegistry();
    const result = registry.registerSkill({ name: '' });
    expect(result.success).toBe(false);
  });

  test('registers tools into ToolRegistry', async () => {
    const skills = createSkillRegistry();
    skills.registerSkill(
      {
        name: 'example',
        version: '1.0.0',
        permissions: [],
        tools: [{ name: 'ping', description: 'Ping', parameters: {} }],
      },
      { ping: async () => ({ ok: true }) }
    );

    const tools = new ToolRegistry();
    skills.registerTools(tools);

    expect(tools.get('example:ping')).toBeDefined();
    const result = await tools.execute('example:ping', {});
    expect(result.ok).toBe(true);
  });

  test('disable/enable skill', () => {
    const registry = createSkillRegistry();
    registry.registerSkill(
      {
        name: 'toggle',
        version: '1.0.0',
        tools: [{ name: 'noop', description: 'Noop', parameters: {} }],
      },
      { noop: async () => ({}) }
    );

    expect(registry.isEnabled('toggle')).toBe(true);
    registry.disableSkill('toggle');
    expect(registry.isEnabled('toggle')).toBe(false);
    registry.enableSkill('toggle');
    expect(registry.isEnabled('toggle')).toBe(true);
  });

  test('discovers skills from directory', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-skills-'));
    const skillDir = path.join(tmp, 'demo');
    fs.mkdirSync(path.join(skillDir, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify({
        name: 'demo',
        version: '1.0.0',
        permissions: ['terminal'],
        tools: [{ name: 'echo', description: 'Echo', parameters: { text: { type: 'string' } } }],
      })
    );
    fs.writeFileSync(
      path.join(skillDir, 'tools', 'echo.js'),
      'export async function execute({ text }) { return { text }; }\n'
    );

    const registry = createSkillRegistry();
    const results = await registry.discoverFromDirectory(tmp);

    expect(results).toHaveLength(1);
    console.log('DISCOVER RESULT', JSON.stringify(results));
    expect(results[0].success).toBe(true);
    expect(registry.isEnabled('demo')).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

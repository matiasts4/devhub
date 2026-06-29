/**
 * @jest-environment node
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildZedRegistry } from '../buildZedRegistry';

describe('buildZedRegistry', () => {
  test('includes built-in Zed tools', () => {
    const registry = buildZedRegistry({ skillsDir: null });
    expect(registry.get('open_terminal')).toBeDefined();
    expect(registry.get('open_url')).toBeDefined();
    expect(registry.get('browse_files')).toBeDefined();
  });

  test('discovers and registers the bundled demo skill by default', () => {
    const registry = buildZedRegistry();
    expect(registry.get('demo:hello')).toBeDefined();
    expect(registry.get('demo:hello').description).toContain('greeting');
  });

  test('discovers skills from a custom directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-build-skills-'));
    const skillDir = path.join(tmp, 'custom');
    fs.mkdirSync(path.join(skillDir, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify({
        name: 'custom',
        version: '1.0.0',
        permissions: [],
        tools: [{ name: 'noop', description: 'Noop', parameters: {} }],
      })
    );
    fs.writeFileSync(
      path.join(skillDir, 'tools', 'noop.js'),
      'export async function execute() { return { ok: true }; }\n'
    );

    const registry = buildZedRegistry({ skillsDir: tmp });
    expect(registry.get('custom:noop')).toBeDefined();

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('is tolerant when skillsDir does not exist', () => {
    const registry = buildZedRegistry({ skillsDir: path.join(os.tmpdir(), 'does-not-exist-zed') });
    expect(registry.get('open_terminal')).toBeDefined();
    expect(registry.get('demo:hello')).toBeUndefined();
  });

  test('memoizes toAnthropicTools until a new tool is registered', () => {
    const registry = buildZedRegistry({ skillsDir: null });
    const first = registry.toAnthropicTools();
    const second = registry.toAnthropicTools();
    expect(second).toBe(first);

    registry.register({
      name: 'memo_test_tool',
      description: 'test',
      parameters: {},
      async execute() {
        return {};
      },
    });
    const third = registry.toAnthropicTools();
    expect(third).not.toBe(first);
    expect(third.length).toBe(first.length + 1);
  });
});

// T-014: ToolRegistry.get(name) — TDD regression for the schema-aware
// no-params check (T-015). The chat route must look up a tool's parameter
// schema before short-circuiting on empty input. We need a fast O(1) lookup
// for `get(name)`.

const { ToolRegistry } = require('../../tools/registry');

describe('ToolRegistry.get (T-014)', () => {
  test('returns the registered tool definition for a known name', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'foo', parameters: { x: { type: 'string' } } };
    registry.register(tool);
    expect(registry.get('foo')).toBe(tool);
  });

  test('returns undefined for an unknown name', () => {
    const registry = new ToolRegistry();
    expect(registry.get('does_not_exist')).toBeUndefined();
  });

  test('returns the most recently registered tool when names collide', () => {
    const registry = new ToolRegistry();
    const first = { name: 'dup', parameters: {} };
    const second = { name: 'dup', parameters: { a: { type: 'string' } } };
    registry.register(first);
    registry.register(second);
    expect(registry.get('dup')).toBe(second);
  });

  test('does not mutate the registry', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'x', parameters: {} };
    registry.register(tool);
    registry.get('x');
    registry.get('missing');
    expect(registry.list()).toHaveLength(1);
  });
});

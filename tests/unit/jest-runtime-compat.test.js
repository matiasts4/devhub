describe('jest runtime compatibility helpers', () => {
  test('installFetchGlobals hydrates missing fetch primitives', () => {
    const { installFetchGlobals } = require('../jest.runtime-compat');

    const target = {};
    installFetchGlobals(target);

    expect(typeof target.fetch).toBe('function');
    expect(typeof target.Headers).toBe('function');
    expect(typeof target.Request).toBe('function');
    expect(typeof target.Response).toBe('function');
  });

  test('createNodeTestShim forwards calls to the target test function', () => {
    const { createNodeTestShim } = require('../shims/node-test');

    const calls = [];
    const target = {
      test: (name, fn) => calls.push({ type: 'test', name, fn }),
    };

    const shim = createNodeTestShim(target);
    const callback = () => 'ok';

    shim('works', callback);

    expect(calls).toEqual([{ type: 'test', name: 'works', fn: callback }]);
  });

  test('createNodeTestShim preserves test modifiers when available', () => {
    const { createNodeTestShim } = require('../shims/node-test');

    const calls = [];
    const target = {
      test: Object.assign((name, fn) => calls.push({ type: 'test', name, fn }), {
        only: (name, fn) => calls.push({ type: 'only', name, fn }),
        skip: (name, fn) => calls.push({ type: 'skip', name, fn }),
        todo: (name) => calls.push({ type: 'todo', name }),
      }),
    };

    const shim = createNodeTestShim(target);
    const callback = () => 'ok';

    shim.only('exclusive', callback);
    shim.skip('skipped', callback);
    shim.todo('todo item');

    expect(calls).toEqual([
      { type: 'only', name: 'exclusive', fn: callback },
      { type: 'skip', name: 'skipped', fn: callback },
      { type: 'todo', name: 'todo item' },
    ]);
  });

  test('node:test shim exposes named it/describe exports for ESM-style tests', () => {
    const nodeTestShim = require('../shims/node-test');

    expect(nodeTestShim.default).toBe(nodeTestShim);
    expect(nodeTestShim.test).toBe(nodeTestShim);
    expect(typeof nodeTestShim.it).toBe('function');
    expect(typeof nodeTestShim.describe).toBe('function');
  });
});

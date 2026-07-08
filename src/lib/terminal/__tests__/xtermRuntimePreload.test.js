'use strict';

const { installDom } = require('@/test-support/domHarness');

describe('xtermRuntimePreload', () => {
  beforeEach(() => {
    jest.resetModules();
    installDom();
  });

  test('preloadXtermRuntime is idempotent and returns a shared promise', async () => {
    jest.doMock('xterm', () => ({ Terminal: class {} }), { virtual: true });
    jest.doMock('xterm-addon-fit', () => ({ FitAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-search', () => ({ SearchAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-webgl', () => ({ WebglAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-canvas', () => ({ CanvasAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-serialize', () => ({ SerializeAddon: class {} }), { virtual: true });

    const mod = require('../xtermRuntimePreload');
    const first = mod.preloadXtermRuntime();
    const second = mod.preloadXtermRuntime();
    expect(first).toBe(second);
    const result = await first;
    expect(result.Terminal).toBeTruthy();
    expect(result.FitAddon).toBeTruthy();
    expect(result.SearchAddon).toBeTruthy();
  });

  test('loadXtermCore returns constructors from preload', async () => {
    jest.doMock('xterm', () => ({ Terminal: class Terminal {} }), { virtual: true });
    jest.doMock('xterm-addon-fit', () => ({ FitAddon: class FitAddon {} }), { virtual: true });
    jest.doMock('xterm-addon-search', () => ({ SearchAddon: class SearchAddon {} }), {
      virtual: true,
    });
    jest.doMock('xterm-addon-webgl', () => ({ WebglAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-canvas', () => ({ CanvasAddon: class {} }), { virtual: true });
    jest.doMock('xterm-addon-serialize', () => ({ SerializeAddon: class {} }), { virtual: true });

    const mod = require('../xtermRuntimePreload');
    const core = await mod.loadXtermCore();
    expect(typeof core.Terminal).toBe('function');
    expect(typeof core.FitAddon).toBe('function');
    expect(typeof core.SearchAddon).toBe('function');
  });

  test('preloadXtermRuntime is a no-op without window (SSR)', async () => {
    const prevWindow = global.window;
    delete global.window;
    try {
      const mod = require('../xtermRuntimePreload');
      mod.__resetXtermRuntimePreloadForTests();
      await expect(mod.preloadXtermRuntime()).resolves.toBeNull();
    } finally {
      global.window = prevWindow;
    }
  });
});

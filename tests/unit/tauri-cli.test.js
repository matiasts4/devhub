const path = require('path');
const packageJson = require('../../package.json');

const scriptPath = path.resolve(__dirname, '../../scripts/tauri-cli.cjs');

describe('tauri cli wrapper', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(scriptPath);
  });

  test('package scripts route tauri commands through the wrapper', () => {
    expect(packageJson.scripts.tauri).toBe('node scripts/tauri-cli.cjs');
    expect(packageJson.scripts['tauri:dev']).toBe('npm run tauri -- dev');
    expect(packageJson.scripts['tauri:build']).toBe('npm run generate-icon && npm run tauri -- build');
  });

  test('buildTauriEnv prefers system pkg-config on linux when PATH pkg-config misses required webkit packages', () => {
    const execFileSync = jest.fn((command) => {
      if (command === 'pkg-config') {
        throw new Error('Package webkit2gtk-4.1 was not found');
      }

      return Buffer.from('');
    });

    const env = api.buildTauriEnv({
      env: { PATH: '/home/linuxbrew/.linuxbrew/bin:/usr/bin' },
      platform: 'linux',
      execFileSync,
      existsSync: jest.fn((target) => target === '/usr/bin/pkg-config'),
    });

    expect(env).toEqual(
      expect.objectContaining({
        PATH: '/home/linuxbrew/.linuxbrew/bin:/usr/bin',
        PKG_CONFIG: '/usr/bin/pkg-config',
      })
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'pkg-config',
      ['--exists', ...api.REQUIRED_GTK_PACKAGES],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/pkg-config',
      ['--exists', ...api.REQUIRED_GTK_PACKAGES],
      expect.objectContaining({ stdio: 'ignore' })
    );
  });

  test('buildTauriEnv keeps existing pkg-config resolution when current command already works', () => {
    const execFileSync = jest.fn(() => Buffer.from(''));

    const env = api.buildTauriEnv({
      env: { PATH: '/usr/bin', HOME: '/home/matias' },
      platform: 'linux',
      execFileSync,
      existsSync: jest.fn(() => true),
    });

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/matias',
      PKG_CONFIG_PATH: '/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig',
    });
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledWith(
      'pkg-config',
      ['--exists', ...api.REQUIRED_GTK_PACKAGES],
      expect.objectContaining({ stdio: 'ignore' })
    );
  });

  test('buildTauriEnv injects Linux pkg-config search paths when they are missing', () => {
    const execFileSync = jest.fn(() => Buffer.from(''));

    const env = api.buildTauriEnv({
      env: { PATH: '/usr/bin', HOME: '/home/matias' },
      platform: 'linux',
      execFileSync,
      existsSync: jest.fn(() => true),
    });

    expect(env.PKG_CONFIG_PATH).toBe('/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig');
  });

  test('buildTauriEnv preserves existing Linux pkg-config search paths while prepending project defaults', () => {
    const execFileSync = jest.fn(() => Buffer.from(''));

    const env = api.buildTauriEnv({
      env: {
        PATH: '/usr/bin',
        PKG_CONFIG_PATH: '/custom/pkgconfig:/another/path',
      },
      platform: 'linux',
      execFileSync,
      existsSync: jest.fn(() => true),
    });

    expect(env.PKG_CONFIG_PATH).toBe(
      '/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:/custom/pkgconfig:/another/path'
    );
  });

  test('resolveTauriCliArgs disables beforeDevCommand when dev server is already ready', () => {
    const args = api.resolveTauriCliArgs({
      args: ['dev'],
      buildConfig: {
        beforeDevCommand: 'npm run dev',
        devUrl: 'http://localhost:3100',
      },
      devUrlReady: true,
    });

    expect(args).toEqual([
      'dev',
      '-c',
      JSON.stringify({ build: { beforeDevCommand: '' } }),
    ]);
  });

  test('resolveTauriCliArgs keeps dev args untouched when dev server is not ready', () => {
    const args = api.resolveTauriCliArgs({
      args: ['dev'],
      buildConfig: {
        beforeDevCommand: 'npm run dev',
        devUrl: 'http://localhost:3100',
      },
      devUrlReady: false,
    });

    expect(args).toEqual(['dev']);
  });

  test('runTauriCli injects a config override instead of rerunning beforeDevCommand when devUrl already responds', () => {
    const spawnSync = jest
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    api.runTauriCli({
      args: ['dev'],
      env: { PATH: '/usr/bin', PKG_CONFIG: '/usr/bin/pkg-config' },
      spawnSync,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      process.execPath,
      [
        '-e',
        expect.stringContaining('const target = process.argv[1];'),
        'http://localhost:3100',
      ],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      process.execPath,
      [
        expect.stringContaining(path.join('@tauri-apps', 'cli', 'tauri.js')),
        'dev',
        '-c',
        JSON.stringify({ build: { beforeDevCommand: '' } }),
      ],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ PKG_CONFIG: '/usr/bin/pkg-config' }),
      })
    );
  });

  test('runTauriCli launches the local tauri cli with the resolved environment', () => {
    const spawnSync = jest.fn(() => ({ status: 0 }));

    api.runTauriCli({
      args: ['build'],
      env: { PATH: '/usr/bin', PKG_CONFIG: '/usr/bin/pkg-config' },
      spawnSync,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining(path.join('@tauri-apps', 'cli', 'tauri.js')), 'build'],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ PKG_CONFIG: '/usr/bin/pkg-config' }),
      })
    );
  });
});

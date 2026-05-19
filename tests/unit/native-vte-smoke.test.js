const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/native-vte-smoke.cjs');

describe('native vte smoke wrapper', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(scriptPath);
  });

  test('buildNativeVteSmokeArgs routes cargo run through the standalone gtk_vte_smoke binary', () => {
    expect(api.buildNativeVteSmokeArgs(['--title', 'DevHub smoke'])).toEqual([
      'run',
      '--bin',
      'gtk_vte_smoke',
      '--',
      '--title',
      'DevHub smoke',
    ]);
  });

  test('runNativeVteSmoke executes cargo from src-tauri with the provided env', () => {
    const spawnSync = jest.fn(() => ({ status: 0 }));

    api.runNativeVteSmoke({
      args: ['--command', 'pwd'],
      env: { PKG_CONFIG_PATH: '/tmp/pkgconfig' },
      spawnSync,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      'cargo',
      ['run', '--bin', 'gtk_vte_smoke', '--', '--command', 'pwd'],
      expect.objectContaining({
        cwd: expect.stringContaining(path.join('devhub', 'src-tauri')),
        env: { PKG_CONFIG_PATH: '/tmp/pkgconfig' },
        stdio: 'inherit',
      })
    );
  });
});

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

  test('runNativeVteSmoke writes a machine-readable summary when QA metadata is provided', () => {
    const fs = { mkdirSync: jest.fn(), writeFileSync: jest.fn() };
    const spawnSync = jest.fn(() => ({ status: 0 }));

    const exitCode = api.runNativeVteSmoke({
      args: ['--command', 'pwd'],
      env: { PKG_CONFIG_PATH: '/tmp/pkgconfig' },
      spawnSync,
      fs,
      qaContext: {
        qaRunId: 'qa-20260521-001',
        scenarioId: 'approval-closure',
        summaryPath: '/tmp/native-summary.json',
      },
    });

    expect(exitCode).toBe(0);
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/native-summary.json',
      expect.stringContaining('"qa_run_id": "qa-20260521-001"'),
      'utf8'
    );
    expect(fs.writeFileSync.mock.calls[0][1]).toContain('"scenario_id": "approval-closure"');
    expect(fs.writeFileSync.mock.calls[0][1]).toContain('"status": "passed"');
  });
});

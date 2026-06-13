const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/ensure-native-runtime.cjs');

describe('ensure-native-runtime', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(scriptPath);
  });

  test('runNodeCheckScript executes native verification in a fresh node process', () => {
    const exec = jest.fn();

    api.runNodeCheckScript({
      cwd: '/tmp/devhub',
      script: 'console.log(1)',
      exec,
      nodeBin: '/usr/bin/node',
    });

    expect(exec).toHaveBeenCalledWith('/usr/bin/node', ['-e', 'console.log(1)'], {
      cwd: '/tmp/devhub',
      stdio: 'pipe',
    });
  });

  test('createDefaultChecks uses isolated subprocess checks for native modules', () => {
    const runNodeCheck = jest.fn();
    const checks = api.createDefaultChecks({ cwd: '/tmp/devhub', runNodeCheck });

    checks['better-sqlite3']();
    checks['node-pty']();
    checks['node-pty-sidecar']();

    expect(runNodeCheck).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cwd: '/tmp/devhub',
        script: expect.stringContaining("require('better-sqlite3')"),
      })
    );
    // node-pty (root) — Next.js runtime loads from project root node_modules.
    expect(runNodeCheck).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cwd: '/tmp/devhub',
        script: expect.stringContaining("require('node-pty')"),
      })
    );
    // node-pty-sidecar — packaged sidecar binary uses its own node_modules.
    expect(runNodeCheck).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        cwd: '/tmp/devhub/sidecar-backend',
        script: expect.stringContaining("require('node-pty')"),
      })
    );
  });

  test('runChecks returns no failures when all checks pass', () => {
    const result = api.runChecks({
      checks: {
        'better-sqlite3': () => {},
        'node-pty': () => {},
      },
    });

    expect(result).toEqual([]);
  });

  test('runChecks captures failures with module names', () => {
    const result = api.runChecks({
      checks: {
        'better-sqlite3': () => {
          throw new Error('NODE_MODULE_VERSION mismatch');
        },
        'node-pty': () => {},
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        moduleName: 'better-sqlite3',
        message: expect.stringContaining('NODE_MODULE_VERSION mismatch'),
      }),
    ]);
  });

  test('ensureNativeRuntime rebuilds and rechecks after ABI failure', () => {
    const exec = jest.fn();
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const checks = {
      'better-sqlite3': jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('NODE_MODULE_VERSION 137 vs 127');
        })
        .mockImplementationOnce(() => {}),
      'node-pty': jest.fn(),
      'node-pty-sidecar': jest.fn(),
    };

    const result = api.ensureNativeRuntime({
      checks,
      cwd: '/tmp/devhub',
      exec,
      log,
      nodeBin: '/home/matias/.nvm/versions/node/v24.14.0/bin/node',
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['rebuild', 'better-sqlite3'],
      expect.objectContaining({
        cwd: '/tmp/devhub',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining('/home/matias/.nvm/versions/node/v24.14.0/bin'),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: '/tmp/devhub',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining('/home/matias/.nvm/versions/node/v24.14.0/bin'),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: '/tmp/devhub/sidecar-backend',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining('/home/matias/.nvm/versions/node/v24.14.0/bin'),
        }),
      })
    );
    expect(checks['better-sqlite3']).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rebuilt: true, failures: [] });
  });

  test('rebuildNativeModules prefers npm from the active node directory', () => {
    const exec = jest.fn();

    api.rebuildNativeModules({
      cwd: '/tmp/devhub',
      exec,
      nodeBin: '/home/matias/.nvm/versions/node/v24.14.0/bin/node',
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['rebuild', 'better-sqlite3'],
      expect.objectContaining({
        cwd: '/tmp/devhub',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringMatching(/^\/home\/matias\/\.nvm\/versions\/node\/v24\.14\.0\/bin:/),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: '/tmp/devhub',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringMatching(/^\/home\/matias\/\.nvm\/versions\/node\/v24\.14\.0\/bin:/),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: '/tmp/devhub/sidecar-backend',
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringMatching(/^\/home\/matias\/\.nvm\/versions\/node\/v24\.14\.0\/bin:/),
        }),
      })
    );
  });

  test('ensureNativeRuntime skips rebuild when checks already pass', () => {
    const exec = jest.fn();

    const result = api.ensureNativeRuntime({
      checks: {
        'better-sqlite3': () => {},
        'node-pty': () => {},
        'node-pty-sidecar': () => {},
      },
      exec,
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    expect(exec).not.toHaveBeenCalled();
    expect(result).toEqual({ rebuilt: false, failures: [] });
  });
});

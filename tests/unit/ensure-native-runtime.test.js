const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/ensure-native-runtime.cjs');
const ROOT = path.join('/tmp', 'devhub');
const SIDECAR = path.join(ROOT, 'sidecar-backend');
const NODE_BIN = path.join(
  '/home',
  'matias',
  '.nvm',
  'versions',
  'node',
  'v24.14.0',
  'bin',
  'node'
);
const NODE_DIR = path.dirname(NODE_BIN);

describe('ensure-native-runtime', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(scriptPath);
  });

  test('runNodeCheckScript executes native verification in a fresh node process', () => {
    const exec = jest.fn();

    api.runNodeCheckScript({
      cwd: ROOT,
      script: 'console.log(1)',
      exec,
      nodeBin: '/usr/bin/node',
    });

    expect(exec).toHaveBeenCalledWith('/usr/bin/node', ['-e', 'console.log(1)'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  });

  test('createDefaultChecks uses isolated subprocess checks for native modules', () => {
    const runNodeCheck = jest.fn();
    const checks = api.createDefaultChecks({ cwd: ROOT, runNodeCheck });

    checks['better-sqlite3']();
    checks['node-pty']();
    checks['node-pty-sidecar']();

    expect(runNodeCheck).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cwd: ROOT,
        script: expect.stringContaining("require('better-sqlite3')"),
      })
    );
    expect(runNodeCheck).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cwd: ROOT,
        script: expect.stringContaining("require('node-pty')"),
      })
    );
    expect(runNodeCheck).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        cwd: SIDECAR,
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

  test('ensureNativeRuntime skips checks when stamp cache matches', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const checks = {
      'better-sqlite3': jest.fn(),
      'node-pty': jest.fn(),
      'node-pty-sidecar': jest.fn(),
    };
    const stamp = {
      node: '24.14.0',
      modules: '137',
      nodeBin: '/usr/bin/node',
      'better-sqlite3': '12.10.0',
      'node-pty': '1.1.0',
      'node-pty-sidecar': '1.1.0',
    };
    const fsApi = {
      readFileSync: jest.fn(() => JSON.stringify(stamp)),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };

    const result = api.ensureNativeRuntime({
      checks,
      cwd: ROOT,
      log,
      nodeBin: '/usr/bin/node',
      fsApi,
      stamp,
    });

    expect(result).toEqual({ rebuilt: false, failures: [], skippedViaCache: true });
    expect(checks['better-sqlite3']).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Cache hit'));
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
    const fsApi = {
      readFileSync: jest.fn(() => {
        throw new Error('no stamp');
      }),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };

    const result = api.ensureNativeRuntime({
      checks,
      cwd: ROOT,
      exec,
      log,
      nodeBin: NODE_BIN,
      force: true,
      fsApi,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['rebuild', 'better-sqlite3'],
      expect.objectContaining({
        cwd: ROOT,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: ROOT,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: SIDECAR,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
    expect(checks['better-sqlite3']).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rebuilt: true, failures: [], skippedViaCache: false });
    expect(fsApi.writeFileSync).toHaveBeenCalled();
  });

  test('rebuildNativeModules prefers npm from the active node directory', () => {
    const exec = jest.fn();

    api.rebuildNativeModules({
      cwd: ROOT,
      exec,
      nodeBin: NODE_BIN,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['rebuild', 'better-sqlite3'],
      expect.objectContaining({
        cwd: ROOT,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: ROOT,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['rebuild', 'node-pty'],
      expect.objectContaining({
        cwd: SIDECAR,
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: expect.stringContaining(NODE_DIR),
        }),
      })
    );
  });

  test('ensureNativeRuntime skips rebuild when checks already pass', () => {
    const exec = jest.fn();
    const fsApi = {
      readFileSync: jest.fn(() => {
        throw new Error('no stamp');
      }),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };

    const result = api.ensureNativeRuntime({
      checks: {
        'better-sqlite3': () => {},
        'node-pty': () => {},
        'node-pty-sidecar': () => {},
      },
      exec,
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      force: true,
      fsApi,
    });

    expect(exec).not.toHaveBeenCalled();
    expect(result).toEqual({ rebuilt: false, failures: [], skippedViaCache: false });
    expect(fsApi.writeFileSync).toHaveBeenCalled();
  });
});

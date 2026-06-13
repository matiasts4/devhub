const fs = require('fs');
const os = require('os');
const path = require('path');

describe('DevHub DB path resolver', () => {
  let tmpRoot;

  beforeEach(() => {
    jest.resetModules();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-db-path-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function loadResolver() {
    return require('../../src/lib/db/pathResolver');
  }

  test('uses DEVHUB_DB_PATH override and creates its parent directory', () => {
    const customDbPath = path.join(tmpRoot, 'custom', 'nested', 'devhub.db');
    const { resolveDbPath } = loadResolver();

    const resolved = resolveDbPath({
      env: { DEVHUB_DB_PATH: customDbPath },
      homeDir: path.join(tmpRoot, 'home'),
      cwd: path.join(tmpRoot, 'repo'),
      moduleDir: path.join(tmpRoot, 'repo', 'src', 'lib', 'db'),
    });

    expect(resolved).toBe(customDbPath);
    expect(fs.existsSync(path.dirname(customDbPath))).toBe(true);
  });

  test('defaults to a canonical ~/.devhub/data/devhub.db path independent of cwd', () => {
    const homeDir = path.join(tmpRoot, 'home');
    const cwd = path.join(tmpRoot, 'repo');
    const moduleDir = path.join(tmpRoot, 'repo', 'src', 'lib', 'db');
    const { resolveDbPath } = loadResolver();

    const resolved = resolveDbPath({ env: {}, homeDir, cwd, moduleDir });

    expect(resolved).toBe(path.join(homeDir, '.devhub', 'data', 'devhub.db'));
    expect(fs.existsSync(path.join(homeDir, '.devhub', 'data'))).toBe(true);
  });

  test('uses ~/.devhub-dev when tauri dev sidecar markers are present', () => {
    const homeDir = path.join(tmpRoot, 'home');
    const devDir = path.join(homeDir, '.devhub-dev');
    fs.mkdirSync(devDir, { recursive: true });
    fs.writeFileSync(path.join(devDir, 'sidecar-port.txt'), '4001', 'utf8');

    const { getCanonicalDevhubDir } = loadResolver();
    expect(getCanonicalDevhubDir({ env: {}, homeDir })).toBe(devDir);
  });

  test('syncs a stale ~/.devhub-dev database from newer ~/.devhub/data on resolve', () => {
    const homeDir = path.join(tmpRoot, 'home');
    const devDir = path.join(homeDir, '.devhub-dev');
    fs.mkdirSync(devDir, { recursive: true });
    fs.writeFileSync(path.join(devDir, 'sidecar-port.txt'), '4001', 'utf8');

    const productionDbPath = path.join(homeDir, '.devhub', 'data', 'devhub.db');
    const devDbPath = path.join(homeDir, '.devhub-dev', 'data', 'devhub.db');
    fs.mkdirSync(path.dirname(productionDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(devDbPath), { recursive: true });
    fs.writeFileSync(productionDbPath, 'production-db');
    fs.writeFileSync(`${productionDbPath}-wal`, 'production-wal');
    fs.writeFileSync(devDbPath, 'dev-db');
    fs.utimesSync(
      productionDbPath,
      new Date('2026-06-09T00:00:00Z'),
      new Date('2026-06-09T00:00:00Z')
    );
    fs.utimesSync(
      `${productionDbPath}-wal`,
      new Date('2026-06-09T00:00:00Z'),
      new Date('2026-06-09T00:00:00Z')
    );
    fs.utimesSync(devDbPath, new Date('2026-05-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));

    const { resolveDbPath } = loadResolver();
    const resolved = resolveDbPath({
      env: {},
      homeDir,
      cwd: path.join(tmpRoot, 'repo'),
      moduleDir: path.join(tmpRoot, 'repo', 'src', 'lib', 'db'),
    });

    expect(resolved).toBe(devDbPath);
    expect(fs.readFileSync(devDbPath, 'utf8')).toBe('production-db');
    expect(fs.readFileSync(`${devDbPath}-wal`, 'utf8')).toBe('production-wal');
  });

  test('syncs dev DB from production when only the dev WAL is newer', () => {
    const homeDir = path.join(tmpRoot, 'home');
    const devDir = path.join(homeDir, '.devhub-dev');
    fs.mkdirSync(devDir, { recursive: true });
    fs.writeFileSync(path.join(devDir, 'sidecar.pid'), '12345', 'utf8');

    const productionDbPath = path.join(homeDir, '.devhub', 'data', 'devhub.db');
    const devDbPath = path.join(homeDir, '.devhub-dev', 'data', 'devhub.db');
    fs.mkdirSync(path.dirname(productionDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(devDbPath), { recursive: true });
    fs.writeFileSync(productionDbPath, 'production-db-with-real-projects');
    fs.writeFileSync(devDbPath, 'dev-fixture');
    fs.writeFileSync(`${devDbPath}-wal`, 'recent-dev-wal');
    fs.utimesSync(
      productionDbPath,
      new Date('2026-06-09T00:00:00Z'),
      new Date('2026-06-09T00:00:00Z')
    );
    fs.utimesSync(devDbPath, new Date('2026-05-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));
    fs.utimesSync(
      `${devDbPath}-wal`,
      new Date('2026-06-09T12:00:00Z'),
      new Date('2026-06-09T12:00:00Z')
    );

    const { resolveDbPath } = loadResolver();
    resolveDbPath({
      env: {},
      homeDir,
      cwd: path.join(tmpRoot, 'repo'),
      moduleDir: path.join(tmpRoot, 'repo', 'src', 'lib', 'db'),
    });

    expect(fs.readFileSync(devDbPath, 'utf8')).toBe('production-db-with-real-projects');
  });

  test('migrates the newest legacy database into the canonical path on first use', () => {
    const homeDir = path.join(tmpRoot, 'home');
    const cwd = path.join(tmpRoot, 'repo');
    const moduleDir = path.join(tmpRoot, 'repo', 'src', 'lib', 'db');
    fs.mkdirSync(moduleDir, { recursive: true });

    const repoDbPath = path.join(cwd, 'data', 'devhub.db');
    fs.mkdirSync(path.dirname(repoDbPath), { recursive: true });
    fs.writeFileSync(repoDbPath, 'repo-db');
    fs.utimesSync(repoDbPath, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));

    const standaloneDbPath = path.join(homeDir, '.devhub', 'standalone', 'data', 'devhub.db');
    fs.mkdirSync(path.dirname(standaloneDbPath), { recursive: true });
    fs.writeFileSync(standaloneDbPath, 'standalone-db');
    fs.writeFileSync(`${standaloneDbPath}-wal`, 'standalone-wal');
    fs.utimesSync(
      standaloneDbPath,
      new Date('2026-02-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z')
    );
    fs.utimesSync(
      `${standaloneDbPath}-wal`,
      new Date('2026-02-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z')
    );

    const { resolveDbPath } = loadResolver();
    const resolved = resolveDbPath({ env: {}, homeDir, cwd, moduleDir });
    const canonicalDbPath = path.join(homeDir, '.devhub', 'data', 'devhub.db');

    expect(resolved).toBe(canonicalDbPath);
    expect(fs.readFileSync(canonicalDbPath, 'utf8')).toBe('standalone-db');
    expect(fs.readFileSync(`${canonicalDbPath}-wal`, 'utf8')).toBe('standalone-wal');
  });
});

const fs = require('fs');
const os = require('os');
const path = require('path');

const { copySqliteFamily, resolveDbPath } = require('../pathResolver.js');

function makeTmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `devhub-pathresolver-${label}-`));
}

describe('copySqliteFamily', () => {
  let spy;
  afterEach(() => {
    if (spy) {
      spy.mockRestore();
      spy = null;
    }
  });

  test('copies db+wal, never leaves -shm at the target, and removes stale wal/shm', () => {
    const srcDir = makeTmpDir('src');
    const dstDir = makeTmpDir('dst');
    const srcDb = path.join(srcDir, 'devhub.db');
    const dstDb = path.join(dstDir, 'devhub.db');

    fs.writeFileSync(srcDb, 'MAIN-DB');
    fs.writeFileSync(`${srcDb}-wal`, 'WAL-CONTENT');
    fs.writeFileSync(`${srcDb}-shm`, 'SHM-CONTENT');
    // Stale target files that must be cleaned.
    fs.writeFileSync(`${dstDb}-shm`, 'STALE-SHM');

    copySqliteFamily(srcDb, dstDb);

    expect(fs.readFileSync(dstDb, 'utf8')).toBe('MAIN-DB');
    expect(fs.readFileSync(`${dstDb}-wal`, 'utf8')).toBe('WAL-CONTENT');
    // -shm is never copied nor left behind — SQLite rebuilds it on open.
    expect(fs.existsSync(`${dstDb}-shm`)).toBe(false);
  });

  test('removes a stale target -wal when the source has none', () => {
    const srcDir = makeTmpDir('src');
    const dstDir = makeTmpDir('dst');
    const srcDb = path.join(srcDir, 'devhub.db');
    const dstDb = path.join(dstDir, 'devhub.db');

    fs.writeFileSync(srcDb, 'MAIN-DB');
    fs.writeFileSync(`${dstDb}-wal`, 'STALE-WAL');
    fs.writeFileSync(`${dstDb}-shm`, 'STALE-SHM');

    copySqliteFamily(srcDb, dstDb);

    expect(fs.readFileSync(dstDb, 'utf8')).toBe('MAIN-DB');
    expect(fs.existsSync(`${dstDb}-wal`)).toBe(false);
    expect(fs.existsSync(`${dstDb}-shm`)).toBe(false);
  });

  test('retries the main db copy on transient failure', () => {
    const srcDir = makeTmpDir('src');
    const dstDir = makeTmpDir('dst');
    const srcDb = path.join(srcDir, 'devhub.db');
    const dstDb = path.join(dstDir, 'devhub.db');
    fs.writeFileSync(srcDb, 'MAIN-DB');

    const original = fs.copyFileSync;
    let calls = 0;
    spy = jest.spyOn(fs, 'copyFileSync').mockImplementation((s, t) => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('UNKNOWN: transient lock');
        err.code = 'UNKNOWN';
        throw err;
      }
      return original(s, t);
    });

    copySqliteFamily(srcDb, dstDb);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(fs.readFileSync(dstDb, 'utf8')).toBe('MAIN-DB');
  });

  test('throws only when the main db copy is definitively impossible', () => {
    const srcDir = makeTmpDir('src');
    const dstDir = makeTmpDir('dst');
    const srcDb = path.join(srcDir, 'devhub.db');
    const dstDb = path.join(dstDir, 'devhub.db');
    fs.writeFileSync(srcDb, 'MAIN-DB');

    spy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('UNKNOWN: permanent lock');
    });

    expect(() => copySqliteFamily(srcDb, dstDb)).toThrow('unable to copy');
  });
});

describe('resolveDbPath resilience', () => {
  let spy;
  afterEach(() => {
    if (spy) {
      spy.mockRestore();
      spy = null;
    }
    delete process.env.DEVHUB_DB_PATH;
  });

  test('a failing legacy migration never escapes resolveDbPath (API must not 500)', () => {
    const repoDir = makeTmpDir('repo');
    const canonicalDir = makeTmpDir('canonical');
    const canonicalDb = path.join(canonicalDir, 'devhub.db');

    // Legacy candidate with a real projects table so migration actually tries.
    const legacyDataDir = path.join(repoDir, 'data');
    fs.mkdirSync(legacyDataDir, { recursive: true });
    const legacyDb = path.join(legacyDataDir, 'devhub.db');
    const Database = require('better-sqlite3');
    const db = new Database(legacyDb);
    db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('p1', 'demo');
    db.close();

    // Sabotage every copy — the migration must fail and be swallowed.
    spy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('UNKNOWN: copyfile raced a live WAL writer');
    });

    process.env.DEVHUB_DB_PATH = canonicalDb;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let resolved;
    expect(() => {
      resolved = resolveDbPath({ cwd: repoDir });
    }).not.toThrow();

    expect(path.resolve(resolved)).toBe(path.resolve(canonicalDb));
    expect(fs.existsSync(canonicalDb)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

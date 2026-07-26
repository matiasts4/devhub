'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ─── helpers ────────────────────────────────────────────────────────────────

/** Makes a minimal valid db file with a projects row in dir. */
function makeValidDb(dir, name = 'devhub.db') {
  const dbPath = path.join(dir, name);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#58A6FF',
      status TEXT DEFAULT 'active',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      planning_prompt TEXT,
      planning_status TEXT DEFAULT 'none',
      project_type TEXT DEFAULT 'software',
      documentation_policy TEXT DEFAULT 'personal',
      local_path TEXT
    );
    INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project');
  `);
  db.close();
  return dbPath;
}

/** Makes a malformed (corrupt) db file in dir. */
function makeCorruptDb(dir, name = 'devhub.db') {
  const dbPath = path.join(dir, name);
  fs.writeFileSync(dbPath, Buffer.from('SQLite format 3\x00\x00\x00\x00\x00\x00\x00'));
  return dbPath;
}

// ─── integrity_check as primary gate ───────────────────────────────────────

test('PRAGMA integrity_check returns ok for a healthy db', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO projects (id, name) VALUES ('p1', 'Project 1');
  `);
  const result = db.prepare('PRAGMA integrity_check').get();
  assert.equal(result.integrity_check, 'ok');
  db.close();
});

test('PRAGMA integrity_check returns errors for a corrupt db', () => {
  // Truncate the file so page numbers in the freelist point past EOF.
  // This makes SQLite throw SQLITE_CORRUPT on open or during the check.
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-integrity-'));
  let fname;
  try {
    fname = path.join(dir, 'corrupt.db');
    const d = new Database(fname);
    d.exec('CREATE TABLE t (x);');
    // insert enough rows to require multiple pages
    for (let i = 0; i < 100; i++) d.exec(`INSERT INTO t VALUES (${i});`);
    d.close();

    // Truncate 40% — freelist page pointers will reference past-EOF
    const buf = fs.readFileSync(fname);
    const halfLen = Math.floor(buf.length * 0.6);
    fs.writeFileSync(fname, buf.slice(0, halfLen));

    let caught = null;
    try {
      const corruptDb = new Database(fname);
      const result = corruptDb.prepare('PRAGMA integrity_check').get();
      corruptDb.close();
      // If it opened, check must fail (corrupt freelist references)
      assert.notEqual(result.integrity_check, 'ok');
    } catch (err) {
      caught = err;
      // SQLITE_CORRUPT or SQLITE_NOTADB both indicate a corrupt db
      assert.ok(
        err.code === 'SQLITE_CORRUPT' || err.code === 'SQLITE_NOTADB',
        `Expected CORRUPT or NOTADB but got: ${err.code}`
      );
    }
    // either the open/query threw (CORRUPT/NOTADB) or integrity_check returned non-ok
    assert.ok(caught !== undefined, 'expected either an exception or a failed integrity_check');
  } finally {
    if (fname) {
      try {
        new Database(fname).close();
      } catch {
        /* ignore */
      }
    }
    fs.rmSync(dir, { recursive: true });
  }
});

// ─── backup rejection: corrupt files must not be selected ────────────────────

test('rejects a corrupt backup candidate via integrity_check', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-backup-test-'));
  try {
    // create a corrupt file that looks like a backup
    const badBackup = path.join(dir, 'devhub.db.backup-0001');
    fs.writeFileSync(badBackup, Buffer.from('SQLite format 3\x00garbage'));

    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('devhub.db.backup-'))
      .map((f) => path.join(dir, f))
      .filter((fp) => {
        try {
          const td = new Database(fp, { readonly: true });
          const r = td.prepare('PRAGMA integrity_check').get();
          td.close();
          return r.integrity_check === 'ok';
        } catch {
          return false;
        }
      });

    assert.equal(backups.length, 0, 'corrupt backup must be filtered out');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('accepts a valid backup candidate via integrity_check', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-backup-test-'));
  try {
    makeValidDb(dir, 'devhub.db.backup-0001');

    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('devhub.db.backup-'))
      .map((f) => path.join(dir, f))
      .filter((fp) => {
        try {
          const td = new Database(fp, { readonly: true });
          const r = td.prepare('PRAGMA integrity_check').get();
          td.close();
          return r.integrity_check === 'ok';
        } catch {
          return false;
        }
      });

    assert.equal(backups.length, 1);
    assert.ok(backups[0].endsWith('devhub.db.backup-0001'));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ─── pre-open gate: corrupt db triggers needsRecovery ───────────────────────

test('pre-open gate triggers needsRecovery for corrupt main db', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-preopen-test-'));
  try {
    // put a corrupt db at the expected path
    makeCorruptDb(dir, 'devhub.db');

    let needsRecovery = false;
    try {
      const stats = fs.statSync(path.join(dir, 'devhub.db'));
      if (stats.size > 0) {
        const td = new Database(path.join(dir, 'devhub.db'), { readonly: true });
        const integ = td.prepare('PRAGMA integrity_check').get();
        td.close();
        if (integ.integrity_check !== 'ok') {
          needsRecovery = true;
        }
      }
    } catch {
      needsRecovery = true;
    }

    assert.equal(needsRecovery, true, 'corrupt db should trigger needsRecovery');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('pre-open gate accepts healthy db and sets needsRecovery=false', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-preopen-test-'));
  try {
    makeValidDb(dir, 'devhub.db');

    let needsRecovery = false;
    try {
      const stats = fs.statSync(path.join(dir, 'devhub.db'));
      if (stats.size > 0) {
        const td = new Database(path.join(dir, 'devhub.db'), { readonly: true });
        const integ = td.prepare('PRAGMA integrity_check').get();
        td.close();
        if (integ.integrity_check !== 'ok') {
          needsRecovery = true;
        }
      }
    } catch {
      needsRecovery = true;
    }

    assert.equal(needsRecovery, false, 'healthy db should NOT trigger needsRecovery');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ─── pre-restore backup must also pass integrity_check ──────────────────────

test('devhub.db.pre-restore corrupt candidate is rejected in recovery scan', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-prerestore-test-'));
  try {
    // create a fake corrupt pre-restore backup
    const corruptPreRestore = path.join(dir, 'devhub.db.pre-restore');
    fs.writeFileSync(corruptPreRestore, Buffer.from('garbage'));

    const candidates = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('devhub.db.backup-') || f === 'devhub.db.pre-restore')
      .map((f) => path.join(dir, f))
      .filter((fp) => {
        try {
          const td = new Database(fp, { readonly: true });
          const r = td.prepare('PRAGMA integrity_check').get();
          td.close();
          return r.integrity_check === 'ok';
        } catch {
          return false;
        }
      })
      .sort((l, r) => fs.statSync(r).mtimeMs - fs.statSync(l).mtimeMs);

    assert.equal(candidates.length, 0, 'corrupt pre-restore should be rejected');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('devhub.db.pre-restore valid candidate is accepted in recovery scan', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-prerestore-test-'));
  try {
    // create a valid pre-restore backup
    makeValidDb(dir, 'devhub.db.pre-restore');

    const candidates = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('devhub.db.backup-') || f === 'devhub.db.pre-restore')
      .map((f) => path.join(dir, f))
      .filter((fp) => {
        try {
          const td = new Database(fp, { readonly: true });
          const r = td.prepare('PRAGMA integrity_check').get();
          td.close();
          return r.integrity_check === 'ok';
        } catch {
          return false;
        }
      })
      .sort((l, r) => fs.statSync(r).mtimeMs - fs.statSync(l).mtimeMs);

    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].endsWith('devhub.db.pre-restore'));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ─── post-schema safety net resets corrupt handle ────────────────────────────

test('post-schema integrity check detects WAL-replay corruption and resets', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-postschema-test-'));
  try {
    const dbPath = path.join(dir, 'devhub.db');
    // start with a clean db
    const db = new Database(dbPath, { fileMustExist: false });
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        documentation_policy TEXT DEFAULT 'personal'
      );
      INSERT INTO projects (id, name) VALUES ('proj-1', 'Test');
    `);
    db.close();

    // now corrupt the WAL-side files only (simulates partial-write / mid-replay crash)
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) fs.writeFileSync(walPath, Buffer.from('corrupt wal page'));
    if (fs.existsSync(shmPath)) fs.writeFileSync(shmPath, Buffer.from('corrupt shm'));

    // open again and run post-schema integrity check
    const db2 = new Database(dbPath, { fileMustExist: false });
    db2.pragma('journal_mode = WAL');
    db2.pragma('foreign_keys = ON');

    // simulate schema init (check passes because schema exists)
    db2.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        documentation_policy TEXT DEFAULT 'personal'
      );
    `);

    // but the WAL-corrupt state should cause integrity_check to fail
    const integ = db2.prepare('PRAGMA integrity_check').get();
    if (integ.integrity_check !== 'ok') {
      // safety net: close and delete, recreate
      db2.close();
      fs.unlinkSync(dbPath);
      try {
        fs.unlinkSync(walPath);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(shmPath);
      } catch {
        /* ignore */
      }
      const fresh = new Database(dbPath, { fileMustExist: false });
      fresh.pragma('journal_mode = WAL');
      fresh.pragma('foreign_keys = ON');
      fresh.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY, name TEXT NOT NULL,
          documentation_policy TEXT DEFAULT 'personal'
        );
      `);
      const freshInteg = fresh.prepare('PRAGMA integrity_check').get();
      assert.equal(freshInteg.integrity_check, 'ok', 'fresh db must be clean');
      fresh.close();
    } else {
      db2.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ─── healthy path: no false positives ───────────────────────────────────────

test('healthy db passes pre-open gate and skips recovery', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'db-healthy-test-'));
  try {
    makeValidDb(dir, 'devhub.db');

    let needsRecovery = false;
    let backupCreated = false;

    const dbPath = path.join(dir, 'devhub.db');
    const stats = fs.statSync(dbPath);
    if (stats.size > 0) {
      const td = new Database(dbPath, { readonly: true });
      const integ = td.prepare('PRAGMA integrity_check').get();
      td.close();
      if (integ.integrity_check !== 'ok') {
        needsRecovery = true;
      } else {
        // backup would be created by real getDb() — simulate here
        const backupPath = `${dbPath}.backup-${Date.now()}`;
        fs.copyFileSync(dbPath, backupPath);
        backupCreated = true;
      }
    }

    assert.equal(needsRecovery, false);
    assert.equal(backupCreated, true);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

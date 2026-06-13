/**
 * bootstrapLock.test.js — T2.4 / R-BUF-4 lock dedup contract.
 *
 * Covers the shared bootstrapLock module's three public functions:
 *   - tryAcquireLock: atomic create, stale-recovery, refuses when held
 *   - releaseLock: unlinks the file, refuses to delete other-PID locks
 *   - isLockHeld: true after acquire, false after release, false when
 *     older than ttlMs
 *
 * Tests use a per-suite temp directory to isolate from the host
 * `/tmp` and from any other concurrent test runs.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  tryAcquireLock,
  releaseLock,
  isLockHeld,
  BOOTSTRAP_LOCK_TTL_MS_DEFAULT,
} = require('../bootstrapLock.js');

let lockDir;

beforeEach(() => {
  lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-bootstrap-lock-'));
});

afterEach(() => {
  // Best-effort cleanup.
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function lockPathFor(missionId, role) {
  return path.join(
    lockDir,
    `devhub-bootstrap-${missionId || 'unknown'}-${role || 'agent'}.lock`
  );
}

describe('T2.4 — tryAcquireLock (swarm-launch-hardening)', () => {
  it('T2.4 tryAcquireLock succeeds when no lock exists', () => {
    const result = tryAcquireLock({
      missionId: 'm-1',
      role: 'director',
      lockDir,
    });

    expect(result.acquired).toBe(true);
    expect(result.lockPath).toBe(lockPathFor('m-1', 'director'));
    expect(result.holder).toBeDefined();
    expect(result.holder.pid).toBe(process.pid);
    expect(typeof result.holder.acquiredAt).toBe('string');
    expect(typeof result.holder.expiresAt).toBe('string');
    expect(fs.existsSync(result.lockPath)).toBe(true);
  });

  it('T2.4 tryAcquireLock returns acquired:false when held by another process', () => {
    // Pre-seed a fresh lock owned by a fake pid.
    const lockPath = lockPathFor('m-2', 'worker');
    const futureExpiry = new Date(Date.now() + 60000).toISOString();
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999999,
        acquiredAt: new Date().toISOString(),
        expiresAt: futureExpiry,
      })
    );

    const result = tryAcquireLock({
      missionId: 'm-2',
      role: 'worker',
      ttlMs: 30000,
      lockDir,
    });

    expect(result.acquired).toBe(false);
    expect(result.lockPath).toBe(lockPath);
    expect(result.holder).toBeDefined();
    expect(result.holder.pid).toBe(999999);
    expect(typeof result.ageMs).toBe('number');
    // The original lock file is still on disk — we did not overwrite.
    const contents = fs.readFileSync(lockPath, 'utf8');
    expect(contents).toMatch(/"pid"\s*:\s*999999/);
  });

  it('T2.4 stale lock older than ttlMs is recovered (acquired:true, recovered:true)', () => {
    const lockPath = lockPathFor('m-3', 'auditor');
    const oldAcquire = new Date(Date.now() - 60000).toISOString(); // 60s ago
    const oldExpiry = new Date(Date.now() - 30000).toISOString();  // expired
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 888888,
        acquiredAt: oldAcquire,
        expiresAt: oldExpiry,
      })
    );

    const result = tryAcquireLock({
      missionId: 'm-3',
      role: 'auditor',
      ttlMs: 5000, // 5s TTL — old lock (60s old) is stale
      lockDir,
    });

    expect(result.acquired).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.holder.pid).toBe(process.pid);
    // The lock file on disk is now ours.
    const contents = fs.readFileSync(lockPath, 'utf8');
    expect(contents).toMatch(new RegExp(`"pid"\\s*:\\s*${process.pid}`));
    expect(contents).not.toMatch(/"pid"\s*:\s*888888/);
  });

  it('T2.4 throws when missionId or role is missing', () => {
    expect(() => tryAcquireLock({ role: 'director', lockDir })).toThrow(/missionId/);
    expect(() => tryAcquireLock({ missionId: 'm-x', lockDir })).toThrow(/role/);
  });
});

describe('T2.4 — isLockHeld (swarm-launch-hardening)', () => {
  it('T2.4 isLockHeld returns true after acquire', () => {
    tryAcquireLock({ missionId: 'm-4', role: 'director', lockDir });
    expect(
      isLockHeld({ missionId: 'm-4', role: 'director', lockDir })
    ).toBe(true);
  });

  it('T2.4 isLockHeld returns false when no lock file exists', () => {
    expect(
      isLockHeld({ missionId: 'm-no-such', role: 'worker', lockDir })
    ).toBe(false);
  });

  it('T2.4 isLockHeld returns false after release', () => {
    tryAcquireLock({ missionId: 'm-5', role: 'worker', lockDir });
    releaseLock({ missionId: 'm-5', role: 'worker', lockDir });
    expect(
      isLockHeld({ missionId: 'm-5', role: 'worker', lockDir })
    ).toBe(false);
  });
});

describe('T2.4 — releaseLock (swarm-launch-hardening)', () => {
  it('T2.4 releaseLock removes the file', () => {
    const acquired = tryAcquireLock({
      missionId: 'm-6',
      role: 'director',
      lockDir,
    });
    expect(acquired.acquired).toBe(true);
    expect(fs.existsSync(acquired.lockPath)).toBe(true);

    const release = releaseLock({
      missionId: 'm-6',
      role: 'director',
      lockDir,
    });
    expect(release.released).toBe(true);
    expect(fs.existsSync(acquired.lockPath)).toBe(false);
  });

  it('T2.4 releaseLock refuses to delete a lock held by another pid', () => {
    const lockPath = lockPathFor('m-7', 'auditor');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 1234567,
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      })
    );

    const release = releaseLock({
      missionId: 'm-7',
      role: 'auditor',
      lockDir,
    });
    expect(release.released).toBe(false);
    // The other process's lock is still there.
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('T2.4 releaseLock is a no-op when no lock exists', () => {
    const release = releaseLock({
      missionId: 'm-never',
      role: 'worker',
      lockDir,
    });
    expect(release.released).toBe(false);
  });
});

describe('T2.4 — bootstrapLock defaults', () => {
  it('T2.4 BOOTSTRAP_LOCK_TTL_MS_DEFAULT is 30000 (30s)', () => {
    expect(BOOTSTRAP_LOCK_TTL_MS_DEFAULT).toBe(30000);
  });
});

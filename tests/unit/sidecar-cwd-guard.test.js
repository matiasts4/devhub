const os = require('os');
const path = require('path');
const { resolveSidecarSessionCwd } = require('../../sidecar-backend/sessionCwd');

/**
 * Regression test: sidecar-backend/sessionCwd.js must load without ../src sibling paths.
 *
 * Bug: sessionCwd.js previously required ../src/lib/terminal/cwdGuard.js, which does not
 * exist under the packaged sidecar-backend install path (/usr/lib/DevHub/_up_/sidecar-backend).
 * This caused sidecar startup to crash before port 4000 was bound.
 *
 * Fix: sessionCwd.js now requires ./cwdGuard.js (local sibling), which is present in both
 * dev and packaged install paths.
 *
 * Paths below are built with path/os so assertions hold on both POSIX and Windows
 * (resolveTerminalSpawnCwd normalizes via path.resolve, so '/tmp' becomes 'D:\tmp' on win32).
 */
describe('sidecar cwd safeguard', () => {
  test('sessionCwd loads without ../src sibling path dependency', () => {
    // If sessionCwd.js previously referenced ../src/lib/terminal/cwdGuard.js,
    // this require would throw before any test runs:
    // Error: Cannot find module '../src/lib/terminal/cwdGuard'
    expect(() => {
      require('../../sidecar-backend/sessionCwd');
    }).not.toThrow();
  });

  test('falls back to home dir (not process cwd) when requested cwd is missing', () => {
    // Packaged installs run the sidecar from inside the app install dir
    // (C:\Program Files\DevHub\resources\...\sidecar-backend). An invalid
    // requested cwd must never land the user's shell there — home wins.
    const missing = path.join(os.tmpdir(), 'definitely-missing-devhub-cwd-guard');
    const result = resolveSidecarSessionCwd(missing);

    expect(result.requestedCwd).toBe(path.resolve(missing));
    expect(result.effectiveCwd).toBe(path.resolve(os.homedir()));
    expect(result.usedFallback).toBe(true);
  });

  test('resolveSidecarSessionCwd returns valid shape for real directory', () => {
    const result = resolveSidecarSessionCwd(os.tmpdir());
    expect(result).toHaveProperty('requestedCwd');
    expect(result).toHaveProperty('effectiveCwd');
    expect(result).toHaveProperty('usedFallback');
    expect(typeof result.requestedCwd).toBe('string');
    expect(typeof result.effectiveCwd).toBe('string');
    expect(typeof result.usedFallback).toBe('boolean');
  });

  test('returns existing directory unchanged', () => {
    const tmp = os.tmpdir();
    const result = resolveSidecarSessionCwd(tmp);
    expect(result.requestedCwd).toBe(path.resolve(tmp));
    expect(result.effectiveCwd).toBe(path.resolve(tmp));
    expect(result.usedFallback).toBe(false);
  });
});

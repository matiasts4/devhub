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
 */
describe('sidecar cwd safeguard', () => {
  test('.sessionCwd loads without ../src sibling path dependency', () => {
    // If sessionCwd.js previously referenced ../src/lib/terminal/cwdGuard.js,
    // this require would throw before any test runs:
    // Error: Cannot find module '../src/lib/terminal/cwdGuard'
    expect(() => {
      require('../../sidecar-backend/sessionCwd');
    }).not.toThrow();
  });

  test('falls back to process cwd when requested cwd is missing', () => {
    const result = resolveSidecarSessionCwd('/definitely/missing/devhub');

    expect(result.requestedCwd).toBe('/definitely/missing/devhub');
    expect(result.effectiveCwd).toBe(process.cwd());
    expect(result.usedFallback).toBe(true);
  });

  test('resolveSidecarSessionCwd returns valid shape for real directory', () => {
    const result = resolveSidecarSessionCwd('/tmp');
    expect(result).toHaveProperty('requestedCwd');
    expect(result).toHaveProperty('effectiveCwd');
    expect(result).toHaveProperty('usedFallback');
    expect(typeof result.requestedCwd).toBe('string');
    expect(typeof result.effectiveCwd).toBe('string');
    expect(typeof result.usedFallback).toBe('boolean');
  });

  test('returns /tmp unchanged when it exists', () => {
    const result = resolveSidecarSessionCwd('/tmp');
    expect(result.requestedCwd).toBe('/tmp');
    expect(result.effectiveCwd).toBe('/tmp');
    expect(result.usedFallback).toBe(false);
  });
});

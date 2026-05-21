const { resolveSidecarSessionCwd } = require('../../sidecar-backend/sessionCwd');

describe('sidecar cwd safeguard', () => {
  test('falls back to process cwd when requested cwd is missing', () => {
    const result = resolveSidecarSessionCwd('/definitely/missing/devhub');

    expect(result.requestedCwd).toBe('/definitely/missing/devhub');
    expect(result.effectiveCwd).toBe(process.cwd());
    expect(result.usedFallback).toBe(true);
  });
});

const { resolveTerminalSpawnCwd } = require('./cwdGuard.js');

function createFsMock(existingDirectories) {
  const directories = new Set(existingDirectories);

  return {
    statSync: jest.fn((targetPath) => {
      if (!directories.has(targetPath)) {
        throw new Error(`ENOENT: ${targetPath}`);
      }

      return {
        isDirectory: () => true,
      };
    }),
  };
}

describe('resolveTerminalSpawnCwd', () => {
  test('uses requested cwd when it exists', () => {
    const fsImpl = createFsMock(['/safe/requested', '/safe/process', '/safe/home']);

    expect(
      resolveTerminalSpawnCwd('/safe/requested', {
        fsImpl,
        processCwd: '/safe/process',
        homeDir: '/safe/home',
      })
    ).toEqual({
      requestedCwd: '/safe/requested',
      effectiveCwd: '/safe/requested',
      usedFallback: false,
    });
  });

  test('falls back to process cwd when requested cwd is missing', () => {
    const fsImpl = createFsMock(['/safe/process', '/safe/home']);

    expect(
      resolveTerminalSpawnCwd('/missing/project', {
        fsImpl,
        processCwd: '/safe/process',
        homeDir: '/safe/home',
      })
    ).toEqual({
      requestedCwd: '/missing/project',
      effectiveCwd: '/safe/process',
      usedFallback: true,
    });
  });

  test('falls back to home when process cwd is unavailable', () => {
    const fsImpl = createFsMock(['/safe/home']);

    expect(
      resolveTerminalSpawnCwd('/missing/project', {
        fsImpl,
        processCwd: '/missing/process',
        homeDir: '/safe/home',
      })
    ).toEqual({
      requestedCwd: '/missing/project',
      effectiveCwd: '/safe/home',
      usedFallback: true,
    });
  });
});

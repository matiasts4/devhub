/**
 * ttyServer.getAllActiveSessions.test.js — T-023 RED test.
 *
 * list_terminals (GET /api/terminal/processes) used to call
 * `getActiveOpenCodeSessionIds()`, which only surfaces sessions that
 * have an opencodeSessionId or mode === 'tui'. Plain PTY sessions
 * created by the open_terminal tool are invisible, so the assistant
 * loops on open_terminal calls.
 *
 * Fix: expose all active sessions via a new `getAllActiveSessions()`.
 *
 * The test seeds the global map directly (no PTY spawn) and asserts
 * the new helper returns the fake session.
 *
 * FAILS before the fix because `getAllActiveSessions` is not exported.
 */

describe('ttyServer — getAllActiveSessions (T-023)', () => {
  let getAllActiveSessions;

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ getAllActiveSessions } = require('../ttyServer.js'));
    });
    globalThis.__DEVHUB_TTY_SESSIONS__ = new Map();
  });

  afterEach(() => {
    delete globalThis.__DEVHUB_TTY_SESSIONS__;
  });

  test('returns a plain PTY session that has no opencodeSessionId', () => {
    globalThis.__DEVHUB_TTY_SESSIONS__.set('term-test', {
      id: 'term-test',
      cwd: '/tmp',
      shell: 'zsh',
      mode: 'pty',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const result = getAllActiveSessions();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'term-test', cwd: '/tmp', shell: 'zsh' }),
      ])
    );
  });

  test('sorts sessions by createdAt ascending', () => {
    globalThis.__DEVHUB_TTY_SESSIONS__.set('older', {
      id: 'older',
      cwd: '/a',
      shell: 'zsh',
      mode: 'shell',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    globalThis.__DEVHUB_TTY_SESSIONS__.set('newer', {
      id: 'newer',
      cwd: '/b',
      shell: 'zsh',
      mode: 'shell',
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    const result = getAllActiveSessions();

    expect(result[0].id).toBe('older');
    expect(result[1].id).toBe('newer');
  });
});

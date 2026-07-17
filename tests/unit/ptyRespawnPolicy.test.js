const {
  WIN_CTRL_C_EXIT_CODE,
  WIN_CTRL_C_EXIT_CODE_U32,
  isWindowsCtrlCExit,
  shouldRespawnShellAfterPtyExit,
} = require('../../src/lib/terminal/ptyRespawnPolicy.cjs');

describe('ptyRespawnPolicy', () => {
  test('recognizes STATUS_CONTROL_C_EXIT in signed and unsigned forms', () => {
    expect(isWindowsCtrlCExit(WIN_CTRL_C_EXIT_CODE)).toBe(true);
    expect(isWindowsCtrlCExit(WIN_CTRL_C_EXIT_CODE_U32)).toBe(true);
    expect(isWindowsCtrlCExit(0)).toBe(false);
    expect(isWindowsCtrlCExit(1)).toBe(false);
  });

  test('respawns only on win32 TUI/agent sessions killed by Ctrl+C', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'tui',
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(true);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'shell',
        agentType: 'opencode',
        exitCode: WIN_CTRL_C_EXIT_CODE_U32,
      })
    ).toBe(true);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'linux',
        mode: 'tui',
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(false);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'shell',
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(false);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'tui',
        exitCode: 0,
      })
    ).toBe(false);
  });

  test('caps respawn loops', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'tui',
        exitCode: WIN_CTRL_C_EXIT_CODE,
        respawnCount: 3,
        maxRespawns: 3,
      })
    ).toBe(false);
  });
});

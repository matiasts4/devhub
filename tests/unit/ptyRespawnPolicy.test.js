const {
  WIN_CTRL_C_EXIT_CODE,
  WIN_CTRL_C_EXIT_CODE_U32,
  isWindowsCtrlCExit,
  shouldRespawnShellAfterPtyExit,
  shouldRelaunchAgentAfterCtrlCRespawn,
} = require('../../src/lib/terminal/ptyRespawnPolicy.cjs');

describe('ptyRespawnPolicy', () => {
  test('recognizes STATUS_CONTROL_C_EXIT in signed and unsigned forms', () => {
    expect(isWindowsCtrlCExit(WIN_CTRL_C_EXIT_CODE)).toBe(true);
    expect(isWindowsCtrlCExit(WIN_CTRL_C_EXIT_CODE_U32)).toBe(true);
    expect(isWindowsCtrlCExit(0)).toBe(false);
  });

  test('bootstrapped modal agent: respawn on any exit (avoid Sesión finalizada)', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        launchCommand: 'opencode',
        mode: 'tui',
        exitCode: 0,
      })
    ).toBe(true);

    expect(
      shouldRespawnShellAfterPtyExit({
        launchCommand: 'grok',
        exitCode: 1,
      })
    ).toBe(true);
  });

  test('nested typed TUI: only Win Ctrl+C host-death respawns (clean quit stays fast)', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'tui',
        agentType: 'opencode',
        launchCommand: null,
        exitCode: 0,
      })
    ).toBe(false);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'tui',
        agentType: 'opencode',
        launchCommand: null,
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(true);

    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'linux',
        mode: 'tui',
        agentType: 'opencode',
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(false);
  });

  test('plain shell never respawns', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        platform: 'win32',
        mode: 'shell',
        exitCode: WIN_CTRL_C_EXIT_CODE,
      })
    ).toBe(false);
  });

  test('caps respawn loops', () => {
    expect(
      shouldRespawnShellAfterPtyExit({
        launchCommand: 'opencode',
        respawnCount: 3,
        maxRespawns: 3,
      })
    ).toBe(false);
  });

  test('relaunches agent only for unfocused collateral deaths', () => {
    expect(
      shouldRelaunchAgentAfterCtrlCRespawn({
        inputFocused: true,
        launchCommand: 'grok',
      })
    ).toBe(false);

    expect(
      shouldRelaunchAgentAfterCtrlCRespawn({
        inputFocused: false,
        launchCommand: 'grok',
      })
    ).toBe(true);
  });
});

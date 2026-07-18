/**
 * Windows ConPTY: Ctrl+C (CTRL_C_EVENT) often kills the whole console host
 * (powershell.exe), not just the child TUI. Exit code is STATUS_CONTROL_C_EXIT.
 *
 * Lives inside sidecar-backend so the packaged install (resources/sidecar-backend)
 * can require it without the repo's src/ tree.
 */

/** STATUS_CONTROL_C_EXIT — signed int32 form seen in node-pty logs */
const WIN_CTRL_C_EXIT_CODE = -1073741510;
/** Same status as unsigned 32-bit */
const WIN_CTRL_C_EXIT_CODE_U32 = 0xc000013a;

function isWindowsCtrlCExit(exitCode) {
  const n = Number(exitCode);
  return n === WIN_CTRL_C_EXIT_CODE || n === WIN_CTRL_C_EXIT_CODE_U32;
}

function hasLaunchCommand(launchCommand) {
  return typeof launchCommand === 'string' && launchCommand.trim().length > 0;
}

/**
 * Whether to keep WS clients alive and spawn a fresh interactive shell.
 *
 * Two different product paths:
 * 1) Bootstrapped agent (workspace modal / initialCommand → launchCommand set):
 *    any TUI death must leave a usable shell (never "Sesión finalizada").
 * 2) Nested TUI typed into an already-live shell (no launchCommand):
 *    do not intervene on clean quit — PowerShell stays and returns the prompt
 *    instantly. Only heal Windows ConPTY Ctrl+C host death.
 */
function shouldRespawnShellAfterPtyExit({
  platform = typeof process !== 'undefined' ? process.platform : '',
  mode = null,
  agentType = null,
  launchCommand = null,
  exitCode = null,
  respawnCount = 0,
  maxRespawns = 3,
} = {}) {
  if (Number(respawnCount) >= Number(maxRespawns)) return false;

  const bootstrapped = hasLaunchCommand(launchCommand);
  if (bootstrapped) return true;

  // Nested / typed TUI: only the Win ConPTY Ctrl+C host-death case.
  const wasTui = mode === 'tui' || Boolean(agentType);
  if (!wasTui) return false;
  if (platform !== 'win32') return false;
  return isWindowsCtrlCExit(exitCode);
}

/**
 * Windows ConPTY Ctrl+C can kill sibling panel hosts too. If this session was
 * not the focused input target, restore the agent launch instead of leaving a
 * bare shell (which drops the sibling Grok/OpenCode session).
 *
 * Only meaningful for bootstrapped agents (have launchCommand).
 */
function shouldRelaunchAgentAfterCtrlCRespawn({
  inputFocused = false,
  launchCommand = null,
  agentType = null,
} = {}) {
  if (inputFocused) return false;
  return hasLaunchCommand(launchCommand) || Boolean(agentType);
}

module.exports = {
  WIN_CTRL_C_EXIT_CODE,
  WIN_CTRL_C_EXIT_CODE_U32,
  isWindowsCtrlCExit,
  hasLaunchCommand,
  shouldRespawnShellAfterPtyExit,
  shouldRelaunchAgentAfterCtrlCRespawn,
};

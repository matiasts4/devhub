/**
 * Windows ConPTY: Ctrl+C (CTRL_C_EVENT) often kills the whole console host
 * (powershell.exe), not just the child TUI. Exit code is STATUS_CONTROL_C_EXIT.
 *
 * CJS so sidecar-backend and ttyServer (via createRequire) share one copy.
 */

/** STATUS_CONTROL_C_EXIT — signed int32 form seen in node-pty logs */
const WIN_CTRL_C_EXIT_CODE = -1073741510;
/** Same status as unsigned 32-bit */
const WIN_CTRL_C_EXIT_CODE_U32 = 0xc000013a;

function isWindowsCtrlCExit(exitCode) {
  const n = Number(exitCode);
  return n === WIN_CTRL_C_EXIT_CODE || n === WIN_CTRL_C_EXIT_CODE_U32;
}

/**
 * Whether to keep WS clients alive and spawn a fresh interactive shell.
 */
function shouldRespawnShellAfterPtyExit({
  platform = typeof process !== 'undefined' ? process.platform : '',
  mode = null,
  agentType = null,
  exitCode = null,
  respawnCount = 0,
  maxRespawns = 3,
} = {}) {
  if (platform !== 'win32') return false;
  if (Number(respawnCount) >= Number(maxRespawns)) return false;
  const wasTui = mode === 'tui' || Boolean(agentType);
  if (!wasTui) return false;
  return isWindowsCtrlCExit(exitCode);
}

module.exports = {
  WIN_CTRL_C_EXIT_CODE,
  WIN_CTRL_C_EXIT_CODE_U32,
  isWindowsCtrlCExit,
  shouldRespawnShellAfterPtyExit,
};

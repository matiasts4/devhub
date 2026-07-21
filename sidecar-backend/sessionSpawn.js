const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let tmuxAvailabilityCache = null;

function resolveWindowsShell() {
  if (os.platform() !== 'win32') return null;
  try {
    const result = spawnSync(
      'pwsh.exe',
      ['-NoLogo', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      { encoding: 'utf8', stdio: 'pipe', timeout: 3000 }
    );
    if (result.status === 0 && result.stdout?.trim()) return 'pwsh.exe';
  } catch {
    // pwsh not available
  }
  return 'powershell.exe';
}

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseBooleanQueryFlag(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function hasTmux() {
  if (typeof tmuxAvailabilityCache === 'boolean') return tmuxAvailabilityCache;
  if (os.platform() === 'win32') {
    tmuxAvailabilityCache = false;
    return tmuxAvailabilityCache;
  }

  try {
    const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
    tmuxAvailabilityCache = result.status === 0;
  } catch {
    tmuxAvailabilityCache = false;
  }

  return tmuxAvailabilityCache;
}

function buildSwarmTmuxSessionName(launchId, roleKey) {
  const safeLaunch = String(launchId || '').trim();
  const safeRole = String(roleKey || '').trim();
  if (!safeLaunch || !safeRole) return null;
  return `devhub-swarm-${safeLaunch}-${safeRole}`;
}

function buildSidecarSpawnConfig({
  sessionId,
  cwd,
  isSwarmRole = false,
  launchId = null,
  roleKey = null,
  env = process.env,
  hookToken = null,
  hookUrl = null,
} = {}) {
  const isWin = os.platform() === 'win32';
  const resolvedShell = isWin ? resolveWindowsShell() : env.SHELL || 'bash';
  const swarmSessionName = isSwarmRole ? buildSwarmTmuxSessionName(launchId, roleKey) : null;
  const tmuxSession = swarmSessionName;

  const kimiBinDir = path.join(os.homedir(), '.kimi-code', 'bin');
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const existingPath = env[pathKey] || '';
  const separator = isWin ? ';' : ':';
  const newPath = existingPath ? `${kimiBinDir}${separator}${existingPath}` : kimiBinDir;

  const sidecarPort = env.SIDECAR_PORT || '4000';
  const defaultHookUrl = env.DEVHUB_HOOK_URL || `http://127.0.0.1:${sidecarPort}/agent-hook`;
  const effectiveHookUrl = hookUrl || defaultHookUrl;

  const spawnEnv = {
    ...env,
    [pathKey]: newPath,
    TERM: 'xterm-256color',
    DEVHUB_PROJECT_DIR: cwd,
    MOTD_SHOWN: 'true',
    SSH_CONNECTION: '',
    HUSHLOGIN: 'true',
    DEVHUB_HOOK_ENV: '1',
    DEVHUB_TERMINAL_ID: sessionId || '',
    DEVHUB_HOOK_URL: effectiveHookUrl,
  };

  if (hookToken) {
    spawnEnv.DEVHUB_HOOK_TOKEN = hookToken;
  }

  // The PTY sidecar is a Node process and may have been launched with a
  // restrictive --max-old-space-size (e.g. 384 MB). Shells spawned through it
  // must not inherit that flag, or arbitrary Node commands run by the user
  // (pnpm tauri dev, npm scripts, etc.) will OOM. Keep any other NODE_OPTIONS
  // the user/system may have set.
  const sidecarNodeOptions = env.NODE_OPTIONS || '';
  if (sidecarNodeOptions) {
    const cleanedNodeOptions = sidecarNodeOptions
      .split(' ')
      .filter((part) => !/^--max-old-space-size=/.test(part))
      .join(' ')
      .trim();
    if (cleanedNodeOptions) {
      spawnEnv.NODE_OPTIONS = cleanedNodeOptions;
    } else {
      delete spawnEnv.NODE_OPTIONS;
    }
  }

  if (tmuxSession) {
    spawnEnv.DEVHUB_TMUX_SESSION = tmuxSession;
  }

  let args = [];
  const shellBase = path.basename(resolvedShell).toLowerCase();
  if (isWin && (shellBase.includes('powershell') || shellBase.includes('pwsh'))) {
    // -NoLogo hides the copyright banner; POWERSHELL_UPDATECHECK=Off disables
    // the "install the latest PowerShell" update prompt in PowerShell 7.
    args = ['-NoLogo'];
    spawnEnv.POWERSHELL_UPDATECHECK = 'Off';
  }

  if (tmuxSession && hasTmux() && !isWin) {
    const { buildTmuxPanelAttachCommand } = require('../src/lib/terminal/tmuxStatusBar.js');
    const attachCommand = buildTmuxPanelAttachCommand(tmuxSession, cwd);
    return {
      shell: resolvedShell,
      args: ['-lc', attachCommand],
      env: spawnEnv,
      tmuxSession,
      tmuxEnabled: true,
      isSwarmRole: Boolean(isSwarmRole),
    };
  }

  return {
    shell: resolvedShell,
    args,
    env: spawnEnv,
    tmuxSession: null,
    tmuxEnabled: false,
    isSwarmRole: Boolean(isSwarmRole),
  };
}

module.exports = {
  buildSidecarSpawnConfig,
  buildSwarmTmuxSessionName,
  hasTmux,
  parseBooleanQueryFlag,
};

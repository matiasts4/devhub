const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let tmuxAvailabilityCache = null;

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
} = {}) {
  const resolvedShell = env.SHELL || 'bash';
  const swarmSessionName = isSwarmRole ? buildSwarmTmuxSessionName(launchId, roleKey) : null;
  const tmuxSession = swarmSessionName;

  const kimiBinDir = path.join(os.homedir(), '.kimi-code', 'bin');
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const existingPath = env[pathKey] || '';
  const separator = os.platform() === 'win32' ? ';' : ':';
  const newPath = existingPath ? `${kimiBinDir}${separator}${existingPath}` : kimiBinDir;

  const spawnEnv = {
    ...env,
    [pathKey]: newPath,
    TERM: 'xterm-256color',
    DEVHUB_PROJECT_DIR: cwd,
    MOTD_SHOWN: 'true',
    SSH_CONNECTION: '',
    HUSHLOGIN: 'true',
  };

  if (tmuxSession) {
    spawnEnv.DEVHUB_TMUX_SESSION = tmuxSession;
  }

  if (tmuxSession && hasTmux() && os.platform() !== 'win32') {
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
    args: [],
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

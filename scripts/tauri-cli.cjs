#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRED_GTK_PACKAGES = ['javascriptcoregtk-4.1', 'libsoup-3.0', 'webkit2gtk-4.1'];
const SYSTEM_PKG_CONFIG = '/usr/bin/pkg-config';
const TAURI_CLI_ENTRY = path.join(__dirname, '..', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const TAURI_CONF_PATH = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const DEFAULT_LINUX_PKG_CONFIG_PATHS = ['/usr/lib/x86_64-linux-gnu/pkgconfig', '/usr/share/pkgconfig'];
const DEV_URL_READY_PATH = '/api/agenthub/config';

function mergePkgConfigPath(existingValue, platform = process.platform) {
  if (platform !== 'linux') {
    return existingValue;
  }

  const existingParts = String(existingValue || '')
    .split(':')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_LINUX_PKG_CONFIG_PATHS, ...existingParts])].join(':');
}

function pkgConfigResolves({ command, env, execFileSync: exec = execFileSync }) {
  exec(command, ['--exists', ...REQUIRED_GTK_PACKAGES], {
    env,
    stdio: 'ignore',
  });
  return true;
}

function shouldPreferSystemPkgConfig({
  env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (platform !== 'linux' || env.PKG_CONFIG) {
    return false;
  }

  try {
    pkgConfigResolves({ command: 'pkg-config', env, execFileSync: exec });
    return false;
  } catch (_error) {
    if (!existsSync(SYSTEM_PKG_CONFIG)) {
      return false;
    }
  }

  try {
    pkgConfigResolves({ command: SYSTEM_PKG_CONFIG, env, execFileSync: exec });
    return true;
  } catch (_error) {
    return false;
  }
}

function buildTauriEnv({
  env = process.env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  const nextEnv = { ...env };

  if (platform === 'linux') {
    nextEnv.PKG_CONFIG_PATH = mergePkgConfigPath(nextEnv.PKG_CONFIG_PATH, platform);
  }

  if (
    shouldPreferSystemPkgConfig({
      env: nextEnv,
      platform,
      execFileSync: exec,
      existsSync,
    })
  ) {
    nextEnv.PKG_CONFIG = SYSTEM_PKG_CONFIG;
  }

  return nextEnv;
}

function readTauriBuildConfig({
  configPath = TAURI_CONF_PATH,
  readFileSync = fs.readFileSync,
} = {}) {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed?.build || null;
  } catch (_error) {
    return null;
  }
}

function isReadyHttpStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 400;
}

function buildDevReadyProbeUrl(url, readinessPath = DEV_URL_READY_PATH) {
  if (!url) {
    return null;
  }

  try {
    return new URL(readinessPath, url).toString();
  } catch (_error) {
    return null;
  }
}

function isDevUrlReady(url, { spawnSync: spawn = spawnSync } = {}) {
  const probeTarget = buildDevReadyProbeUrl(url);

  if (!probeTarget) {
    return false;
  }

  const probeScript = [
    'const target = process.argv[1];',
    'const parsed = new URL(target);',
    "const client = parsed.protocol === 'https:' ? require('https') : require('http');",
    'const req = client.request(target, { method: \"GET\", timeout: 500 }, (res) => {',
    '  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);',
    '});',
    'req.on(\"timeout\", () => { req.destroy(); process.exit(1); });',
    'req.on(\"error\", () => process.exit(1));',
    'req.end();',
  ].join(' ');

  const result = spawn(process.execPath, ['-e', probeScript, probeTarget], {
    stdio: 'ignore',
  });

  return result.status === 0;
}

function injectArgsBeforeAppArgs(args, extraArgs) {
  const appArgsIndex = args.indexOf('--');

  if (appArgsIndex === -1) {
    return [...args, ...extraArgs];
  }

  return [...args.slice(0, appArgsIndex), ...extraArgs, ...args.slice(appArgsIndex)];
}

function resolveTauriCliArgs({ args = [], buildConfig = null, devUrlReady = false } = {}) {
  if (
    args[0] !== 'dev'
    || !buildConfig?.beforeDevCommand
    || !buildConfig?.devUrl
    || !devUrlReady
  ) {
    return args;
  }

  return injectArgsBeforeAppArgs(args, ['-c', JSON.stringify({ build: { beforeDevCommand: '' } })]);
}

function runTauriCli({
  args = process.argv.slice(2),
  env = buildTauriEnv(),
  spawnSync: spawn = spawnSync,
} = {}) {
  const buildConfig = readTauriBuildConfig();
  const cliArgs = resolveTauriCliArgs({
    args,
    buildConfig,
    devUrlReady: args[0] === 'dev' ? isDevUrlReady(buildConfig?.devUrl, { spawnSync: spawn }) : false,
  });

  const result = spawn(process.execPath, [TAURI_CLI_ENTRY, ...cliArgs], {
    stdio: 'inherit',
    env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return result.status;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  return 1;
}

if (require.main === module) {
  try {
    runTauriCli();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildDevReadyProbeUrl,
  buildTauriEnv,
  DEV_URL_READY_PATH,
  DEFAULT_LINUX_PKG_CONFIG_PATHS,
  injectArgsBeforeAppArgs,
  isDevUrlReady,
  isReadyHttpStatus,
  mergePkgConfigPath,
  pkgConfigResolves,
  REQUIRED_GTK_PACKAGES,
  readTauriBuildConfig,
  resolveTauriCliArgs,
  runTauriCli,
  shouldPreferSystemPkgConfig,
  SYSTEM_PKG_CONFIG,
  TAURI_CLI_ENTRY,
  TAURI_CONF_PATH,
};

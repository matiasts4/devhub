import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export const KIMI_BLOCK_BEGIN = '# >>> devhub hooks (v2) >>>';
export const KIMI_BLOCK_BEGIN_LEGACY_V1 = '# >>> devhub hooks (v1) >>>';
export const KIMI_BLOCK_END = '# <<< devhub hooks <<<';

/**
 * Kimi Code hook events (full reference: kimi.com/code/docs hooks page).
 * DONE-EVIDENCE-01 adds the tool/turn lifecycle events so hook authority
 * stays fresh across long tool calls (PostToolUse*, SubagentStop) and failed
 * or closed turns settle to idle deterministically (StopFailure, SessionEnd).
 */
export const KIMI_EVENTS = [
  ['SessionStart', 'session'],
  ['UserPromptSubmit', 'working'],
  ['PreToolUse', 'working'],
  ['PostToolUse', 'working'],
  ['PostToolUseFailure', 'working'],
  ['SubagentStart', 'working'],
  ['SubagentStop', 'working'],
  ['PreCompact', 'working'],
  ['PermissionRequest', 'blocked'],
  ['PermissionResult', 'working'],
  ['Stop', 'idle'],
  ['StopFailure', 'idle'],
  ['Interrupt', 'idle'],
  ['SessionEnd', 'idle'],
];

export const CLAUDE_EVENTS = [
  ['SessionStart', 'session'],
  ['UserPromptSubmit', 'working'],
  ['PreToolUse', 'working'],
  ['PostToolUse', 'working'],
  ['PostToolUseFailure', 'working'],
  ['SubagentStop', 'working'],
  ['PermissionRequest', 'blocked'],
  ['Stop', 'idle'],
];

/**
 * Antigravity (agy) hook events — ~/.gemini/config/hooks.json.
 * Quirk: the payload delivered on stdin does NOT include the event name, so
 * the installed command passes it as argv[2] to the bridge.
 * The bridge (scripts/agent-hooks/antigravity-bridge.mjs) maps:
 *   PreInvocation → working, Pre/PostToolUse → working,
 *   Stop + fullyIdle:true → idle, Stop + fullyIdle:false → working.
 */
export const ANTIGRAVITY_EVENTS = [
  'PreInvocation',
  'PostInvocation',
  'PreToolUse',
  'PostToolUse',
  'Stop',
];

/** Marker substring identifying DevHub-managed entries in hooks.json. */
export const ANTIGRAVITY_HOOK_MARKER = 'antigravity-bridge.mjs';

function findPathUpwards(startDir, ...relativeSegments) {
  let currentDir = path.resolve(startDir);
  for (let depth = 0; depth <= 6; depth += 1) {
    const candidate = path.join(currentDir, ...relativeSegments);
    if (fs.existsSync(candidate)) return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

export function resolveHookAssetsDir() {
  const candidate =
    findPathUpwards(process.cwd(), 'scripts', 'agent-hooks') ||
    (typeof __dirname !== 'undefined'
      ? findPathUpwards(__dirname, 'scripts', 'agent-hooks')
      : null);

  if (!candidate || !fs.existsSync(candidate)) {
    throw new Error(
      `Agent hook script assets directory not found searching upwards from ${process.cwd()}`
    );
  }

  return candidate;
}

/**
 * Format installed hook command with appropriate shell wrapper and quoting.
 */
export function buildInstalledHookCommand(scriptPath, state, event, agentName) {
  const normalized = scriptPath.replace(/\\/g, '/');
  if (scriptPath.endsWith('.ps1')) {
    const winPath = scriptPath.replace(/\//g, '\\');
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${winPath}" -State ${state} -Event ${event} -Agent ${agentName}`;
  }
  const escapedPath = normalized.replace(/'/g, "'\\''");
  return `bash '${escapedPath}' ${state} ${event} ${agentName}`;
}

/**
 * Best-effort version check for Kimi CLI (≥ 0.14.0).
 */
export function checkKimiVersion() {
  try {
    const output = execSync('kimi --version', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 0 || (major === 0 && minor < 14)) {
        return {
          ok: false,
          version: match[0],
          warning: `Kimi version ${match[0]} is below minimum recommended version 0.14.0`,
        };
      }
      return { ok: true, version: match[0] };
    }
  } catch {
    return { ok: false, version: null, warning: 'Kimi CLI version check timed out or failed' };
  }
  return { ok: true, version: null };
}

/**
 * Remove DevHub managed block from Kimi TOML configuration string — byte-faithful to surrounding text.
 * Matches both the current (v2) and legacy (v1) begin markers so upgrades
 * cleanly replace older installs.
 */
export function removeKimiManagedBlock(content = '') {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex(
    (l) => l.trim() === KIMI_BLOCK_BEGIN || l.trim() === KIMI_BLOCK_BEGIN_LEGACY_V1
  );
  if (startIdx === -1) return content;

  let endIdx = lines.findIndex((l) => l.trim() === KIMI_BLOCK_END);
  if (endIdx === -1) endIdx = lines.length - 1;

  let removeStart = startIdx;
  if (removeStart > 0 && lines[removeStart - 1].trim() === '') {
    removeStart -= 1;
  }

  const result = [...lines.slice(0, removeStart), ...lines.slice(endIdx + 1)];
  return result.join('\n');
}

/**
 * Merge DevHub managed block into Kimi config string.
 */
export function buildKimiConfigWithHooks(content = '', scriptPath = '', agentName = 'kimi') {
  const clean = removeKimiManagedBlock(content);

  let block = `${KIMI_BLOCK_BEGIN}\n`;
  for (const [event, state] of KIMI_EVENTS) {
    const cmd = buildInstalledHookCommand(scriptPath, state, event, agentName);
    block += `[[hooks]]\nevent = "${event}"\ncommand = ${JSON.stringify(cmd)}\ntimeout = 10\n\n`;
  }
  block += `${KIMI_BLOCK_END}\n`;

  if (!clean) return block;

  const separator = clean.endsWith('\n\n') ? '' : clean.endsWith('\n') ? '\n' : '\n\n';
  return clean + separator + block;
}

/**
 * Check if Kimi config string has DevHub managed block.
 */
export function isKimiHooksInstalled(content = '') {
  return content.includes(KIMI_BLOCK_BEGIN);
}

/**
 * Merge DevHub hooks into Claude settings.json string.
 */
export function buildClaudeSettingsWithHooks(
  content = '{}',
  scriptPath = '',
  agentName = 'claude'
) {
  let json = {};
  try {
    json = JSON.parse(content || '{}');
  } catch {
    json = {};
  }

  if (!json.hooks || typeof json.hooks !== 'object') {
    json.hooks = {};
  }

  for (const [event, state] of CLAUDE_EVENTS) {
    let list = Array.isArray(json.hooks[event]) ? json.hooks[event] : [];
    // Remove existing devhub hook entries
    list = list.filter((item) => {
      const hooks = item?.hooks;
      if (!Array.isArray(hooks)) return true;
      return !hooks.some(
        (h) => typeof h?.command === 'string' && h.command.includes('devhub-agent-state')
      );
    });

    const cmd = buildInstalledHookCommand(scriptPath, state, event, agentName);
    list.push({
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: cmd,
          timeout: 10,
        },
      ],
    });

    json.hooks[event] = list;
  }

  return JSON.stringify(json, null, 2) + '\n';
}

/**
 * Remove DevHub hooks from Claude settings.json string — preserves existing empty hook arrays or objects.
 */
export function removeClaudeHooks(content = '{}') {
  let json = {};
  try {
    json = JSON.parse(content || '{}');
  } catch {
    return content;
  }

  if (!json.hooks || typeof json.hooks !== 'object') {
    return content;
  }

  for (const event of Object.keys(json.hooks)) {
    if (!Array.isArray(json.hooks[event])) continue;
    json.hooks[event] = json.hooks[event].filter((item) => {
      const hooks = item?.hooks;
      if (!Array.isArray(hooks)) return true;
      return !hooks.some(
        (h) => typeof h?.command === 'string' && h.command.includes('devhub-agent-state')
      );
    });
  }

  return JSON.stringify(json, null, 2) + '\n';
}

/**
 * Check if Claude settings.json string has DevHub hooks.
 */
export function isClaudeHooksInstalled(content = '') {
  return content.includes('devhub-agent-state');
}

// ─── Antigravity (agy) hooks.json support ────────────────────────────────────

/**
 * Build the hook command for a given Antigravity event.
 * The bridge receives the event name as argv[2] (payload lacks it).
 */
export function buildAntigravityHookCommand(bridgePath, eventName) {
  const normalized = bridgePath.replace(/\\/g, '/');
  return `node "${normalized}" ${eventName}`;
}

function isDevhubAntigravityEntry(entry) {
  const hooks = entry?.hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) => typeof h?.command === 'string' && h.command.includes(ANTIGRAVITY_HOOK_MARKER)
  );
}

/**
 * Merge DevHub hook entries into an Antigravity hooks.json string.
 * Idempotent and non-destructive:
 *   - parses existing JSON (corrupt → returns fresh config, caller backs up)
 *   - removes ONLY previous DevHub entries (identified by bridge marker)
 *   - preserves third-party hooks untouched
 *
 * @param {string} content — existing hooks.json content ('' when absent)
 * @param {string} bridgePath — absolute path to antigravity-bridge.mjs
 * @returns {{ json: string, wasCorrupt: boolean }}
 */
export function buildAntigravityHooksConfig(content = '', bridgePath = '') {
  let json = {};
  let wasCorrupt = false;
  if (content && content.trim()) {
    try {
      json = JSON.parse(content);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        json = {};
        wasCorrupt = true;
      }
    } catch {
      json = {};
      wasCorrupt = true;
    }
  }

  if (!json.hooks || typeof json.hooks !== 'object' || Array.isArray(json.hooks)) {
    json.hooks = {};
  }

  for (const eventName of ANTIGRAVITY_EVENTS) {
    let list = Array.isArray(json.hooks[eventName]) ? json.hooks[eventName] : [];
    // Remove only previous DevHub entries — never clobber third-party hooks.
    list = list.filter((entry) => !isDevhubAntigravityEntry(entry));

    list.push({
      hooks: [
        {
          type: 'command',
          command: buildAntigravityHookCommand(bridgePath, eventName),
          timeout: 30,
        },
      ],
    });

    json.hooks[eventName] = list;
  }

  return { json: JSON.stringify(json, null, 2) + '\n', wasCorrupt };
}

/**
 * Remove DevHub-managed entries from an Antigravity hooks.json string.
 * Preserves third-party hooks and empty arrays.
 */
export function removeAntigravityHooks(content = '') {
  let json = {};
  try {
    json = JSON.parse(content || '{}');
  } catch {
    return content;
  }

  if (!json.hooks || typeof json.hooks !== 'object') {
    return content;
  }

  for (const event of Object.keys(json.hooks)) {
    if (!Array.isArray(json.hooks[event])) continue;
    json.hooks[event] = json.hooks[event].filter((entry) => !isDevhubAntigravityEntry(entry));
  }

  return JSON.stringify(json, null, 2) + '\n';
}

/**
 * Check if an Antigravity hooks.json string has DevHub-managed entries.
 */
export function isAntigravityHooksInstalled(content = '') {
  return content.includes(ANTIGRAVITY_HOOK_MARKER);
}

/**
 * Resolve target config directory for agent.
 */
export function resolveAgentConfigPath(agent) {
  const home = os.homedir();
  if (agent === 'kimi') {
    return path.join(home, '.kimi-code', 'config.toml');
  }
  if (agent === 'claude') {
    return path.join(home, '.claude', 'settings.json');
  }
  if (agent === 'qodercli' || agent === 'qoder') {
    return path.join(home, '.qoder', 'settings.json');
  }
  if (agent === 'agy' || agent === 'antigravity') {
    // Global hooks recognized by all 3 Antigravity variants (terminal agent,
    // CLI, and IDE). Workspace-level .agents/hooks.json is NOT managed here.
    return path.join(home, '.gemini', 'config', 'hooks.json');
  }
  if (agent === 'opencode') {
    const custom = process.env.OPENCODE_PLUGINS_DIR;
    if (custom) return path.join(custom, 'devhub-agent-state.js');
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const candidates = [
      path.join(xdgConfig, 'opencode', 'plugins', 'devhub-agent-state.js'),
      path.join(home, '.opencode', 'plugins', 'devhub-agent-state.js'),
    ];
    if (process.platform === 'win32' && process.env.APPDATA) {
      candidates.unshift(
        path.join(process.env.APPDATA, 'opencode', 'plugins', 'devhub-agent-state.js')
      );
    }
    for (const cand of candidates) {
      if (fs.existsSync(path.dirname(cand))) return cand;
    }
    return candidates[0];
  }
  throw new Error(`Unsupported agent: ${agent}`);
}

/**
 * Get status of agent hook installation.
 */
export function getAgentHookStatus(agent) {
  try {
    const configPath = resolveAgentConfigPath(agent);
    if (!fs.existsSync(configPath)) {
      return { installed: false, configPath, exists: false };
    }
    if (agent === 'opencode') {
      return { installed: true, configPath, exists: true };
    }
    const content = fs.readFileSync(configPath, 'utf8');
    if (agent === 'kimi') {
      return { installed: isKimiHooksInstalled(content), configPath, exists: true };
    }
    if (agent === 'claude') {
      return { installed: isClaudeHooksInstalled(content), configPath, exists: true };
    }
    if (agent === 'qodercli' || agent === 'qoder') {
      return { installed: isClaudeHooksInstalled(content), configPath, exists: true };
    }
    if (agent === 'agy' || agent === 'antigravity') {
      return { installed: isAntigravityHooksInstalled(content), configPath, exists: true };
    }
  } catch (err) {
    return { installed: false, error: err.message };
  }
  return { installed: false };
}

/**
 * Copy asset scripts to destination directory.
 */
export function copyHookScripts(targetDir) {
  const assetsDir = resolveHookAssetsDir();

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const shSource = path.join(assetsDir, 'devhub-agent-state.sh');
  const ps1Source = path.join(assetsDir, 'devhub-agent-state.ps1');

  if (!fs.existsSync(shSource) || !fs.existsSync(ps1Source)) {
    throw new Error(`Hook script assets missing in ${assetsDir}`);
  }

  const shDest = path.join(targetDir, 'devhub-agent-state.sh');
  const ps1Dest = path.join(targetDir, 'devhub-agent-state.ps1');

  fs.copyFileSync(shSource, shDest);
  fs.copyFileSync(ps1Source, ps1Dest);

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(shDest, 0o755);
    } catch {
      /* ignore */
    }
  }

  return { shDest, ps1Dest };
}

/**
 * Install Antigravity hooks into ~/.gemini/config/hooks.json.
 * Idempotent, non-destructive merge:
 *   - creates config dir when missing (agy recognizes pre-created hooks)
 *   - backs up existing file before every write (single .devhub-bak)
 *   - corrupt JSON → timestamped backup + fresh config + warning
 *   - never touches third-party hook entries
 */
function installAntigravityHook(configPath, configDir) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const assetsDir = resolveHookAssetsDir();
  const bridgePath = path.join(assetsDir, 'antigravity-bridge.mjs');
  if (!fs.existsSync(bridgePath)) {
    throw new Error(`Antigravity bridge asset missing in ${assetsDir}`);
  }

  let content = '';
  if (fs.existsSync(configPath)) {
    content = fs.readFileSync(configPath, 'utf8');
    const backupPath = `${configPath}.devhub-bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(configPath, backupPath);
    }
  }

  const { json: newContent, wasCorrupt } = buildAntigravityHooksConfig(content, bridgePath);

  if (wasCorrupt && content) {
    // Never overwrite unparseable content without preserving it.
    const corruptBackup = `${configPath}.devhub-corrupt-${Date.now()}`;
    fs.copyFileSync(configPath, corruptBackup);
    console.warn(
      `[devhub-hooks] WARNING: ${configPath} contained corrupt JSON — backed up to ${corruptBackup} and writing fresh config`
    );
  }

  fs.writeFileSync(configPath, newContent, 'utf8');
  return { success: true, agent: 'agy', action: 'installed', configPath, bridgePath, wasCorrupt };
}

/**
 * Install agent hook.
 */
export function installAgentHook(agent, options = {}) {
  const configPath = resolveAgentConfigPath(agent);
  const configDir = path.dirname(configPath);

  if (agent === 'agy' || agent === 'antigravity') {
    return installAntigravityHook(configPath, configDir);
  }

  // P3-6: Abort if config directory does not exist
  if (!fs.existsSync(configDir)) {
    throw new Error(
      `Installation aborted: Agent config directory for '${agent}' does not exist (${configDir}). Please run ${agent} at least once first.`
    );
  }

  if (agent === 'opencode') {
    const assetsDir = resolveHookAssetsDir();
    const pluginSource = path.join(assetsDir, 'devhub-opencode-plugin.js');
    if (!fs.existsSync(pluginSource)) {
      throw new Error(`OpenCode plugin asset missing in ${assetsDir}`);
    }
    fs.copyFileSync(pluginSource, configPath);
    return { success: true, agent, action: 'installed', configPath };
  }

  if (agent === 'kimi') {
    const versionResult = checkKimiVersion();
    if (versionResult.warning) {
      console.warn(`[devhub-hooks] ${versionResult.warning}`);
    }
  }

  const hooksDir = path.join(configDir, 'hooks');
  const { shDest, ps1Dest } = copyHookScripts(hooksDir);
  const scriptPath = process.platform === 'win32' && !options.useBash ? ps1Dest : shDest;

  let content = '';
  if (fs.existsSync(configPath)) {
    content = fs.readFileSync(configPath, 'utf8');
    const backupPath = `${configPath}.devhub-bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(configPath, backupPath);
    }
  }

  let newContent = content;
  if (agent === 'kimi') {
    newContent = buildKimiConfigWithHooks(content, scriptPath, 'kimi');
  } else if (agent === 'claude') {
    newContent = buildClaudeSettingsWithHooks(content, scriptPath, 'claude');
  } else if (agent === 'qodercli' || agent === 'qoder') {
    newContent = buildClaudeSettingsWithHooks(content, scriptPath, 'qodercli');
  }

  fs.writeFileSync(configPath, newContent, 'utf8');
  return { success: true, agent, action: 'installed', configPath, scriptPath };
}

/**
 * Uninstall agent hook.
 */
export function uninstallAgentHook(agent) {
  const configPath = resolveAgentConfigPath(agent);

  if (agent === 'opencode') {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return { success: true, agent, action: 'uninstalled', configPath };
  }

  if (!fs.existsSync(configPath)) {
    return { success: true, agent, action: 'not_found', configPath };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  let newContent = content;

  if (agent === 'agy' || agent === 'antigravity') {
    newContent = removeAntigravityHooks(content);
  } else if (agent === 'kimi') {
    newContent = removeKimiManagedBlock(content);
  } else if (agent === 'claude') {
    newContent = removeClaudeHooks(content);
  } else if (agent === 'qodercli' || agent === 'qoder') {
    newContent = removeClaudeHooks(content);
  }

  fs.writeFileSync(configPath, newContent, 'utf8');
  return { success: true, agent, action: 'uninstalled', configPath };
}

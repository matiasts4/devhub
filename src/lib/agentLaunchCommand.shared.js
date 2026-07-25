/* eslint-env node */
/**
 * @module agentLaunchCommand.shared
 * Shared agent launch command builder.
 * SAFE for browser — all Node.js-only operations are lazy and conditional.
 */

import { shellQuotePrompt } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { buildTmuxDisableStatusFragment } from '@/lib/terminal/tmuxStatusBar.js';
import { buildPrompt } from './sdd/SwarmPromptEngine';
import { generateSessionId, buildTmuxSessionName } from './sdd/sessionIdUtils';

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Read minimax config lazily — only runs in Node.js (server-side).
 * Uses process.mainModule.require to access fs without triggering Turbopack static analysis.
 */
function _getMinimaxConfig() {
  if (typeof process === 'undefined' || !process.stdout) return null;
  try {
    // process.mainModule.require is available in Node.js and bypasses Turbopack static analysis
    const nodeRequire = process.mainModule?.require;
    if (typeof nodeRequire !== 'function') return null;
    const path = nodeRequire('path');
    const fs = nodeRequire('fs');
    const configPath = path.join(process.cwd(), 'data', 'llm-providers-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.providers?.minimax ?? null;
  } catch {
    return null;
  }
}
// Keep a silent reference so tree-shaking does not drop a helper still used by future inject paths.
void _getMinimaxConfig;

/**
 * Legacy Linux defaults (kept for documentation / non-Node fallbacks).
 * Prefer `resolveAgentProgramExecutable` which probes the real host.
 */
export const AGENT_PROGRAM_EXECUTABLES = Object.freeze({
  opencode: 'opencode',
  codex: 'codex',
  hermes: 'hermes',
  kimi: 'kimi',
  grok: 'grok',
  agy: 'agy',
  antigravity: 'agy',
  qodercli: 'qodercli',
  qoder: 'qodercli',
});

/** Skill folder names under ~/.kimi-code/skills (or peers). */
export const KIMI_SKILL_NAMES = Object.freeze({
  zed: 'devhub-zed-orchestrator',
  director: 'devhub-zed-orchestrator',
  sdd_worker_1: 'devhub-gentle-orchestrator',
  sdd_worker_2: 'devhub-gentle-orchestrator',
  sdd_worker_3: 'devhub-gentle-orchestrator',
  sdd_worker_4: 'devhub-gentle-orchestrator',
  default: 'devhub-gentle-orchestrator',
});

/** @deprecated use KIMI_SKILL_NAMES + resolveKimiSkillDir */
export const KIMI_SKILL_DIRS = Object.freeze({
  zed: '',
  director: '',
  sdd_worker_1: '',
  sdd_worker_2: '',
  sdd_worker_3: '',
  sdd_worker_4: '',
  default: '',
});

function isNodeRuntime() {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

function getUserHome() {
  if (!isNodeRuntime()) return '';
  return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
}

function tryRequireNode(moduleId) {
  if (!isNodeRuntime()) return null;
  try {
    // Prefer process.mainModule.require so browser bundlers never see bare `require`.
    const req = process.mainModule?.require;
    if (typeof req !== 'function') return null;
    return req(moduleId);
  } catch {
    return null;
  }
}

function pathExists(filePath) {
  if (!filePath) return false;
  const fs = tryRequireNode('fs');
  if (!fs) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Convert a host absolute path so WSL bash can open it.
 * Windows: `C:\Users\...` → `/mnt/c/Users/...`
 * Linux/macOS: unchanged.
 * @param {string} hostPath
 * @returns {string}
 */
export function toShellExecutablePath(hostPath) {
  if (!hostPath || typeof hostPath !== 'string') return hostPath;
  // Bare command names (no path separators) stay as-is for PATH lookup
  if (!/[\\/]/.test(hostPath) && !/^[A-Za-z]:/.test(hostPath)) {
    return hostPath;
  }
  if (!isNodeRuntime() || process.platform !== 'win32') {
    return hostPath;
  }
  const path = tryRequireNode('path');
  const resolved = path ? path.resolve(hostPath) : hostPath;
  const withSlashes = String(resolved).replace(/\\/g, '/');
  const driveMatch = withSlashes.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  return withSlashes;
}

function candidateBins(programId, home) {
  const path = tryRequireNode('path');
  const join = path ? path.join.bind(path) : (...parts) => parts.join('/');
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  switch (programId) {
    case 'kimi':
      return [
        process.env.DEVHUB_AGENT_KIMI_BIN,
        home && join(home, '.kimi-code', 'bin', 'kimi.exe'),
        home && join(home, '.kimi-code', 'bin', 'kimi'),
        home && join(home, '.local', 'bin', 'kimi'),
        'kimi.exe',
        'kimi',
      ].filter(Boolean);
    case 'opencode':
      // Prefer POSIX/sh wrappers over .cmd — launch scripts run under bash/WSL.
      return [
        process.env.DEVHUB_AGENT_OPENCODE_BIN,
        home && join(home, '.opencode', 'bin', 'opencode'),
        home && join(home, '.opencode', 'bin', 'opencode.exe'),
        appData && join(appData, 'npm', 'opencode'),
        localAppData && join(localAppData, 'npm', 'opencode'),
        // .cmd last (not executable from WSL bash)
        appData && join(appData, 'npm', 'opencode.cmd'),
        localAppData && join(localAppData, 'npm', 'opencode.cmd'),
        'opencode',
      ].filter(Boolean);
    case 'codex':
      return [
        process.env.DEVHUB_AGENT_CODEX_BIN,
        home && join(home, '.local', 'bin', 'codex'),
        'codex',
      ].filter(Boolean);
    case 'hermes':
      return [
        process.env.DEVHUB_AGENT_HERMES_BIN,
        home && join(home, '.local', 'bin', 'hermes'),
        'hermes',
      ].filter(Boolean);
    case 'grok':
      return [
        process.env.DEVHUB_AGENT_GROK_BIN,
        home && join(home, '.grok', 'bin', 'grok.exe'),
        home && join(home, '.grok', 'bin', 'grok'),
        'grok.exe',
        'grok',
      ].filter(Boolean);
    case 'agy':
    case 'antigravity':
      return [
        process.env.DEVHUB_AGENT_AGY_BIN,
        process.env.DEVHUB_AGENT_ANTIGRAVITY_BIN,
        home && join(home, '.antigravity', 'bin', 'agy.exe'),
        home && join(home, '.antigravity', 'bin', 'agy'),
        home && join(home, '.gemini', 'bin', 'agy'),
        home && join(home, '.local', 'bin', 'agy'),
        'agy.exe',
        'agy',
        'antigravity',
      ].filter(Boolean);
    case 'qodercli':
    case 'qoder':
      return [
        process.env.DEVHUB_AGENT_QODERCLI_BIN,
        process.env.DEVHUB_AGENT_QODER_BIN,
        home && join(home, '.qoder', 'bin', 'qodercli.exe'),
        home && join(home, '.qoder', 'bin', 'qodercli'),
        home && join(home, '.local', 'bin', 'qodercli'),
        'qodercli.exe',
        'qodercli',
      ].filter(Boolean);
    default:
      return [programId, 'hermes'];
  }
}

/**
 * Resolve the agent CLI to embed in launch wrappers.
 * Probes the real host (Windows/Linux) and returns a path bash/WSL can execute.
 * @param {string} [programId]
 * @returns {string}
 */
export function resolveAgentProgramExecutable(programId = 'hermes') {
  const id = String(programId || 'hermes').trim() || 'hermes';

  // Env override always wins (absolute or bare)
  const envKey = `DEVHUB_AGENT_${id.toUpperCase()}_BIN`;
  if (isNodeRuntime() && process.env[envKey]) {
    return toShellExecutablePath(process.env[envKey]);
  }

  if (!isNodeRuntime()) {
    return AGENT_PROGRAM_EXECUTABLES[id] || id;
  }

  const home = getUserHome();
  const candidates = candidateBins(id, home);

  for (const candidate of candidates) {
    // Bare names (PATH lookup inside bash/WSL) — accept as last-resort after absolutes
    if (!/[\\/]/.test(candidate) && !/^[A-Za-z]:/.test(candidate)) {
      continue;
    }
    // Never embed Windows batch files into bash wrappers (WSL cannot exec .cmd)
    if (/\.(cmd|bat)$/i.test(candidate)) {
      continue;
    }
    if (pathExists(candidate)) {
      return toShellExecutablePath(candidate);
    }
  }

  // Prefer bare command name so WSL/Git Bash can resolve via PATH / Windows interop
  const bare = candidates.find((c) => !/[\\/]/.test(c) && !/^[A-Za-z]:/.test(c));
  return bare || AGENT_PROGRAM_EXECUTABLES[id] || id;
}

function slugifyRoleKey(role = '') {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve Kimi --skills-dir for a role. Returns empty string when missing
 * so the launcher can omit the flag instead of pointing at a dead path.
 * @param {string} [roleKey]
 * @returns {string}
 */
export function resolveKimiSkillDir(roleKey = '') {
  const key = slugifyRoleKey(roleKey);
  const skillName = KIMI_SKILL_NAMES[key] || KIMI_SKILL_NAMES.default;

  if (!isNodeRuntime()) {
    return '';
  }

  const path = tryRequireNode('path');
  const join = path ? path.join.bind(path) : (...parts) => parts.join('/');
  const home = getUserHome();
  if (!home) return '';

  const candidates = [
    process.env.DEVHUB_KIMI_SKILLS_ROOT && join(process.env.DEVHUB_KIMI_SKILLS_ROOT, skillName),
    join(home, '.kimi-code', 'skills', skillName),
    join(home, '.kimi', 'skills', skillName),
    join(home, '.grok', 'skills', skillName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return toShellExecutablePath(candidate);
    }
  }

  // Skill pack not installed — omit --skills-dir rather than hard-fail in WSL
  return '';
}

/**
 * Build a tmux-wrapped command for swarm agents.
 * The tmux session survives PTY death (page refresh, network drop).
 * Session name: devhub-swarm-{launchId}-{roleKey}
 * Status bar disabled to save vertical space.
 *
 * IMPORTANT: Do NOT use `exec` in the tmux session command. Using `exec` causes
 * the tmux session to close when the inner process exits, killing any background
 * loops (like _devhub_pending_deliveries_loop) that were started by the wrapper
 * shell before the tmux command. Instead, run the inner command as a child
 * process so the tmux session keeps a shell alive after the command exits.
 */
export function buildTmuxWrappedCommand(innerCommand, tmuxSessionName, cwd = null) {
  const sessionTarget = shellQuote(tmuxSessionName);
  const startDirectory = cwd ? ` -c ${shellQuote(cwd)}` : '';
  // Wrap innerCommand so it runs as a child (NOT exec) inside tmux.
  // This keeps the tmux session alive after innerCommand exits, allowing
  // background loops started by the wrapper shell to continue running.
  const command = shellQuote(`(${innerCommand}); exec zsh`);
  return [
    buildTmuxDisableStatusFragment(tmuxSessionName),
    `tmux new-session -A -d -s ${sessionTarget}${startDirectory} ${command} 2>/dev/null || true`,
    buildTmuxDisableStatusFragment(tmuxSessionName),
    `tmux attach-session -t ${sessionTarget}`,
    buildTmuxDisableStatusFragment(tmuxSessionName),
  ].join('; ');
}

// ---------------------------------------------------------------------------
// SDD Session + Prompt integration (shared, no persistence)
// ---------------------------------------------------------------------------

function buildSddPromptShared(prompt, options = {}) {
  const {
    role = null,
    phase = 'sdd-apply',
    changeName = null,
    missionId = null,
    sessionId: existingSessionId = null,
    sddEnabled = false,
  } = options;

  if (!sddEnabled) {
    return { prompt, sessionId: existingSessionId, tmuxSessionName: null };
  }

  const sessionId = existingSessionId || generateSessionId();
  const tmuxSessionName = buildTmuxSessionName(sessionId);

  const vars = {
    change_name: changeName,
    phase,
    artifacts: 'spec, design, tasks',
    mission_id: missionId,
    role,
    session_id: sessionId,
  };

  const interpolatedPrompt = buildPrompt(role, phase, vars, { forcePhaseContract: true });

  return {
    prompt: interpolatedPrompt,
    sessionId,
    tmuxSessionName,
  };
}

/**
 * Build an agent launch command string (pure, no DB, safe for browser).
 * For server-side persistence, use the wrapper in agentLaunchCommand.js.
 */
export function buildAgentLaunchCommand(programId, prompt, options = {}) {
  const executable = resolveAgentProgramExecutable(programId);
  const opencodeAgent = options.opencodeAgent || DEFAULT_OPENCODE_AGENT;
  const modelId = options.modelId || null;
  const tmuxSessionNameOption = options.tmuxSessionName || null;
  const disableTmuxWrap = options.disableTmuxWrap === true;
  const interactiveBootstrapPrompt = options.interactiveBootstrapPrompt === true;

  // SDD session integration must be opt-in at the call site.
  const sddEnabled = options.sddEnabled === true;
  const {
    prompt: resolvedPrompt,
    sessionId,
    tmuxSessionName: sddTmuxSessionName,
  } = buildSddPromptShared(prompt, {
    role: options.role || null,
    phase: options.phase || 'sdd-apply',
    changeName: options.changeName || null,
    missionId: options.missionId || null,
    sessionId: options.sessionId || null,
    sddEnabled,
  });

  // Prefer tmux session name from SDD session; fall back to explicit option
  const tmuxSessionName = sddTmuxSessionName || tmuxSessionNameOption;

  const quotedPrompt = shellQuotePrompt(resolvedPrompt || '');

  let innerCommand;
  switch (programId) {
    case 'codex':
      innerCommand = `${executable} exec --sandbox workspace-write ${quotedPrompt}`;
      break;
    case 'opencode': {
      // Add --session flag when SDD session is active
      const sessionFlag = sessionId ? ` --session ${sessionId}` : '';
      if (interactiveBootstrapPrompt) {
        innerCommand = modelId
          ? `${executable} --agent ${opencodeAgent} --model ${modelId}${sessionFlag}`
          : `${executable} --agent ${opencodeAgent}${sessionFlag}`;
      } else {
        innerCommand = modelId
          ? `${executable} --agent ${opencodeAgent} --prompt ${quotedPrompt} --model ${modelId}${sessionFlag}`
          : `${executable} --agent ${opencodeAgent} --prompt ${quotedPrompt}${sessionFlag}`;
      }
      break;
    }
    case 'kimi': {
      // Kimi does not allow --prompt with --yolo, so swarm launches start the
      // interactive TUI and the wrapper injects the bootstrap prompt later via
      // tmux send-keys. One-off launches without tmux still use -p.
      //
      // Current kimi-code CLI also rejects combining --yolo with --auto
      // ("Cannot combine --yolo with --auto"). Use --yolo alone so swarm
      // agents auto-approve tool actions without a human prompt.
      const kimiSkillDir = resolveKimiSkillDir(options.role || opencodeAgent);
      const skillDirFlag = kimiSkillDir ? ` --skills-dir ${shellQuote(kimiSkillDir)}` : '';
      const modelFlag = modelId ? ` --model ${shellQuote(modelId)}` : '';
      if (interactiveBootstrapPrompt) {
        innerCommand = `${executable} --yolo${skillDirFlag}${modelFlag}`;
      } else {
        innerCommand = modelId
          ? `${executable} -p ${quotedPrompt}${modelFlag}`
          : `${executable} -p ${quotedPrompt}`;
      }
      break;
    }
    case 'grok':
      innerCommand = executable;
      break;
    case 'agy':
    case 'antigravity':
      // Antigravity starts its interactive TUI bare (like grok); the swarm
      // bootstrap prompt is injected post-launch via tmux send-keys by the
      // wrapper. No non-interactive prompt flag is assumed for agy.
      innerCommand = executable;
      break;
    case 'qodercli':
    case 'qoder':
      // Qoder CLI (qodercli): interactive TUI when bare; documented print mode
      // `-p <prompt>` for non-interactive one-shots (docs.qoder.com/en/cli).
      // Swarm launches use the interactive TUI + send-keys bootstrap.
      if (interactiveBootstrapPrompt) {
        innerCommand = executable;
      } else {
        innerCommand = `${executable} -p ${quotedPrompt}`;
      }
      break;
    case 'hermes':
    default:
      innerCommand = `${executable} chat -q ${quotedPrompt}`;
      break;
  }

  // Wrap in tmux if session name provided (swarm resilience)
  if (!disableTmuxWrap && tmuxSessionName) {
    return buildTmuxWrappedCommand(innerCommand, tmuxSessionName, options.cwd);
  }

  return innerCommand;
}

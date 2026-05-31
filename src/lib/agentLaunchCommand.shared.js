/* eslint-env node */
/**
 * @module agentLaunchCommand.shared
 * Shared agent launch command builder.
 * SAFE for browser — all Node.js-only operations are lazy and conditional.
 */

import { shellQuotePrompt } from '@/lib/docopsPrompts';
import { buildPrompt } from './sdd/SwarmPromptEngine';
import { generateSessionId, buildTmuxSessionName } from './sdd/sessionIdUtils';

/**
 * Read minimax config lazily — only runs in Node.js (server-side).
 * Uses process.mainModule.require to access fs without triggering Turbopack static analysis.
 */
function getMinimaxConfig() {
  if (typeof process === 'undefined' || !process.stdout) return null;
  try {
    // process.mainModule.require is available in Node.js and bypasses Turbopack static analysis
    const require = process.mainModule?.require;
    if (!require) return null;
    const path = require('path');
    const fs = require('fs');
    const configPath = path.join(process.cwd(), 'data', 'llm-providers-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.providers?.minimax ?? null;
  } catch {
    return null;
  }
}

export const AGENT_PROGRAM_EXECUTABLES = Object.freeze({
  opencode: '/home/matias/.opencode/bin/opencode',
  codex: '/home/matias/.nvm/versions/node/v24.14.0/bin/codex',
  hermes: '/home/matias/.local/bin/hermes',
});

export function resolveAgentProgramExecutable(programId = 'hermes') {
  return AGENT_PROGRAM_EXECUTABLES[programId] || AGENT_PROGRAM_EXECUTABLES.hermes;
}

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'`)}'`;
}

/**
 * Build a tmux-wrapped command for swarm agents.
 * The tmux session survives PTY death (page refresh, network drop).
 * Session name: devhub-swarm-{launchId}-{roleKey}
 * Status bar disabled to save vertical space.
 */
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
    `tmux new-session -A -d -s ${sessionTarget}${startDirectory} ${command} 2>/dev/null || true`,
    `tmux set-option -t ${sessionTarget} status off 2>/dev/null || true`,
    `tmux attach-session -t ${sessionTarget}`,
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
  const opencodeAgent = options.opencodeAgent || 'sdd-orchestrator';
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

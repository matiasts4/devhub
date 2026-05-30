import { shellQuotePrompt } from '@/lib/docopsPrompts';
import { buildPrompt } from './sdd/SwarmPromptEngine';
import { generateSessionId, buildTmuxSessionName } from './sdd/sessionIdUtils';
import { persistSession } from './sdd/SessionPersistence';
import {
  AGENT_PROGRAM_EXECUTABLES,
  resolveAgentProgramExecutable,
  buildTmuxWrappedCommand as buildTmuxWrappedCommandShared,
  buildAgentLaunchCommand as buildAgentLaunchCommandPure,
  _minimaxConfig,
} from './agentLaunchCommand.shared';

// ---------------------------------------------------------------------------
// SDD Session + Prompt integration (server-only, with persistence)
// ---------------------------------------------------------------------------

function buildSddPrompt(prompt, options = {}) {
  // SessionPersistence is server-only (uses SQLite). In the browser, persistSession is a no-op.
  const safePersistSession = typeof window === 'undefined' ? persistSession : async () => {};

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

  // Persist session async (fire-and-forget)
  safePersistSession({
    sessionId,
    agentId: options.agentId || null,
    missionId,
    phase,
    artifacts: {},
    context: { prompt: interpolatedPrompt },
  }).catch((e) => {
    console.warn('[agentLaunchCommand] persistSession failed:', e.message);
  });

  return {
    prompt: interpolatedPrompt,
    sessionId,
    tmuxSessionName,
  };
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
export function buildTmuxWrappedCommand(innerCommand, tmuxSessionName, cwd = null) {
  const sessionTarget = shellQuote(tmuxSessionName);
  const startDirectory = cwd ? ` -c ${shellQuote(cwd)}` : '';
  const command = shellQuote(innerCommand);
  return [
    `tmux new-session -A -d -s ${sessionTarget}${startDirectory} ${command} 2>/dev/null || true`,
    `tmux set-option -t ${sessionTarget} status off 2>/dev/null || true`,
    `tmux attach-session -t ${sessionTarget}`,
  ].join('; ');
}

export function buildAgentLaunchCommand(programId, prompt, options = {}) {
  const executable = resolveAgentProgramExecutable(programId);
  const opencodeAgent = options.opencodeAgent || 'sdd-orchestrator';
  const modelId = options.modelId || null;
  const tmuxSessionNameOption = options.tmuxSessionName || null;
  const disableTmuxWrap = options.disableTmuxWrap === true;
  const interactiveBootstrapPrompt = options.interactiveBootstrapPrompt === true;

  // SDD session integration must be opt-in at the call site. Letting a global
  // env flag inject --session into every OpenCode launch breaks normal swarm
  // launches because the internal DevHub session ID is not an OpenCode ses_* ID.
  const sddEnabled = options.sddEnabled === true;
  const {
    prompt: resolvedPrompt,
    sessionId,
    tmuxSessionName: sddTmuxSessionName,
  } = buildSddPrompt(prompt, {
    role: options.role || null,
    phase: options.phase || 'sdd-apply',
    changeName: options.changeName || null,
    missionId: options.missionId || null,
    sessionId: options.sessionId || null,
    agentId: options.agentId || null,
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
      if (options.role === 'zed') {
        // MINIMAX-2: Zed routes to OpenCode with MiniMax subscription flags (D-5)
        const model = _minimaxConfig?.MINIMAX_MODEL ?? 'minimax-coding-plan/MiniMax-M2.7';
        const baseUrl = _minimaxConfig?.ANTHROPIC_BASE_URL ?? 'https://api.minimax.io/anthropic';
        const agent = opencodeAgent || 'swarm-director';
        innerCommand = modelId
          ? `${executable} --agent ${agent} --model ${modelId} --base-url ${baseUrl}${sessionFlag}`
          : `${executable} --agent ${agent} --model ${model} --base-url ${baseUrl}${sessionFlag}`;
      } else if (interactiveBootstrapPrompt) {
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

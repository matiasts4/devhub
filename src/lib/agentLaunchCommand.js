import fs from 'node:fs';
import path from 'node:path';
import { shellQuotePrompt } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { buildPrompt } from './sdd/SwarmPromptEngine';
import { generateSessionId, buildTmuxSessionName } from './sdd/sessionIdUtils';
import { persistSession } from './sdd/SessionPersistence';
import {
  resolveAgentProgramExecutable,
  buildTmuxWrappedCommand,
  resolveKimiSkillDir,
} from './agentLaunchCommand.shared';

// Server-only minimax config reader (fs is safe here — this module is never bundled for browser)
let _serverMinimaxConfig = null;
function getServerMinimaxConfig() {
  if (_serverMinimaxConfig) return _serverMinimaxConfig;
  try {
    const configPath = path.join(process.cwd(), 'data', 'llm-providers-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    _serverMinimaxConfig = parsed?.providers?.minimax ?? null;
  } catch {
    _serverMinimaxConfig = null;
  }
  return _serverMinimaxConfig;
}

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

export function buildAgentLaunchCommand(programId, prompt, options = {}) {
  const executable = resolveAgentProgramExecutable(programId);
  const opencodeAgent = options.opencodeAgent || DEFAULT_OPENCODE_AGENT;
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
      // kimi-code rejects --yolo combined with --auto. Swarm uses --yolo only
      // (auto-approve all actions). Bootstrap prompt is injected via tmux.
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
    case 'agy':
    case 'antigravity':
      // Antigravity starts its interactive TUI bare (like grok); the swarm
      // bootstrap prompt is injected post-launch via tmux send-keys by the
      // wrapper. Keep in sync with agentLaunchCommand.shared.js.
      innerCommand = executable;
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

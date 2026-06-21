import { detectOpenCodeTuiReady } from './opencodeReadyMarker.js';
import { detectAgentSessionEndFromOutput } from './agentSessionExit.js';

export const AGENT_PROGRAMS = Object.freeze([
  'opencode',
  'hermes',
  'grok',
  'groc',
  'kimi',
  'codex',
]);

export function normalizeTuiInitialCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

export function resolveAgentProgramFromCommand(initialCommand) {
  const normalized = normalizeTuiInitialCommand(initialCommand);
  if (!normalized) return null;
  const match = normalized.match(/\b(opencode|hermes|grok|groc|kimi|codex)\b/i);
  return match ? match[1].toLowerCase() : null;
}

export function isLikelyTuiInitialCommand(initialCommand) {
  return Boolean(resolveAgentProgramFromCommand(initialCommand));
}

export function isGrokTuiInitialCommand(initialCommand) {
  return /^(grok|groc)\b/i.test(normalizeTuiInitialCommand(initialCommand));
}

/** Grok TUI shortcut bar — input/transcript chrome is ready (no opencode-style footer). */
export function detectGrokTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    /Shift\+Tab\s+mode/i.test(text) ||
    /ctrl\+c:cancel/i.test(text) ||
    /user_prompt_submit/i.test(text) ||
    /ctrl\+c\s+cancel/i.test(text) ||
    /esc\s+cancel/i.test(text)
  );
}

/** Grok sets DECSET 1000/1006 on startup and titles the PTY `grok`. */
export function detectGrokSessionFromOutput(text) {
  if (!text || typeof text !== 'string') return false;
  return /\]0;grok\b/i.test(text) || detectGrokTuiReady(text);
}

/**
 * Generic Ink/agent TUI readiness — opencode/grok keep dedicated detectors;
 * kimi/codex/hermes and future agents share this path for wheel passthrough.
 */
export function detectAgentTuiReady(text, initialCommand = '') {
  if (!text || typeof text !== 'string') return false;
  if (detectOpenCodeTuiReady(text)) return true;
  if (detectGrokSessionFromOutput(text)) return true;

  const lower = text.toLowerCase();
  if (/welcome to kimi/i.test(lower)) return true;
  if (/kimi code cli v\d/i.test(lower)) return true;
  if (/\]0;(?:kimi|codex|hermes|grok|groc)\b/i.test(text)) return true;
  if (/mcp\s*\/\s*status/i.test(text) || /[⊙⊛]\s*\d+\s+mcp/i.test(text)) return true;
  if (/ctrl\+p\s+commands/i.test(text) || /esc\s+interrupt/i.test(text)) return true;

  const program = resolveAgentProgramFromCommand(initialCommand);
  if (!program) return false;

  if (program === 'kimi') {
    if (/session_[a-f0-9-]{8,}/i.test(text)) return true;
    if (/k2(?:\.\d+)?\s+code/i.test(text)) return true;
    if (/\bthinking\b/i.test(text) && /\/\s*[\d.]+%\s*\(/i.test(text)) return true;
  }

  // Ink TUIs enable mouse tracking on the alternate screen once interactive.
  const mouseReady = /\x1b\[\?(?:1000|1006)h/.test(text);
  const altScreenReady = /\x1b\[\?1049h/.test(text);
  if (mouseReady && altScreenReady) return true;

  if (program === 'codex' && /\bcodex\b/i.test(lower)) return true;

  return false;
}

/**
 * Agent left its alternate-screen TUI — shell owns the PTY again.
 * Requires prior agent readiness so boot noise cannot detach early.
 */
export function detectAgentTuiDetachedFromOutput(text, { wasAgentReady = false } = {}) {
  if (!text || typeof text !== 'string') return false;
  if (detectAgentSessionEndFromOutput(text)) return true;
  if (!wasAgentReady) return false;
  if (/\x1b\[\?1049l/.test(text)) return true;
  if (/(?:^|\r?\n)\s*-\([^)\r\n]+@[^)\r\n]+\)-\[[^\]\r\n]+\]\s*\$\s*(?:\r?\n|$)/m.test(text)) {
    return true;
  }
  return false;
}

/** True only while an agent Ink TUI is live and accepting injected/native mouse. */
export function isAgentTuiInteractionLive({
  initialCommand = '',
  tuiSessionActive = false,
  agentTuiDetached = false,
  grokTuiReady = false,
  opencodeFooterConfirmed = false,
  agentTuiReady = false,
  isGrokSession = false,
} = {}) {
  if (!tuiSessionActive || agentTuiDetached) return false;
  if (isGrokSession || isGrokTuiInitialCommand(initialCommand)) return grokTuiReady;
  const program = resolveAgentProgramFromCommand(initialCommand);
  if (program === 'opencode') return opencodeFooterConfirmed;
  if (program) return agentTuiReady || opencodeFooterConfirmed;
  return false;
}

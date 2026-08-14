/**
 * agentOutputPromotion — gate for promoting a PTY session to an agent TUI
 * from output alone (no explicit agent launch command / typed input).
 *
 * Why this exists: the output-based ready detectors (kimiReadyMarker,
 * opencodeReadyMarker, …) include weak footer hints like `MCP /status` or
 * `session_<hex>` that also appear in plain log output. A dev launcher such
 * as `pnpm electron:up` pipes DevHub's own startup logs (MCP status lines,
 * session ids) into the terminal, and the old "any weak hit ⇒ agent" rule
 * falsely promoted that panel to `agentType: 'kimi'|'opencode'` — lighting
 * the workspace activity dot and the panel status badge for a non-agent
 * process. Once promoted with `agentLaunchOrigin: 'output'`, the typed-agent
 * reaper never cleaned it up.
 *
 * Promotion rules (per agent kind):
 *   1. Sessions with an explicit NON-agent initialCommand (e.g.
 *      `pnpm electron:up`) are never promoted from output. Legitimate
 *      output-detected agents live in tmux / pre-attached panes WITHOUT an
 *      initialCommand (see W7 notes in ttyServer / sidecar server).
 *   2. A single STRONG signal (welcome banner, version line, OSC title,
 *      provider row) promotes immediately.
 *   3. Weak footer hints promote only when ≥2 DISTINCT promoting signals
 *      appear in the same chunk — a real TUI footer repaints several per
 *      frame; log noise prints at most one. Generic log-prone patterns
 *      (`session_<hex>`, `/status x.y`, `thinking … / N% (`) never promote.
 *   4. grok / agy / qodercli detectors are already chrome-specific (agent
 *      prompt lines, `? for shortcuts`, permission prompts), so they promote
 *      as before — still subject to rule 1.
 *
 * CJS sidecar mirror: `shouldPromoteAgentFromOutput` is reimplemented in
 * sidecar-backend/sessionTransport.js — keep the two in sync.
 */

import { detectAgentTypeFromCommand } from './agentTuiMetadata.shared.js';
import { detectKimiStrongSignal, countKimiPromotingSignals } from './kimiReadyMarker.js';
import {
  detectOpenCodeStrongSignal,
  countOpenCodePromotingSignals,
} from './opencodeReadyMarker.js';
import { detectGrokSessionFromOutput } from './grokReadyMarker.js';
import { detectAntigravityTuiReady } from './antigravityReadyMarker.js';
import { detectQodercliTuiReady } from './qodercliReadyMarker.js';

/** Minimum number of distinct weak footer signals required to promote. */
export const MIN_PROMOTING_SIGNALS = 2;

/**
 * True when the session was launched with an explicit command that is NOT a
 * known agent TUI (e.g. `pnpm electron:up`, `npm run dev`). Such sessions
 * must never be promoted to an agent from output alone.
 */
export function isExplicitNonAgentLaunch(session) {
  const command = session?.initialCommand;
  if (!command || typeof command !== 'string' || !command.trim()) return false;
  return detectAgentTypeFromCommand(command) === null;
}

/**
 * Whether `text` (one filtered PTY output chunk) justifies promoting
 * `session` to agent `kind` ('kimi' | 'opencode' | 'grok' | 'agy' |
 * 'qodercli') from output alone.
 *
 * Callers must only consult this when `session.agentType` is NOT yet set —
 * ready-marking for already-known agents keeps using the plain detectors.
 */
export function shouldPromoteAgentFromOutput(session, kind, text) {
  if (!text || typeof text !== 'string') return false;
  if (isExplicitNonAgentLaunch(session)) return false;
  switch (kind) {
    case 'kimi':
      return (
        detectKimiStrongSignal(text) || countKimiPromotingSignals(text) >= MIN_PROMOTING_SIGNALS
      );
    case 'opencode':
      return (
        detectOpenCodeStrongSignal(text) ||
        countOpenCodePromotingSignals(text) >= MIN_PROMOTING_SIGNALS
      );
    case 'grok':
      return detectGrokSessionFromOutput(text);
    case 'agy':
      return detectAntigravityTuiReady(text);
    case 'qodercli':
      return detectQodercliTuiReady(text);
    default:
      return false;
  }
}

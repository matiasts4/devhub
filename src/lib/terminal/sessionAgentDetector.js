/**
 * sessionAgentDetector — shared herdr-style ingest for ttyServer and sidecar (via CJS bundle).
 */

import { detectAgentState, AgentStateMachine } from './agentTuiMetadata.shared.js';
import {
  extractBottomViewport,
  processCarriageReturns,
  resolveDetectionSizing,
} from './extractBottomViewport.js';
import { stripAnsi } from './stripAnsi.js';
import { tracePublishedTransition } from './agentStateTrace.js';

export const HOOK_AUTHORITY_TTL_MS = Number(process.env.DEVHUB_HOOK_AUTHORITY_TTL_MS || 120000);
export const HOOK_AUTHORITY_AGENTS = [
  'kimi',
  'claude',
  'opencode',
  'agy',
  'antigravity',
  'qodercli',
];

/**
 * Startup grace period — after an agent TUI is first detected, suppress
 * manifest-based "running" detections for this window. Agents often show
 * brief spinners/animations during initialization that would otherwise be
 * misinterpreted as active work. Idle and blocked detections are still
 * allowed (the agent may show its prompt immediately). Hook authority and
 * user-input signals bypass this grace period entirely.
 */
export const AGENT_STARTUP_GRACE_MS = Number(process.env.DEVHUB_AGENT_STARTUP_GRACE_MS || 3500);

/**
 * W4: quiescence window — how long a session must produce ZERO PTY output
 * before a 'running' state is treated as finished. Based on output activity
 * (any chunk), not on rule hits. Configurable per session via
 * session.detectionQuiescenceMs, globally via DEVHUB_AGENT_QUIESCENCE_MS.
 */
export const DEFAULT_AGENT_QUIESCENCE_MS = Number(process.env.DEVHUB_AGENT_QUIESCENCE_MS || 4000);

/**
 * DONE-EVIDENCE-01: second quiescence stage. After the first silence window
 * flips running→idle (reason 'quiescence', badge only — the bridge does NOT
 * notify on it), continued silence past this confirm window upgrades the
 * reason to 'quiescence-confirmed', which IS allowed to notify as a low
 * confidence "done probable" fallback for agents without hooks.
 */
export const DEFAULT_AGENT_QUIESCENCE_CONFIRM_MS = Number(
  process.env.DEVHUB_AGENT_QUIESCENCE_CONFIRM_MS || 12000
);

/**
 * While a hook-reported tool call is in flight (PreToolUse/SubagentStart with
 * no matching PostToolUse / SubagentStop / Stop yet), quiescence is vetoed: the
 * agent is provably busy even when fully silent. The cap bounds the veto in
 * case the matching end-event hook is ever lost (fail-open hooks).
 */
export const HOOK_TOOL_ACTIVE_VETO_CAP_MS = Number(
  process.env.DEVHUB_HOOK_TOOL_ACTIVE_VETO_CAP_MS || 30 * 60 * 1000
);

function getQuiescenceMs(session) {
  const override = Number(session?.detectionQuiescenceMs);
  return override > 0 ? override : DEFAULT_AGENT_QUIESCENCE_MS;
}

function getQuiescenceConfirmMs(session) {
  const override = Number(session?.detectionQuiescenceConfirmMs);
  return override > 0 ? override : DEFAULT_AGENT_QUIESCENCE_CONFIRM_MS;
}

/**
 * True while a hook-reported tool call is active and the veto has not exceeded
 * its safety cap.
 */
export function hasActiveHookTool(session, now = Date.now()) {
  if (!session?.hookToolActive) return false;
  const since = Number(session.hookToolActiveAt);
  if (!since) return true;
  return now - since < HOOK_TOOL_ACTIVE_VETO_CAP_MS;
}

/**
 * Record the reason of the last published idle on the session, so a later
 * authoritative idle (hook Stop, visible prompt) can detect it is upgrading a
 * silence-based idle and re-emit the frame (reason-upgrade). Also emits the
 * JSONL transition trace — MUST be called BEFORE assigning
 * session.agentTuiState so the trace captures the real prev state.
 */
function trackPublishedReason(session, published, extra = {}) {
  if (!published) return;
  tracePublishedTransition(session, published, extra);
  session.agentTuiStateReason = published.reason ?? null;
  if (published.state === 'idle') {
    session._lastIdleReason = published.reason ?? null;
  }
}

function getLastActivityAt(session) {
  return session.lastActivityAt ?? session.lastWorkingAt ?? null;
}

function getDetectionSizing(session) {
  return resolveDetectionSizing({
    cols: session?.termsize?.cols,
    rows: session?.termsize?.rows,
    viewportLines: session?.detectionViewportLines,
    bufferChars: session?.detectionBufferChars,
  });
}

/**
 * Check if a session has active, unexpired hook authority from an authorized agent type.
 */
export function hasFreshHookAuthority(session, now = Date.now()) {
  if (!session?.hookState || typeof session.hookState.at !== 'number') {
    return false;
  }

  // P3-2: Only agents in authority allowlist (kimi, claude, opencode) take precedence over screen detection
  const sourceAgent = session.hookState.source
    ? session.hookState.source.replace(/^devhub:/, '')
    : null;
  const agentType = session.agentType || sourceAgent;
  if (!agentType || !HOOK_AUTHORITY_AGENTS.includes(agentType)) {
    return false;
  }

  // DONE-EVIDENCE-01: while a tool call is hook-active (PreToolUse without its
  // PostToolUse yet), the authority window stretches so a long silent tool
  // call never falls back to the 4s quiescence path.
  const ttl = hasActiveHookTool(session, now)
    ? Math.max(HOOK_AUTHORITY_TTL_MS, HOOK_TOOL_ACTIVE_VETO_CAP_MS)
    : HOOK_AUTHORITY_TTL_MS;
  return now - session.hookState.at < ttl;
}

/**
 * Attach detection fields to a PTY session object (idempotent).
 */
export function ensureAgentDetectionSession(session) {
  if (!session) return session;
  if (!session.agentStateMachine) {
    session.agentStateMachine = new AgentStateMachine();
  }
  if (session.detectionBuffer === undefined) {
    session.detectionBuffer = '';
  }
  if (session.oscProgress === undefined) {
    session.oscProgress = '';
  }
  return session;
}

/**
 * Run manifest detection on filtered PTY output chunk.
 *
 * @returns {{ published: object|null, agentTuiState: string|null, agentTuiStateAt: number|null }}
 */
export function ingestAgentDetectionFromFilteredOutput(session, filtered, now = Date.now()) {
  ensureAgentDetectionSession(session);

  const result = {
    published: null,
    agentTuiState: session.agentTuiState ?? null,
    agentTuiStateAt: session.agentTuiStateAt ?? null,
  };

  if (!session.agentType || !session.agentStateMachine) {
    return result;
  }

  if (typeof filtered !== 'string' || !filtered) {
    return result;
  }

  // Keep accumulating screen evidence even under hook authority, so that when
  // authority expires the viewport we evaluate is fresh, not minutes old.
  session.detectionBuffer = (session.detectionBuffer || '') + filtered;
  const sizing = getDetectionSizing(session);
  if (session.detectionBuffer.length > sizing.bufferChars) {
    session.detectionBuffer = session.detectionBuffer.slice(-sizing.bufferChars);
  }

  // W4: output activity clock. ANY PTY chunk while agentType is set means the
  // agent session is alive and producing output — refresh regardless of rule
  // hits, hook authority, or whether the footer is currently visible.
  session.lastActivityAt = now;

  if (hasFreshHookAuthority(session, now)) {
    session._hadHookAuthority = true;
    return result;
  }

  // P3-3: If hook authority just expired, invalidate lastDetection so we re-evaluate screen fresh
  if (session._hadHookAuthority) {
    session._hadHookAuthority = false;
    session.lastDetection = null;
  }

  // W6: collapse CR-overwritten frames (last-write-wins per line) BEFORE
  // stripping ANSI. stripAnsi deletes every \r, which would fuse spinner/footer
  // frames into one concatenated line and break anchored lineRegex rules.
  const collapsedBuffer = processCarriageReturns(session.detectionBuffer || '');
  const cleanBuffer = stripAnsi(collapsedBuffer);
  const screen = extractBottomViewport(cleanBuffer, {
    maxLines: sizing.viewportLines,
  });

  const detected = detectAgentState(session.agentType, screen, {
    oscTitle: session.title || '',
    oscProgress: session.oscProgress || '',
  });

  if (detected.visibleWorking) {
    session.lastWorkingAt = now;
  }

  if (detected.skipStateUpdate) {
    return result;
  }

  // W4: 'unknown' (no manifest rule matched) is non-evidence — never publish a
  // state change for it. The last published state stays sticky; true finish is
  // detected by the quiescence tick on real output silence.
  if (detected.state === 'unknown') {
    return result;
  }

  // Do not degrade a running state to a non-explicit idle during streaming
  // output UNLESS an explicit idle prompt matched (visibleIdle: true) OR the
  // session has produced no output at all for the quiescence window.
  const quiescenceMs = getQuiescenceMs(session);
  const lastActivityAt = getLastActivityAt(session);
  const isQuiescent = lastActivityAt && now - lastActivityAt > quiescenceMs;
  if (
    session.agentTuiState === 'running' &&
    detected.state === 'idle' &&
    !detected.visibleIdle &&
    !isQuiescent
  ) {
    return result;
  }

  // Startup grace period: suppress manifest-based "running" detections during
  // the first few seconds after agent detection. Agents show brief spinners or
  // loading animations during initialization that would be false positives.
  // Idle/blocked are still allowed so the prompt is detected immediately.
  // User-input signals (notifyUserInput) bypass this entirely since they set
  // lastUserInputAt which indicates a real prompt submission.
  if (
    detected.state === 'running' &&
    session.agentDetectedAt &&
    !session.lastUserInputAt &&
    now - session.agentDetectedAt < AGENT_STARTUP_GRACE_MS
  ) {
    return result;
  }

  // DONE-EVIDENCE-01: tag the evidence source. An idle is only positive
  // evidence of "done" when the agent's prompt is visibly back on screen
  // (visibleIdle rule matched); everything else from the manifest is a
  // neutral signal.
  detected.reason =
    detected.state === 'idle' && detected.visibleIdle ? 'prompt-visible' : 'manifest';

  // Cache only publishable detections
  session.lastDetection = detected;

  const published = session.agentStateMachine.publish(detected, now);
  if (published) {
    trackPublishedReason(session, published, { source: 'ingest', now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
    result.published = {
      ...published,
      wasCancelled: Boolean(detected.wasCancelled),
    };
    result.agentTuiState = published.state;
    result.agentTuiStateAt = now;
    result.wasCancelled = Boolean(detected.wasCancelled);
  }

  return result;
}

/**
 * Notify the detector that the user submitted input (Enter key / stdin) to the agent session.
 * Immediately transitions session state to 'running' to eliminate API TTFT detection lag.
 */
export function notifyUserInput(session, now = Date.now()) {
  ensureAgentDetectionSession(session);
  session.lastUserInputAt = now;
  session.lastWorkingAt = now;
  session.lastActivityAt = now;

  const detection = {
    state: 'running',
    visibleIdle: false,
    visibleWorking: true,
    visibleBlocker: false,
    reason: 'user-input',
  };

  session.lastDetection = detection;

  const published = session.agentStateMachine.publish(detection, now, { bypassHold: true });
  if (published) {
    trackPublishedReason(session, published, { source: 'user-input', now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }

  return published;
}

/**
 * Tick agent detection logic on an active session.
 */
export function tickAgentDetection(session, now = Date.now()) {
  ensureAgentDetectionSession(session);

  const result = {
    published: null,
    agentTuiState: session.agentTuiState ?? null,
    agentTuiStateAt: session.agentTuiStateAt ?? null,
  };

  if (!session.agentType || !session.agentStateMachine) {
    return result;
  }

  // P3-1: Dead PTY process check MUST run BEFORE hook authority check!
  const pty = session.pty || session.ptyProcess;
  const ptyPid = session.ptyPid || (pty && pty.pid);
  if (!pty || !ptyPid) {
    session.hookState = null; // Clear hook authority on dead PTY
    session.hookToolActive = false;
    const published = session.agentStateMachine.publish(
      {
        state: 'idle',
        visibleIdle: true,
        visibleWorking: false,
        visibleBlocker: false,
        reason: 'pty-dead',
      },
      now
    );
    if (published) {
      trackPublishedReason(session, published, { source: 'tick', now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
    return result;
  }

  if (hasFreshHookAuthority(session, now)) {
    session._hadHookAuthority = true;
    return result;
  }

  // P3-3: If hook authority just expired, invalidate lastDetection so we re-evaluate screen fresh
  if (session._hadHookAuthority) {
    session._hadHookAuthority = false;
    session.lastDetection = null;
  }

  const bufferUnchanged = session.lastTickBuffer === session.detectionBuffer;
  session.lastTickBuffer = session.detectionBuffer;

  const state = session.agentTuiState;
  const isRunningOrBlocked = state === 'running' || state === 'blocked';
  const hasPendingIdle = !!session.agentStateMachine.pendingIdle;
  const hasPendingTransition = !!session.agentStateMachine.pendingTransition;

  // Output Quiescence (two stages, DONE-EVIDENCE-01). Activity is any PTY
  // chunk (session.lastActivityAt), so streaming output whose footer scrolled
  // offscreen no longer causes false "finished" flips (W4).
  //   stage 1 (> quiescenceMs silent): running→idle, reason 'quiescence' —
  //     the badge flips but the notification bridge does NOT treat it as done.
  //   stage 2 (> confirmMs silent): reason upgrades to 'quiescence-confirmed'
  //     — a low-confidence "done probable" that MAY notify (fallback for
  //     hook-less agents).
  // Vetoed entirely while a hook-reported tool call is active: the agent is
  // provably busy even when fully silent (long builds/tests).
  const quiescenceMs = getQuiescenceMs(session);
  const quiescenceConfirmMs = getQuiescenceConfirmMs(session);
  const lastActivityAt = getLastActivityAt(session);
  const silentForMs = lastActivityAt ? now - lastActivityAt : 0;
  const quiescenceVetoed = hasActiveHookTool(session, now);
  if (!quiescenceVetoed && state === 'running' && lastActivityAt && silentForMs > quiescenceMs) {
    const fallbackIdle = {
      state: 'idle',
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      reason: silentForMs > quiescenceConfirmMs ? 'quiescence-confirmed' : 'quiescence',
    };
    session.lastDetection = fallbackIdle;
    const published = session.agentStateMachine.publish(fallbackIdle, now, { bypassHold: true });
    if (published) {
      trackPublishedReason(session, published, { source: 'tick', now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
    return result;
  }

  // Stage-2 reason upgrade: already idle from stage 1 and silence continued
  // past the confirm window. The state does not change, so the state machine
  // would never republish on its own — emit the upgraded frame explicitly.
  if (
    !quiescenceVetoed &&
    state === 'idle' &&
    session._lastIdleReason === 'quiescence' &&
    lastActivityAt &&
    silentForMs > quiescenceConfirmMs
  ) {
    const upgraded = {
      state: 'idle',
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      reason: 'quiescence-confirmed',
    };
    session.lastDetection = upgraded;
    trackPublishedReason(session, upgraded, { source: 'tick', now, upgrade: true });
    session.agentTuiState = 'idle';
    session.agentTuiStateAt = now;
    result.published = upgraded;
    result.agentTuiState = 'idle';
    result.agentTuiStateAt = now;
    return result;
  }

  if (bufferUnchanged && !isRunningOrBlocked && !hasPendingIdle && !hasPendingTransition) {
    return result;
  }

  if (session.lastDetection) {
    const published = session.agentStateMachine.publish(session.lastDetection, now);
    if (published) {
      trackPublishedReason(session, published, { source: 'tick', now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
  }

  return result;
}

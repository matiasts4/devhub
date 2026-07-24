/**
 * sessionAgentDetector — shared herdr-style ingest for ttyServer and sidecar (via CJS bundle).
 */

import { detectAgentState, AgentStateMachine } from './agentTuiMetadata.shared.js';
import {
  extractBottomViewport,
  MAX_DETECTION_BUFFER_CHARS,
  DEFAULT_DETECTION_VIEWPORT_LINES,
} from './extractBottomViewport.js';
import { stripAnsi } from './stripAnsi.js';

export const HOOK_AUTHORITY_TTL_MS = Number(process.env.DEVHUB_HOOK_AUTHORITY_TTL_MS || 120000);
export const HOOK_AUTHORITY_AGENTS = ['kimi', 'claude', 'opencode', 'agy', 'antigravity'];

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

  return now - session.hookState.at < HOOK_AUTHORITY_TTL_MS;
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
  if (session.detectionBuffer.length > MAX_DETECTION_BUFFER_CHARS) {
    session.detectionBuffer = session.detectionBuffer.slice(-MAX_DETECTION_BUFFER_CHARS);
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

  const cleanBuffer = stripAnsi(session.detectionBuffer || '');
  const screen = extractBottomViewport(cleanBuffer, {
    maxLines: session.detectionViewportLines || DEFAULT_DETECTION_VIEWPORT_LINES,
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

  // Do not degrade a running state to fallback idle during streaming output UNLESS
  // an explicit idle prompt matched (visibleIdle: true) OR no working signals arrived for > 2500ms
  const isQuiescent = session.lastWorkingAt && now - session.lastWorkingAt > 2500;
  if (
    session.agentTuiState === 'running' &&
    detected.state === 'idle' &&
    !detected.visibleIdle &&
    !isQuiescent
  ) {
    return result;
  }

  // Cache only publishable detections
  session.lastDetection = detected;

  const published = session.agentStateMachine.publish(detected, now);
  if (published) {
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

  const detection = {
    state: 'running',
    visibleIdle: false,
    visibleWorking: true,
    visibleBlocker: false,
  };

  session.lastDetection = detection;

  const published = session.agentStateMachine.publish(detection, now, { bypassHold: true });
  if (published) {
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
    const published = session.agentStateMachine.publish(
      {
        state: 'idle',
        visibleIdle: true,
        visibleWorking: false,
        visibleBlocker: false,
      },
      now
    );
    if (published) {
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

  // Output Quiescence: If running and no working signals for > 2500ms, transition to idle
  if (state === 'running' && session.lastWorkingAt && now - session.lastWorkingAt > 2500) {
    const fallbackIdle = {
      state: 'idle',
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
    };
    session.lastDetection = fallbackIdle;
    const published = session.agentStateMachine.publish(fallbackIdle, now, { bypassHold: true });
    if (published) {
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
    return result;
  }

  if (bufferUnchanged && !isRunningOrBlocked && !hasPendingIdle) {
    return result;
  }

  if (session.lastDetection) {
    const published = session.agentStateMachine.publish(session.lastDetection, now);
    if (published) {
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
  }

  return result;
}

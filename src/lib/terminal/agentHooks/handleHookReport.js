import { buildAgentStateFrame } from '../agentStateFrame.js';
import { tracePublishedTransition } from '../agentStateTrace.js';

export const ALLOWED_HOOK_STATES = ['working', 'blocked', 'idle', 'session'];

/** Source tag sent by scripts/agent-hooks/antigravity-bridge.mjs. */
export const ANTIGRAVITY_BRIDGE_SOURCE = 'antigravity-hook';

/**
 * DONE-EVIDENCE-01: hook lifecycle event sets driving the tool-active veto.
 * While a tool call is active, the quiescence path is suppressed — a silent
 * long-running tool (builds, tests) must never read as "done".
 */
export const HOOK_TOOL_START_EVENTS = ['PreToolUse', 'SubagentStart'];
export const HOOK_TOOL_END_EVENTS = ['PostToolUse', 'PostToolUseFailure', 'SubagentStop'];
export const HOOK_TURN_END_EVENTS = ['Stop', 'Interrupt', 'StopFailure', 'SessionEnd'];

function updateHookToolActive(session, event, now) {
  if (!event) return;
  if (HOOK_TOOL_START_EVENTS.includes(event)) {
    session.hookToolActive = true;
    session.hookToolActiveAt = now;
  } else if (HOOK_TOOL_END_EVENTS.includes(event) || HOOK_TURN_END_EVENTS.includes(event)) {
    session.hookToolActive = false;
    session.hookToolActiveAt = null;
  }
}

/**
 * Track the reason of the last published idle so a later authoritative idle
 * can detect it is upgrading a silence-based one (reason-upgrade). Emits the
 * JSONL transition trace — MUST be called BEFORE assigning
 * session.agentTuiState so the trace captures the real prev state.
 */
function trackHookPublishedReason(session, published, extra = {}) {
  if (!published) return;
  tracePublishedTransition(session, published, extra);
  session.agentTuiStateReason = published.reason ?? null;
  if (published.state === 'idle') {
    session._lastIdleReason = published.reason ?? null;
  }
}

/**
 * DONE-EVIDENCE-01 reason-upgrade: an authoritative idle (hook Stop /
 * Interrupt / ...) arriving while the session is already idle from a
 * silence-based quiescence must still emit a frame — idle→idle publishes
 * nothing, and the true "done" would never reach the notification bridge.
 */
function buildReasonUpgradeFrame(session, mappedState, reason, now, source) {
  const isAuthoritativeIdle =
    mappedState === 'idle' &&
    session.agentTuiState === 'idle' &&
    (session._lastIdleReason === 'quiescence' ||
      session._lastIdleReason === 'quiescence-confirmed');
  if (!isAuthoritativeIdle) return null;
  tracePublishedTransition(session, { state: 'idle', reason }, { source, upgrade: true, now });
  session.agentTuiStateReason = reason;
  session._lastIdleReason = reason;
  return buildAgentStateFrame(session, 'idle', { at: now, reason });
}

/**
 * Process a hook payload against a session map.
 *
 * @param {Map|object} sessionsMap — Map or getter of terminal sessions
 * @param {object} body — Parsed JSON body
 * @param {number} [now] — Timestamp ms
 * @returns {{ status: number, error?: string, broadcast?: object, session?: object }}
 */
export function handleHookReport(sessionsMap, body, now = Date.now()) {
  if (!body || typeof body !== 'object') {
    return { status: 400, error: 'Invalid JSON payload' };
  }

  const { terminalId, token, state, event, source, agent, agentSessionId } = body;

  if (
    !terminalId ||
    typeof terminalId !== 'string' ||
    !token ||
    typeof token !== 'string' ||
    !state ||
    typeof state !== 'string'
  ) {
    return { status: 400, error: 'Missing required fields: terminalId, token, state' };
  }

  if (!ALLOWED_HOOK_STATES.includes(state)) {
    return {
      status: 400,
      error: `Invalid state '${state}'. Allowed: ${ALLOWED_HOOK_STATES.join(', ')}`,
    };
  }

  const session =
    typeof sessionsMap.get === 'function' ? sessionsMap.get(terminalId) : sessionsMap[terminalId];
  if (!session) {
    return { status: 404, error: `Session '${terminalId}' not found` };
  }

  if (!session.hookToken || session.hookToken !== token) {
    return { status: 403, error: 'Invalid session token' };
  }

  if (agentSessionId) {
    session.agentSessionId = agentSessionId;
  }

  if (agent && !session.agentType) {
    session.agentType = agent;
  }

  // P2-1: 'session' state reports register agentSessionId but do NOT set hookState authority
  if (state === 'session') {
    return { status: 204, session, broadcast: null };
  }

  const mappedState = state === 'working' ? 'running' : state;

  updateHookToolActive(session, event || null, now);

  session.hookState = {
    state: mappedState,
    rawState: state,
    event: event || null,
    at: now,
    source: source || `devhub:${agent || session.agentType || 'unknown'}`,
    agentSessionId: agentSessionId || session.agentSessionId || null,
  };

  const detection = {
    state: mappedState,
    visibleWorking: mappedState === 'running',
    visibleBlocker: mappedState === 'blocked',
    visibleIdle: mappedState === 'idle',
    reason: `hook:${event || state}`,
  };

  // P2-2: Publish and check if there was an actual state change
  const published = session.agentStateMachine
    ? session.agentStateMachine.publishHook(detection, now)
    : null;

  if (published) {
    trackHookPublishedReason(session, published, { source: 'hook', now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }

  // P2-2: Only broadcast when published state change occurs — OR when an
  // authoritative idle upgrades a silence-based quiescence idle (same state,
  // new evidence: the true "done" must reach the client exactly once).
  const broadcastPayload = published
    ? buildAgentStateFrame(session, published.state, { at: now })
    : buildReasonUpgradeFrame(session, mappedState, detection.reason, now, 'hook');

  return { status: 204, broadcast: broadcastPayload, session };
}

/**
 * Resolve which session a bridge report (no terminalId) belongs to.
 * Routing priority:
 *   1. session.agentConversationId === conversationId (sticky once bound)
 *   2. workspacePaths overlap with a session's cwd
 *   3. most recently active session with agentType agy/antigravity
 * Returns null when no session matches.
 */
function resolveBridgeTargetSession(sessionsMap, body) {
  const { conversationId, workspacePaths } = body;
  const sessions =
    typeof sessionsMap.values === 'function'
      ? [...sessionsMap.values()]
      : Object.values(sessionsMap);

  if (conversationId) {
    const byConversation = sessions.find((s) => s?.agentConversationId === conversationId);
    if (byConversation) return byConversation;
  }

  if (Array.isArray(workspacePaths) && workspacePaths.length > 0) {
    const normalized = workspacePaths.map((p) =>
      String(p)
        .replace(/[\\/]+$/, '')
        .toLowerCase()
    );
    const byWorkspace = sessions.find((s) => {
      const cwd = String(s?.cwd || s?.workspacePath || '')
        .replace(/[\\/]+$/, '')
        .toLowerCase();
      return (
        cwd &&
        normalized.some((wp) => cwd === wp || cwd.startsWith(wp + '/') || wp.startsWith(cwd + '/'))
      );
    });
    if (byWorkspace) {
      // Bind the conversation so subsequent reports route directly.
      if (conversationId) byWorkspace.agentConversationId = conversationId;
      return byWorkspace;
    }
  }

  // Fallback: most recently active agy session.
  let best = null;
  let bestAt = -1;
  for (const s of sessions) {
    if (!s || (s.agentType !== 'agy' && s.agentType !== 'antigravity')) continue;
    const at = s.lastActivityAt ?? s.agentTuiStateAt ?? 0;
    if (at >= bestAt) {
      best = s;
      bestAt = at;
    }
  }
  if (best && conversationId) best.agentConversationId = conversationId;
  return best;
}

/**
 * Process a hook report from the Antigravity bridge (antigravity-bridge.mjs).
 * Bridge reports carry a SHARED token (not per-session) and NO terminalId —
 * routing is by conversationId / workspacePaths (see resolveBridgeTargetSession).
 *
 * @param {Map|object} sessionsMap
 * @param {object} body — Parsed JSON body from the bridge
 * @param {number} [now]
 * @param {{ bridgeToken?: string }} [options] — shared bridge token; when
 *   omitted, token validation is skipped (dev/test setups).
 * @returns {{ status: number, error?: string, broadcast?: object, session?: object }}
 */
export function handleBridgeHookReport(sessionsMap, body, now = Date.now(), options = {}) {
  if (!body || typeof body !== 'object') {
    return { status: 400, error: 'Invalid JSON payload' };
  }

  const { token, state } = body;

  if (!token || typeof token !== 'string' || !state || typeof state !== 'string') {
    return { status: 400, error: 'Missing required fields: token, state' };
  }

  if (!ALLOWED_HOOK_STATES.includes(state)) {
    return {
      status: 400,
      error: `Invalid state '${state}'. Allowed: ${ALLOWED_HOOK_STATES.join(', ')}`,
    };
  }

  // Shared bridge token (written to ~/.devhub/hook-bridge.json at startup).
  if (options.bridgeToken && token !== options.bridgeToken) {
    return { status: 403, error: 'Invalid bridge token' };
  }

  const session = resolveBridgeTargetSession(sessionsMap, body);
  if (!session) {
    return { status: 404, error: 'No matching session for bridge report' };
  }

  // Ensure the session is identified as agy even if detection never ran.
  if (!session.agentType) {
    session.agentType = 'agy';
  }
  if (body.conversationId && !session.agentConversationId) {
    session.agentConversationId = body.conversationId;
  }

  if (state === 'session') {
    return { status: 204, session, broadcast: null };
  }

  const mappedState = state === 'working' ? 'running' : state;

  updateHookToolActive(session, body.event || null, now);

  session.hookState = {
    state: mappedState,
    rawState: state,
    event: body.event || null,
    at: now,
    source: body.source || ANTIGRAVITY_BRIDGE_SOURCE,
    agentSessionId: body.conversationId || session.agentSessionId || null,
    conversationId: body.conversationId || null,
    terminationReason: body.terminationReason || null,
    transcriptPath: body.transcriptPath || null,
  };

  const detection = {
    state: mappedState,
    visibleWorking: mappedState === 'running',
    visibleBlocker: mappedState === 'blocked',
    visibleIdle: mappedState === 'idle',
    reason: `hook:${body.event || state}`,
  };

  const published = session.agentStateMachine
    ? session.agentStateMachine.publishHook(detection, now)
    : null;

  if (published) {
    trackHookPublishedReason(session, published, { source: 'hook-bridge', now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }

  const broadcastPayload = published
    ? buildAgentStateFrame(session, published.state, { at: now })
    : buildReasonUpgradeFrame(session, mappedState, detection.reason, now, 'hook-bridge');

  return { status: 204, broadcast: broadcastPayload, session };
}

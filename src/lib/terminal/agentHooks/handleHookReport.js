import { HOOK_AUTHORITY_TTL_MS } from '../sessionAgentDetector.js';

export const ALLOWED_HOOK_STATES = ['working', 'blocked', 'idle', 'session'];

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

  if (!terminalId || typeof terminalId !== 'string' || !token || typeof token !== 'string' || !state || typeof state !== 'string') {
    return { status: 400, error: 'Missing required fields: terminalId, token, state' };
  }

  if (!ALLOWED_HOOK_STATES.includes(state)) {
    return { status: 400, error: `Invalid state '${state}'. Allowed: ${ALLOWED_HOOK_STATES.join(', ')}` };
  }

  const session = typeof sessionsMap.get === 'function' ? sessionsMap.get(terminalId) : sessionsMap[terminalId];
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
  };

  // P2-2: Publish and check if there was an actual state change
  const published = session.agentStateMachine
    ? session.agentStateMachine.publishHook(detection, now)
    : null;

  if (published) {
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }

  // P2-2: Only broadcast when published state change occurs
  const broadcastPayload = published
    ? {
        type: 'agent-state',
        agentTuiState: published.state,
        at: now,
      }
    : null;

  return { status: 204, broadcast: broadcastPayload, session };
}

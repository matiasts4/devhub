export const ACTIVE_AGENT_STATUSES = [
  'working',
  'running',
  'active',
  'thinking',
  'asking_questions',
];

export const AGENT_HEARTBEAT_STALE_MS = 90_000;

export function normalizeAgentStatus(status) {
  return String(status || '').toLowerCase();
}

export function getAgentLastSeenAt(agent) {
  const timestamp = agent?.last_heartbeat || agent?.updated_at || agent?.created_at;
  const parsed = timestamp ? new Date(timestamp).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function isAgentHeartbeatFresh(
  agent,
  { now = Date.now(), staleAfterMs = AGENT_HEARTBEAT_STALE_MS } = {}
) {
  const lastSeenAt = getAgentLastSeenAt(agent);
  if (!lastSeenAt) return false;
  return now - lastSeenAt <= staleAfterMs;
}

export function isActiveAgent(agent, options = {}) {
  const status = normalizeAgentStatus(agent?.status);
  if (!ACTIVE_AGENT_STATUSES.includes(status)) return false;

  return isAgentHeartbeatFresh(agent, options);
}

export function filterActiveAgents(agents = [], options = {}) {
  return (agents || []).filter((agent) => isActiveAgent(agent, options));
}

export function countActiveAgents(agents = [], options = {}) {
  return filterActiveAgents(agents, options).length;
}

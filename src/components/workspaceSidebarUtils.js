/**
 * Pure utilities for WorkspaceSidebar — extracted for testability.
 * No React/router/DB imports — zero side effects.
 */

/**
 * Returns the nav keys that should be visible given a project's feature list.
 *
 * @param {string[]|null|undefined} features  - project.features
 * @param {string[]} defaultNav               - full default nav key list
 * @returns {string[]}
 */
export function getVisibleNavKeys(features, defaultNav) {
  if (!features || features.length === 0) {
    return defaultNav;
  }
  return defaultNav.filter((k) => features.includes(k) || k === 'dashboard');
}

/**
 * Determines if an agent row is considered "active" right now.
 *
 * @param {{ status?: string; last_heartbeat?: string; updated_at?: string; created_at?: string }} agent
 * @param {number} nowMs              - current timestamp in ms
 * @param {number} heartbeatFreshMs   - max age for a heartbeat to be considered fresh
 * @param {Set<string>} activeStatuses - set of status strings considered active
 * @returns {boolean}
 */
export function isAgentActive(agent, nowMs, heartbeatFreshMs, activeStatuses) {
  const status = (agent.status || '').toLowerCase();
  if (!activeStatuses.has(status)) return false;

  const lastSeen = agent.last_heartbeat || agent.updated_at || agent.created_at;
  if (!lastSeen) return false;

  return nowMs - new Date(lastSeen).getTime() <= heartbeatFreshMs;
}

export function shouldShowPlanningSignal(key, planningStatus) {
  return key === 'swarm' && planningStatus === 'pending';
}

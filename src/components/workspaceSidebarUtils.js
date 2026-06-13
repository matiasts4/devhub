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
  return key === 'planificacion' && planningStatus === 'pending';
}

export function getSidebarChromeStyle() {
  return {
    background:
      'linear-gradient(180deg, var(--chrome-panel-fill-emphasis), color-mix(in srgb, var(--chrome-panel-fill) 84%, black 16%))',
    borderRightColor: 'var(--chrome-border-color)',
    borderRightWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getSidebarNavActiveStyle() {
  return {
    background:
      'linear-gradient(135deg, var(--chrome-control-fill-hover), var(--chrome-control-fill))',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getSidebarNavItemClasses({ active = false, collapsed = false } = {}) {
  return [
    'group flex items-center border cursor-pointer select-none',
    collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-2.5 py-2',
    'rounded-[var(--chrome-radius-control)] text-[11px] font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150',
    active
      ? 'border-[var(--chrome-border-color)] bg-[var(--chrome-control-fill-hover)] text-[var(--text-primary)] shadow-[var(--chrome-shadow-control)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)]'
      : 'border-transparent bg-transparent text-[var(--text-muted)] shadow-none hover:border-[var(--chrome-border-color)] hover:bg-[var(--chrome-control-fill)] hover:text-[var(--text-primary)] hover:shadow-[var(--chrome-shadow-control)] active:translate-y-[var(--chrome-press-offset)]',
  ].join(' ');
}

export function getSidebarIdentityShellStyle() {
  return {
    background:
      'linear-gradient(160deg, var(--chrome-panel-fill-emphasis), color-mix(in srgb, var(--chrome-panel-fill) 88%, black 12%))',
    borderColor: 'color-mix(in srgb, var(--accent-primary) 24%, var(--chrome-border-color))',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getSidebarStatCardStyle() {
  return {
    background:
      'linear-gradient(180deg, var(--chrome-control-fill), color-mix(in srgb, var(--chrome-panel-fill) 82%, black 18%))',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getSidebarToggleStyle() {
  return {
    borderColor: 'color-mix(in srgb, var(--accent-primary) 28%, var(--chrome-border-color))',
    borderWidth: 'var(--chrome-border-width)',
    background:
      'linear-gradient(180deg, var(--chrome-control-fill-hover), color-mix(in srgb, var(--chrome-control-fill) 78%, black 22%))',
    color: 'var(--text-primary)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getSidebarChromeStyle() {
  return {
    background:
      'linear-gradient(180deg, var(--chrome-panel-fill-emphasis), color-mix(in srgb, var(--chrome-panel-fill) 84%, black 16%))',
    borderRightColor: 'var(--chrome-border-color)',
    borderRightWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getSidebarNavActiveStyle() {
  return {
    background:
      'linear-gradient(135deg, var(--chrome-control-fill-hover), var(--chrome-control-fill))',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getSidebarNavItemClasses({ active = false, collapsed = false } = {}) {
  return [
    'group flex items-center border cursor-pointer select-none',
    collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-2.5 py-2',
    'rounded-[var(--chrome-radius-control)] text-[11px] font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150',
    active
      ? 'border-[var(--chrome-border-color)] bg-[var(--chrome-control-fill-hover)] text-[var(--text-primary)] shadow-[var(--chrome-shadow-control)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)]'
      : 'border-transparent bg-transparent text-[var(--text-muted)] shadow-none hover:border-[var(--chrome-border-color)] hover:bg-[var(--chrome-control-fill)] hover:text-[var(--text-primary)] hover:shadow-[var(--chrome-shadow-control)] active:translate-y-[var(--chrome-press-offset)]',
  ].join(' ');
}

export function getSidebarIdentityShellStyle() {
  return {
    background:
      'linear-gradient(160deg, var(--chrome-panel-fill-emphasis), color-mix(in srgb, var(--chrome-panel-fill) 88%, black 12%))',
    borderColor: 'color-mix(in srgb, var(--accent-primary) 24%, var(--chrome-border-color))',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getSidebarStatCardStyle() {
  return {
    background:
      'linear-gradient(180deg, var(--chrome-control-fill), color-mix(in srgb, var(--chrome-panel-fill) 82%, black 18%))',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getSidebarToggleStyle() {
  return {
    borderColor: 'color-mix(in srgb, var(--accent-primary) 28%, var(--chrome-border-color))',
    borderWidth: 'var(--chrome-border-width)',
    background:
      'linear-gradient(180deg, var(--chrome-control-fill-hover), color-mix(in srgb, var(--chrome-control-fill) 78%, black 22%))',
    color: 'var(--text-primary)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

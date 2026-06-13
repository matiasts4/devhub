/**
 * Unit tests for WorkspaceSidebar pure logic — sidebar-ux-improvements
 *
 * Pure functions extracted from WorkspaceSidebar.jsx:
 *   - getVisibleNavKeys(features, defaultNav)
 *   - isAgentActive(agent, nowMs, heartbeatFreshMs)
 */

const fs = require('fs');
const path = require('path');
const {
  getVisibleNavKeys,
  isAgentActive,
  shouldShowPlanningSignal,
  getSidebarChromeStyle,
  getSidebarNavActiveStyle,
  getSidebarNavItemClasses,
  getSidebarIdentityShellStyle,
  getSidebarStatCardStyle,
  getSidebarToggleStyle,
} = require('../workspaceSidebarUtils.js');

const DEFAULT_NAV = ['dashboard', 'tareas', 'editor', 'roadmap', 'historial', 'swarm', 'telegram'];

describe('getVisibleNavKeys()', () => {
  test('returns all default keys when features is empty', () => {
    const keys = getVisibleNavKeys([], DEFAULT_NAV);
    expect(keys).toEqual(DEFAULT_NAV);
  });

  test('returns filtered keys when features is non-empty, always includes dashboard', () => {
    const keys = getVisibleNavKeys(['tareas', 'swarm'], DEFAULT_NAV);
    expect(keys).toContain('dashboard');
    expect(keys).toContain('tareas');
    expect(keys).toContain('swarm');
    expect(keys).not.toContain('editor');
    expect(keys).not.toContain('roadmap');
  });

  test('returns full DEFAULT_NAV when features is null', () => {
    const keys = getVisibleNavKeys(null, DEFAULT_NAV);
    expect(keys).toEqual(DEFAULT_NAV);
  });
});

describe('isAgentActive()', () => {
  const HEARTBEAT_FRESH_MS = 90_000;
  const ACTIVE_STATUSES = new Set(['working', 'running', 'active', 'thinking', 'asking_questions']);

  test('returns true for active status with recent heartbeat', () => {
    const nowMs = Date.now();
    const agent = {
      status: 'working',
      last_heartbeat: new Date(nowMs - 10_000).toISOString(),
    };
    expect(isAgentActive(agent, nowMs, HEARTBEAT_FRESH_MS, ACTIVE_STATUSES)).toBe(true);
  });

  test('returns false for active status with stale heartbeat', () => {
    const nowMs = Date.now();
    const agent = {
      status: 'working',
      last_heartbeat: new Date(nowMs - 120_000).toISOString(),
    };
    expect(isAgentActive(agent, nowMs, HEARTBEAT_FRESH_MS, ACTIVE_STATUSES)).toBe(false);
  });

  test('returns false for inactive status', () => {
    const nowMs = Date.now();
    const agent = {
      status: 'idle',
      last_heartbeat: new Date(nowMs - 1_000).toISOString(),
    };
    expect(isAgentActive(agent, nowMs, HEARTBEAT_FRESH_MS, ACTIVE_STATUSES)).toBe(false);
  });

  test('returns false when last_heartbeat is missing', () => {
    const nowMs = Date.now();
    const agent = { status: 'working' };
    expect(isAgentActive(agent, nowMs, HEARTBEAT_FRESH_MS, ACTIVE_STATUSES)).toBe(false);
  });
});

describe('planning affordances', () => {
  test('shows the planning signal on planificacion only while planning is pending', () => {
    expect(shouldShowPlanningSignal('planificacion', 'pending')).toBe(true);
    expect(shouldShowPlanningSignal('dashboard', 'pending')).toBe(false);
    expect(shouldShowPlanningSignal('swarm', 'pending')).toBe(false);
    expect(shouldShowPlanningSignal('planificacion', 'completed')).toBe(false);
  });

  test('does not keep legacy agenthub navigation metadata in the sidebar', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'WorkspaceSidebar.jsx'),
      'utf8'
    );

    expect(source).not.toContain('agenthub: {');
  });

  test('sidebar chrome helpers resolve morphology token-driven shell styles', () => {
    expect(getSidebarChromeStyle()).toEqual(
      expect.objectContaining({
        borderRightColor: 'var(--chrome-border-color)',
        borderRightWidth: 'var(--chrome-border-width)',
        boxShadow: 'var(--chrome-shadow-panel)',
      })
    );
    expect(getSidebarChromeStyle().background).toContain('var(--chrome-panel-fill)');
    expect(getSidebarChromeStyle().background).not.toContain('var(--surface-card) 95%');
  });

  test('sidebar active nav style resolves tokenized control chrome instead of per-page gradients', () => {
    const style = getSidebarNavActiveStyle();

    expect(style.background).toContain('var(--chrome-control-fill)');
    expect(style.borderColor).toBe('var(--chrome-border-color)');
    expect(style.borderWidth).toBe('var(--chrome-border-width)');
    expect(style.boxShadow).toBe('var(--chrome-shadow-control)');
  });

  test('sidebar nav items resolve stronger morphology-aware classes for both collapsed and active states', () => {
    const activeExpanded = getSidebarNavItemClasses({ active: true, collapsed: false });
    const inactiveCollapsed = getSidebarNavItemClasses({ active: false, collapsed: true });

    expect(activeExpanded).toContain('rounded-[var(--chrome-radius-control)]');
    expect(activeExpanded).toContain('bg-[var(--chrome-control-fill-hover)]');
    expect(activeExpanded).toContain('shadow-[var(--chrome-shadow-control)]');
    expect(activeExpanded).not.toContain('rounded-xl');

    expect(inactiveCollapsed).toContain('justify-center');
    expect(inactiveCollapsed).toContain('hover:bg-[var(--chrome-control-fill)]');
    expect(inactiveCollapsed).toContain('hover:border-[var(--chrome-border-color)]');
    expect(inactiveCollapsed).not.toContain('hover:bg-white/[0.05]');
  });

  test('sidebar identity and toggle chrome use shared panel/control tokens instead of bespoke shell values', () => {
    const identityStyle = getSidebarIdentityShellStyle();
    const statCardStyle = getSidebarStatCardStyle();
    const toggleStyle = getSidebarToggleStyle();

    expect(identityStyle.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(identityStyle.borderColor).toContain('var(--chrome-border-color)');
    expect(identityStyle.borderWidth).toBe('var(--chrome-border-width)');
    expect(identityStyle.boxShadow).toBe('var(--chrome-shadow-panel)');

    expect(statCardStyle.background).toContain('var(--chrome-control-fill)');
    expect(statCardStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(statCardStyle.boxShadow).toBe('var(--chrome-shadow-control)');

    expect(toggleStyle.background).toContain('var(--chrome-control-fill-hover)');
    expect(toggleStyle.borderColor).toContain('var(--chrome-border-color)');
    expect(toggleStyle.boxShadow).toBe('var(--chrome-shadow-control)');
    expect(JSON.stringify({ identityStyle, statCardStyle, toggleStyle })).not.toContain('255,255,255');
  });
});

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
  test('shows the planning signal on swarm only while planning is pending', () => {
    expect(shouldShowPlanningSignal('swarm', 'pending')).toBe(true);
    expect(shouldShowPlanningSignal('dashboard', 'pending')).toBe(false);
    expect(shouldShowPlanningSignal('swarm', 'completed')).toBe(false);
  });

  test('does not keep legacy agenthub navigation metadata in the sidebar', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'WorkspaceSidebar.jsx'),
      'utf8'
    );

    expect(source).not.toContain('agenthub: {');
  });
});

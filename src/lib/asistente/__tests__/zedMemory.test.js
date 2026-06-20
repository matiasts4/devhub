/**
 * @jest-environment jsdom
 */

import {
  getZedMemory,
  setZedPreference,
  getZedPreference,
  recordZedMemoryAction,
  setZedAgentStatus,
  getZedAgentStatus,
  clearZedMemory,
  ZED_MEMORY_STORAGE_KEY,
} from '../zedMemory';

describe('zedMemory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns default memory when localStorage is empty', () => {
    const memory = getZedMemory();
    expect(memory.preferences).toEqual({});
    expect(memory.recentActions).toEqual([]);
    expect(memory.agentStatus).toBe('idle');
    expect(memory.currentTaskId).toBeNull();
    expect(memory.pendingPlans).toEqual([]);
    expect(memory.lastSeenAt).toBeNull();
  });

  it('persists and retrieves preferences', () => {
    setZedPreference('theme', 'dark');
    expect(getZedPreference('theme')).toBe('dark');
    expect(getZedPreference('missing', 'fallback')).toBe('fallback');
    expect(getZedMemory().lastSeenAt).toMatch(/\d{4}-/);
  });

  it('records recent actions and caps them', () => {
    for (let i = 0; i < 25; i += 1) {
      recordZedMemoryAction({ type: 'agent_action', tool: 'test', idx: i });
    }
    const memory = getZedMemory();
    expect(memory.recentActions.length).toBeLessThanOrEqual(20);
    expect(memory.recentActions[0].idx).toBe(24);
  });

  it('sets and gets agent status', () => {
    setZedAgentStatus('working', 'task-123');
    expect(getZedAgentStatus()).toEqual({ status: 'working', currentTaskId: 'task-123' });
  });

  it('clears memory', () => {
    setZedPreference('theme', 'dark');
    clearZedMemory();
    expect(getZedPreference('theme')).toBeNull();
    expect(window.localStorage.getItem(ZED_MEMORY_STORAGE_KEY)).toBeNull();
  });

  it('survives corrupt localStorage', () => {
    window.localStorage.setItem(ZED_MEMORY_STORAGE_KEY, '{not json');
    expect(getZedMemory().preferences).toEqual({});
  });
});

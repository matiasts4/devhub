/**
 * Durable memory for Zed across sessions.
 *
 * Stores preferences, recent actions, agent status and pending plans in
 * localStorage so Zed does not start from zero on every interaction.
 */

const ZED_MEMORY_KEY = 'devhub-zed-memory';
const MAX_RECENT_ACTIONS = 20;

function isClient() {
  return typeof window !== 'undefined' && window.localStorage;
}

function readMemory() {
  if (!isClient()) return defaultMemory();
  try {
    const raw = window.localStorage.getItem(ZED_MEMORY_KEY);
    if (!raw) return defaultMemory();
    const parsed = JSON.parse(raw);
    return { ...defaultMemory(), ...parsed };
  } catch {
    return defaultMemory();
  }
}

function defaultMemory() {
  return {
    preferences: {},
    recentActions: [],
    agentStatus: 'idle',
    currentTaskId: null,
    pendingPlans: [],
    lastSeenAt: null,
  };
}

function writeMemory(memory) {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(ZED_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota errors
  }
}

export function getZedMemory() {
  return readMemory();
}

export function setZedPreference(key, value) {
  const memory = readMemory();
  memory.preferences[key] = value;
  memory.lastSeenAt = new Date().toISOString();
  writeMemory(memory);
}

export function getZedPreference(key, defaultValue = null) {
  const memory = readMemory();
  return memory.preferences[key] ?? defaultValue;
}

export function recordZedMemoryAction(action) {
  const memory = readMemory();
  memory.recentActions.unshift({
    ...action,
    timestamp: new Date().toISOString(),
  });
  memory.recentActions = memory.recentActions.slice(0, MAX_RECENT_ACTIONS);
  memory.lastSeenAt = new Date().toISOString();
  writeMemory(memory);
}

export function setZedAgentStatus(status, currentTaskId = null) {
  const memory = readMemory();
  memory.agentStatus = status;
  memory.currentTaskId = currentTaskId;
  memory.lastSeenAt = new Date().toISOString();
  writeMemory(memory);
}

export function getZedAgentStatus() {
  const memory = readMemory();
  return { status: memory.agentStatus, currentTaskId: memory.currentTaskId };
}

export function addZedPendingPlan(plan) {
  const memory = readMemory();
  memory.pendingPlans.push({
    ...plan,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  memory.lastSeenAt = new Date().toISOString();
  writeMemory(memory);
}

export function removeZedPendingPlan(planId) {
  const memory = readMemory();
  memory.pendingPlans = memory.pendingPlans.filter((p) => p.id !== planId);
  writeMemory(memory);
}

export function clearZedMemory() {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(ZED_MEMORY_KEY);
  } catch {
    // ignore
  }
}

export const ZED_MEMORY_STORAGE_KEY = ZED_MEMORY_KEY;

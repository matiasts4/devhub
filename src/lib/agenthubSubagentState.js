const TERMINAL_STATUS_MAP = {
  completed: 'success',
  success: 'success',
  error: 'error',
  aborted: 'aborted',
  idle: 'success',
};

const IN_PROGRESS_STATUS = new Set(['active', 'working', 'running', 'thinking', 'busy', 'retry']);

import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';

const VALID_SDD_AGENT_RE = /^sdd-[a-z0-9][a-z0-9-]*$/i;

export function normalizeSubagentName(agentName) {
  const normalized = typeof agentName === 'string' ? agentName.trim().toLowerCase() : '';
  if (!normalized) return DEFAULT_OPENCODE_AGENT;
  if (normalized === 'build' || normalized === 'plan' || normalized === 'qa') {
    return DEFAULT_OPENCODE_AGENT;
  }
  if (VALID_SDD_AGENT_RE.test(normalized)) {
    return normalized;
  }
  return DEFAULT_OPENCODE_AGENT;
}

export function normalizeSubagentStatus(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!normalized) return 'running';
  return (
    TERMINAL_STATUS_MAP[normalized] || (IN_PROGRESS_STATUS.has(normalized) ? 'running' : normalized)
  );
}

export function getSubagentMeta(message) {
  try {
    return message?.meta ? JSON.parse(message.meta) : {};
  } catch {
    return {};
  }
}

export function getSubagentSessionIdentifiers(message) {
  const meta = getSubagentMeta(message);
  return {
    childSessionId: meta.childSessionId || null,
    sessionId: meta.sessionId || null,
  };
}

export function isStaleSessionForSubagentMessage(staleSession, message) {
  const { childSessionId, sessionId } = getSubagentSessionIdentifiers(message);
  return [childSessionId, sessionId].filter(Boolean).some((id) => {
    return [staleSession?.session_id, staleSession?.opencode_session_id].includes(id);
  });
}

export function getSubagentFinalStatusFromChild(childStatus) {
  return normalizeSubagentStatus(childStatus);
}

/**
 * useAgentRegistryPolling — Polls agent_registry + live terminal sessions every 5s.
 *
 * Sources of truth (merged):
 * 1. agent_registry (SQLite) — agents launched from the app
 * 2. /api/terminal/sessions — live PTY processes (with opencodeSessionId if detected)
 * Active agents: status active + heartbeat fresh OR PTY session with opencode running.
 * Inactive agents are no longer synthesized here; resumable history now comes from the shared catalog.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/db/localClient';
import { AGENT_HEARTBEAT_STALE_MS } from '@/lib/agentRegistryTelemetry';
import { getAgentRegistryLiveSnapshot } from '@/lib/agentRegistryLive';

const POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 15000;

function dedupeBy(items, getKey) {
  const seen = new Set();
  return (items || []).filter((item, index) => {
    const rawKey = getKey(item, index);
    const key = rawKey == null || rawKey === '' ? `__index_${index}` : String(rawKey);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function useAgentRegistryPolling(projectId, options = {}) {
  const [agents, setAgents] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [inactiveAgents, setInactiveAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const db = useMemo(() => createClient(), []);
  const visibilityAware = options?.visibilityAware === true;

  const clearPollingTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!projectId) return;

    try {
      // ── Source 1: agent_registry from local SQLite ──────────────────────────
      const { data: registryData } = await db
        .from('agent_registry')
        .select('*')
        .eq('project_id', projectId)
        .order('last_heartbeat', { ascending: false });

      // ── Source 2: Live PTY sessions ─────────────────────────────────────────
      let liveSessions = {};
      try {
        const res = await fetch('/api/terminal/sessions', { cache: 'no-store' });
        if (res.ok) {
          const sessionData = await res.json();
          const sessions = sessionData?.sessions || sessionData;
          if (Array.isArray(sessions)) {
            sessions.forEach((s) => {
              const key = s?.terminalId || s?.id;
              if (key) {
                liveSessions[key] = {
                  alive: s.alive !== false,
                  mode: s.mode,
                  opencodeSessionId: s.opencodeSessionId || null,
                };
              }
            });
          }
        }
      } catch {
        // Terminal sessions may not be available — continue without them
      }

      // ── Source 3: localStorage agent runs ──────────────────────────────────
      const agentRuns = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');

      // ── Build enriched registry agent list ──────────────────────────────────
      const allAgents = [...(registryData || [])];

      allAgents.forEach((agent) => {
        const runKey = agent.current_task_id || agent.agent_id;
        const run = agentRuns[runKey] || agentRuns[agent.agent_id];
        if (run) {
          agent._displayName = run.taskTitle || run.promptSummary || null;
          agent._selectedAgent = run.selectedAgent || null;
          agent._launchOrigin = run.launchOrigin || null;
          agent._promptSummary = run.promptSummary || null;
          agent._launchedAt = run.launchedAt || null;
          agent._panelId = run.panelId || null;
          agent._opencodeSessionId = run.opencodeSessionId || null;
        }
      });

      const combinedAgents = dedupeBy(allAgents, (agent) => agent?.agent_id);

      // ── Auto-cleanup stale registry agents ──────────────────────────────────
      const staleAgents = allAgents.filter((agent) => {
        if (!agent.last_heartbeat) return false;
        const hb = new Date(agent.last_heartbeat).getTime();
        if (!Number.isFinite(hb)) return false;
        const age = Date.now() - hb;
        const isActiveStatus = [
          'running', 'working', 'active', 'thinking', 'asking_questions',
        ].includes(String(agent.status || '').toLowerCase());
        return age > AGENT_HEARTBEAT_STALE_MS && isActiveStatus;
      });

      for (const stale of staleAgents) {
        try {
          await db
            .from('agent_registry')
            .update({ status: 'idle', updated_at: new Date().toISOString() })
            .eq('agent_id', stale.agent_id);
        } catch {
          // Ignore individual update failures
        }
      }

      // ── Split into active / inactive ─────────────────────────────────────────
      const snapshot = getAgentRegistryLiveSnapshot({
        agents: allAgents,
        liveSessions,
        agentRuns,
      });

      const activeAll = dedupeBy(snapshot.activeAgents, (agent) => agent?.agent_id);

      // ── Auto-purge old registry entries (> 7 days) ────────────────────────────
      // Prevents the registry from accumulating stale sdd-orchestrator entries indefinitely.
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const oldAgents = allAgents.filter((agent) => {
        const ts = agent.created_at || agent.last_heartbeat;
        if (!ts) return false;
        const age = Date.now() - new Date(ts).getTime();
        return age > SEVEN_DAYS_MS && (!agent.status || agent.status === 'idle');
      });
      for (const old of oldAgents) {
        try {
          await db.from('agent_registry').delete().eq('agent_id', old.agent_id);
        } catch {
          // Ignore
        }
      }

      setAgents(combinedAgents);
      setActiveAgents(activeAll);
      setInactiveAgents([]);

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to fetch agent registry');
      setAgents([]);
      setActiveAgents([]);
      setInactiveAgents([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, db]);

  useEffect(() => {
    clearPollingTimer();

    const hidden = visibilityAware && typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden) {
      fetchAgents();
      intervalRef.current = setInterval(fetchAgents, POLL_INTERVAL_MS);
    } else {
      timeoutRef.current = setTimeout(fetchAgents, HIDDEN_POLL_INTERVAL_MS);
    }

    if (!visibilityAware || typeof document === 'undefined') {
      return () => clearPollingTimer();
    }

    const handleVisibilityChange = () => {
      clearPollingTimer();
      if (document.visibilityState === 'hidden') {
        timeoutRef.current = setTimeout(fetchAgents, HIDDEN_POLL_INTERVAL_MS);
        return;
      }

      fetchAgents();
      intervalRef.current = setInterval(fetchAgents, POLL_INTERVAL_MS);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPollingTimer();
    };
  }, [clearPollingTimer, fetchAgents, visibilityAware]);

  return {
    agents,
    activeAgents,
    inactiveAgents,
    loading,
    error,
    lastUpdated,
    refetch: fetchAgents,
  };
}

/**
 * useAgentRegistryPolling — Polls agent_registry + live terminal sessions + OpenCode sessions every 5s.
 *
 * Sources of truth (merged):
 * 1. agent_registry (SQLite) — agents launched from the app
 * 2. /api/terminal/sessions — live PTY processes (with opencodeSessionId if detected)
 * 3. /api/opencode/sessions — OpenCode session list with isActive flag
 *
 * Active agents: status active + heartbeat fresh OR PTY session with opencode running.
 * Inactive agents: everything else (shown in History tab with Resume button).
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/db/localClient';
import { AGENT_HEARTBEAT_STALE_MS } from '@/lib/agentRegistryTelemetry';
import { getAgentRegistryLiveSnapshot } from '@/lib/agentRegistryLive';

const POLL_INTERVAL_MS = 5000;

export default function useAgentRegistryPolling(projectId) {
  const [agents, setAgents] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [inactiveAgents, setInactiveAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const db = useMemo(() => createClient(), []);

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

      // ── Source 3: OpenCode sessions ─────────────────────────────────────────
      let opencodeSessions = [];
      try {
        const res = await fetch('/api/opencode/sessions', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          opencodeSessions = Array.isArray(data) ? data : data?.sessions || [];
        }
      } catch {
        // OpenCode may not be available
      }

      // ── Source 4: localStorage agent runs ──────────────────────────────────
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

      // ── Synthesize OpenCode sessions as virtual agents ────────────────────────
      // Only create virtual entries for sessions NOT already covered by a registry entry
      const existingOCSessionIds = new Set(
        allAgents.map((a) => a._opencodeSessionId).filter(Boolean)
      );

      // Local override: sessions the user explicitly terminated via the "End" button
      // Stored as { sessionId: timestamp } in localStorage
      const terminatedSessions = JSON.parse(localStorage.getItem('devhub_oc_terminated') || '{}');

      const virtualAgents = opencodeSessions
        .filter((s) => !existingOCSessionIds.has(s.id))
        .map((s) => {
          // If user manually terminated this session, force isActive=false regardless of PTY state
          const wasTerminated = Boolean(terminatedSessions[s.id]);
          const effectivelyActive = s.isActive && !wasTerminated;
          return {
            agent_id: `oc-${s.id}`,
            nombre: 'opencode',
            modelo_llm: 'N/A',
            status: effectivelyActive ? 'running' : 'idle',
            last_heartbeat: effectivelyActive
              ? new Date().toISOString()
              : new Date(s.updated).toISOString(),
            current_task_id: s.id,
            // Virtual-specific metadata
            _isOpenCodeSession: true,
            _opencodeSessionId: s.id,
            _displayName: s.title || `Session ${s.id.slice(0, 8)}`,
            _selectedAgent: 'opencode',
            _launchedAt: effectivelyActive ? Date.now() : null,
            _activePanelId: effectivelyActive ? (s.activePanelId || null) : null,
            _sessionDirectory: s.directory || null,
            _sessionUpdated: s.updated,
            _wasTerminated: wasTerminated,
          };
        });


      const combinedAgents = [...allAgents, ...virtualAgents];

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

      // Active = registry actives + virtual OC sessions with isActive=true
      const activeOC = virtualAgents.filter((a) => a.status === 'running');
      const activeAll = [...snapshot.activeAgents, ...activeOC];

      // History = ONLY inactive OpenCode sessions (resumable, meaningful)
      // Registry agents (sdd-orchestrator, etc.) are NOT shown in History —
      // they accumulate over time and there's nothing to "resume" on them.
      const activeIds = new Set(activeAll.map((a) => a.agent_id));
      const inactiveAll = virtualAgents.filter(
        (a) => a._isOpenCodeSession && !activeIds.has(a.agent_id)
      );

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
      setInactiveAgents(inactiveAll);

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
    fetchAgents();
    intervalRef.current = setInterval(fetchAgents, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAgents]);

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

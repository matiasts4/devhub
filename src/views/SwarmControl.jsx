import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/db/localClient';
import { getDocOpsContextBudgetPolicy } from '@/lib/docopsPolicy';
import {
  Activity,
  Cpu,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  ListTodo,
  RefreshCw,
  Info,
  Hash,
  ChevronDown,
  ChevronRight,
  Terminal,
  Loader2,
  Server,
  Eye,
  X,
  Wifi,
  WifiOff,
  Send,
  LayoutList,
  GanttChart,
  Layers,
  Plus,
  Square,
  Gauge,
} from 'lucide-react';
import { toast } from 'sonner';
import StatusSignal from '@/components/ui/StatusSignal';
import AgentTracePanel from '@/components/chat/AgentTracePanel';
import TraceSearchBar from '@/components/chat/TraceSearchBar';
import MCPStatusPanel from '@/components/chat/MCPStatusPanel';
import AgentMetricsCard from '@/components/chat/AgentMetricsCard';
import LiveTracePreview from '@/components/chat/LiveTracePreview';
import SwarmTimeline from '@/components/chat/SwarmTimeline';
import SubagentBreadcrumbs from '@/components/chat/SubagentBreadcrumbs';
import AgentLaunchModal from '@/components/chat/AgentLaunchModal';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/chat/Skeleton';
import { useAgentTraces } from '@/hooks/useAgentTraces';

// ─── SSE Connection Hook ──────────────────────────────────────────────────────

/**
 * useSessionStream — connects to the SSE endpoint and dispatches events.
 * Implements exponential backoff on disconnect.
 */
function useSessionStream(handlers) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const maxRetries = 10;
  const baseDelay = 1000;

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const es = new EventSource('/api/agenthub/sessions/stream');
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryCountRef.current = 0;
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;

        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, retryCountRef.current), 30000);
          retryCountRef.current++;
          retryTimerRef.current = setTimeout(connect, delay);
        }
      };

      es.addEventListener('session-update', (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        handlers.onSessionUpdate?.(data);
      });

      es.addEventListener('trace-event', (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        handlers.onTraceEvent?.(data);
      });

      es.addEventListener('usage-update', (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        handlers.onUsageUpdate?.(data);
      });

      es.addEventListener('heartbeat', () => {
        handlers.onHeartbeat?.();
      });
    } catch {
      // EventSource not supported — fall back to polling handled by parent
      setConnected(false);
    }
  }, [handlers]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { connected, reconnect: connect };
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  active: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Activo' },
  working: {
    cls: 'bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/20',
    label: 'Ejecutando',
  },
  running: { cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'Running' },
  idle: { cls: 'bg-[#8B949E]/10 text-[#8B949E] border-[#8B949E]/20', label: 'Idle' },
  error: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Error' },
  thinking: { cls: 'bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/20', label: 'Thinking' },
  completed: {
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    label: 'Completado',
  },
};

// ─── Mini Trace Summary (T-38) ────────────────────────────────────────────────

function MiniTraceSummary({ traces, usage }) {
  const lastThree = traces.slice(-3);

  if (lastThree.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Esperando actividad…
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {lastThree.map((t, i) => {
        const isTool = t.trace_type === 'tool' || t.tool_name;
        const label = isTool
          ? t.tool_name || 'tool'
          : t.trace_type === 'reasoning'
            ? 'thinking'
            : t.trace_type || 'text';
        const statusColor =
          t.tool_status === 'running'
            ? 'text-amber-400'
            : t.tool_status === 'error'
              ? 'text-red-400'
              : 'text-gray-400';
        return (
          <div key={t.id || i} className="flex items-center gap-2">
            <span className={`text-[10px] font-mono ${statusColor}`}>
              {t.tool_status === 'running' ? (
                <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
              ) : (
                <Terminal className="w-3 h-3 inline mr-1" />
              )}
              {label}
            </span>
            {t.duration_ms && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {t.duration_ms}ms
              </span>
            )}
          </div>
        );
      })}
      {usage && usage.total_tokens > 0 && (
        <div
          className="flex items-center gap-2 pt-1 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {usage.total_tokens.toLocaleString()} tokens
          </span>
          {usage.tool_calls_count > 0 && (
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              · {usage.tool_calls_count} calls
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Live Agent Card (T-38) ───────────────────────────────────────────────────

function LiveAgentCard({ session, traces, usage, onViewTrace, onKill }) {
  const status = (session.status || 'idle').toLowerCase();
  const badge = STATUS_BADGE[status] || STATUS_BADGE.idle;

  const cardBorderColor =
    status === 'working' || status === 'running' || status === 'thinking'
      ? 'var(--warning)'
      : status === 'error'
        ? 'var(--danger)'
        : status === 'completed'
          ? 'var(--success)'
          : 'var(--border-subtle)';

  const isWorking = ['working', 'running', 'thinking', 'active'].includes(status);

  return (
    <div
      className="rounded-xl p-4 transition-all hover:border-[var(--border-strong)]"
      style={{
        background: 'var(--surface-muted)',
        border: `1px solid ${cardBorderColor}`,
        borderLeftWidth: '3px',
        borderLeftColor: cardBorderColor,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: isWorking
                ? 'color-mix(in srgb, var(--warning) 10%, transparent)'
                : 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              border: `1px solid ${isWorking ? 'color-mix(in srgb, var(--warning) 20%, transparent)' : 'color-mix(in srgb, var(--accent-primary) 20%, transparent)'}`,
            }}
          >
            {isWorking ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--warning)' }} />
            ) : (
              <Activity
                className="w-4 h-4"
                strokeWidth={1.5}
                style={{ color: 'var(--accent-primary)' }}
              />
            )}
          </div>
          <div>
            <h3
              className="font-mono font-semibold text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              {session.title || 'Sin título'}
            </h3>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {session.agent_model || 'N/A'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${badge.cls}`}>
            {badge.label}
          </span>
          <button
            onClick={() => onViewTrace(session)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] hover:text-[var(--accent-primary)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-muted)',
            }}
            title="Ver trace completo"
            aria-label="Ver trace completo"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onKill(session.id)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_20%,transparent)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-muted)',
            }}
            title="Terminar sesión"
            aria-label="Terminar sesión"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mini trace summary */}
      <div
        className="rounded-lg p-3"
        style={{
          background: 'var(--surface-app)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <p
          className="text-[11px] uppercase tracking-wider font-semibold mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Últimas acciones
        </p>
        <MiniTraceSummary traces={traces} usage={usage} />
      </div>
    </div>
  );
}

// ─── Expandable Trace Panel (T-39) ────────────────────────────────────────────

function ExpandedTracePanel({ session, onClose }) {
  const { traces, loading, error, searchTraces, filterTraces, refresh, searchResults } =
    useAgentTraces(session.id, { refreshInterval: 2000, enabled: true });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const handleSearch = useCallback(
    (term) => {
      setSearchTerm(term);
      if (term) {
        searchTraces(term);
      }
    },
    [searchTraces]
  );

  const handleFilter = useCallback(
    (filters) => {
      if (filters.trace_type) setFilterType(filters.trace_type);
      if (filters.tool_status) setFilterStatus(filters.tool_status);
      filterTraces(filters);
    },
    [filterTraces]
  );

  const handleClear = useCallback(() => {
    setSearchTerm('');
    setFilterType('all');
    setFilterStatus('all');
    filterTraces({});
    refresh();
  }, [filterTraces, refresh]);

  const displayTraces = useMemo(() => {
    const base = searchResults !== null ? searchResults : traces;
    let result = base;

    if (filterType && filterType !== 'all') {
      result = result.filter((p) => {
        const type = p.trace_type || (p.tool_name ? 'tool' : 'text');
        return type === filterType;
      });
    }
    if (filterStatus && filterStatus !== 'all') {
      result = result.filter((p) => !p.tool_status || p.tool_status === filterStatus);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter((p) => {
        const searchable = [
          p.tool_name,
          p.tool_output,
          p.content,
          JSON.stringify(p.tool_input || ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    return result;
  }, [traces, searchResults, searchTerm, filterType, filterStatus]);

  const isRunning = ['working', 'running', 'active', 'thinking'].includes(
    (session.status || '').toLowerCase()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full overflow-y-auto animate-in slide-in-from-right duration-300"
        style={{ background: 'var(--surface-app)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
          style={{
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <h2
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Trace: {session.title || session.id.slice(0, 8)}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {session.agent_model || 'N/A'} ·{' '}
              <span className={`font-mono ${isRunning ? 'text-amber-400' : 'text-gray-400'}`}>
                {isRunning ? 'En ejecución' : session.status || 'Inactivo'}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-elevated transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cerrar panel de trace"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <TraceSearchBar onSearch={handleSearch} onFilter={handleFilter} onClear={handleClear} />

        {/* Trace content */}
        <div className="p-4">
          {loading && traces.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-500 text-xs font-mono gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando traces…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-10 text-red-400 text-xs font-mono gap-2">
              <AlertCircle className="w-4 h-4" />
              Error: {error}
            </div>
          ) : (
            <AgentTracePanel
              trace={displayTraces.map((t) => ({
                id: t.id,
                type: t.trace_type || (t.tool_name ? 'tool' : 'text'),
                toolName: t.tool_name,
                toolInput: t.tool_input,
                toolOutput: t.tool_output,
                toolStatus: t.tool_status,
                content: t.content,
                durationMs: t.duration_ms,
                timeStart: t.time_start,
                timeEnd: t.time_end,
              }))}
              isRunning={isRunning}
              searchTerm={searchTerm}
              filterType={filterType}
              filterStatus={filterStatus}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main SwarmControl ────────────────────────────────────────────────────────

export default function SwarmControl() {
  const { project } = useOutletContext() || {};
  const navigate = useNavigate();
  const db = useMemo(() => createClient(), []);
  const docopsBudget = getDocOpsContextBudgetPolicy();

  // Session-based agent data (T-41: no longer relies on agent_registry as primary source)
  const [sessions, setSessions] = useState([]);
  const [sessionTraces, setSessionTraces] = useState({});
  const [sessionUsage, setSessionUsage] = useState({});

  // Legacy registry data (still fetched for backwards compat, but not primary)
  const [registryAgents, setRegistryAgents] = useState([]);

  // Task queue & history (via local SQLite)
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoadingSessionsData, setIsLoadingSessionsData] = useState(false);
  const [isLoadingTaskData, setIsLoadingTaskData] = useState(false);

  // Trace panel state (T-39)
  const [expandedSession, setExpandedSession] = useState(null);

  // MCP status (T-40)
  const [mcpServers, setMcpServers] = useState([]);

  // SSE connection state
  const [sseConnected, setSseConnected] = useState(false);

  // Swarm Control Pro (Batch C)
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'timeline'
  const [groupMode, setGroupMode] = useState('flat'); // 'flat' | 'project' | 'type'
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  // Breadcrumb chain for session hierarchy navigation
  const [breadcrumbChain, setBreadcrumbChain] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const opencodePort =
    Number(import.meta?.env?.VITE_OPENCODE_PORT || import.meta?.env?.NEXT_PUBLIC_OPENCODE_PORT) ||
    4153;

  // Swarm process status
  const [swarmProcessStatus, setSwarmProcessStatus] = useState(null);
  const [swarmConfig, setSwarmConfigState] = useState({
    max_concurrent_swarms: 5,
    swarm_enabled: true,
  });

  // ─── SSE Handlers ──────────────────────────────────────────────────────────

  const handleSessionUpdate = useCallback((data) => {
    const { type, session } = data;
    if (type === 'initial') {
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === session.id);
        if (exists) return prev;
        return [...prev, session];
      });
    } else if (type === 'new') {
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === session.id);
        if (exists) return prev;
        return [...prev, session];
      });
    } else if (type === 'update') {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, ...session } : s)));
    }
  }, []);

  const handleTraceEvent = useCallback((data) => {
    // Mark that this session has new traces — the expanded panel will auto-refresh
    setSessionTraces((prev) => ({
      ...prev,
      [data.session_id]: {
        ...(prev[data.session_id] || {}),
        lastRefresh: Date.now(),
        count: data.newTraceCount,
      },
    }));
  }, []);

  const handleUsageUpdate = useCallback((data) => {
    setSessionUsage((prev) => ({
      ...prev,
      [data.session_id]: data.usage,
    }));
  }, []);

  const handleHeartbeat = useCallback(() => {
    setSseConnected(true);
  }, []);

  const streamHandlers = useMemo(
    () => ({
      onSessionUpdate: handleSessionUpdate,
      onTraceEvent: handleTraceEvent,
      onUsageUpdate: handleUsageUpdate,
      onHeartbeat: handleHeartbeat,
    }),
    [handleSessionUpdate, handleTraceEvent, handleUsageUpdate, handleHeartbeat]
  );

  const { connected: sseLive, reconnect } = useSessionStream(streamHandlers);

  useEffect(() => {
    if (!sseLive) {
      setSseConnected(false);
    }
  }, [sseLive]);

  // ─── Fetch sessions on mount (initial load) ────────────────────────────────

  const fetchSessions = useCallback(async () => {
    if (!project?.id) return;
    setIsLoadingSessionsData(true);
    try {
      const res = await fetch(`/api/agenthub/sessions?project_id=${project.id}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // SSE will handle updates
    } finally {
      setIsLoadingSessionsData(false);
    }
  }, [project?.id]);

  // ─── Fetch traces for active sessions (for mini summaries) ──────────────────

  const fetchActiveTraces = useCallback(async (activeSessions) => {
    const workingSessions = activeSessions.filter((s) =>
      ['working', 'running', 'active', 'thinking'].includes((s.status || '').toLowerCase())
    );

    for (const session of workingSessions) {
      try {
        const res = await fetch(`/api/agenthub/sessions/${session.id}/traces?limit=10`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const traces = await res.json();
          setSessionTraces((prev) => ({
            ...prev,
            [session.id]: { traces, count: traces.length },
          }));
        }

        // Also fetch usage
        const usageRes = await fetch(`/api/agenthub/sessions/${session.id}/usage`, {
          cache: 'no-store',
        });
        if (usageRes.ok) {
          const usage = await usageRes.json();
          setSessionUsage((prev) => ({ ...prev, [session.id]: usage }));
        }
      } catch {
        // Silently ignore
      }
    }
  }, []);

  // ─── Fetch legacy registry agents (backwards compat) ───────────────────────

  const fetchRegistryAgents = useCallback(async () => {
    if (!project?.id) return;
    try {
      const { data } = await db
        .from('agent_registry')
        .select('*')
        .eq('project_id', project.id)
        .order('last_heartbeat', { ascending: false });
      if (data) setRegistryAgents(data);
    } catch {
      // Registry may not exist
    }
  }, [project?.id, db]);

  // ─── Fetch task queue & history ────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    if (!project?.id) return;
    setIsLoadingTaskData(true);

    try {
      const { data: queueData } = await db
        .from('tasks')
        .select('*')
        .eq('project_id', project.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (queueData) setQueue(queueData);

      const { data: historyData } = await db
        .from('tasks')
        .select('*')
        .eq('project_id', project.id)
        .in('status', ['completed', 'blocked'])
        .order('updated_at', { ascending: false })
        .limit(10);
      if (historyData) setHistory(historyData);
    } finally {
      setIsLoadingTaskData(false);
    }
  }, [project?.id, db]);

  // ─── Fetch MCP status ──────────────────────────────────────────────────────

  const fetchMcpStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agenthub/mcp/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.servers) setMcpServers(data.servers);
      }
    } catch {
      // MCP endpoint may not be available
    }
  }, []);

  const fetchSwarmStatus = useCallback(async () => {
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch('/api/agenthub/opencode/status', { cache: 'no-store' }),
        fetch('/api/agenthub/config', { cache: 'no-store' }),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setSwarmProcessStatus(data);
      }
      if (configRes.ok) {
        const data = await configRes.json();
        setSwarmConfigState(data);
      }
    } catch {
      // Swarm status endpoint may not be available
    }
  }, []);

  const launchAgent = useCallback(
    async ({ profile, profileName, model, instructions, projectId }) => {
      try {
        const truncated =
          instructions.length > 50 ? instructions.slice(0, 50) + '\u2026' : instructions;
        const res = await fetch('/api/agenthub/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId || project?.id,
            title: `${profileName}: ${truncated}`,
            agent_model: model,
            instructions,
            profile,
          }),
        });
        if (!res.ok) {
          throw new Error(`Error ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        toast.success(`Agente "${profileName}" lanzado`);
        // Refresh sessions to show the new one
        fetchSessions();
      } catch (err) {
        toast.error(`Error al lanzar agente: ${err.message}`);
        throw err;
      }
    },
    [project?.id, fetchSessions]
  );

  // ─── Breadcrumb chain loading ──────────────────────────────────────────────

  const loadBreadcrumbChain = useCallback(async (sessionId) => {
    if (!sessionId) {
      setBreadcrumbChain([]);
      setCurrentSessionId(null);
      return;
    }
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`/api/agenthub/sessions?hierarchy=chain&session_id=${sessionId}`);
      if (res.ok) {
        const chain = await res.json();
        setBreadcrumbChain(chain);
      }
    } catch {
      setBreadcrumbChain([]);
    }
  }, []);

  // ─── Handle session click from timeline or list ────────────────────────────

  const handleSessionClick = useCallback(
    (session) => {
      loadBreadcrumbChain(session.id);
      // If it has a parent, we could navigate to AgentHub with that session
      if (session.parent_id) {
        toast.info(`Sesión hija: ${session.title}`);
      }
    },
    [loadBreadcrumbChain]
  );

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!project?.id) return;

    fetchSessions();
    fetchTasks();
    fetchRegistryAgents();
    fetchMcpStatus();
    fetchSwarmStatus();

    // Realtime channel for tasks/queue (kept separate from SSE)
    const channel = db
      .channel('swarm_control_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${project.id}` },
        () => fetchTasks()
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [
    project?.id,
    fetchSessions,
    fetchTasks,
    fetchRegistryAgents,
    fetchMcpStatus,
    fetchProjects,
    fetchSwarmStatus,
    db,
  ]);

  // Fetch traces for active sessions periodically
  useEffect(() => {
    if (sessions.length === 0) return;
    fetchActiveTraces(sessions);

    const interval = setInterval(() => {
      fetchActiveTraces(sessions);
    }, 5000);

    return () => clearInterval(interval);
  }, [sessions, fetchActiveTraces]);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const activeSessions = useMemo(
    () =>
      sessions.filter((s) => {
        const status = (s.status || '').toLowerCase();
        return ['active', 'working', 'running', 'thinking', 'idle', 'error', 'completed'].includes(
          status
        );
      }),
    [sessions]
  );

  const workingSessions = useMemo(
    () =>
      activeSessions.filter((s) =>
        ['working', 'running', 'thinking', 'active'].includes((s.status || '').toLowerCase())
      ),
    [activeSessions]
  );

  const activeAgentsCount = workingSessions.length;

  // ─── Grouped sessions (Swarm Control Pro) ──────────────────────────────────

  const groupedSessions = useMemo(() => {
    if (groupMode === 'flat') return { '': activeSessions };

    const groups = {};
    activeSessions.forEach((s) => {
      let key;
      if (groupMode === 'project') {
        key = s.project_name || s.project_id || 'Sin proyecto';
      } else if (groupMode === 'type') {
        // Derive type from agent_model or title
        const model = (s.agent_model || '').toLowerCase();
        if (model.includes('frontend') || model.includes('react') || model.includes('next')) {
          key = 'Frontend';
        } else if (model.includes('backend') || model.includes('go') || model.includes('node')) {
          key = 'Backend';
        } else if (model.includes('qa') || model.includes('test')) {
          key = 'QA / Testing';
        } else if (model.includes('architect')) {
          key = 'Architect';
        } else {
          key = 'General';
        }
      } else {
        key = 'General';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [activeSessions, groupMode]);

  // ─── Kill session (T-41: via OpenCode dispose API) ─────────────────────────

  const killSession = useCallback(
    async (sessionId) => {
      try {
        // Abort specific session routing through our local API to prevent CORS
        const session = sessions.find((s) => s.id === sessionId);

        // Use either opencode_session_id or standard session id based on what we have
        const targetId = session?.opencode_session_id || sessionId;

        const response = await fetch(`/api/agenthub/sessions/${targetId}/abort`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'no response body');
          console.warn(
            '[SwarmControl] Target OpenCode not reachable (normal for integrated mode)',
            {
              sessionId,
              targetId,
            }
          );
        }
      } catch (error) {
        console.warn(
          '[SwarmControl] Error aborting via direct network (normal for integrated mode)'
        );
      }

      // Update DB status
      try {
        await db
          .from('agent_hub_sessions')
          .update({ status: 'aborted', updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      } catch (dbError) {
        console.error('[SwarmControl] Failed to update session status in DB', {
          sessionId,
          error: dbError?.message || dbError,
        });
      }

      // Update local status
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'aborted' } : s))
      );
      toast.info('Sesión cancelada');
    },
    [sessions, opencodePort, db] // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  const killAllActiveSessions = useCallback(async () => {
    if (activeSessions.length === 0) return;
    toast.info('Cerrando ' + activeSessions.length + ' sesiones...');
    for (const session of activeSessions) {
      await killSession(session.id);
    }
    toast.success('Todas las sesiones canceladas');
  }, [activeSessions, killSession]);

  const openSessionTerminal = useCallback(
    (session) => {
      if (!project?.id) return;
      navigate(`/project/${project.id}/agenthub`, {
        state: { openTerminalPanel: true, sourceSessionId: session?.id || null },
      });
    },
    [navigate, project?.id]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const connectionMode = sseConnected ? 'sse' : !sseLive ? 'polling' : 'disconnected';

  return (
    <div className="min-h-screen core-page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* Breadcrumbs de navegación jerárquica */}
      <SubagentBreadcrumbs
        chain={breadcrumbChain}
        currentSessionId={currentSessionId}
        onNavigate={(sessionId) => loadBreadcrumbChain(sessionId)}
      />

      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between gap-3 core-sticky-header"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
            }}
          >
            <Zap
              className="w-3.5 h-3.5"
              strokeWidth={1.5}
              style={{ color: 'var(--accent-primary)' }}
            />
          </div>
          <h1 className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Swarm Control
          </h1>
          <span className="text-xs text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            v2.1
          </span>
          {project?.name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
              {project.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {/* SSE Connection indicator (T-37) */}
          <div className="hidden sm:flex items-center gap-1.5" role="status" aria-live="polite">
            {connectionMode === 'sse' ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : connectionMode === 'polling' ? (
              <Wifi className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-gray-500" />
            )}
            <span
              className="text-[10px] font-mono"
              style={{
                color:
                  connectionMode === 'sse'
                    ? 'var(--success)'
                    : connectionMode === 'polling'
                      ? 'var(--warning)'
                      : 'var(--text-muted)',
              }}
            >
              {connectionMode === 'sse'
                ? 'SSE'
                : connectionMode === 'polling'
                  ? 'Polling'
                  : 'Disconnected'}
            </span>
          </div>

          <StatusSignal
            tone={activeAgentsCount > 0 ? 'success' : 'neutral'}
            animation={activeAgentsCount > 0 ? 'pulse' : 'none'}
            label={activeAgentsCount > 0 ? 'Swarm activo' : 'Sin actividad'}
          />

          {/* Concurrency Badge */}
          {swarmConfig && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              title={`${activeAgentsCount} de ${swarmConfig.max_concurrent_swarms} swarms activos`}
            >
              <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span style={{ color: 'var(--accent-primary)' }}>{activeAgentsCount}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                /{swarmConfig.max_concurrent_swarms}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>activos</span>
            </div>
          )}

          {/* Queue Status Indicator */}
          {swarmProcessStatus && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono"
              style={{
                background: swarmProcessStatus.running
                  ? 'color-mix(in srgb, var(--success) 8%, transparent)'
                  : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                border: `1px solid ${swarmProcessStatus.running ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'var(--border-subtle)'}`,
                color: swarmProcessStatus.running ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{swarmProcessStatus.running ? 'Server OK' : 'Server off'}</span>
            </div>
          )}

          {/* View mode toggle (Swarm Control Pro) */}
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-strong)' }}
          >
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
              style={{
                background: viewMode === 'list' ? 'var(--accent-primary)' : 'transparent',
                color:
                  viewMode === 'list' ? 'var(--text-on-brand-base, #000)' : 'var(--text-muted)',
              }}
              title="Vista de lista"
              aria-label="Cambiar a vista de lista"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
              style={{
                background: viewMode === 'timeline' ? 'var(--accent-primary)' : 'transparent',
                color:
                  viewMode === 'timeline' ? 'var(--text-on-brand-base, #000)' : 'var(--text-muted)',
              }}
              title="Vista de línea de tiempo"
              aria-label="Cambiar a vista de línea de tiempo"
            >
              <GanttChart className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Group mode toggle (Swarm Control Pro) */}
          {viewMode === 'list' && (
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--border-strong)' }}
            >
              {['flat', 'project', 'type'].map((mode) => {
                const icons = { flat: Layers, project: Hash, type: Cpu };
                const labels = { flat: 'Plano', project: 'Proyecto', type: 'Tipo' };
                const Icon = icons[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => setGroupMode(mode)}
                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono transition-colors cursor-pointer"
                    style={{
                      background: groupMode === mode ? 'var(--accent-primary)' : 'transparent',
                      color:
                        groupMode === mode
                          ? 'var(--text-on-brand-base, #000)'
                          : 'var(--text-muted)',
                    }}
                    title={`Agrupar por ${labels[mode]}`}
                    aria-label={`Agrupar sesiones por ${labels[mode]}`}
                  >
                    <Icon className="w-3 h-3" />
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Launch Agent button (Swarm Control Pro) */}
          <button
            onClick={() => setLaunchModalOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            style={{
              background: 'var(--accent-primary)',
              border: '1px solid var(--accent-primary)',
              color: 'var(--text-on-brand-base, #000)',
            }}
            title="Lanzar nuevo agente"
            aria-label="Lanzar nuevo agente"
          >
            <Plus className="w-3.5 h-3.5" />
            Lanzar
          </button>

          <button
            onClick={() => {
              fetchSessions();
              fetchTasks();
              fetchRegistryAgents();
              fetchMcpStatus();
              fetchSwarmStatus();
              reconnect();
            }}
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
            title="Recargar telemetría"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refrescar
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 w-full max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <div
          className="rounded-xl px-4 py-2.5 flex items-center gap-2 mb-6 core-toolbar-card"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
        >
          <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            DevHub
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ›
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Swarm Control
          </span>
        </div>

        {/* Stats Cards */}
        <div
          className="rounded-2xl overflow-hidden fade-in-up core-panel"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
              }}
            >
              <Activity
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Telemetría del Swarm
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Estado en tiempo real de sesiones, traces y cola de ejecución
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div
                className="rounded-xl px-4 py-3 core-kpi-card"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Activos
                </p>
                <p className="text-xl font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                  {activeAgentsCount}
                </p>
              </div>
              <div
                className="rounded-xl px-4 py-3 core-kpi-card"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sesiones totales
                </p>
                <p className="text-xl font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                  {sessions.length}
                </p>
              </div>
              <div
                className="rounded-xl px-4 py-3 core-kpi-card"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  En cola
                </p>
                <p className="text-xl font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                  {queue.length}
                </p>
              </div>
            </div>

            {/* Swarm Process Status Row */}
            {swarmProcessStatus && (
              <div
                className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 text-xs"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Server
                    className="w-3.5 h-3.5"
                    style={{
                      color: swarmProcessStatus.running ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>Proceso:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{
                      color: swarmProcessStatus.running ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  >
                    {swarmProcessStatus.running ? 'Corriendo' : 'Detenido'}
                  </span>
                </div>
                {swarmProcessStatus.pid && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)' }}>PID:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {swarmProcessStatus.pid}
                    </span>
                  </div>
                )}
                {swarmProcessStatus.processInfo?.memoryMB && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)' }}>RAM:</span>
                    <span className="font-mono" style={{ color: 'var(--warning)' }}>
                      {swarmProcessStatus.processInfo.memoryMB}MB
                    </span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>Límite:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {activeAgentsCount}/{swarmConfig.max_concurrent_swarms}
                  </span>
                </div>
              </div>
            )}

            {/* Swarm Process Status Row */}
            {swarmProcessStatus && (
              <div
                className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 text-xs"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Server
                    className="w-3.5 h-3.5"
                    style={{
                      color: swarmProcessStatus.running ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>Proceso:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{
                      color: swarmProcessStatus.running ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  >
                    {swarmProcessStatus.running ? 'Corriendo' : 'Detenido'}
                  </span>
                </div>
                {swarmProcessStatus.pid && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)' }}>PID:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {swarmProcessStatus.pid}
                    </span>
                  </div>
                )}
                {swarmProcessStatus.processInfo?.memoryMB && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)' }}>RAM:</span>
                    <span className="font-mono" style={{ color: 'var(--warning)' }}>
                      {swarmProcessStatus.processInfo.memoryMB}MB
                    </span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>Límite:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {activeAgentsCount}/{swarmConfig.max_concurrent_swarms}
                  </span>
                </div>
              </div>
            )}

            <div
              className="rounded-xl px-4 py-3 flex items-start gap-2 text-xs"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Info
                className="w-4 h-4 mt-0.5 shrink-0"
                style={{ color: 'var(--accent-primary)' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>
                Swarm Control v2.1 usa SSE para telemetría en tiempo real. Las sesiones se rastrean
                directamente desde Agent Hub, sin depender del agent_registry.
              </span>
            </div>

            <div
              className="flex items-center justify-between mt-3 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>
                Budget DocOps: {docopsBudget.max_tokens_context}/{docopsBudget.max_expansions}/
                {docopsBudget.expansion_step_tokens}
              </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                {connectionMode === 'sse'
                  ? '● SSE conectado'
                  : connectionMode === 'polling'
                    ? '◐ Polling activo'
                    : '○ Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {/* Sessions + Queue Grid (T-37, T-38, T-41) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 fade-in-up">
          {/* Active Sessions (replaces Agent Registry) — Swarm Control Pro */}
          <div className="lg:col-span-2">
            <div
              className="rounded-2xl overflow-hidden core-panel"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                  }}
                >
                  <Cpu
                    className="w-4 h-4"
                    strokeWidth={1.5}
                    style={{ color: 'var(--accent-primary)' }}
                  />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Sesiones Activas
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {activeSessions.length} sesion{activeSessions.length !== 1 ? 'es' : ''}{' '}
                    registrada{activeSessions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {activeSessions.length > 0 && (
                  <button
                    onClick={killAllActiveSessions}
                    className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors"
                    style={{
                      background: 'color-mix(in srgb, var(--danger, #ef4444) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--danger, #ef4444) 20%, transparent)',
                      color: 'var(--danger, #ef4444)',
                    }}
                    title="Cerrar todas las sesiones activas"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Cerrar Todas
                  </button>
                )}
              </div>

              <div className="p-6">
                {isLoadingSessionsData ? (
                  <div className="space-y-3" role="status" aria-live="polite">
                    <SkeletonCard />
                    <SkeletonCard />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ) : viewMode === 'timeline' ? (
                  /* Timeline View (Swarm Control Pro) */
                  <SwarmTimeline
                    sessions={activeSessions}
                    tracesBySession={sessionTraces}
                    onSessionClick={handleSessionClick}
                  />
                ) : activeSessions.length === 0 ? (
                  <div
                    className="border-dashed border rounded-xl p-10 text-center"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      background: 'var(--surface-muted)',
                    }}
                  >
                    <Cpu
                      className="w-8 h-8 mx-auto mb-2"
                      strokeWidth={1}
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      No hay sesiones activas en este momento.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(groupedSessions).map(([groupName, groupSessions]) => (
                      <div key={groupName || 'flat'}>
                        {groupName && (
                          <div className="flex items-center gap-2 mb-2">
                            <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                            <span
                              className="text-[11px] font-mono font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {groupName}
                            </span>
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                              style={{
                                background: 'var(--surface-elevated)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {groupSessions.length}
                            </span>
                          </div>
                        )}
                        <div className="space-y-3">
                          {groupSessions.map((session) => {
                            const traces = sessionTraces[session.id]?.traces || [];
                            const usage = sessionUsage[session.id] || null;
                            const isWorking = ['working', 'running', 'active', 'thinking'].includes(
                              (session.status || '').toLowerCase()
                            );
                            return (
                              <div key={session.id}>
                                <div className="mb-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => openSessionTerminal(session)}
                                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium"
                                    style={{
                                      borderColor: 'var(--border-strong)',
                                      color: 'var(--text-secondary)',
                                      background: 'var(--surface-card)',
                                    }}
                                  >
                                    <Terminal className="h-3.5 w-3.5" />
                                    Abrir terminal
                                  </button>
                                </div>
                                <AgentMetricsCard
                                  agent={null}
                                  session={session}
                                  traces={traces}
                                  isRunning={isWorking}
                                  onExpand={() => (
                                    <LiveTracePreview
                                      traces={traces}
                                      isRunning={isWorking}
                                      onExpand={() => setExpandedSession(session)}
                                    />
                                  )}
                                  onViewTrace={setExpandedSession}
                                  onKill={killSession}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cola de Ejecución */}
          <div>
            <div
              className="rounded-2xl overflow-hidden core-panel"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)',
                  }}
                >
                  <Clock
                    className="w-4 h-4"
                    strokeWidth={1.5}
                    style={{ color: 'var(--warning)' }}
                  />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Cola de Tareas
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {queue.length} tarea{queue.length !== 1 ? 's' : ''} pendiente
                    {queue.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="p-6">
                {isLoadingTaskData ? (
                  <div className="space-y-3" role="status" aria-live="polite">
                    <Skeleton className="h-4 w-24" />
                    <SkeletonText lines={4} />
                  </div>
                ) : queue.length === 0 ? (
                  <div className="p-8 text-center">
                    <ListTodo
                      className="w-6 h-6 mx-auto mb-2"
                      strokeWidth={1}
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Cola vacía
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {queue.slice(0, 5).map((task, i) => (
                      <div
                        key={task.id}
                        className="py-3 flex items-start gap-2.5 transition-colors hover:bg-surface-elevated cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span
                          className="text-xs font-mono mt-0.5 w-4 shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p
                            className="text-xs font-medium line-clamp-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {task.title}
                          </p>
                          <p
                            className="text-xs mt-0.5 capitalize"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {task.priority}
                          </p>
                        </div>
                      </div>
                    ))}
                    {queue.length > 5 && (
                      <div
                        className="py-2.5 text-center text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        +{queue.length - 5} más en cola
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Ejecuciones */}
        <div className="mt-6 fade-in-up">
          <div
            className="rounded-2xl overflow-hidden core-panel"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--success) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
                }}
              >
                <CheckCircle2
                  className="w-4 h-4"
                  strokeWidth={1.5}
                  style={{ color: 'var(--success)' }}
                />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Historial de Ejecuciones
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Últimas tareas completadas o bloqueadas
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <tr>
                    {['Tarea', 'Estado Final', 'Reintentos QA', 'Última Actividad'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-[11px] uppercase tracking-wider font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoadingTaskData ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8">
                        <div role="status" aria-live="polite" className="space-y-3">
                          <Skeleton className="h-3 w-32" />
                          <SkeletonText lines={3} />
                        </div>
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-10 text-center text-sm"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        No hay ejecuciones recientes
                      </td>
                    </tr>
                  ) : (
                    history.map((th) => (
                      <tr
                        key={th.id}
                        className="border-b transition-colors hover:bg-surface-elevated last:border-0 cursor-pointer"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td
                          className="px-6 py-3 font-medium text-xs"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {th.title}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium"
                            style={{
                              color: th.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                            }}
                          >
                            {th.status === 'completed' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            {th.status === 'completed' ? 'Completada' : 'Bloqueada'}
                          </span>
                        </td>
                        <td
                          className="px-6 py-3 text-xs font-mono"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {th.retry_count || 0}
                        </td>
                        <td className="px-6 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(th.updated_at).toLocaleString('es-ES')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* MCP Status Panel (T-40) */}
        {mcpServers.length > 0 && (
          <div className="mt-6 fade-in-up">
            <MCPStatusPanel servers={mcpServers} collapsed={true} />
          </div>
        )}
      </div>

      {/* Expanded Trace Panel (T-39) */}
      {expandedSession && (
        <ExpandedTracePanel session={expandedSession} onClose={() => setExpandedSession(null)} />
      )}

      <AgentLaunchModal
        isOpen={launchModalOpen}
        onClose={() => setLaunchModalOpen(false)}
        onLaunch={handleLaunchAgent}
        projects={projects}
      />
    </div>
  );
}

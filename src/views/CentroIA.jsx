'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot,
  Plug2,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  RefreshCw,
  ListTodo,
  MapPin,
  FolderOpen,
  Sparkles,
  Info,
  Clock,
  Activity,
  Cpu,
  Zap,
  Network,
  Hash,
} from 'lucide-react';
import ChatAgente from '@/components/ChatAgente';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOutletContext } from 'react-router-dom';
import { createClient } from '@/lib/db/localSupabase';
import { getAgentRegistryLiveSnapshot, getAgentDisplayMeta } from '@/lib/agentRegistryLive';
import { getDocOpsContextBudgetPolicy } from '@/lib/docopsPolicy';
import StatusSignal from '@/components/ui/StatusSignal';

const TOOLS = [
  { name: 'list_projects', desc: 'Listar todos los proyectos' },
  { name: 'get_project', desc: 'Obtener detalles de un proyecto' },
  { name: 'update_project', desc: 'Actualizar nombre, estado, progreso' },
  { name: 'list_tasks', desc: 'Listar tareas (filtro por estado)' },
  { name: 'create_task', desc: 'Crear nueva tarea' },
  { name: 'update_task', desc: 'Cambiar estado, prioridad de tarea' },
  { name: 'delete_task', desc: 'Eliminar una tarea' },
  { name: 'list_milestones', desc: 'Listar hitos del roadmap' },
  { name: 'create_milestone', desc: 'Crear nuevo hito' },
  { name: 'update_milestone', desc: 'Actualizar estado de un hito' },
  { name: 'get_dashboard', desc: 'Resumen global' },
];

const STATUS_CONFIG = {
  working: {
    color: 'text-accent-primary',
    bg: 'bg-accent-primary/10',
    border: 'border-accent-primary/20',
    icon: Loader2,
    spin: true,
    label: 'Ejecutando',
  },
  running: {
    color: 'text-accent-primary',
    bg: 'bg-accent-primary/10',
    border: 'border-accent-primary/20',
    icon: Loader2,
    spin: true,
    label: 'Ejecutando',
  },
  active: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: Activity,
    spin: false,
    label: 'Activo',
  },
  thinking: {
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    icon: Bot,
    spin: true,
    label: 'Pensando',
  },
  asking_questions: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Info,
    spin: false,
    label: 'Esperando input',
  },
  completed: {
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    icon: CheckCircle2,
    spin: false,
    label: 'Completado',
  },
  failed: {
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    icon: XCircle,
    spin: false,
    label: 'Error',
  },
  idle: {
    color: 'text-text-muted',
    bg: 'bg-surface-elevated',
    border: 'border-borders-subtle',
    icon: Clock,
    spin: false,
    label: 'Inactivo',
  },
};

export default function CentroIA() {
  const { project } = useOutletContext() || {};
  const supabase = useMemo(() => createClient(), []);
  const docopsBudget = getDocOpsContextBudgetPolicy();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quotaSnapshot, setQuotaSnapshot] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState('');

  // Memory Graph state
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [querying, setQuerying] = useState(false);
  const [history, setHistory] = useState([]);

  // Agent State
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentRuns, setAgentRuns] = useState({});
  const [liveSessions, setLiveSessions] = useState({});

  const QUOTA_CACHE_KEY = 'devhub_gemini_quota_snapshot';

  const loadQuotaCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(QUOTA_CACHE_KEY);
      if (!cached) return;
      setQuotaSnapshot(JSON.parse(cached));
    } catch {
      // Ignore cache parsing issues.
    }
  }, []);

  const refreshQuotaSnapshot = useCallback(async () => {
    setQuotaLoading(true);
    setQuotaError('');

    try {
      const res = await fetch('/api/agents/quotas', { cache: 'no-store' });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudieron consultar las cuotas.');
      }

      const snapshot = {
        checkedAt: payload.checkedAt || new Date().toISOString(),
        quotas: payload.quotas || [],
      };

      setQuotaSnapshot(snapshot);
      localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      setQuotaError(error.message || 'No se pudieron consultar las cuotas.');
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('memory_query_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    loadQuotaCache();
  }, [loadQuotaCache]);

  useEffect(() => {
    try {
      const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
      setAgentRuns(runs);
    } catch {
      setAgentRuns({});
    }
  }, []);

  const fetchTerminalSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/sessions', { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      const byId = {};
      for (const session of payload.sessions || []) {
        byId[session.terminalId] = session;
      }
      setLiveSessions(byId);
    } catch {
      // Keep UI functional if sessions endpoint is unavailable.
    }
  }, []);

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || !project?.id) return;

    setQuerying(true);
    setAnswer(null);
    setSources([]);

    try {
      const res = await fetch('/api/centro-ia/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, project_id: project.id }),
      });
      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources || []);

      const newHistory = [query, ...history.filter((q) => q !== query)].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem('memory_query_history', JSON.stringify(newHistory));
    } catch (err) {
      console.error(err);
      setAnswer('Error al consultar el Memory Graph.');
    } finally {
      setQuerying(false);
    }
  };

  const fetchStats = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [{ data: tasks }, { data: milestones }, { data: interactions }] = await Promise.all([
      supabase.from('tasks').select('id, status').eq('project_id', project.id),
      supabase.from('milestones').select('id, status').eq('project_id', project.id),
      supabase
        .from('ai_interactions')
        .select('id', { count: 'exact' })
        .eq('project_id', project.id),
    ]);
    setStats({
      tasks: tasks?.length || 0,
      tasks_done: tasks?.filter((t) => t.status === 'completed').length || 0,
      milestones: milestones?.length || 0,
      ms_done: milestones?.filter((m) => m.status === 'completed').length || 0,
      interactions: interactions?.length || 0,
    });
    setLoading(false);
  }, [project?.id, supabase]);

  const fetchAgents = useCallback(async () => {
    if (!project?.id) return;
    const { data } = await supabase
      .from('agent_registry')
      .select('*, current_task_id, last_heartbeat, status')
      .eq('project_id', project.id)
      .order('last_heartbeat', { ascending: false })
      .limit(50);

    if (data) {
      const taskIds = data.map((a) => a.current_task_id).filter(Boolean);
      let tasksDict = {};
      if (taskIds.length > 0) {
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('id, title')
          .in('id', taskIds);
        tasksData?.forEach((t) => (tasksDict[t.id] = t.title));
      }

      setAgents(
        data.map((a) => ({
          ...a,
          current_task: { title: tasksDict[a.current_task_id] },
        }))
      );
    }
    setLoadingAgents(false);
    await fetchTerminalSessions();
  }, [project?.id, supabase, fetchTerminalSessions]);

  useEffect(() => {
    fetchStats();
    fetchAgents();
  }, [fetchStats, fetchAgents]);

  useEffect(() => {
    if (!project?.id) return;

    const channel = supabase
      .channel('agent_registry_list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_registry',
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          fetchAgents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project?.id, fetchAgents, supabase]);

  const { activeAgents, activeAgentsCount } = getAgentRegistryLiveSnapshot({
    agents,
    liveSessions,
    agentRuns,
  });
  const visibleAgents = activeAgents.filter((agent) => {
    const run = agentRuns[agent.agent_id];
    const hasLiveSession = run?.panelId && liveSessions[run.panelId]?.alive;
    const lastSeen = agent.last_heartbeat || agent.updated_at || agent.created_at;
    const heartbeatFresh = lastSeen ? Date.now() - new Date(lastSeen).getTime() <= 90_000 : false;
    return hasLiveSession || heartbeatFresh;
  });
  const historyAgents = agents
    .filter(
      (a) =>
        !['working', 'running', 'active', 'thinking', 'asking_questions'].includes(
          a.status?.toLowerCase()
        )
    )
    .slice(0, 10);
  const quotaRows = quotaSnapshot?.quotas || [];
  const checkedAtLabel = quotaSnapshot?.checkedAt
    ? formatDistanceToNow(new Date(quotaSnapshot.checkedAt), {
        addSuffix: true,
        locale: es,
      })
    : 'Nunca';

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <Bot className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent-primary)' }} />
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Agentes IA
          </h1>
          {project?.name && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
              {project.name}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            fetchStats();
            fetchAgents();
          }}
          className="transition-colors p-1.5 rounded-md hover:bg-surface-elevated"
          style={{ color: 'var(--text-muted)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-6 py-6 w-full max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <div
          className="rounded-xl border px-4 py-2.5 flex items-center gap-2 mb-6"
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
            Agentes IA
          </span>
        </div>

        {/* Stats / Budget Card */}
        <div
          className="rounded-2xl overflow-hidden mb-6"
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
              <Zap className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Presupuesto DocOps
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Contexto compartido para agentes
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando estadísticas...
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Tareas', value: stats.tasks, sub: `${stats.tasks_done} completadas` },
                  { label: 'Hitos', value: stats.milestones, sub: `${stats.ms_done} completados` },
                  { label: 'Interacciones IA', value: stats.interactions, sub: 'Total consultas' },
                  {
                    label: 'Budget Contexto',
                    value: docopsBudget.max_tokens_context,
                    sub: `${docopsBudget.max_expansions} expansiones`,
                  },
                ].map(({ label, value, sub }) => (
                  <div
                    key={label}
                    className="rounded-xl p-4"
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </p>
                    <p className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                      {value}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {sub}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Swarm Active Card */}
        <div
          className="rounded-2xl overflow-hidden mb-6"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                }}
              >
                <Network className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Swarm Activo
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  En tiempo real
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusSignal
                tone={activeAgentsCount > 0 ? 'success' : 'neutral'}
                animation={activeAgentsCount > 0 ? 'pulse' : 'none'}
                compact
              />
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {activeAgentsCount} Agentes
              </span>
            </div>
          </div>

          <div className="p-6">
            {loadingAgents ? (
              <div
                className="flex items-center justify-center py-8"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : visibleAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                <Cpu
                  className="w-10 h-10 opacity-20"
                  strokeWidth={1}
                  style={{ color: 'var(--text-muted)' }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Swarm Inactivo
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Lanza un nuevo agente usando el panel de la derecha o desde una tarea.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleAgents.map((agent) => {
                  const statusKey = agent.status?.toLowerCase() || 'running';
                  const session = agentRuns[agent.agent_id]?.panelId
                    ? liveSessions[agentRuns[agent.agent_id].panelId]
                    : null;
                  const isWaiting = statusKey === 'idle' && Boolean(session?.alive);
                  const config = isWaiting
                    ? {
                        color: 'text-amber-400',
                        bg: 'bg-amber-500/10',
                        border: 'border-amber-500/20',
                        icon: Clock,
                        spin: false,
                        label: 'Activo en espera',
                      }
                    : STATUS_CONFIG[statusKey] || STATUS_CONFIG.running;
                  const StatusIcon = config.icon;
                  const isSubAgent =
                    agent.nombre?.includes('sdd-') || agent.agent_id?.includes('worker');
                  const executionMeta = getAgentDisplayMeta(agent, { agentRuns });

                  return (
                    <div
                      key={agent.id || agent.agent_id}
                      className="p-4 rounded-xl border shadow-sm flex flex-col gap-3 fade-in-up transition-all hover:border-borders-strong"
                      style={{
                        background: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex gap-3 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              background:
                                'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                            }}
                          >
                            <Bot className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                          </div>
                          <div className="min-w-0">
                            <h4
                              className="text-sm font-semibold truncate"
                              style={{ color: 'var(--text-primary)' }}
                              title={agent.nombre || agent.profile_name || 'Agente Autónomo'}
                            >
                              {agent.nombre || agent.profile_name || 'Agente Autónomo'}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              {isSubAgent && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded border"
                                  style={{
                                    background: 'var(--surface-elevated)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  Sub-Agente
                                </span>
                              )}
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded border"
                                style={{
                                  background: 'var(--surface-elevated)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {executionMeta.label}
                              </span>
                              <span
                                className="text-[10px] font-mono truncate"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {agent.agent_id
                                  ? agent.agent_id.slice(0, 15) + '...'
                                  : 'ID: ' + (agent.id?.slice(0, 8) || 'N/A')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`flex items-center gap-1.5 px-2 py-1 rounded border shrink-0 ${config.bg} ${config.border}`}
                        >
                          <StatusIcon
                            className={`w-3 h-3 ${config.color} ${config.spin ? 'animate-spin' : ''}`}
                          />
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}
                          >
                            {config.label}
                          </span>
                        </div>
                      </div>

                      <div
                        className="rounded-lg p-2.5 border text-xs line-clamp-2"
                        style={{
                          background: 'var(--surface-muted)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                        title={executionMeta.summary || 'Trabajando...'}
                      >
                        {`En tarea: ${executionMeta.summary}`}
                      </div>

                      <p
                        className="text-[10px] line-clamp-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Resumen: {executionMeta.summary}
                      </p>

                      <div className="flex justify-between items-center mt-1">
                        <span
                          className="text-[10px] flex items-center gap-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Clock className="w-3 h-3" />
                          Actualizado{' '}
                          {formatDistanceToNow(new Date(agent.last_heartbeat || agent.created_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                        {agent.modelo_llm && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                            style={{
                              background:
                                'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                              borderColor:
                                'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                              color: 'var(--accent-primary)',
                            }}
                          >
                            {agent.modelo_llm}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* History Card */}
        <div
          className="rounded-2xl overflow-hidden mb-6"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text-muted) 15%, transparent)',
                }}
              >
                <Terminal className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Historial de Ejecución
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Ejecuciones recientes de agentes
                </p>
              </div>
            </div>
          </div>

          <div className="p-0">
            {loadingAgents ? (
              <div
                className="flex items-center justify-center p-8"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : historyAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-2">
                <Bot className="w-8 h-8 opacity-20" style={{ color: 'var(--text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No hay ejecuciones recientes.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {historyAgents.map((agent) => {
                  const statusKey = agent.status?.toLowerCase() || 'idle';
                  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.idle;
                  const StatusIcon = config.icon;
                  const executionMeta = getAgentDisplayMeta(agent, { agentRuns });

                  return (
                    <div
                      key={agent.id || agent.agent_id}
                      className="p-4 transition-colors flex items-start gap-4"
                      style={{
                        color: 'var(--text-primary)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--surface-elevated)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div className="mt-1 flex-shrink-0">
                        <StatusIcon className={`w-4 h-4 ${config.color}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {agent.nombre || agent.profile_name || 'Agente'}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${config.bg} ${config.border} ${config.color}`}
                            >
                              {config.label}
                            </span>
                          </div>
                          <span
                            className="text-[10px] flex items-center gap-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(
                              new Date(agent.last_heartbeat || agent.created_at),
                              {
                                addSuffix: true,
                                locale: es,
                              }
                            )}
                          </span>
                        </div>
                        <p
                          className="text-xs leading-relaxed break-words mt-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {`Tarea: ${executionMeta.summary}`}
                        </p>

                        {statusKey === 'failed' && agent.error_message && (
                          <div
                            className="mt-2 text-[10px] p-2 rounded border"
                            style={{
                              background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                              borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)',
                              color: 'var(--danger)',
                            }}
                          >
                            {agent.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - ChatAgente, MCP, Memory Graph */}
        <div className="space-y-6 fade-in-up">
          {/* ChatAgente Launcher */}
          <ChatAgente projectId={project?.id} projectName={project?.name} />

          {/* Quotas Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                  }}
                >
                  <Zap className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Cuotas Gemini
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Caché local + consulta manual bajo demanda
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={refreshQuotaSnapshot}
                disabled={quotaLoading}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                  color: 'var(--accent-primary)',
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${quotaLoading ? 'animate-spin' : ''}`} />
                Consultar cuotas
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span style={{ color: 'var(--text-muted)' }}>Última consulta</span>
                <span style={{ color: 'var(--text-secondary)' }}>{checkedAtLabel}</span>
              </div>

              {quotaError && (
                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--danger) 18%, transparent)',
                    color: 'var(--danger)',
                  }}
                >
                  {quotaError}
                </div>
              )}

              {!quotaSnapshot ? (
                <div
                  className="rounded-xl border px-4 py-4 text-sm"
                  style={{
                    background: 'var(--surface-muted)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  No hay una lectura guardada todavía. Tocá <strong>Consultar cuotas</strong> para
                  traer el estado actual de tus perfiles.
                </div>
              ) : quotaRows.length === 0 ? (
                <div
                  className="rounded-xl border px-4 py-4 text-sm"
                  style={{
                    background: 'var(--surface-muted)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  La última consulta no devolvió perfiles.
                </div>
              ) : (
                <div className="grid gap-3">
                  {quotaRows.map((quota) => {
                    const used = quota.quotaUsedPercent;
                    const statusTone =
                      quota.status === 'exhausted'
                        ? 'danger'
                        : quota.status === 'available'
                          ? 'success'
                          : 'neutral';
                    return (
                      <div
                        key={quota.profile}
                        className="rounded-xl border p-4"
                        style={{
                          background: 'var(--surface-muted)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {quota.profile}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {quota.source || 'manual'}
                            </p>
                          </div>
                          <span
                            className="text-[10px] font-semibold uppercase px-2 py-1 rounded-full border"
                            style={{
                              color:
                                statusTone === 'success'
                                  ? 'var(--success)'
                                  : statusTone === 'danger'
                                    ? 'var(--danger)'
                                    : 'var(--text-muted)',
                              borderColor:
                                statusTone === 'success'
                                  ? 'color-mix(in srgb, var(--success) 25%, transparent)'
                                  : statusTone === 'danger'
                                    ? 'color-mix(in srgb, var(--danger) 25%, transparent)'
                                    : 'var(--border-subtle)',
                              background:
                                statusTone === 'success'
                                  ? 'color-mix(in srgb, var(--success) 8%, transparent)'
                                  : statusTone === 'danger'
                                    ? 'color-mix(in srgb, var(--danger) 8%, transparent)'
                                    : 'var(--surface-elevated)',
                            }}
                          >
                            {quota.status}
                          </span>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                              {used === null ? 'N/A' : `${used}%`}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              usado en el modelo más cargado
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              Reset
                            </p>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                              {quota.resetIn || '-'}
                            </p>
                          </div>
                        </div>

                        {Array.isArray(quota.models) && quota.models.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {quota.models.slice(0, 3).map((model) => (
                              <div
                                key={`${quota.profile}:${model.model}`}
                                className="flex items-center justify-between text-[11px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <span className="truncate pr-2">{model.model}</span>
                                <span className="shrink-0">{model.usedPercent}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* MCP Status Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{
                borderBottom: '1px solid color-mix(in srgb, var(--success) 15%, transparent)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--success) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
                }}
              >
                <Plug2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  DevHub MCP Server
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Conexión local vía stdio
                </p>
              </div>
              <span className="ml-auto">
                <StatusSignal tone="success" animation="pulse" label="ACTIVO" />
              </span>
            </div>

            <div className="p-6">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Antigravity está conectado localmente vía MCP{' '}
                <code
                  className="font-mono text-[10px] px-1 rounded"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  stdio
                </code>
                . Con control total de OpenCode.
              </p>
            </div>
          </div>

          {/* Memory Graph Card */}
          <div
            className="rounded-2xl overflow-hidden"
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
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Consulta al Memory Graph
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Pregunta al agente sobre decisiones, errores y arquitectura
                </p>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleQuery} className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ej. ¿Qué BD decidimos usar?"
                    className="flex-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={querying || !query.trim()}
                    className="text-white px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    style={{ background: 'var(--accent-primary)' }}
                  >
                    {querying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {history.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {history.slice(0, 2).map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setQuery(h)}
                        className="text-[9px] px-2 py-0.5 rounded-full border transition-colors"
                        style={{
                          background: 'var(--surface-muted)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = 'var(--text-secondary)')
                        }
                      >
                        {h.length > 25 ? h.substring(0, 25) + '...' : h}
                      </button>
                    ))}
                  </div>
                )}
              </form>

              {querying && (
                <div
                  className="mt-4 p-3 rounded-lg border flex flex-col items-center justify-center gap-2"
                  style={{
                    background: 'var(--surface-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full border-t-2 border-l-2 animate-spin"
                    style={{ borderColor: 'var(--accent-primary)' }}
                  />
                  <p className="text-[10px] animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    Analizando memorias...
                  </p>
                </div>
              )}

              {answer && !querying && (
                <div className="mt-4 space-y-3 fade-in-up">
                  <div
                    className="p-3 rounded-lg border"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

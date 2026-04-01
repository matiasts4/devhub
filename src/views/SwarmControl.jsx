import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createClient } from '@/lib/db/localSupabase';
import { getAgentRegistryLiveSnapshot, getAgentDisplayMeta } from '@/lib/agentRegistryLive';
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
} from 'lucide-react';
import { toast } from 'sonner';
import StatusSignal from '@/components/ui/StatusSignal';

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
};

export default function SwarmControl() {
  const { project } = useOutletContext() || {};
  const supabase = useMemo(() => createClient(), []);
  const docopsBudget = getDocOpsContextBudgetPolicy();

  const [agents, setAgents] = useState([]);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [agentRuns, setAgentRuns] = useState({});
  const [liveSessions, setLiveSessions] = useState({});

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
      // Ignore session API failures. Agent status still works from DB.
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!project?.id) return;

    const { data: agentsData } = await supabase
      .from('agent_registry')
      .select('*, current_task_id, last_heartbeat, status')
      .eq('project_id', project.id)
      .order('last_heartbeat', { ascending: false });

    if (!agentsData) return;

    const taskIds = agentsData.map((a) => a.current_task_id).filter(Boolean);
    let tasksDict = {};
    if (taskIds.length > 0) {
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title')
        .in('id', taskIds);
      tasksData?.forEach((t) => (tasksDict[t.id] = t.title));
    }

    setAgents(
      agentsData.map((a) => ({
        ...a,
        current_task: { title: tasksDict[a.current_task_id] },
      }))
    );

    await fetchTerminalSessions();
  }, [fetchTerminalSessions, project?.id, supabase]);

  const fetchData = useCallback(async () => {
    if (!project?.id) return;

    const { data: queueData } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (queueData) setQueue(queueData);

    const { data: historyData } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', project.id)
      .in('status', ['completed', 'blocked'])
      .order('updated_at', { ascending: false })
      .limit(10);
    if (historyData) setHistory(historyData);
  }, [project?.id, supabase]);

  useEffect(() => {
    if (!project?.id) return;

    fetchAgents();
    fetchData();
    const interval = setInterval(() => {
      fetchData();
      fetchAgents();
    }, 15000);

    const channel = supabase
      .channel('swarm_control')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_registry',
          filter: `project_id=eq.${project.id}`,
        },
        () => fetchAgents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${project.id}` },
        () => fetchData()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [project?.id, fetchAgents, fetchData, supabase]);

  const { activeAgents, activeAgentsCount } = getAgentRegistryLiveSnapshot({
    agents,
    liveSessions,
    agentRuns,
  });
  const now = Date.now();
  const staleAgents = activeAgents.filter((agent) => {
    if (!agent.last_heartbeat) return true;
    return now - new Date(agent.last_heartbeat).getTime() > 90000;
  });

  const killAgent = async (agent_id) => {
    await supabase.from('agent_registry').delete().eq('agent_id', agent_id);
    setAgents((prev) => prev.filter((a) => a.agent_id !== agent_id));
    toast.info(`Agente ${agent_id} terminado`);
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
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
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            v2.0
          </span>
          {project?.name && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
              {project.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StatusSignal
            tone={activeAgentsCount > 0 ? 'success' : 'neutral'}
            animation={activeAgentsCount > 0 ? 'pulse' : 'none'}
            label={activeAgentsCount > 0 ? 'Swarm activo' : 'Sin actividad'}
          />
          <button
            onClick={() => {
              fetchData();
              fetchAgents();
            }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
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
            Swarm Control
          </span>
        </div>

        {/* Stats Cards */}
        <div
          className="rounded-2xl overflow-hidden fade-in-up"
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
                Estado en tiempo real de agentes, heartbeats y cola de ejecución
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div
                className="rounded-xl px-4 py-3"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Activos
                </p>
                <p className="text-xl font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                  {activeAgentsCount}
                </p>
              </div>
              <div
                className="rounded-xl px-4 py-3"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Heartbeat stale
                </p>
                <p
                  className="text-xl font-mono mt-1"
                  style={{
                    color: staleAgents.length > 0 ? 'var(--warning)' : 'var(--text-primary)',
                  }}
                >
                  {staleAgents.length}
                </p>
              </div>
              <div
                className="rounded-xl px-4 py-3"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  En cola
                </p>
                <p className="text-xl font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                  {queue.length}
                </p>
              </div>
            </div>

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
                Swarm Control es un monitor operativo: refleja estados reportados por agentes y
                heartbeat en tiempo real. Solo refleja sesiones lanzadas desde la app y no
                pausa/reanuda procesos globales por sí mismo.
              </span>
            </div>

            <div
              className="flex items-center justify-between mt-3 text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>
                Budget DocOps compartido: {docopsBudget.max_tokens_context}/
                {docopsBudget.max_expansions}/{docopsBudget.expansion_step_tokens}
              </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                Sesiones de terminal: {Object.keys(liveSessions).length}
              </span>
            </div>
          </div>
        </div>

        {/* Agents + Queue Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 fade-in-up">
          {/* Workers Activos */}
          <div className="lg:col-span-2">
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
                    Agentes Activos
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {activeAgentsCount} agente{activeAgentsCount !== 1 ? 's' : ''} registrado
                    {activeAgentsCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="p-6">
                {activeAgentsCount === 0 ? (
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
                      No hay agentes registrados en este momento.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeAgents.map((agent) => {
                      const session = agentRuns[agent.agent_id]?.panelId
                        ? liveSessions[agentRuns[agent.agent_id].panelId]
                        : null;
                      const isWaiting =
                        (agent.status || '').toLowerCase() === 'idle' && Boolean(session?.alive);
                      const badge = isWaiting
                        ? {
                            cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                            label: 'Activo en espera',
                          }
                        : STATUS_BADGE[agent.status] || STATUS_BADGE.idle;
                      const execMeta = getAgentDisplayMeta(agent, { agentRuns });
                      return (
                        <div
                          key={agent.agent_id}
                          className="rounded-xl p-4 transition-all"
                          style={{
                            background: 'var(--surface-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-strong)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{
                                  background:
                                    'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                                  border:
                                    '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                                }}
                              >
                                <Activity
                                  className="w-4 h-4"
                                  strokeWidth={1.5}
                                  style={{ color: 'var(--accent-primary)' }}
                                />
                              </div>
                              <div>
                                <h3
                                  className="font-mono font-semibold text-sm"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {agent.nombre}
                                </h3>
                                <p
                                  className="text-[10px] font-mono"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {agent.agent_id} · {agent.modelo_llm || 'N/A'}
                                </p>
                                <div className="mt-1 flex items-center gap-2">
                                  <span
                                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border ${execMeta.tone}`}
                                  >
                                    {execMeta.label}
                                  </span>
                                  <span
                                    className="text-[10px]"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {execMeta.summary}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <button
                                onClick={() => killAgent(agent.agent_id)}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid transparent',
                                  color: 'var(--text-muted)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    'color-mix(in srgb, var(--danger) 10%, transparent)';
                                  e.currentTarget.style.color = 'var(--danger)';
                                  e.currentTarget.style.borderColor =
                                    'color-mix(in srgb, var(--danger) 20%, transparent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                                title="Forzar interrupción"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div
                            className="rounded-lg p-3"
                            style={{
                              background: 'var(--surface-app)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <p
                              className="text-[9px] uppercase tracking-wider font-semibold mb-1"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Tarea Actual
                            </p>
                            <p
                              className="text-xs font-medium"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {execMeta.summary}
                            </p>
                            <p
                              className="text-[10px] mt-1 line-clamp-2"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {agent.current_task?.title
                                ? 'Contexto de trabajo vinculado al task_id y status del registry.'
                                : 'El contexto de lanzamiento se toma del prompt o metadata del spawn.'}
                            </p>
                            <p
                              className="text-[10px] mt-1 line-clamp-1"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Heartbeat: {agent.last_heartbeat || 'N/A'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cola de Ejecución */}
          <div>
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
                {queue.length === 0 ? (
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
                        className="py-3 flex items-start gap-2.5 transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-elevated)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          className="text-[10px] font-mono mt-0.5 w-4 shrink-0"
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
                            className="text-[10px] mt-0.5 capitalize"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {task.priority}
                          </p>
                        </div>
                      </div>
                    ))}
                    {queue.length > 5 && (
                      <div
                        className="py-2.5 text-center text-[10px]"
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
                        className="px-6 py-3 text-[9px] uppercase tracking-wider font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
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
                        className="border-b transition-colors last:border-0"
                        style={{ borderColor: 'var(--border-subtle)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-elevated)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
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
      </div>
    </div>
  );
}

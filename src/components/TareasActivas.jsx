'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bot, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/db/localSupabase';
import {
  countActiveAgents,
  filterActiveAgents,
  normalizeAgentStatus,
} from '@/lib/agentRegistryTelemetry';
import { getAgentDisplayMeta } from '@/lib/agentRegistryLive';

const STATUS_CONFIG = {
  working: { color: '#58A6FF', dot: 'bg-[#58A6FF] animate-pulse', label: 'Ejecutando' },
  running: { color: '#58A6FF', dot: 'bg-[#58A6FF] animate-pulse', label: 'Ejecutando' },
  active: { color: '#3FB950', dot: 'bg-[#3FB950]', label: 'Activo' },
  thinking: { color: '#D2A8FF', dot: 'bg-[#D2A8FF] animate-pulse', label: 'Pensando' },
  asking_questions: { color: '#E3B341', dot: 'bg-[#E3B341]', label: 'Preguntando' },
  idle: { color: '#8B949E', dot: 'bg-[#8B949E]', label: 'Idle' },
  error: { color: '#F778BA', dot: 'bg-[#F778BA]', label: 'Error' },
};

export default function TareasActivas({ projectId }) {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState([]);
  const [agentRuns, setAgentRuns] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
      setAgentRuns(runs);
    } catch {
      setAgentRuns({});
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    const { data: agentsData } = await supabase
      .from('agent_registry')
      .select(
        'agent_id,nombre,modelo_llm,status,current_task_id,last_heartbeat,updated_at,created_at'
      )
      .eq('project_id', projectId)
      .order('last_heartbeat', { ascending: false, nullsFirst: false });

    const taskIds = (agentsData || []).map((agent) => agent.current_task_id).filter(Boolean);
    let tasksById = {};

    if (taskIds.length > 0) {
      const { data: tasksData } = await supabase.from('tasks').select('id,title').in('id', taskIds);
      tasksById = Object.fromEntries((tasksData || []).map((task) => [task.id, task.title]));
    }

    setAgents(
      (agentsData || []).map((agent) => ({
        ...agent,
        current_task: tasksById[agent.current_task_id] || null,
      }))
    );
    setLoading(false);
  }, [projectId, supabase]);

  const displayedAgents = useMemo(() => {
    const now = Date.now();
    return filterActiveAgents(agents, { now }).filter((agent) => {
      const lastSeen = agent.last_heartbeat || agent.updated_at || agent.created_at;
      if (!lastSeen) return false;
      return now - new Date(lastSeen).getTime() <= 90_000;
    });
  }, [agents]);

  useEffect(() => {
    fetchAgents();
    if (!projectId) return undefined;

    const channel = supabase
      .channel(`tareas-activas:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_registry',
          filter: `project_id=eq.${projectId}`,
        },
        () => fetchAgents()
      )
      .subscribe();

    const interval = setInterval(fetchAgents, 15000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchAgents, projectId, supabase]);

  return (
    <div
      data-testid="tareas-activas"
      className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-borders-subtle">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 text-accent-primary animate-spin" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-text-primary">
            Tareas Activas de Agentes
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <button
            onClick={fetchAgents}
            className="p-1 rounded hover:bg-surface-elevated transition-colors"
            title="Refrescar telemetría"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <span>{countActiveAgents(agents)} en ejecución</span>
        </div>
      </div>

      <div className="divide-y divide-[#21262D]">
        {loading && agents.length === 0 ? (
          <div className="px-5 py-6 text-xs text-text-muted">Cargando agentes activos...</div>
        ) : displayedAgents.length === 0 ? (
          <div className="px-5 py-6 text-xs text-text-muted">No hay agentes activos.</div>
        ) : (
          displayedAgents.map((agent, i) => {
            const cfg = STATUS_CONFIG[normalizeAgentStatus(agent.status)] || STATUS_CONFIG.idle;
            const displayMeta = getAgentDisplayMeta(agent, { agentRuns });
            return (
              <div
                key={agent.agent_id}
                data-testid={`task-item-${agent.agent_id}`}
                className="fade-in-up flex items-center gap-4 px-5 py-3 hover:bg-surface-elevated transition-colors"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-surface-elevated border border-borders-strong flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-borders-subtle text-text-muted bg-surface-elevated">
                      {displayMeta.label}
                    </span>
                    {(agent.current_task_id || displayMeta.summary) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[#58A6FF]/20 text-[#58A6FF] bg-[#58A6FF]/10">
                        {agent.current_task_id ? 'En contexto' : 'Launch app'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-text-primary truncate">
                    {displayMeta.summary}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-muted">
                      {agent.nombre || agent.agent_id}
                    </span>
                    <span className="text-[10px] text-[#30363D]">·</span>
                    <span className="text-[10px] text-text-muted font-mono">{agent.agent_id}</span>
                  </div>
                  {cfg.label === 'Ejecutando' && (
                    <div className="mt-1.5 h-[2px] bg-surface-elevated rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#388BFD]" style={{ width: '72%' }} />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className="text-[10px] font-medium" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div className="ml-3 text-[10px] text-text-muted text-right min-w-[92px]">
                  <div>
                    {formatDistanceToNow(
                      new Date(agent.last_heartbeat || agent.updated_at || agent.created_at),
                      {
                        addSuffix: true,
                        locale: es,
                      }
                    )}
                  </div>
                  <div className="truncate max-w-[92px]">{agent.current_task_id || '—'}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

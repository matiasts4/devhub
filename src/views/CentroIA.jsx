'use client';
import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import ChatAgente from '@/components/ChatAgente';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOutletContext } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';

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

export default function CentroIA() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Memory Graph state
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [querying, setQuerying] = useState(false);
  const [history, setHistory] = useState([]);

  // Agent History State
  const [agentHistory, setAgentHistory] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('memory_query_history');
    if (saved) setHistory(JSON.parse(saved));
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
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) setAgentHistory(data);
    setLoadingAgents(false);
  }, [project?.id, supabase]);

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

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-4 h-4 text-success" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">
            Centro de Control de Agentes
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3FB950]/10 border border-[#3FB950]/20 text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
            MCP Local
          </span>
        </div>
        <button
          onClick={() => {
            fetchStats();
            fetchAgents();
          }}
          className="text-borders-strong hover:text-white transition-colors p-1.5 rounded-md hover:bg-surface-elevated"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-6 py-6 grid grid-cols-1 xl:grid-cols-12 gap-6 max-w-[1400px] mx-auto w-full">
        {/* Left Column - Action Center (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          {/* Main Launcher */}
          <ChatAgente projectId={project?.id} projectName={project?.name} />

          {/* Active / Recent Agents History */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden flex flex-col min-h-[300px]">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-borders-subtle">
              <Terminal className="w-4 h-4 text-accent-primary" strokeWidth={1.5} />
              <h3 className="font-mono text-sm font-semibold text-text-primary">
                Historial de Ejecución
              </h3>
            </div>

            <div className="p-0 flex-1 overflow-auto">
              {loadingAgents ? (
                <div className="flex items-center justify-center h-full p-8 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : agentHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center text-text-muted space-y-2">
                  <Bot className="w-8 h-8 opacity-20" />
                  <p className="text-xs">Aún no se han ejecutado agentes en este proyecto.</p>
                </div>
              ) : (
                <div className="divide-y divide-borders-subtle">
                  {agentHistory.map((agent) => (
                    <div
                      key={agent.id}
                      className="p-4 hover:bg-surface-elevated transition-colors flex items-start gap-4"
                    >
                      {/* Status Icon */}
                      <div className="mt-1 flex-shrink-0">
                        {agent.status === 'running' && (
                          <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
                        )}
                        {agent.status === 'completed' && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                        {agent.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                        {!['running', 'completed', 'failed'].includes(agent.status) && (
                          <Clock className="w-4 h-4 text-text-muted" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <span className="text-[10px] font-mono text-[#D2A8FF] bg-[#D2A8FF]/10 px-1.5 py-0.5 rounded border border-[#D2A8FF]/20">
                            {agent.profile_name || 'default'}
                          </span>
                          <span className="text-[10px] text-text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(agent.created_at), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-text-primary leading-relaxed break-words">
                          {agent.task_description}
                        </p>

                        {agent.status === 'failed' && agent.error_message && (
                          <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                            {agent.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Context & Stats (5 cols) */}
        <div className="xl:col-span-5 space-y-6">
          {/* MCP Status Banner */}
          <div
            className="bg-surface-card border border-[#3FB950]/25 rounded-xl p-5 flex gap-4"
            style={{ borderLeft: '3px solid #3FB950' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#3FB950]/10 border border-[#3FB950]/20 flex items-center justify-center flex-shrink-0">
              <Plug2 className="w-5 h-5 text-success" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-mono font-semibold text-sm text-text-primary">
                  DevHub MCP Server
                </h2>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3FB950]/15 text-success border border-[#3FB950]/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
                  ACTIVO
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Antigravity está conectado a DevHub localmente vía MCP{' '}
                <code className="text-[#D2A8FF] font-mono text-[10px] bg-surface-elevated px-1 rounded">
                  stdio
                </code>
                . Con control total de OpenCode.
              </p>
            </div>
          </div>

          {/* Project stats */}
          {!loading && stats && (
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: 'Tareas',
                  value: stats.tasks,
                  sub: `${stats.tasks_done} completadas`,
                  color: '#58A6FF',
                  icon: ListTodo,
                },
                {
                  label: 'Hitos',
                  value: stats.milestones,
                  sub: `${stats.ms_done} completados`,
                  color: '#E3B341',
                  icon: MapPin,
                },
                {
                  label: 'Proyecto',
                  value: project?.name?.slice(0, 8) || '—',
                  sub: project?.status || '',
                  color: '#3FB950',
                  icon: FolderOpen,
                },
                {
                  label: 'Agentes Lanzados',
                  value: agentHistory.length,
                  sub: 'en este proyecto',
                  color: '#D2A8FF',
                  icon: Sparkles,
                },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={i}
                    className="bg-surface-card border border-borders-subtle rounded-lg px-4 py-3 flex items-center justify-between fade-in-up"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div>
                      <p className="text-[10px] text-text-secondary">{s.label}</p>
                      <p className="font-mono text-xl font-bold" style={{ color: s.color }}>
                        {s.value}
                      </p>
                      <p className="text-[9px] text-text-secondary">{s.sub}</p>
                    </div>
                    <Icon className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Memory Graph Query */}
          <div className="bg-surface-card border border-[#8957e5]/30 rounded-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8957e5] to-[#d2a8ff]" />
            <div className="p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d2a8ff]" />
                Consulta al Memory Graph
              </h3>
              <p className="text-[11px] text-text-muted mb-4">
                Pregunta al agente sobre decisiones, errores y arquitectura.
              </p>

              <form onSubmit={handleQuery} className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ej. ¿Qué BD decidimos usar?"
                    className="flex-1 bg-surface-elevated border border-borders-subtle rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-[#8957e5] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={querying || !query.trim()}
                    className="bg-[#8957e5] hover:bg-[#9a6bea] disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
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
                        className="text-[9px] bg-surface-app px-2 py-0.5 rounded-full border border-borders-subtle text-text-secondary hover:text-white transition-colors"
                      >
                        {h.length > 25 ? h.substring(0, 25) + '...' : h}
                      </button>
                    ))}
                  </div>
                )}
              </form>

              {querying && (
                <div className="mt-4 p-3 rounded-lg bg-surface-elevated border border-borders-subtle flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 rounded-full border-t-2 border-l-2 border-[#8957e5] animate-spin" />
                  <p className="text-[10px] text-text-muted animate-pulse">
                    Analizando memorias...
                  </p>
                </div>
              )}

              {answer && !querying && (
                <div className="mt-4 space-y-3 fade-in-up">
                  <div className="p-3 rounded-lg bg-[#21262D]/60 border border-borders-subtle">
                    <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                      {answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tools list (Collapsed look) */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-borders-subtle">
              <Info className="w-3.5 h-3.5 text-text-secondary" strokeWidth={1.5} />
              <h3 className="font-mono text-xs font-semibold text-text-primary">
                Herramientas MCP ({TOOLS.length})
              </h3>
            </div>
            <div className="divide-y divide-borders-subtle max-h-[150px] overflow-y-auto custom-scrollbar">
              {TOOLS.map((tool) => (
                <div key={tool.name} className="flex items-center gap-3 px-4 py-2">
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-success" strokeWidth={1.5} />
                  <code className="text-[9px] font-mono text-[#D2A8FF] w-[110px] flex-shrink-0">
                    {tool.name}
                  </code>
                  <span className="text-[9px] text-text-secondary truncate">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

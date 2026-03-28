import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createClient } from "@/lib/supabase/client";
import {
  Play, Pause, Activity, Cpu, AlertCircle, Clock,
  CheckCircle2, XCircle, Zap, ListTodo, LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_BADGE = {
  active:   { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",  label: "Activo"   },
  idle:     { cls: "bg-[#8B949E]/10 text-[#8B949E] border-[#8B949E]/20",        label: "Idle"     },
  error:    { cls: "bg-red-500/10 text-red-400 border-red-500/20",              label: "Error"    },
  thinking: { cls: "bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/20",        label: "Thinking" },
};

export default function SwarmControl() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();

  const [agents, setAgents]           = useState([]);
  const [queue, setQueue]             = useState([]);
  const [history, setHistory]         = useState([]);
  const [swarmStatus, setSwarmStatus] = useState('active');

  useEffect(() => {
    if (!project?.id) return;

    const fetchData = async () => {
      const { data: agentsData } = await supabase
        .from('agent_registry')
        .select('*, current_task_id')
        .eq('project_id', project.id);

      if (agentsData) {
        const taskIds = agentsData.map(a => a.current_task_id).filter(Boolean);
        let tasksDict = {};
        if (taskIds.length > 0) {
          const { data: tasksData } = await supabase.from('tasks').select('id, title').in('id', taskIds);
          tasksData?.forEach(t => tasksDict[t.id] = t.title);
        }
        setAgents(agentsData.map(a => ({ ...a, current_task: { title: tasksDict[a.current_task_id] } })));
      }

      const { data: queueData } = await supabase
        .from('tasks').select('*')
        .eq('project_id', project.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (queueData) setQueue(queueData);

      const { data: historyData } = await supabase
        .from('tasks').select('*')
        .eq('project_id', project.id)
        .in('status', ['completed', 'blocked'])
        .order('updated_at', { ascending: false })
        .limit(10);
      if (historyData) setHistory(historyData);
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [project?.id]);

  const toggleSwarm = () => {
    const newStatus = swarmStatus === 'active' ? 'paused' : 'active';
    setSwarmStatus(newStatus);
    toast.success(`Swarm ${newStatus === 'active' ? 'activado' : 'pausado'}`);
  };

  const killAgent = async (agent_id) => {
    await supabase.from('agent_registry').delete().eq('agent_id', agent_id);
    setAgents(prev => prev.filter(a => a.agent_id !== agent_id));
    toast.info(`Agente ${agent_id} terminado`);
  };

  return (
    <div className="min-h-screen bg-surface-app flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#58A6FF]/10 border border-[#58A6FF]/20">
            <Zap className="w-3.5 h-3.5 text-[#58A6FF]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-sm font-bold text-text-primary">Swarm Control</h1>
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            v2.0
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold border ${
            swarmStatus === 'active'
              ? 'bg-[#3FB950]/8 border-[#3FB950]/20 text-[#3FB950]'
              : 'bg-[#E3B341]/8 border-[#E3B341]/20 text-[#E3B341]'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${swarmStatus === 'active' ? 'bg-[#3FB950]' : 'bg-[#E3B341]'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${swarmStatus === 'active' ? 'bg-[#3FB950]' : 'bg-[#E3B341]'}`} />
            </span>
            {swarmStatus === 'active' ? 'ACTIVO' : 'PAUSADO'}
          </div>

          <button
            onClick={toggleSwarm}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all bg-surface-elevated border border-borders-strong hover:border-borders-strong text-text-primary hover:bg-surface-card active:scale-95"
          >
            {swarmStatus === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {swarmStatus === 'active' ? 'Pausar Swarm' : 'Reanudar Swarm'}
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Workers Activos */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
              <h2 className="font-mono text-sm font-semibold text-text-primary">Agentes Activos</h2>
              <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong font-mono">{agents.length}</span>
            </div>

            {agents.length === 0 ? (
              <div className="bg-surface-card border border-dashed border-borders-subtle rounded-xl p-10 text-center">
                <Cpu className="w-8 h-8 text-text-muted mx-auto mb-2" strokeWidth={1} />
                <p className="text-sm text-text-muted">No hay agentes registrados en este momento.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map(agent => {
                  const badge = STATUS_BADGE[agent.status] || STATUS_BADGE.idle;
                  return (
                    <div key={agent.agent_id} className="bg-surface-card border border-borders-subtle rounded-xl p-4 hover:border-borders-strong transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#58A6FF]/10 border border-[#58A6FF]/20">
                            <Activity className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
                          </div>
                          <div>
                            <h3 className="font-mono font-semibold text-sm text-text-primary">{agent.nombre}</h3>
                            <p className="text-[10px] text-text-muted font-mono">{agent.agent_id} · {agent.modelo_llm || "N/A"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <button
                            onClick={() => killAgent(agent.agent_id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20"
                            title="Forzar interrupción"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="bg-surface-app rounded-lg p-3 border border-borders-subtle">
                        <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-1">Tarea Actual</p>
                        <p className="text-xs font-medium text-text-primary">{agent.current_task?.title || "Ninguna · Idle"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cola de Ejecución */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#E3B341]" strokeWidth={1.5} />
              <h2 className="font-mono text-sm font-semibold text-text-primary">Cola de Tareas</h2>
              <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong font-mono">{queue.length}</span>
            </div>

            <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
              {queue.length === 0 ? (
                <div className="p-8 text-center">
                  <ListTodo className="w-6 h-6 text-text-muted mx-auto mb-2" strokeWidth={1} />
                  <p className="text-xs text-text-muted">Cola vacía</p>
                </div>
              ) : (
                <div className="divide-y divide-borders-subtle">
                  {queue.slice(0, 5).map((task, i) => (
                    <div key={task.id} className="p-3 flex items-start gap-2.5 hover:bg-surface-elevated transition-colors">
                      <span className="text-[10px] font-mono text-text-muted mt-0.5 w-4 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary line-clamp-1">{task.title}</p>
                        <p className="text-[10px] text-text-muted mt-0.5 capitalize">{task.priority}</p>
                      </div>
                    </div>
                  ))}
                  {queue.length > 5 && (
                    <div className="p-2.5 text-center text-[10px] text-text-muted">
                      +{queue.length - 5} más en cola
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Historial de Ejecuciones */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#3FB950]" strokeWidth={1.5} />
            <h2 className="font-mono text-sm font-semibold text-text-primary">Historial de Ejecuciones</h2>
          </div>

          <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-borders-subtle">
                <tr>
                  {["Tarea", "Estado Final", "Reintentos QA", "Última Actividad"].map(h => (
                    <th key={h} className="px-4 py-3 text-[9px] uppercase tracking-wider font-semibold text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-muted">
                      No hay ejecuciones recientes
                    </td>
                  </tr>
                ) : (
                  history.map(th => (
                    <tr key={th.id} className="border-b border-borders-subtle hover:bg-surface-elevated transition-colors last:border-0">
                      <td className="px-4 py-3 font-medium text-xs text-text-primary">{th.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${th.status === 'completed' ? 'text-[#3FB950]' : 'text-danger'}`}>
                          {th.status === 'completed'
                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                            : <AlertCircle className="w-3.5 h-3.5" />}
                          {th.status === 'completed' ? 'Completada' : 'Bloqueada'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted font-mono">{th.retry_count || 0}</td>
                      <td className="px-4 py-3 text-xs text-text-muted">{new Date(th.updated_at).toLocaleString('es-ES')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createClient } from "@/lib/supabase/client";
import { Play, Pause, Activity, Cpu, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SwarmControl() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();

  const [agents, setAgents] = useState([]);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [swarmStatus, setSwarmStatus] = useState('active'); // active, paused

  useEffect(() => {
    if (!project?.id) return;
    
    const fetchData = async () => {
      // Fetch agents
      const { data: agentsData } = await supabase
        .from('agent_registry')
        .select(`*, current_task_id`)
        .eq('project_id', project.id);
        
      if (agentsData) {
        // Enlazar los nombres de las tareas
        const taskIds = agentsData.map(a => a.current_task_id).filter(Boolean);
        let tasksDict = {};
        if (taskIds.length > 0) {
          const { data: tasksData } = await supabase.from('tasks').select('id, title').in('id', taskIds);
          tasksData?.forEach(t => tasksDict[t.id] = t.title);
        }
        
        const enhancedAgents = agentsData.map(a => ({
          ...a,
          current_task: { title: tasksDict[a.current_task_id] }
        }));
        setAgents(enhancedAgents);
      }

      // Fetch queue
      const { data: queueData } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', project.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
        
      if (queueData) setQueue(queueData);

      // Fetch history
      const { data: historyData } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', project.id)
        .in('status', ['completed', 'blocked'])
        .order('updated_at', { ascending: false })
        .limit(10);
        
      if (historyData) setHistory(historyData);
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [project?.id]); // removed supabase from dep array as it causes issues sometimes if not memoized

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
    <div className="flex flex-col h-full overflow-y-auto px-6 py-6 space-y-8" style={{ color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight mb-2">Swarm v2.0 Control</h1>
          <p className="text-sm opacity-70">Monitor y orquestación autónoma de agentes.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" 
               style={{ background: "var(--surface-muted)", border: "1px solid var(--border-subtle)" }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${swarmStatus === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${swarmStatus === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            </span>
            {swarmStatus.toUpperCase()}
          </div>
          
          <button 
            onClick={toggleSwarm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors hover:brightness-110"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            {swarmStatus === 'active' ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
            {swarmStatus === 'active' ? 'Pausar Swarm' : 'Reanudar Swarm'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workers Activos */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Cpu className="w-5 h-5"/> Agentes Activos ({agents.length})
          </h2>
          {agents.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed text-sm" style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>
              No hay agentes registrados o trabajando en este momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {agents.map(agent => (
                <div key={agent.agent_id} className="p-4 rounded-xl border flex flex-col gap-3" style={{ background: "var(--surface-app)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{agent.nombre} <span className="text-xs opacity-50 ml-1 font-mono">({agent.agent_id})</span></h3>
                        <p className="text-xs font-mono opacity-60">Modelo: {agent.modelo_llm || "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-md ${agent.status === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {agent.status}
                      </span>
                      <button onClick={() => killAgent(agent.agent_id)} className="p-1 rounded-md hover:bg-red-500/20 text-red-500 transition-colors" title="Forzar interrupción">
                        <XCircle className="w-4 h-4"/>
                      </button>
                    </div>
                  </div>
                  <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                    <p className="text-xs text-gray-400 mb-1">Tarea Actual:</p>
                    <p className="text-sm font-medium">{agent.current_task?.title || "Ninguna - Idle"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cola de Ejecución */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Clock className="w-5 h-5"/> Cola de Tareas ({queue.length})
          </h2>
          <div className="p-1 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-muted)" }}>
            {queue.length === 0 ? (
              <div className="p-6 text-center text-sm opacity-50">Empty queue</div>
            ) : (
              <div className="divide-y divide-white/5">
                {queue.slice(0, 5).map(task => (
                  <div key={task.id} className="p-3 text-sm flex items-start gap-2 hover:bg-white/5 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium line-clamp-1">{task.title}</p>
                      <p className="text-xs opacity-50 mt-0.5">Prioridad: {task.priority}</p>
                    </div>
                  </div>
                ))}
                {queue.length > 5 && (
                  <div className="p-2 text-center text-xs opacity-50">+{queue.length - 5} más en cola</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historial */}
      <div className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5"/> Historial de Ejecuciones
        </h2>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-black/10 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 opacity-70">Tarea</th>
                <th className="px-4 py-3 opacity-70">Estado Final</th>
                <th className="px-4 py-3 opacity-70">Reintentos QA</th>
                <th className="px-4 py-3 opacity-70">Última Actividad</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="4" className="px-4 py-8 text-center opacity-50">No hay ejecuciones recientes</td></tr>
              ) : (
                history.map((th) => (
                  <tr key={th.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium">{th.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 ${th.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {th.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertCircle className="w-3.5 h-3.5"/>}
                        {th.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 opacity-70">{th.retry_count || 0}</td>
                    <td className="px-4 py-3 opacity-70">{new Date(th.updated_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

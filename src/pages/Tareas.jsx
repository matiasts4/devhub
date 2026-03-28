'use client';
import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { ListTodo, Plus, X, ChevronDown, Loader2, Flag, Calendar, Trash2, Copy, Check, Filter, Bot, LayoutDashboard, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import Select from "react-select";

const COLUMNS = [
  { id: "pending",     label: "Pendiente",   color: "#484F58", bg: "#484F5810" },
  { id: "in_progress", label: "En Progreso", color: "#58A6FF", bg: "#58A6FF10" },
  { id: "blocked",     label: "Bloqueada",   color: "#F778BA", bg: "#F778BA10" },
  { id: "completed",   label: "Completada",  color: "#3FB950", bg: "#3FB95010" },
];

const PRIORITY = {
  critical: { label: "Crítica",  color: "#F778BA", val: 4 },
  high:     { label: "Alta",     color: "#FFA657", val: 3 },
  medium:   { label: "Media",    color: "#E3B341", val: 2 },
  low:      { label: "Baja",     color: "#8B949E", val: 1 },
};

// ... custom select styles for dark theme ...
const selectStyles = {
  control: (base) => ({ ...base, background: '#1c1f24', borderColor: '#30363d', color: '#fff', fontSize: '12px' }),
  menu: (base) => ({ ...base, background: '#1c1f24', border: '1px solid #30363d' }),
  option: (base, state) => ({ ...base, background: state.isFocused ? '#30363d' : '#1c1f24', color: '#fff' }),
  multiValue: (base) => ({ ...base, background: '#30363d' }),
  multiValueLabel: (base) => ({ ...base, color: '#fff' }),
};

function TaskModal({ projectId, userId, initialStatus, existingTask, allTasks, milestones, dependencies, onClose, onSaved }) {
  const supabase = createClient();
  
  const existingDepsIds = existingTask 
    ? dependencies.filter(d => d.task_id === existingTask.id && d.tipo === 'blocks').map(d => d.depends_on)
    : [];

  const [form, setForm] = useState({
    title: existingTask?.title || "", 
    description: existingTask?.description || "", 
    priority: existingTask?.priority || "medium",
    status: existingTask?.status || initialStatus || "pending", 
    due_date: existingTask?.due_date || "",
    milestone_id: existingTask?.milestone_id || "",
    business_value: existingTask?.business_value || 5,
  });
  
  const [selectedDeps, setSelectedDeps] = useState(
    allTasks.filter(t => existingDepsIds.includes(t.id)).map(t => ({ value: t.id, label: t.title }))
  );

  const [saving, setSaving] = useState(false);

  const blocksTasks = existingTask 
    ? dependencies.filter(d => d.depends_on === existingTask.id && d.tipo === 'blocks').map(d => {
        const t = allTasks.find(a => a.id === d.task_id);
        return t ? t.title : "Desconocida";
      })
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    let targetTaskId = existingTask?.id;

    if (existingTask) {
      const { error } = await supabase.from("tasks").update({ ...form, milestone_id: form.milestone_id || null }).eq("id", existingTask.id);
      if (error) { toast.error("Error al actualizar"); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("tasks").insert({
        ...form,
        project_id: projectId,
        user_id: userId,
        due_date: form.due_date || null,
        milestone_id: form.milestone_id || null,
      }).select().single();
      if (error) { toast.error("Error al crear tarea"); setSaving(false); return; }
      targetTaskId = data.id;
    }

    if (targetTaskId) {
      await supabase.from("task_dependencies").delete().eq("task_id", targetTaskId).eq("tipo", "blocks");
      if (selectedDeps.length > 0) {
        const insertDeps = selectedDeps.map(d => ({ task_id: targetTaskId, depends_on: d.value, tipo: "blocks" }));
        await supabase.from("task_dependencies").insert(insertDeps);
      }
    }

    setSaving(false);
    toast.success(existingTask ? "Tarea actualizada" : "Tarea creada");
    onSaved();
    onClose();
  }

  const taskOptions = allTasks.filter(t => t.id !== existingTask?.id).map(t => ({ value: t.id, label: t.title }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-card border border-borders-strong rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-borders-subtle">
          <h2 className="font-mono font-bold text-text-primary text-sm flex items-center gap-2">
            {existingTask ? "Editar Tarea" : "Nueva Tarea"}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">
            <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs text-text-muted mb-1">Título *</label>
                <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
                <label className="block text-xs text-text-muted mb-1">Descripción</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-xs text-text-muted mb-1">Milestone</label>
                <select value={form.milestone_id} onChange={e => setForm(p => ({ ...p, milestone_id: e.target.value }))}
                    className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none appearance-none">
                    <option value="">(Ninguno)</option>
                    {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                </div>
                <div>
                <label className="block text-xs text-text-muted mb-1">Estado</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none appearance-none">
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Prioridad</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                      className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none appearance-none">
                      {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Valor de Negocio: {form.business_value}</label>
                  <input type="range" min="1" max="10" value={form.business_value} onChange={e => setForm(p => ({ ...p, business_value: parseInt(e.target.value) }))}
                      className="w-full mt-2" />
                  <div className="flex justify-between text-[9px] text-text-muted"><span>Mínimo (1)</span><span>Core (10)</span></div>
                </div>
            </div>

            <div className="pt-2 border-t border-borders-subtle">
                <label className="block text-xs text-text-muted mb-1">Depende de (Bloqueada por)</label>
                <Select isMulti options={taskOptions} value={selectedDeps} onChange={setSelectedDeps} styles={selectStyles} placeholder="Seleccionar tareas..." />
            </div>
            {blocksTasks.length > 0 && (
                <div className="bg-surface-elevated p-3 rounded-lg border border-borders-subtle">
                    <p className="text-[10px] text-text-muted mb-1 font-semibold uppercase">Bloquea a ({blocksTasks.length}):</p>
                    <ul className="text-xs text-white list-disc pl-4 space-y-0.5">
                        {blocksTasks.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                </div>
            )}
            </form>
        </div>
        
        <div className="p-4 border-t border-borders-subtle bg-surface-app flex gap-2 rounded-b-2xl">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-borders-strong text-text-muted text-sm hover:text-white transition-all">Cancelar</button>
            <button type="submit" form="task-form" disabled={saving} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar Tarea
            </button>
        </div>
      </div>
    </div>
  );
}

function AgentQueueView({ tasks, dependencies, milestones }) {
  const [copiedTask, setCopiedTask] = useState(null);

  const queue = useMemo(() => {
    const statusMap = Object.fromEntries(tasks.map(t => [t.id, t.status]));
    const pendingTasks = tasks.filter(t => t.status === "pending");

    return pendingTasks.map(task => {
        const taskDeps = dependencies.filter(d => d.task_id === task.id && d.tipo === "blocks");
        const isBlocked = taskDeps.some(d => statusMap[d.depends_on] !== "completed");
        
        const prioConfig = PRIORITY[task.priority] || PRIORITY.medium;
        const urgencia = prioConfig.val;
        const vnegocio = task.business_value || 5;
        const unlocks = dependencies.filter(d => d.depends_on === task.id).length;
        
        const score = (urgencia * 0.4) + (vnegocio * 0.3) + (unlocks * 0.2);
        const m = milestones.find(m => m.id === task.milestone_id);
        
        return { ...task, score, isBlocked, unlocks, priorityObj: prioConfig, m_title: m?.title };
    }).filter(t => !t.isBlocked).sort((a, b) => b.score - a.score);
  }, [tasks, dependencies, milestones]);

  const handleCopy = (task) => {
    const textToCopy = `🤖 TAREA: ${task.title}\nMILESTONE: ${task.m_title || 'N/A'}\nSCORE: ${task.score.toFixed(1)}\n\nDESCRIPCIÓN:\n${task.description || ""}\n\nEjecuta esta tarea siguiendo el System Prompt del Worker. Asegúrate de nunca hacer push a main.`;
    navigator.clipboard.writeText(textToCopy);
    toast.success("Prompt de Agente Copiado");
    setCopiedTask(task.id);
    setTimeout(() => setCopiedTask(null), 2000);
  };

  return (
    <div className="space-y-3">
        <div className="bg-surface-elevated border border-borders-subtle rounded-xl p-4 flex items-start gap-4">
            <div className="p-3 bg-blue-500/10 rounded-full"><Bot className="w-6 h-6 text-blue-400" /></div>
            <div>
                <h3 className="text-white font-semibold text-sm mb-1">Cola de Agentes Autónomos</h3>
                <p className="text-xs text-text-muted">Las tareas aquí listadas están ordenadas matemáticamente por urgencia, valor de negocio y desbloqueadores. No incluye tareas bloqueadas.</p>
            </div>
        </div>

        {queue.length === 0 ? (
            <p className="p-6 text-center text-text-muted text-sm border border-dashed border-borders-subtle rounded-xl">No hay tareas libres disponibles para agentes.</p>
        ) : (
            <div className="space-y-3 mt-4">
                {queue.map((task, i) => (
                    <div key={task.id} className="bg-surface-card border border-borders-subtle rounded-xl p-4 flex items-center justify-between group hover:border-blue-500/30 transition-all">
                        <div className="flex-1 flex items-center gap-4">
                            <div className="flex flex-col items-center justify-center bg-surface-app border border-borders-strong w-12 h-12 rounded-lg shrink-0">
                                <span className="text-white font-mono font-bold text-sm leading-none">{task.score.toFixed(1)}</span>
                                <span className="text-[8px] text-text-muted uppercase mt-1">Score</span>
                            </div>
                            <div>
                                <h4 className="text-white font-medium text-sm">{task.title}</h4>
                                <div className="flex items-center gap-3 mt-1.5 opacity-80">
                                    <span className="text-[10px] flex items-center gap-1" style={{color: task.priorityObj.color}}><Flag className="w-3 h-3"/> {task.priorityObj.label}</span>
                                    {task.m_title && <span className="text-[10px] text-text-muted bg-surface-elevated px-1.5 rounded">{task.m_title}</span>}
                                    <span className="text-[10px] text-text-muted">Desbloquea: {task.unlocks}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleCopy(task); }} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2">
                            {copiedTask === task.id ? <Check className="w-4 h-4"/> : <Zap className="w-4 h-4" />} {copiedTask === task.id ? "¡Copiado!" : "Ejecutar con Worker"}
                        </button>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}

export default function Tareas() {
  const { project, user } = useOutletContext() || {};
  const supabase = createClient();

  const [tasks, setTasks] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState("kanban");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [initialStatusForNew, setInitialStatus] = useState("pending");

  const [fMilestone, setFMilestone] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [fUnlocked, setFUnlocked] = useState(false);
  const [fMyTasks, setFMyTasks] = useState(false);

  useEffect(() => {
    if (project?.id) {
        const saved = localStorage.getItem(`devhub_kanban_filters_${project.id}`);
        if (saved) {
            try {
                const s = JSON.parse(saved);
                setFMilestone(s.fMilestone || ""); setFUnlocked(s.fUnlocked || false); setFMyTasks(s.fMyTasks || false);
            } catch(e) {}
        }
    }
  }, [project?.id]);

  useEffect(() => {
    if (project?.id) localStorage.setItem(`devhub_kanban_filters_${project.id}`, JSON.stringify({ fMilestone, fUnlocked, fMyTasks }));
  }, [project?.id, fMilestone, fUnlocked, fMyTasks]);

  const fetchData = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [tRes, dRes, mRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", project.id).order("created_at", { ascending: false }),
      supabase.from("task_dependencies").select("*"),
      supabase.from("milestones").select("*").eq("project_id", project.id)
    ]);
    setTasks(tRes.data || []); setDependencies(dRes.data || []); setMilestones(mRes.data || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function moveTask(taskId, newStatus) {
    const completed_at = newStatus === "completed" ? new Date().toISOString() : null;
    await supabase.from("tasks").update({ status: newStatus, completed_at }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, completed_at } : t));
    const col = COLUMNS.find(c => c.id === newStatus);
    toast.success("Tarea movida", { description: `→ ${col?.label}` });
  }

  async function deleteTask(taskId) {
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    toast.success("Tarea eliminada");
  }

  const statusMap = Object.fromEntries(tasks.map(t => [t.id, t.status]));

  const visibleTasks = tasks.filter(t => {
      if (fMilestone && t.milestone_id !== fMilestone) return false;
      if (fSearch && !t.title.toLowerCase().includes(fSearch.toLowerCase())) return false;
      if (fMyTasks && user?.id && t.user_id !== user.id) return false;
      if (fUnlocked) {
          const taskDeps = dependencies.filter(d => d.task_id === t.id && d.tipo === "blocks");
          const isBlocked = taskDeps.some(d => statusMap[d.depends_on] !== "completed");
          if (isBlocked) return false;
      }
      return true;
  });

  return (
    <div className="min-h-screen bg-surface-app flex flex-col">
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-accent-primary/10 rounded-lg border border-accent-primary/20"><ListTodo className="w-4 h-4 text-accent-primary" /></div>
            <h1 className="font-mono text-base font-bold text-text-primary">Tareas</h1>
          </div>
          <div className="flex bg-surface-elevated p-1 rounded-lg border border-borders-subtle">
            <button onClick={() => setViewMode("kanban")} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === "kanban" ? "bg-surface-card text-white shadow-sm" : "text-text-muted hover:text-white"}`}><LayoutDashboard className="w-3.5 h-3.5" /> Kanban</button>
            <button onClick={() => setViewMode("agent")} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === "agent" ? "bg-surface-card text-blue-400 shadow-sm" : "text-text-muted hover:text-white"}`}><Bot className="w-3.5 h-3.5" /> Cola de Agente</button>
          </div>
        </div>
        <button onClick={() => { setEditingTask(null); setInitialStatus("pending"); setModalOpen(true); }} className="flex items-center gap-2 bg-success text-white font-semibold px-4 py-2 rounded-lg text-xs transition-all active:scale-95"><Plus className="w-4 h-4" /> Añadir Tarea</button>
      </div>

      <div className="flex-1 p-6 flex flex-col">
        {viewMode === "kanban" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 p-3 bg-surface-card border border-borders-subtle rounded-xl">
                <div className="flex items-center gap-2 text-text-muted mr-2"><Filter className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Filtros</span></div>
                <input placeholder="Buscar tarea..." value={fSearch} onChange={e => setFSearch(e.target.value)} className="bg-surface-app border border-borders-subtle text-xs px-3 py-2 rounded-lg w-48 outline-none" />
                <select value={fMilestone} onChange={e => setFMilestone(e.target.value)} className="bg-surface-app border border-borders-subtle text-xs px-3 py-2 rounded-lg outline-none"><option value="">Todos los Milestones</option>{milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer hover:text-white"><input type="checkbox" checked={fUnlocked} onChange={e => setFUnlocked(e.target.checked)} className="accent-blue-500" /> Solo desbloqueadas</label>
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer hover:text-white"><input type="checkbox" checked={fMyTasks} onChange={e => setFMyTasks(e.target.checked)} className="accent-blue-500" /> Asignadas a mí</label>
            </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center flex-1"><Loader2 className="w-8 h-8 animate-spin text-accent-primary" /></div>
        ) : viewMode === "agent" ? (
             <AgentQueueView tasks={tasks} dependencies={dependencies} milestones={milestones} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start flex-1">
            {COLUMNS.map(col => {
              const colTasks = visibleTasks.filter(t => t.status === col.id);
              return (
                <div key={col.id} className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-borders-subtle bg-surface-card/50" style={{ borderTop: `2px solid ${col.color}` }}>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: col.color }} /><span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span></div>
                    <span className="font-mono text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-subtle">{colTasks.length}</span>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto space-y-2.5 custom-scrollbar">
                    {colTasks.map((task) => {
                      const prio = PRIORITY[task.priority] || PRIORITY.medium;
                      const nextCols = COLUMNS.filter(c => c.id !== col.id);
                      const isBlocked = dependencies.filter(d => d.task_id === task.id && d.tipo === "blocks").some(d => statusMap[d.depends_on] !== "completed");
                      
                      return (
                        <div key={task.id} onClick={() => { setEditingTask(task); setModalOpen(true); }} className={`bg-surface-app border rounded-lg p-3 hover:shadow-lg transition-all cursor-pointer group relative ${isBlocked ? 'border-red-500/30' : 'border-borders-subtle hover:border-borders-strong'}`}>
                          {isBlocked && <div className="text-[9px] text-red-400 font-semibold mb-1 flex items-center gap-1">🛑 BLOQUEADA</div>}
                          <p className="text-xs text-text-primary font-medium leading-snug mb-2 pr-5">{task.title}</p>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2"><span className="text-[9px] font-semibold flex items-center gap-1" style={{ color: prio.color }}><Flag className="w-2.5 h-2.5" /></span>{task.business_value && <span className="text-[9px] text-blue-300 font-mono" title="Valor Negocio">V:{task.business_value}</span>}</div>
                            <div className="relative group/move" onClick={e => e.stopPropagation()}><button className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-white transition-all p-1 bg-surface-elevated rounded border border-borders-subtle"><ChevronDown className="w-3.5 h-3.5" /></button><div className="absolute right-0 top-6 bg-surface-card border border-borders-subtle rounded-lg py-1 hidden group-hover/move:block z-10 w-32 shadow-xl">{nextCols.map(nc => (<button key={nc.id} onClick={() => moveTask(task.id, nc.id)} className="w-full text-left px-3 py-1.5 text-[10px] text-text-muted hover:text-white hover:bg-surface-elevated flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: nc.color }} />{nc.label}</button>))}<div className="border-t border-borders-subtle mt-1 pt-1"><button onClick={() => deleteTask(task.id)} className="w-full text-left px-3 py-1.5 text-[10px] text-danger hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="w-3 h-3" /> Eliminar</button></div></div></div>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => { setEditingTask(null); setInitialStatus(col.id); setModalOpen(true); }} className="w-full py-2 text-[10px] text-text-muted hover:text-white hover:bg-surface-elevated rounded-lg transition-all flex items-center justify-center gap-1 border border-dashed border-borders-subtle"><Plus className="w-3 h-3" /> Añadir</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {modalOpen && <TaskModal projectId={project?.id} userId={user?.id || (tasks[0]?.user_id)} initialStatus={initialStatusForNew} existingTask={editingTask} allTasks={tasks} milestones={milestones} dependencies={dependencies} onClose={() => setModalOpen(false)} onSaved={fetchData} />}
    </div>
  );
}
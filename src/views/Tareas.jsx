'use client';
import TaskComments from '../components/TaskComments';
import PresenceAvatars from '../components/PresenceAvatars';
import PageHeader from '@/components/PageHeader';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ListTodo,
  Plus,
  X,
  ChevronDown,
  Loader2,
  Flag,
  Calendar,
  Trash2,
  Copy,
  Check,
  Filter,
  Bot,
  LayoutDashboard,
  Zap,
  ShieldAlert,
  Search,
  Milestone,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import Select from 'react-select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  buildDocOpsTaskPrompt,
  enforceDocOpsGateOnLaunchCommand,
  shellQuotePrompt,
} from '@/lib/docopsPrompts';

const COLUMNS = [
  { id: 'pending', label: 'Pendiente', color: '#484F58', bg: '#484F5810' },
  { id: 'in_progress', label: 'En Progreso', color: '#58A6FF', bg: '#58A6FF10' },
  { id: 'blocked', label: 'Bloqueada', color: '#F778BA', bg: '#F778BA10' },
  { id: 'completed', label: 'Completada', color: '#3FB950', bg: '#3FB95010' },
];

const PRIORITY = {
  critical: { label: 'Crítica', color: '#F778BA', val: 4 },
  high: { label: 'Alta', color: '#FFA657', val: 3 },
  medium: { label: 'Media', color: '#E3B341', val: 2 },
  low: { label: 'Baja', color: '#8B949E', val: 1 },
};

// Custom select styles matching PlanningMode design
const selectStyles = {
  control: (base, state) => ({
    ...base,
    background: '#0d1117',
    borderColor: state.isFocused ? '#58A6FF50' : '#30363d',
    borderRadius: '8px',
    color: '#f0f6fc',
    fontSize: '12px',
    boxShadow: state.isFocused ? '0 0 0 2px #58A6FF15' : 'none',
    minHeight: '36px',
    '&:hover': { borderColor: '#484F58' },
  }),
  menu: (base) => ({
    ...base,
    background: '#161b26',
    border: '1px solid #30363d',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  }),
  option: (base, state) => ({
    ...base,
    background: state.isFocused ? '#1c2333' : '#161b26',
    color: '#f0f6fc',
    fontSize: '12px',
  }),
  multiValue: (base) => ({ ...base, background: '#1c2333', borderRadius: '6px' }),
  multiValueLabel: (base) => ({ ...base, color: '#f0f6fc', fontSize: '11px' }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#8b949e',
    '&:hover': { background: '#F778BA20', color: '#F778BA' },
  }),
  placeholder: (base) => ({ ...base, color: '#484F58', fontSize: '12px' }),
  input: (base) => ({ ...base, color: '#f0f6fc' }),
  singleValue: (base) => ({ ...base, color: '#f0f6fc' }),
};

// ─── Styled Select Wrapper ────────────────────────────────────────────────────
function StyledSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div>
      {label && (
        <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="w-full appearance-none bg-surface-app border border-borders-strong rounded-lg px-3 py-2 pr-8 text-sm text-text-primary focus:outline-none focus:border-[#58A6FF]/50 focus:ring-1 focus:ring-[#58A6FF]/10 transition-colors cursor-pointer"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface-card">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({
  projectId,
  userId,
  initialStatus,
  existingTask,
  allTasks,
  milestones,
  dependencies,
  onClose,
  onSaved,
}) {
  const db = createClient();

  const existingDepsIds = existingTask
    ? dependencies
        .filter((d) => d.task_id === existingTask.id && d.tipo === 'blocks')
        .map((d) => d.depends_on)
    : [];

  const [form, setForm] = useState({
    title: existingTask?.title || '',
    description: existingTask?.description || '',
    priority: existingTask?.priority || 'medium',
    status: existingTask?.status || initialStatus || 'pending',
    due_date: existingTask?.due_date || '',
    milestone_id: existingTask?.milestone_id || '',
    business_value: existingTask?.business_value || 5,
  });

  const [selectedDeps, setSelectedDeps] = useState(
    allTasks
      .filter((t) => existingDepsIds.includes(t.id))
      .map((t) => ({ value: t.id, label: t.title }))
  );
  const [saving, setSaving] = useState(false);

  const blocksTasks = existingTask
    ? dependencies
        .filter((d) => d.depends_on === existingTask.id && d.tipo === 'blocks')
        .map((d) => {
          const t = allTasks.find((a) => a.id === d.task_id);
          return t ? t.title : 'Desconocida';
        })
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    let targetTaskId = existingTask?.id;

    if (existingTask) {
      const { error } = await db
        .from('tasks')
        .update({ ...form, milestone_id: form.milestone_id || null })
        .eq('id', existingTask.id);
      if (error) {
        toast.error('Error al actualizar');
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await db
        .from('tasks')
        .insert({
          ...form,
          project_id: projectId,
          user_id: userId,
          due_date: form.due_date || null,
          milestone_id: form.milestone_id || null,
        })
        .select()
        .single();
      if (error) {
        toast.error('Error al crear tarea');
        setSaving(false);
        return;
      }
      targetTaskId = data.id;
    }

    if (targetTaskId) {
      await db
        .from('task_dependencies')
        .delete()
        .eq('task_id', targetTaskId)
        .eq('tipo', 'blocks');
      if (selectedDeps.length > 0) {
        await db.from('task_dependencies').insert(
          selectedDeps.map((d) => ({
            task_id: targetTaskId,
            depends_on: d.value,
            tipo: 'blocks',
          }))
        );
      }
    }

    setSaving(false);
    toast.success(existingTask ? 'Tarea actualizada' : 'Tarea creada');
    onSaved();
    onClose();
  }

  const taskOptions = allTasks
    .filter((t) => t.id !== existingTask?.id)
    .map((t) => ({ value: t.id, label: t.title }));

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-borders-strong rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borders-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#58A6FF]/10 border border-[#58A6FF]/20 flex items-center justify-center">
              <ListTodo className="w-3.5 h-3.5 text-[#58A6FF]" strokeWidth={1.5} />
            </div>
            <h2 className="font-mono font-bold text-text-primary text-sm">
              {existingTask ? 'Editar Tarea' : 'Nueva Tarea'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-surface-elevated flex items-center justify-center text-text-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 flex-1">
          <form id="task-form" className="space-y-4" onSubmit={handleSubmit}>
            {/* Title */}
            <div>
              <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                Título *
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Describe la tarea brevemente..."
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF]/50 focus:ring-1 focus:ring-[#58A6FF]/10 transition-colors cursor-pointer"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                Descripción
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Contexto, criterios de aceptación..."
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF]/50 focus:ring-1 focus:ring-[#58A6FF]/10 transition-colors resize-none leading-relaxed cursor-pointer"
              />
            </div>

            {/* Status + Milestone */}
            <div className="grid grid-cols-2 gap-3">
              <StyledSelect
                label="Estado"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                options={COLUMNS.map((c) => ({ value: c.id, label: c.label }))}
              />
              <StyledSelect
                label="Milestone"
                value={form.milestone_id}
                onChange={(e) => setForm((p) => ({ ...p, milestone_id: e.target.value }))}
                placeholder="(Ninguno)"
                options={milestones.map((m) => ({ value: m.id, label: m.title }))}
              />
            </div>

            {/* Priority + Business Value */}
            <div className="grid grid-cols-2 gap-3">
              {/* Priority — colored pills */}
              <div>
                <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                  Prioridad
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, priority: k }))}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                      style={
                        form.priority === k
                          ? {
                              background: `${v.color}18`,
                              borderColor: `${v.color}40`,
                              color: v.color,
                            }
                          : { background: '#0d1117', borderColor: '#30363d', color: '#8b949e' }
                      }
                    >
                      <Flag className="w-3 h-3" />
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Business Value */}
              <div>
                <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                  Valor Negocio: <span className="text-white font-mono">{form.business_value}</span>
                </label>
                <div className="pt-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={form.business_value}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, business_value: parseInt(e.target.value) }))
                    }
                    className="w-full accent-[#58A6FF] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-text-muted mt-1">
                    <span>Mínimo (1)</span>
                    <span>Core (10)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                Fecha Límite
              </label>
              <DatePicker
                value={form.due_date}
                onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              />
            </div>

            {/* Dependencies */}
            <div className="pt-1 border-t border-borders-subtle">
              <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
                Depende de (Bloqueada por)
              </label>
              <Select
                isMulti
                options={taskOptions}
                value={selectedDeps}
                onChange={setSelectedDeps}
                styles={selectStyles}
                placeholder="Seleccionar tareas dependientes..."
              />
            </div>

            {blocksTasks.length > 0 && (
              <div className="bg-surface-elevated p-3 rounded-lg border border-borders-subtle">
                <p className="text-xs text-text-muted mb-1.5 font-semibold uppercase tracking-wider">
                  Bloquea a ({blocksTasks.length}):
                </p>
                <ul className="text-xs text-white space-y-1">
                  {blocksTasks.map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>

          {existingTask && (
            <div className="mt-6 pt-6 border-t border-borders-subtle">
              <TaskComments taskId={existingTask.id} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-borders-subtle bg-surface-app flex gap-2 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-borders-strong text-text-muted text-sm hover:text-white hover:border-borders-strong transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="task-form"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#58A6FF] to-[#2F81F7] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:from-[#79C0FF] hover:to-[#58A6FF] transition-all"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar Tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Queue View ─────────────────────────────────────────────────────────
function AgentQueueView({ tasks, dependencies, milestones, project, navigate }) {
  const [copiedTask, setCopiedTask] = useState(null);

  const queue = useMemo(() => {
    const statusMap = Object.fromEntries(tasks.map((t) => [t.id, t.status]));
    return tasks
      .filter((t) => t.status === 'pending')
      .map((task) => {
        const taskDeps = dependencies.filter((d) => d.task_id === task.id && d.tipo === 'blocks');
        const isBlocked = taskDeps.some((d) => statusMap[d.depends_on] !== 'completed');
        const prioConfig = PRIORITY[task.priority] || PRIORITY.medium;
        const unlocks = dependencies.filter((d) => d.depends_on === task.id).length;
        const score = prioConfig.val * 0.4 + (task.business_value || 5) * 0.3 + unlocks * 0.2;
        const m = milestones.find((m) => m.id === task.milestone_id);
        return { ...task, score, isBlocked, unlocks, priorityObj: prioConfig, m_title: m?.title };
      })
      .filter((t) => !t.isBlocked)
      .sort((a, b) => b.score - a.score);
  }, [tasks, dependencies, milestones]);

  const handleCopy = (task) => {
    const text = `[AGENT] TAREA: ${task.title}\nMILESTONE: ${task.m_title || 'N/A'}\nSCORE: ${task.score.toFixed(1)}\n\nDESCRIPCIÓN:\n${task.description || ''}\n\nEjecuta esta tarea siguiendo el System Prompt del Worker. Asegúrate de nunca hacer push a main.`;
    navigator.clipboard.writeText(text);
    toast.success('Prompt de Agente Copiado');
    setCopiedTask(task.id);
    setTimeout(() => setCopiedTask(null), 2000);
  };

  const handleRunAgent = async (task) => {
    if (!project?.id) return;

    const agentId = `worker-sdd-orchestrator-${Date.now()}`;

    // Telemetría UI inmediata
    const db = createClient();
    try {
      const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
      hints[agentId] = task.title;
      localStorage.setItem('devhub_agent_task_hints', JSON.stringify(hints));
    } catch {
      // Ignore localStorage failures (private mode / storage disabled)
    }

    await db.from('agent_registry').insert({
      agent_id: agentId,
      project_id: project.id,
      nombre: 'SDD ORCHESTRATOR',
      modelo_llm: 'OpenCode Local',
      status: 'working',
      current_task_id: task.id,
      last_heartbeat: new Date().toISOString(),
    });

    navigate(`/project/${project.id}/terminales`);

    setTimeout(() => {
      const telemetryPrompt = buildDocOpsTaskPrompt({
        agentId: 'sdd-orchestrator',
        taskId: task.id,
        telemetryId: agentId,
        taskTitle: task.title,
        taskDescription: task.description,
      });

      window.dispatchEvent(
        new CustomEvent('devhub:run-agent', {
          detail: {
            taskId: agentId,
            command: enforceDocOpsGateOnLaunchCommand(
              `opencode --agent sdd-orchestrator --prompt ${shellQuotePrompt(telemetryPrompt)}`
            ),
            selectedAgent: 'sdd-orchestrator',
            launchOrigin: 'task-launch',
            promptSummary: task.title,
            taskTitle: task.title,
          },
        })
      );
      toast.success(`Enviando a terminal para: ${task.title}`);
    }, 150);
  };

  return (
    <div className="space-y-3">
      <div className="bg-surface-elevated border border-borders-subtle rounded-xl p-4 flex items-start gap-4">
        <div className="p-2.5 bg-[#58A6FF]/10 rounded-xl border border-[#58A6FF]/20">
          <Bot className="w-5 h-5 text-[#58A6FF]" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm mb-0.5">Cola de Agentes Autónomos</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Tareas ordenadas por urgencia, valor de negocio y desbloqueadores. Solo incluye tareas
            libres de bloqueos.
          </p>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-borders-subtle rounded-xl">
          <Bot className="w-8 h-8 text-text-muted mx-auto mb-2" strokeWidth={1} />
          <p className="text-sm text-text-muted">No hay tareas libres disponibles para agentes.</p>
        </div>
      ) : (
        <div className="space-y-2.5 mt-2">
          {queue.map((task, i) => (
            <div
              key={task.id}
              className="bg-surface-card border border-borders-subtle rounded-xl p-4 flex items-center justify-between group hover:border-[#58A6FF]/30 transition-all"
            >
              <div className="flex-1 flex items-center gap-4">
                <div className="flex flex-col items-center justify-center bg-surface-app border border-borders-strong w-12 h-12 rounded-lg shrink-0">
                  <span className="text-white font-mono font-bold text-sm leading-none">
                    {task.score.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-muted uppercase mt-0.5">Score</span>
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">{task.title}</h4>
                  <div className="flex items-center gap-3 mt-1 opacity-80">
                    <span
                      className="text-xs flex items-center gap-1"
                      style={{ color: task.priorityObj.color }}
                    >
                      <Flag className="w-3 h-3" /> {task.priorityObj.label}
                    </span>
                    {task.m_title && (
                      <span className="text-xs text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded-md border border-borders-subtle">
                        {task.m_title}
                      </span>
                    )}
                    <span className="text-xs text-text-muted">Desbloquea: {task.unlocks}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(task);
                  }}
                  className="bg-surface-elevated text-text-muted hover:text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all border border-borders-subtle hover:border-borders-strong"
                  title="Copiar prompt"
                >
                  {copiedTask === task.id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunAgent(task);
                  }}
                  className="bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20 hover:bg-[#58A6FF] hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <Zap className="w-3.5 h-3.5" /> Ejecutar con Worker
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Tareas View ─────────────────────────────────────────────────────────
export default function Tareas() {
  const { project, user } = useOutletContext() || {};
  const navigate = useNavigate();
  const db = createClient();

  const [tasks, setTasks] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('kanban');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [initialStatusForNew, setInitialStatus] = useState('pending');

  const [fMilestone, setFMilestone] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [fUnlocked, setFUnlocked] = useState(false);
  const [fMyTasks, setFMyTasks] = useState(false);

  useEffect(() => {
    if (project?.id) {
      const saved = localStorage.getItem(`devhub_kanban_filters_${project.id}`);
      if (saved) {
        try {
          const s = JSON.parse(saved);
          setFMilestone(s.fMilestone || '');
          setFUnlocked(s.fUnlocked || false);
          setFMyTasks(s.fMyTasks || false);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [project?.id]);

  useEffect(() => {
    if (project?.id)
      localStorage.setItem(
        `devhub_kanban_filters_${project.id}`,
        JSON.stringify({ fMilestone, fUnlocked, fMyTasks })
      );
  }, [project?.id, fMilestone, fUnlocked, fMyTasks]);

  const fetchData = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [tRes, dRes, mRes] = await Promise.all([
      db
        .from('tasks')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      db.from('task_dependencies').select('*'),
      db.from('milestones').select('*').eq('project_id', project.id),
    ]);
    setTasks(tRes.data || []);
    setDependencies(dRes.data || []);
    setMilestones(mRes.data || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    if (!project?.id) return;
    const channel = db
      .channel(`public:tasks:${project.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${project.id}` },
        () => fetchData()
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [project?.id, fetchData]);

  async function moveTask(taskId, newStatus) {
    const completed_at = newStatus === 'completed' ? new Date().toISOString() : null;
    await db.from('tasks').update({ status: newStatus, completed_at }).eq('id', taskId);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, completed_at } : t))
    );
    const col = COLUMNS.find((c) => c.id === newStatus);
    toast.success('Tarea movida', { description: `→ ${col?.label}` });
  }

  async function deleteTask(taskId) {
    await db.from('tasks').delete().eq('id', taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast.success('Tarea eliminada');
  }

  const statusMap = Object.fromEntries(tasks.map((t) => [t.id, t.status]));

  const visibleTasks = tasks.filter((t) => {
    if (fMilestone && t.milestone_id !== fMilestone) return false;
    if (fSearch && !t.title.toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fMyTasks && user?.id && t.assigned_to !== user.id) return false;
    if (fUnlocked) {
      const taskDeps = dependencies.filter((d) => d.task_id === t.id && d.tipo === 'blocks');
      if (taskDeps.some((d) => statusMap[d.depends_on] !== 'completed')) return false;
    }
    return true;
  });

  const activeFiltersCount = [fMilestone, fSearch, fUnlocked, fMyTasks].filter(Boolean).length;

  return (
    <div className="h-full flex flex-col">
      {/* Integrated Page Header */}
      <PageHeader project={project} pageName="tareas">
        {/* View mode toggle */}
        <div className="flex bg-surface-elevated p-0.5 rounded-lg border border-borders-subtle">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${viewMode === 'kanban' ? 'bg-surface-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Kanban
          </button>
          <button
            onClick={() => setViewMode('agent')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${viewMode === 'agent' ? 'bg-surface-card text-[#58A6FF] shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Bot className="w-3.5 h-3.5" /> Cola Agente
          </button>
        </div>

        <PresenceAvatars projectId={project?.id} />
        
        <button
          onClick={() => {
            setEditingTask(null);
            setInitialStatus('pending');
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 bg-[#2ea043] hover:bg-[#3FB950] text-white font-semibold px-3.5 py-2 rounded-lg text-xs transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Añadir Tarea
        </button>
      </PageHeader>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-5 flex flex-col gap-4">
        {/* Filter bar */}
        {viewMode === 'kanban' && (
          <div
            className="core-panel rounded-xl p-3 flex flex-wrap items-center gap-2.5"
            style={{ background: 'var(--surface-card, #161b26)' }}
          >
            {/* Filter icon + label */}
            <div className="flex items-center gap-1.5 text-text-muted pr-1 border-r border-borders-subtle mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="text-[11px] bg-[#58A6FF] text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
              <input
                placeholder="Buscar tarea..."
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary placeholder-[#484F58] pl-7 pr-3 py-1.5 rounded-lg w-44 outline-none focus:border-[#58A6FF]/40 focus:ring-1 focus:ring-[#58A6FF]/10 transition-colors cursor-pointer"
              />
            </div>

            {/* Milestone filter */}
            <div className="relative">
              <Milestone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
              <select
                value={fMilestone}
                onChange={(e) => setFMilestone(e.target.value)}
                className="appearance-none bg-surface-app border border-borders-subtle text-xs text-text-primary pl-7 pr-7 py-1.5 rounded-lg outline-none focus:border-[#58A6FF]/40 cursor-pointer"
              >
                <option value="">Todos los Milestones</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
            </div>

            {/* Toggle pills */}
            <button
              onClick={() => setFUnlocked((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${fUnlocked ? 'bg-[#58A6FF]/10 border-[#58A6FF]/30 text-[#58A6FF]' : 'bg-surface-app border-borders-subtle text-text-muted hover:text-text-primary hover:border-borders-strong'}`}
            >
              <Zap className="w-3 h-3" /> Solo desbloqueadas
            </button>
            <button
              onClick={() => setFMyTasks((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${fMyTasks ? 'bg-[#3FB950]/10 border-[#3FB950]/30 text-[#3FB950]' : 'bg-surface-app border-borders-subtle text-text-muted hover:text-text-primary hover:border-borders-strong'}`}
            >
              Asignadas a mí
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={() => {
                  setFSearch('');
                  setFMilestone('');
                  setFUnlocked(false);
                  setFMyTasks(false);
                }}
                className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Board / Agent View */}
        {loading ? (
          <div className="flex items-center justify-center flex-1 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#58A6FF]" />
          </div>
        ) : viewMode === 'agent' ? (
          <AgentQueueView
            tasks={tasks}
            dependencies={dependencies}
            milestones={milestones}
            project={project}
            navigate={navigate}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {COLUMNS.map((col) => {
              const colTasks = visibleTasks.filter((t) => t.status === col.id);
              return (
                <div
                  key={col.id}
                  className="core-panel rounded-xl overflow-hidden flex flex-col max-h-[80vh] shadow-sm"
                  style={{ background: 'var(--surface-card, #161b26)' }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b border-borders-subtle"
                    style={{ borderTop: `2px solid ${col.color}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: col.color }}
                      />
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: col.color }}
                      >
                        {col.label}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-subtle">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Tasks */}
                  <div className="p-2.5 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                    {colTasks.map((task) => {
                      const prio = PRIORITY[task.priority] || PRIORITY.medium;
                      const nextCols = COLUMNS.filter((c) => c.id !== col.id);
                      const isBlocked = dependencies
                        .filter((d) => d.task_id === task.id && d.tipo === 'blocks')
                        .some((d) => statusMap[d.depends_on] !== 'completed');

                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            setEditingTask(task);
                            setModalOpen(true);
                          }}
                          className={`bg-surface-card border border-borders-strong rounded-xl p-3 hover:shadow-lg transition-all cursor-pointer group relative ${isBlocked ? 'border-danger/30 bg-red-950/5' : 'border-borders-subtle hover:border-borders-strong'}`}
                        >
                          {isBlocked && (
                            <div className="flex items-center gap-1 text-[11px] text-danger font-semibold mb-1.5">
                              <ShieldAlert className="w-3 h-3" /> BLOQUEADA
                            </div>
                          )}
                          <p className="text-xs text-text-primary font-medium leading-snug mb-2.5 pr-5">
                            {task.title}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[11px] font-semibold flex items-center gap-0.5"
                                style={{ color: prio.color }}
                              >
                                <Flag className="w-2.5 h-2.5" />
                              </span>
                              {task.business_value && (
                                <span
                                  className="text-[11px] text-[#58A6FF] font-mono"
                                  title="Valor Negocio"
                                >
                                  V:{task.business_value}
                                </span>
                              )}
                              {task.due_date && (
                                <span className="text-[11px] text-text-muted flex items-center gap-0.5">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {new Date(task.due_date).toLocaleDateString('es-ES', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                              )}
                            </div>

                            {/* Move dropdown */}
                            <div
                              className="relative group/move"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-white transition-all p-1 bg-surface-elevated rounded-lg border border-borders-subtle">
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <div className="absolute right-0 top-7 bg-surface-card border border-borders-subtle rounded-xl py-1 hidden group-hover/move:block z-10 w-36 shadow-xl">
                                {nextCols.map((nc) => (
                                  <button
                                    key={nc.id}
                                    onClick={() => moveTask(task.id, nc.id)}
                                    className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-white hover:bg-surface-elevated flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ background: nc.color }}
                                    />
                                    {nc.label}
                                  </button>
                                ))}
                                <div className="border-t border-borders-subtle mt-1 pt-1">
                                  <button
                                    onClick={() => deleteTask(task.id)}
                                    className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-red-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" /> Eliminar
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => {
                        setEditingTask(null);
                        setInitialStatus(col.id);
                        setModalOpen(true);
                      }}
                      className="w-full py-2 text-xs text-text-muted hover:text-white hover:bg-surface-elevated rounded-xl transition-all flex items-center justify-center gap-1 border border-dashed border-borders-subtle"
                    >
                      <Plus className="w-3 h-3" /> Añadir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modalOpen && (
          <TaskModal
            projectId={project?.id}
            userId={user?.id || tasks[0]?.user_id}
            initialStatus={initialStatusForNew}
            existingTask={editingTask}
            allTasks={tasks}
            milestones={milestones}
            dependencies={dependencies}
            onClose={() => setModalOpen(false)}
            onSaved={fetchData}
          />
        )}
      </div>
    </div>
  );
}

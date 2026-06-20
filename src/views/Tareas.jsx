'use client';
import TaskComments from '../components/TaskComments';
import PresenceAvatars from '../components/PresenceAvatars';
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
import { sileo } from 'sileo';
import Select from 'react-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  btnDangerStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  kanbanCardStyle,
  kanbanColumnHeaderStyle,
  kanbanColumnStyle,
  panelHeaderStripStyle,
  pillStyle,
  sectionSurfaceStyle,
} from '@/chrome/morphology';
import {
  getWorkspaceFilterBarStyle,
  getWorkspacePageContentStyle,
  getWorkspacePageShellStyle,
  getWorkspaceStatusPillStyle,
} from './workspacePageChrome';
import {
  buildDocOpsTaskPrompt,
  enforceDocOpsGateOnLaunchCommand,
  shellQuotePrompt,
} from '@/lib/docopsPrompts';
import { TASK_STATUS_LABELS } from '@/lib/taskStatuses';

const COLOR_VARS = {
  muted: 'var(--text-muted)',
  primary: 'var(--accent-primary)',
  pending: 'var(--warning, var(--accent-secondary))',
  in_progress: 'var(--accent-cyan)',
  qa_ready: 'var(--accent-primary)',
  pink: 'var(--accent-pink)',
  danger: 'var(--danger)',
  success: 'var(--success)',
  high: 'var(--accent-orange, var(--accent-secondary))',
  medium: 'var(--warning, var(--accent-primary))',
};

const COLUMNS = [
  {
    id: 'pending',
    label: TASK_STATUS_LABELS.pending,
    color: COLOR_VARS.pending,
    bg: `color-mix(in srgb, ${COLOR_VARS.pending} 15%, transparent)`,
  },
  {
    id: 'in_progress',
    label: TASK_STATUS_LABELS.in_progress,
    color: COLOR_VARS.in_progress,
    bg: `color-mix(in srgb, ${COLOR_VARS.in_progress} 15%, transparent)`,
  },
  {
    id: 'qa_ready',
    label: TASK_STATUS_LABELS.qa_ready,
    color: COLOR_VARS.qa_ready,
    bg: `color-mix(in srgb, ${COLOR_VARS.qa_ready} 15%, transparent)`,
  },
  {
    id: 'blocked',
    label: TASK_STATUS_LABELS.blocked,
    color: COLOR_VARS.danger,
    bg: `color-mix(in srgb, ${COLOR_VARS.danger} 15%, transparent)`,
  },
  {
    id: 'completed',
    label: TASK_STATUS_LABELS.completed,
    color: COLOR_VARS.success,
    bg: `color-mix(in srgb, ${COLOR_VARS.success} 15%, transparent)`,
  },
];

const PRIORITY = {
  critical: { label: 'Crítica', color: COLOR_VARS.pink, val: 4 },
  high: { label: 'Alta', color: COLOR_VARS.high, val: 3 },
  medium: { label: 'Media', color: COLOR_VARS.medium, val: 2 },
  low: { label: 'Baja', color: COLOR_VARS.muted, val: 1 },
};

function mixChromeAccent(accent = 'var(--accent-primary)', amount = 18) {
  return `color-mix(in srgb, ${accent} ${amount}%, var(--chrome-border-color))`;
}

function resolveAccent(accent = 'var(--accent-primary)', accentVar) {
  return accentVar || accent;
}

function getTaskFieldChromeStyle() {
  return {
    background: 'var(--chrome-control-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
    color: 'var(--text-primary)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

function getTaskIconBadgeStyle(accent = 'var(--accent-primary)') {
  const resolvedAccent = resolveAccent(accent);
  return {
    ...chromeSurfaceStyle({ surface: 'pill', tone: 'accent' }),
    width: '1.9rem',
    height: '1.9rem',
    borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
    background: `color-mix(in srgb, ${resolvedAccent} 12%, var(--chrome-control-fill-hover))`,
    borderColor: mixChromeAccent(resolvedAccent, 28),
    color: resolvedAccent,
  };
}

export function getTaskModalShellStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'panel', emphasized: true }),
    background: 'var(--chrome-panel-fill-emphasis)',
    borderRadius: '0',
    backdropFilter: 'none',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getToolbarToggleRailStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'pill' }),
    background: 'var(--chrome-control-fill)',
    borderRadius: 'calc(var(--chrome-radius-control) + 2px)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getFilterPillChromeStyle({
  active = false,
  accent = 'var(--accent-primary)',
  accentVar,
} = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);

  if (active) {
    return {
      ...pillStyle({ tone: 'accent' }),
      background: `color-mix(in srgb, ${resolvedAccent} 12%, var(--chrome-control-fill-hover))`,
      borderColor: mixChromeAccent(resolvedAccent, 28),
      color: resolvedAccent,
    };
  }

  return {
    ...pillStyle(),
    background: 'var(--chrome-control-fill)',
    borderColor: 'var(--chrome-border-color)',
  };
}

export function getTaskCardChromeStyle({
  blocked = false,
  accent = 'var(--accent-primary)',
  accentVar,
} = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...kanbanCardStyle(),
    background: blocked
      ? 'color-mix(in srgb, var(--danger) 8%, var(--chrome-panel-fill))'
      : 'var(--chrome-panel-fill)',
    borderColor: blocked
      ? 'color-mix(in srgb, var(--danger) 30%, var(--chrome-border-color))'
      : mixChromeAccent(resolvedAccent, 18),
    borderRadius: 'calc(var(--chrome-radius-panel) - 2px)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getMoveMenuChromeStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'panel', emphasized: true }),
    background: 'var(--chrome-panel-fill-emphasis)',
    borderRadius: 'calc(var(--chrome-radius-panel) - 2px)',
  };
}

export function getQueueHeroStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'panel', emphasized: true }),
    background: 'var(--chrome-panel-fill-emphasis)',
    borderRadius: 'var(--chrome-radius-panel)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getQueueRowStyle({ accent = 'var(--accent-primary)', accentVar } = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...chromeSurfaceStyle({ surface: 'panel' }),
    background: 'var(--chrome-panel-fill)',
    borderColor: mixChromeAccent(resolvedAccent, 22),
    borderRadius: 'calc(var(--chrome-radius-panel) - 2px)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getKanbanDetailPillStyle({ accent = 'var(--accent-primary)', accentVar } = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...pillStyle(),
    background: `color-mix(in srgb, ${resolvedAccent} 10%, var(--chrome-control-fill))`,
    borderColor: mixChromeAccent(resolvedAccent, 24),
    borderWidth: 'var(--chrome-border-width)',
    borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
    color: 'var(--text-secondary)',
  };
}

export function getKanbanColumnShellStyle({ accent = 'var(--accent-primary)', accentVar } = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...kanbanColumnStyle(),
    background: 'var(--chrome-panel-fill)',
    borderColor: mixChromeAccent(resolvedAccent, 20),
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getKanbanColumnHeaderStyle({ accent = 'var(--accent-primary)', accentVar } = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...kanbanColumnHeaderStyle(),
    background: `color-mix(in srgb, ${resolvedAccent} 20%, var(--chrome-panel-fill-emphasis))`,
    borderBottomColor: mixChromeAccent(resolvedAccent, 34),
  };
}

export function getKanbanColumnCountStyle({ accent = 'var(--accent-primary)', accentVar } = {}) {
  const resolvedAccent = resolveAccent(accent, accentVar);
  return {
    ...pillStyle(),
    background: `color-mix(in srgb, ${resolvedAccent} 16%, var(--chrome-control-fill-hover))`,
    borderColor: mixChromeAccent(resolvedAccent, 32),
    color: resolvedAccent,
    minWidth: '2.5rem',
  };
}

// Custom select styles matching PlanningMode design
const selectStyles = {
  control: (base, state) => ({
    ...base,
    ...getTaskFieldChromeStyle(),
    borderColor: state.isFocused
      ? mixChromeAccent('var(--accent-primary)', 30)
      : 'var(--chrome-border-color)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    boxShadow: state.isFocused
      ? 'var(--chrome-shadow-control), 0 0 0 1px color-mix(in srgb, var(--accent-primary) 26%, transparent)'
      : 'var(--chrome-shadow-control)',
    minHeight: '36px',
    '&:hover': { borderColor: mixChromeAccent('var(--accent-primary)', 20) },
  }),
  menu: (base) => ({
    ...base,
    ...getMoveMenuChromeStyle(),
    overflow: 'hidden',
  }),
  option: (base, state) => ({
    ...base,
    background: state.isFocused ? 'var(--chrome-control-fill-hover)' : 'transparent',
    color: 'var(--text-primary)',
    fontSize: '12px',
  }),
  multiValue: (base) => ({
    ...base,
    ...getKanbanDetailPillStyle(),
    borderRadius: 'calc(var(--chrome-radius-control) - 4px)',
  }),
  multiValueLabel: (base) => ({ ...base, color: 'var(--text-primary)', fontSize: '11px' }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'var(--text-muted)',
    '&:hover': {
      background: 'color-mix(in srgb, var(--danger) 16%, transparent)',
      color: 'var(--danger)',
    },
  }),
  placeholder: (base) => ({ ...base, color: 'var(--text-muted)', fontSize: '12px' }),
  input: (base) => ({ ...base, color: 'var(--text-primary)' }),
  singleValue: (base) => ({ ...base, color: 'var(--text-primary)' }),
};

// ─── Styled Select Wrapper ────────────────────────────────────────────────────
function StyledSelect({ label, value, onChange, options, placeholder }) {
  const fieldStyle = getTaskFieldChromeStyle();

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
          className="w-full appearance-none bg-surface-app border border-borders-strong px-3 py-2 pr-8 text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]/50 focus:ring-1 focus:ring-[var(--accent-primary)]/10 transition-colors cursor-pointer"
          style={fieldStyle}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface-card">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        />
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
        sileo.error({ title: 'Error al actualizar' });
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
        sileo.error({ title: 'Error al crear tarea' });
        setSaving(false);
        return;
      }
      targetTaskId = data.id;
    }

    if (targetTaskId) {
      await db.from('task_dependencies').delete().eq('task_id', targetTaskId).eq('tipo', 'blocks');
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
    sileo.success({ title: existingTask ? 'Tarea actualizada' : 'Tarea creada' });
    onSaved();
    onClose();
  }

  const taskOptions = allTasks
    .filter((t) => t.id !== existingTask?.id)
    .map((t) => ({ value: t.id, label: t.title }));

  const modalShellStyle = getTaskModalShellStyle();
  const iconBadgeStyle = getTaskIconBadgeStyle();
  const fieldStyle = getTaskFieldChromeStyle();

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg flex flex-col max-h-[92vh]"
        data-testid="task-modal-shell"
        style={modalShellStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={panelHeaderStripStyle()}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 border flex items-center justify-center" style={iconBadgeStyle}>
              <ListTodo
                className="w-3.5 h-3.5"
                strokeWidth={1.5}
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>
            <h2 className="font-mono font-bold text-text-primary text-sm">
              {existingTask ? 'Editar Tarea' : 'Nueva Tarea'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white transition-colors cursor-pointer"
            style={{
              ...btnSecondaryStyle({ size: 'xs' }),
              width: '1.75rem',
              minWidth: '1.75rem',
              padding: 0,
              color: 'var(--text-muted)',
            }}
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
                className="w-full bg-surface-app border border-borders-strong px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]/50 focus:ring-1 focus:ring-[var(--accent-primary)]/10 transition-colors cursor-pointer"
                style={fieldStyle}
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
                className="w-full bg-surface-app border border-borders-strong px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]/50 focus:ring-1 focus:ring-[var(--accent-primary)]/10 transition-colors resize-none leading-relaxed cursor-pointer"
                style={fieldStyle}
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
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border transition-all"
                      style={
                        form.priority === k
                          ? {
                              ...pillStyle(),
                              background: `color-mix(in srgb, ${v.color} 12%, var(--chrome-control-fill))`,
                              borderColor: mixChromeAccent(v.color, 30),
                              borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
                              color: v.color,
                            }
                          : {
                              ...pillStyle(),
                              borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
                              color: 'var(--text-muted)',
                            }
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
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    style={{ accentColor: 'var(--accent-primary)' }}
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
            <div
              className="pt-1"
              style={{ borderTop: `var(--chrome-border-width) solid var(--chrome-border-color)` }}
            >
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
              <div
                className="p-3"
                style={getTaskCardChromeStyle({ accent: 'var(--accent-primary)' })}
              >
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
            <div
              className="mt-6 pt-6"
              style={{ borderTop: `var(--chrome-border-width) solid var(--chrome-border-color)` }}
            >
              <TaskComments taskId={existingTask.id} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex gap-2"
          style={{
            ...sectionSurfaceStyle(),
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            borderRadius: 0,
            boxShadow: 'none',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-borders-strong text-text-muted text-sm hover:text-white hover:border-borders-strong transition-all"
            style={btnSecondaryStyle({ size: 'md' })}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="task-form"
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            style={{ ...btnPrimaryStyle({ size: 'md' }), flex: 1 }}
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
    sileo.success({ title: 'Prompt de Agente Copiado' });
    setCopiedTask(task.id);
    setTimeout(() => setCopiedTask(null), 2000);
  };

  const handleRunAgent = async (task) => {
    if (!project?.id) return;

    const agentId = `worker-sdd-orchestrator-${Date.now()}`;

    // Telemetría UI inmediata
    try {
      const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
      hints[agentId] = task.title;
      localStorage.setItem('devhub_agent_task_hints', JSON.stringify(hints));
    } catch {
      // Ignore localStorage failures (private mode / storage disabled)
    }

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
      sileo.success({ title: `Enviando a terminal para: ${task.title}` });
    }, 150);
  };

  return (
    <div className="space-y-3">
      <div
        className="border px-5 py-4 flex items-start justify-between gap-4"
        data-testid="agent-queue-hero"
        style={getQueueHeroStyle()}
      >
        <div className="flex items-start gap-4">
          <div className="p-2.5 border" style={getTaskIconBadgeStyle()}>
            <Bot className="w-5 h-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse border"
                style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                autonomous execution queue
              </span>
            </div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-text-primary">
              [A] task launch rail
            </h3>
            <p className="mt-1 max-w-[44ch] text-xs leading-relaxed text-text-muted">
              Pending tasks ranked by urgency, business value, and unblock impact. Launch from here
              when the board says go.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
          >
            {queue.length} ready
          </span>
        </div>
      </div>

      {queue.length === 0 ? (
        <div
          className="p-10 text-center border border-dashed border-borders-subtle rounded-none"
          style={getQueueRowStyle()}
        >
          <Bot className="w-8 h-8 text-text-muted mx-auto mb-2" strokeWidth={1} />
          <p className="text-sm text-text-muted">No hay tareas libres disponibles para agentes.</p>
        </div>
      ) : (
        <div className="space-y-2.5 mt-2">
          {queue.map((task, i) => (
            <div
              key={task.id}
              className="bg-surface-card border border-borders-subtle rounded-none p-4 flex items-center justify-between group hover:border-[var(--accent-primary)]/30 transition-all"
              data-testid={`agent-queue-row-${task.id}`}
              style={getQueueRowStyle({ accent: task.priorityObj.color })}
            >
              <div className="flex-1 flex items-center gap-4">
                <div
                  className="flex flex-col items-center justify-center w-12 h-12 shrink-0"
                  style={getTaskCardChromeStyle({ accent: task.priorityObj.color })}
                >
                  <span className="text-white font-mono font-bold text-sm leading-none">
                    {task.score.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-muted uppercase mt-0.5">Score</span>
                </div>
                <div>
                  <h4 className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-white">
                    {task.title}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 opacity-80">
                    <span
                      className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-1"
                      style={{ color: task.priorityObj.color }}
                    >
                      <Flag className="w-3 h-3" /> {task.priorityObj.label}
                    </span>
                    {task.m_title && (
                      <span
                        className="text-xs text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded-md border border-borders-subtle"
                        style={getKanbanDetailPillStyle({ accent: task.priorityObj.color })}
                      >
                        {task.m_title}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                      unlocks {task.unlocks}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(task);
                  }}
                  className="bg-surface-elevated text-text-muted hover:text-white px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-all border border-borders-subtle hover:border-borders-strong"
                  title="Copiar prompt"
                  style={{ ...btnSecondaryStyle({ size: 'sm' }), color: 'var(--text-muted)' }}
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
                  className="px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-all"
                  style={btnPrimaryStyle({ size: 'sm' })}
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
    sileo.success({ title: 'Tarea movida', description: `→ ${col?.label}` });
  }

  async function deleteTask(taskId) {
    await db.from('tasks').delete().eq('id', taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    sileo.success({ title: 'Tarea eliminada' });
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
    <div className="h-full flex flex-col" style={getWorkspacePageShellStyle()}>
      {/* Content */}
      <div
        className="flex-1 overflow-hidden flex flex-col gap-5 min-h-0"
        style={getWorkspacePageContentStyle()}
      >
        <div className="shrink-0 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="border px-5 py-4" style={getQueueHeroStyle()}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse border"
                style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                workspace task grid
              </span>
            </div>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="font-mono text-base font-bold uppercase tracking-[0.22em] text-white">
                  [+] task_kanban_board
                </h2>
                <p className="mt-1 max-w-[56ch] text-xs leading-relaxed text-text-muted">
                  Wider execution board for blockers, milestones, and movement between lanes. Built
                  to feel closer to the brutalist preview, not a soft SaaS grid.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:min-w-[420px]">
                {COLUMNS.map((column) => {
                  const count = visibleTasks.filter((task) => task.status === column.id).length;
                  return (
                    <div
                      key={`hero-count-${column.id}`}
                      className="border px-3 py-2"
                      style={getKanbanColumnCountStyle({ accent: column.color })}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                        {column.label}
                      </div>
                      <div className="mt-1 font-mono text-xl font-bold leading-none">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="border px-5 py-4" style={getQueueRowStyle()}>
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    className="flex items-center gap-1 border p-1"
                    style={getToolbarToggleRailStyle()}
                  >
                    <Button
                      onClick={() => setViewMode('kanban')}
                      variant={viewMode === 'kanban' ? 'devhubGlass' : 'devhubGhost'}
                      size="toolbar"
                      className={viewMode === 'kanban' ? 'text-text-primary' : ''}
                      style={viewMode === 'kanban' ? pillStyle({ tone: 'accent' }) : pillStyle()}
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" /> Tablero
                    </Button>
                    <Button
                      onClick={() => setViewMode('agent')}
                      variant={viewMode === 'agent' ? 'devhubGlass' : 'devhubGhost'}
                      size="toolbar"
                      className={viewMode === 'agent' ? 'text-[var(--text-primary)]' : ''}
                      style={viewMode === 'agent' ? pillStyle({ tone: 'accent' }) : pillStyle()}
                    >
                      <Bot className="w-3.5 h-3.5" /> Cola Agente
                    </Button>
                  </div>

                  <PresenceAvatars projectId={project?.id} />
                </div>

                <Button
                  onClick={() => {
                    setEditingTask(null);
                    setInitialStatus('pending');
                    setModalOpen(true);
                  }}
                  variant="devhubPrimary"
                  size="toolbar"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Añadir Tarea
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div
                  className="border px-3 py-2"
                  style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    visible
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold leading-none">
                    {visibleTasks.length}
                  </div>
                </div>
                <div
                  className="border px-3 py-2"
                  style={getWorkspaceStatusPillStyle({ tone: 'neutral' })}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    filtered
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold leading-none">
                    {activeFiltersCount}
                  </div>
                </div>
                <div
                  className="border px-3 py-2"
                  style={getWorkspaceStatusPillStyle({ tone: 'neutral' })}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    milestones
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold leading-none">
                    {milestones.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        {viewMode === 'kanban' && (
          <div
            className="shrink-0 border p-4 flex flex-wrap items-center gap-3"
            style={getWorkspaceFilterBarStyle()}
            data-testid="tareas-filter-bar"
          >
            {/* Filter icon + label */}
            <div className="flex items-center gap-2 text-text-muted pr-3 border-r border-borders-subtle mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">
                signal filters
              </span>
              {activeFiltersCount > 0 && (
                <span
                  className="text-[11px] text-white w-6 h-6 flex items-center justify-center font-bold"
                  style={getKanbanColumnCountStyle({ accentVar: 'var(--accent-primary)' })}
                >
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
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary placeholder-[var(--text-muted)] pl-7 pr-3 py-1.5 w-44 outline-none focus:border-[var(--accent-primary)]/40 focus:ring-1 focus:ring-[var(--accent-primary)]/10 transition-colors cursor-pointer"
                style={getTaskFieldChromeStyle()}
              />
            </div>

            {/* Milestone filter */}
            <div className="relative">
              <Milestone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
              <select
                value={fMilestone}
                onChange={(e) => setFMilestone(e.target.value)}
                className="appearance-none bg-surface-app border border-borders-subtle text-xs text-text-primary pl-7 pr-7 py-1.5 outline-none focus:border-[var(--accent-primary)]/40 cursor-pointer"
                style={getTaskFieldChromeStyle()}
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
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] border transition-all"
              style={fUnlocked ? pillStyle({ tone: 'accent' }) : pillStyle()}
            >
              <Zap className="w-3 h-3" /> Solo desbloqueadas
            </button>
            <button
              onClick={() => setFMyTasks((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] border transition-all"
              style={fMyTasks ? pillStyle({ tone: 'success' }) : pillStyle()}
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
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
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
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:overflow-hidden"
            data-testid="kanban-board"
          >
            <div className="grid min-h-0 grid-cols-1 gap-5 xl:h-full xl:grid-cols-4">
              {COLUMNS.map((col) => {
                const colTasks = visibleTasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    data-testid={`kanban-column-${col.id}`}
                    className="flex min-h-0 flex-col overflow-hidden xl:h-full"
                    style={getKanbanColumnShellStyle({ accent: col.color })}
                  >
                    {/* Column header */}
                    <div
                      className="flex items-start justify-between gap-3 px-4 py-4 border-b border-borders-subtle"
                      style={getKanbanColumnHeaderStyle({ accent: col.color })}
                    >
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 border ${col.id === 'in_progress' || col.id === 'qa_ready' ? 'animate-pulse' : ''}`}
                            style={{
                              background: col.color,
                              borderColor: mixChromeAccent(col.color, 28),
                            }}
                          />
                          <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                            {col.id.replace('_', ' ')}
                          </span>
                        </div>
                        <span
                          className="font-mono text-xs font-bold uppercase tracking-[0.2em]"
                          style={{ color: col.color }}
                        >
                          {col.label}
                        </span>
                      </div>
                      <span
                        className="font-mono text-sm font-bold px-3 py-2 text-center"
                        style={getKanbanColumnCountStyle({ accent: col.color })}
                      >
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Tasks */}
                    <div
                      className="kanban-column-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pr-2"
                      data-testid={`kanban-column-body-${col.id}`}
                      style={{ '--kanban-column-accent': col.color }}
                    >
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
                            className="border px-4 py-4 transition-all cursor-pointer group relative z-0 border-borders-subtle hover:border-borders-strong hover:-translate-y-px"
                            data-testid={`task-card-${task.id}`}
                            style={getTaskCardChromeStyle({
                              blocked: isBlocked,
                              accent: prio.color,
                            })}
                          >
                            {isBlocked && (
                              <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-danger">
                                <ShieldAlert className="w-3 h-3" /> BLOQUEADA
                              </div>
                            )}
                            <p className="mb-3 pr-5 font-mono text-[11px] font-bold uppercase leading-snug tracking-[0.14em] text-text-primary">
                              {task.title}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="text-[10px] font-semibold uppercase tracking-[0.18em] flex items-center gap-1"
                                  style={{ color: prio.color }}
                                >
                                  <Flag className="w-3 h-3" /> {prio.label}
                                </span>
                                {task.business_value && (
                                  <span
                                    className="px-2 py-1 text-[10px] text-[var(--accent-primary)] font-mono uppercase tracking-[0.18em]"
                                    title="Valor Negocio"
                                    style={getKanbanDetailPillStyle({
                                      accentVar: 'var(--accent-primary)',
                                    })}
                                  >
                                    V:{task.business_value}
                                  </span>
                                )}
                                {task.due_date && (
                                  <span
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-text-muted border"
                                    style={getKanbanDetailPillStyle({ accent: prio.color })}
                                  >
                                    <Calendar className="w-3 h-3" />
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
                                <button
                                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-white transition-all p-1.5 bg-surface-elevated border border-borders-subtle"
                                  style={{
                                    ...btnSecondaryStyle({ size: 'xs' }),
                                    padding: '0.375rem',
                                    minWidth: 'auto',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                <div
                                  className="absolute right-0 top-8 bg-surface-card border border-borders-subtle py-1 hidden group-hover/move:block z-20 w-40 shadow-xl"
                                  data-testid={`task-move-menu-${task.id}`}
                                  style={getMoveMenuChromeStyle()}
                                >
                                  {nextCols.map((nc) => (
                                    <button
                                      key={nc.id}
                                      onClick={() => moveTask(task.id, nc.id)}
                                      className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-white hover:bg-surface-elevated flex items-center gap-2 transition-colors cursor-pointer"
                                      style={{
                                        ...pillStyle(),
                                        width: '100%',
                                        justifyContent: 'flex-start',
                                        borderRadius: 'calc(var(--chrome-radius-control) - 2px)',
                                        color: 'var(--text-muted)',
                                      }}
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
                                      style={{
                                        ...btnDangerStyle({ size: 'xs' }),
                                        width: '100%',
                                        justifyContent: 'flex-start',
                                      }}
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
                        className="w-full py-3 text-[10px] font-semibold uppercase tracking-[0.2em] hover:text-white transition-all flex items-center justify-center gap-1 border"
                        style={{
                          ...btnSecondaryStyle({ size: 'sm' }),
                          width: '100%',
                          borderRadius: 0,
                          borderStyle: 'solid',
                          borderColor: col.color,
                          background: `color-mix(in srgb, ${col.color} 18%, var(--chrome-control-fill))`,
                          color: 'var(--text-primary)',
                          boxShadow: 'var(--chrome-shadow-control)',
                        }}
                      >
                        <Plus className="w-3 h-3" /> Añadir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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

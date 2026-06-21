'use client';
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import useSupabaseRealtime from '@/hooks/useSupabaseRealtime';
import {
  MapPin,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  X,
  AlertTriangle,
  Zap,
  Trash2,
  Flag,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { sileo } from 'sileo';
import { DatePicker } from '@/components/ui/date-picker';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import StatusSignal from '@/components/ui/StatusSignal';
import { UiHeader } from '@/components/ui/system/ui-header';
import {
  getWorkspaceDataTileStyle,
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspaceSectionHeaderStripStyle,
  getWorkspaceSectionSurfaceStyle,
  getWorkspaceStatusPillStyle,
} from './workspacePageChrome';
import {
  inputStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  btnDangerStyle,
  panelStyle,
  progressTrackStyle,
  progressFillStyle,
  pillStyle,
} from '@/chrome/morphology';

const STATUS_CFG = {
  planned: { label: 'Planificado', color: 'var(--text-muted)', pulse: false, tone: 'neutral' },
  in_progress: { label: 'En Progreso', color: 'var(--accent-cyan)', pulse: true, tone: 'info' },
  completed: { label: 'Completado', color: 'var(--success)', pulse: false, tone: 'success' },
  at_risk: { label: 'En Riesgo', color: 'var(--danger)', pulse: true, tone: 'danger' },
};

function getRoadmapTone(status) {
  return STATUS_CFG[status]?.tone || 'neutral';
}

function MilestoneModal({ projectId, userId, onClose, onCreated }) {
  const db = createClient();
  const [form, setForm] = useState({ title: '', description: '', status: 'planned', due_date: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await db.from('milestones').insert({
      ...form,
      project_id: projectId,
      user_id: userId,
      due_date: form.due_date || null,
    });
    setSaving(false);
    if (error) {
      sileo.error({ title: 'Error al crear hito' });
      return;
    }
    sileo.success({ title: 'Hito creado' });
    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
    >
      <div
        className="p-6 w-full max-w-md fade-in-up"
        style={getWorkspaceSectionSurfaceStyle({ emphasized: true })}
      >
        <div
          className="-mx-6 -mt-6 mb-5 flex items-center justify-between px-6 py-4"
          style={getWorkspaceSectionHeaderStripStyle({ tone: 'accent' })}
        >
          <h2 className="font-mono font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            Nuevo Hito del Roadmap
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="cursor-pointer shrink-0 hover:-translate-y-px active:translate-y-0"
            style={{
              ...btnSecondaryStyle({ size: 'xs' }),
              padding: 0,
              width: '1.75rem',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              Título *
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Nombre del hito o fase..."
              className="w-full px-3 py-2 text-sm focus:outline-none transition-colors cursor-pointer"
              style={inputStyle()}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              Descripción
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="¿Qué se entregará en este hito?"
              className="w-full px-3 py-2 text-sm focus:outline-none transition-colors resize-none cursor-pointer"
              style={{ ...inputStyle(), minHeight: '4rem' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Estado
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full text-sm px-3 py-2 focus:outline-none appearance-none cursor-pointer"
                style={inputStyle()}
              >
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Fecha objetivo
              </label>
              <DatePicker
                value={form.due_date}
                onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer"
              style={btnSecondaryStyle({ size: 'md' })}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer disabled:opacity-50"
              style={btnPrimaryStyle({ size: 'md' })}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear Hito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Roadmap() {
  const { project } = useOutletContext() || {};
  const db = createClient();

  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = 'local-user';
  const [showModal, setShowModal] = useState(false);

  const fetchMilestones = useCallback(
    async ({ silent = false } = {}) => {
      if (!project?.id) return;
      if (!silent) setLoading(true);
      const { data } = await db
        .from('milestones')
        .select('*')
        .eq('project_id', project.id)
        .order('due_date', { ascending: true, nullsFirst: false });
      setMilestones(data || []);
      if (!silent) setLoading(false);
    },
    [project?.id]
  );

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  useSupabaseRealtime({
    table: 'milestones',
    filter: project?.id ? `project_id=eq.${project.id}` : undefined,
    onInsert: () => fetchMilestones({ silent: true }),
    onUpdate: () => fetchMilestones({ silent: true }),
    onDelete: () => fetchMilestones({ silent: true }),
    enabled: Boolean(project?.id),
    channelName: `public:milestones:${project?.id || 'none'}`,
  });

  async function toggleComplete(milestone) {
    const newStatus = milestone.status === 'completed' ? 'in_progress' : 'completed';
    await db.from('milestones').update({ status: newStatus }).eq('id', milestone.id);
    setMilestones((prev) =>
      prev.map((m) => (m.id === milestone.id ? { ...m, status: newStatus } : m))
    );
    sileo.success({ title: newStatus === 'completed' ? 'Hito completado' : 'Hito reabierto' });
  }

  async function deleteMilestone(id) {
    await db.from('milestones').delete().eq('id', id);
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    sileo.success({ title: 'Hito eliminado' });
  }

  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = 'var(--accent-primary)';

  return (
    <div
      className="min-h-screen core-page-shell"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky header */}
      <UiHeader sticky data-testid="ui-header">
        <UiHeader.Title>
          <div className="flex items-center gap-3">
            <WorkspacePageTitle icon={MapPin} title="Roadmap" projectName={project?.name} />
          </div>
        </UiHeader.Title>
        <UiHeader.Actions>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 hover:-translate-y-px active:translate-y-0"
            style={btnSecondaryStyle({ size: 'sm' })}
          >
            <Plus
              className="w-3.5 h-3.5"
              strokeWidth={2}
              style={{ color: 'var(--accent-primary)' }}
            />
            Añadir Hito
          </button>
        </UiHeader.Actions>
      </UiHeader>

      <div style={getWorkspacePageContentStyle()}>
        {/* Progress card */}
        <div
          className="overflow-hidden mb-6 fade-in-up rounded-none"
          style={getWorkspaceSectionSurfaceStyle({ emphasized: true })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={getWorkspaceSectionHeaderStripStyle({ tone: 'accent' })}
          >
            <div
              className="w-9 h-9 flex items-center justify-center"
              style={getWorkspaceDataTileStyle(accentColor)}
            >
              <Flag className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <div>
              <h3 className="typography-card-title" style={{ color: 'var(--text-primary)' }}>
                Progreso del Proyecto
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {completed} de {total} hitos completados
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Avance total
              </p>
              <span
                className="typography-data text-3xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {progress}%
              </span>
            </div>
            <div
              className="h-[6px] overflow-hidden border border-[var(--border-subtle)]"
              style={progressTrackStyle()}
            >
              <div
                className="h-full transition-all duration-1000"
                style={{
                  ...progressFillStyle(),
                  width: `${progress}%`,
                  background: 'var(--accent-primary)',
                }}
              />
            </div>
            <div
              className="flex justify-between mt-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{completed} completados</span>
              <span>{total - completed} pendientes</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="overflow-hidden fade-in-up" style={panelStyle()}>
            <div className="flex items-center justify-center py-20">
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>
          </div>
        ) : milestones.length === 0 ? (
          <div className="overflow-hidden fade-in-up" style={panelStyle()}>
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center p-6">
              <div className="w-14 h-14 flex items-center justify-center" style={pillStyle()}>
                <MapPin
                  className="w-7 h-7"
                  strokeWidth={1.5}
                  style={{ color: 'var(--text-muted)' }}
                />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No hay hitos todavía.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="cursor-pointer hover:-translate-y-px active:translate-y-0"
                style={btnPrimaryStyle({ size: 'sm' })}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Añadir el primer hito
              </button>
            </div>
          </div>
        ) : (
          <div className="relative fade-in-up">
            {/* Timeline line */}
            <div
              className="absolute left-5 top-0 bottom-0 w-px"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div className="space-y-4">
              {milestones.map((ms, i) => {
                const cfg = STATUS_CFG[ms.status] || STATUS_CFG.planned;
                const isOverdue =
                  ms.due_date && new Date(ms.due_date) < new Date() && ms.status !== 'completed';
                return (
                  <div
                    key={ms.id}
                    className="relative pl-14 group"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Timeline dot */}
                    <div
                      className="absolute left-3 top-5 w-4 h-4 rounded-none border-2 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                      style={{
                        borderColor: cfg.color,
                        background: ms.status === 'completed' ? cfg.color : 'var(--surface-app)',
                        boxShadow: 'var(--chrome-shadow-control)',
                      }}
                      onClick={() => toggleComplete(ms)}
                      title="Clic para marcar completado"
                    >
                      {ms.status === 'completed' && (
                        <CheckCircle2
                          className="w-2.5 h-2.5"
                          strokeWidth={2.5}
                          style={{ color: 'var(--surface-app)' }}
                        />
                      )}
                      {cfg.pulse && ms.status !== 'completed' && (
                        <StatusSignal compact tone={cfg.tone} animation="blink" />
                      )}
                    </div>

                    {/* Milestone card */}
                    <div
                      className="overflow-hidden transition-all hover:bg-surface-elevated rounded-none"
                      style={{
                        ...panelStyle({
                          emphasized: ms.status !== 'planned',
                          tone: isOverdue ? 'danger' : 'neutral',
                        }),
                        borderRadius: 'var(--chrome-radius-panel)',
                      }}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center justify-between px-6 py-4 gap-3"
                        style={getWorkspaceSectionHeaderStripStyle({
                          tone: cfg.tone === 'neutral' ? 'neutral' : 'accent',
                        })}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 flex items-center justify-center shrink-0"
                            style={pillStyle({ tone: cfg.tone })}
                          >
                            <MapPin className="w-4 h-4" style={{ color: cfg.color }} />
                          </div>
                          <div className="min-w-0">
                            <h3
                              className={`font-bold text-sm uppercase tracking-wider truncate ${
                                ms.status === 'completed' ? 'line-through' : ''
                              }`}
                              style={{
                                color:
                                  ms.status === 'completed'
                                    ? 'var(--text-muted)'
                                    : 'var(--text-primary)',
                              }}
                            >
                              {ms.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <StatusSignal
                                label={cfg.label}
                                tone={getRoadmapTone(ms.status)}
                                animation={
                                  cfg.pulse && ms.status !== 'completed' ? 'blink' : 'none'
                                }
                              />
                              {isOverdue && (
                                <StatusSignal label="Vencido" tone="danger" animation="blink" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleComplete(ms)}
                            className="cursor-pointer hover:-translate-y-px active:translate-y-0"
                            style={{
                              ...pillStyle({
                                tone: ms.status === 'completed' ? 'neutral' : 'accent',
                              }),
                              cursor: 'pointer',
                            }}
                          >
                            {ms.status === 'completed' ? 'Reabrir' : 'Completar'}
                          </button>
                          <button
                            onClick={() => deleteMilestone(ms.id)}
                            className="opacity-0 group-hover:opacity-100 hover:-translate-y-px active:translate-y-0 cursor-pointer"
                            style={{
                              ...btnDangerStyle({ size: 'xs' }),
                              padding: 0,
                              width: '1.75rem',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card content */}
                      <div className="p-6">
                        {ms.description && (
                          <p
                            className="text-xs leading-relaxed mb-3"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {ms.description}
                          </p>
                        )}
                        {ms.due_date && (
                          <div
                            className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 text-[11px]"
                            style={getWorkspaceStatusPillStyle()}
                          >
                            <Clock className="w-3 h-3" strokeWidth={1.5} />
                            <span>
                              Objetivo:{' '}
                              {new Date(ms.due_date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <MilestoneModal
          projectId={project?.id}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={fetchMilestones}
        />
      )}
    </div>
  );
}

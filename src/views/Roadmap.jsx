'use client';
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
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
  Hash,
  Flag,
} from 'lucide-react';
import { createClient } from '@/lib/db/localSupabase';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';

const STATUS_CFG = {
  planned: { label: 'Planificado', color: '#484F58', pulse: false },
  in_progress: { label: 'En Progreso', color: '#58A6FF', pulse: true },
  completed: { label: 'Completado', color: '#3FB950', pulse: false },
  at_risk: { label: 'En Riesgo', color: '#F778BA', pulse: true },
};

function MilestoneModal({ projectId, userId, onClose, onCreated }) {
  const supabase = createClient();
  const [form, setForm] = useState({ title: '', description: '', status: 'planned', due_date: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('milestones').insert({
      ...form,
      project_id: projectId,
      user_id: userId,
      due_date: form.due_date || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Error al crear hito');
      return;
    }
    toast.success('Hito creado');
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in-up"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            Nuevo Hito del Roadmap
          </h2>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
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
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
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
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors resize-none"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
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
                className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none appearance-none"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <option key={k} value={k} style={{ background: 'var(--surface-card)' }}>
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
              className="flex-1 py-2 rounded-lg text-sm transition-all"
              style={{
                border: '1px solid var(--border-strong)',
                color: 'var(--text-muted)',
                background: 'var(--surface-muted)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              style={{
                background: 'linear-gradient(135deg, #E3B341, #F59E0B)',
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
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
  const supabase = createClient();

  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = 'local-user';
  const [showModal, setShowModal] = useState(false);

  const fetchMilestones = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', project.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    setMilestones(data || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  async function toggleComplete(milestone) {
    const newStatus = milestone.status === 'completed' ? 'in_progress' : 'completed';
    await supabase.from('milestones').update({ status: newStatus }).eq('id', milestone.id);
    setMilestones((prev) =>
      prev.map((m) => (m.id === milestone.id ? { ...m, status: newStatus } : m))
    );
    toast.success(newStatus === 'completed' ? 'Hito completado 🎉' : 'Hito reabierto');
  }

  async function deleteMilestone(id) {
    await supabase.from('milestones').delete().eq('id', id);
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    toast.success('Hito eliminado');
  }

  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = project?.color || '#58A6FF';

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <MapPin
            className="w-4 h-4"
            strokeWidth={1.5}
            style={{ color: 'var(--accent-primary)' }}
          />
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Roadmap
          </h1>
          {project?.name && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-muted)',
              }}
            >
              {project.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor =
              'color-mix(in srgb, var(--accent-primary) 40%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
        >
          <Plus
            className="w-3.5 h-3.5"
            strokeWidth={2}
            style={{ color: 'var(--accent-primary)' }}
          />
          Añadir Hito
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
            Roadmap
          </span>
        </div>

        {/* Progress card */}
        <div
          className="rounded-2xl overflow-hidden mb-6 fade-in-up"
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
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}30`,
              }}
            >
              <Flag className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
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
                className="font-mono text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {progress}%
              </span>
            </div>
            <div
              className="h-[4px] rounded-full overflow-hidden"
              style={{ background: 'var(--surface-elevated)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${accentColor}, #3FB950)`,
                }}
              />
            </div>
            <div
              className="flex justify-between mt-2 text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{completed} completados</span>
              <span>{total - completed} pendientes</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div
            className="rounded-2xl overflow-hidden fade-in-up"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-center py-20">
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>
          </div>
        ) : milestones.length === 0 ? (
          <div
            className="rounded-2xl overflow-hidden fade-in-up"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center p-6">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
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
                className="text-xs underline underline-offset-2 transition-colors"
                style={{ color: 'var(--accent-primary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
              >
                + Añadir el primer hito
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
                      className="absolute left-3 top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                      style={{
                        borderColor: cfg.color,
                        background: ms.status === 'completed' ? cfg.color : 'var(--surface-app)',
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
                        <span
                          className="w-1.5 h-1.5 rounded-full animate-pulse"
                          style={{ background: cfg.color }}
                        />
                      )}
                    </div>

                    {/* Milestone card */}
                    <div
                      className="rounded-2xl overflow-hidden transition-all"
                      style={{
                        background: 'var(--surface-card)',
                        border: `1px solid ${isOverdue ? 'color-mix(in srgb, var(--danger) 25%, transparent)' : 'var(--border-subtle)'}`,
                        boxShadow: 'var(--shadow-soft)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-elevated)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--surface-card)';
                      }}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center justify-between px-6 py-4 gap-3"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background: `${cfg.color}18`,
                              border: `1px solid ${cfg.color}30`,
                            }}
                          >
                            <MapPin className="w-4 h-4" style={{ color: cfg.color }} />
                          </div>
                          <div className="min-w-0">
                            <h3
                              className={`font-mono text-sm font-semibold truncate ${
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
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{
                                  color: cfg.color,
                                  background: `${cfg.color}15`,
                                  border: `1px solid ${cfg.color}25`,
                                }}
                              >
                                {cfg.label}
                              </span>
                              {isOverdue && (
                                <span
                                  className="text-[9px] flex items-center gap-1"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Vencido
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleComplete(ms)}
                            className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                            style={{
                              border: '1px solid var(--border-strong)',
                              background: 'var(--surface-muted)',
                              color: 'var(--text-muted)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--text-primary)';
                              e.currentTarget.style.borderColor =
                                'color-mix(in srgb, #3FB950 40%, transparent)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-muted)';
                              e.currentTarget.style.borderColor = 'var(--border-strong)';
                            }}
                          >
                            {ms.status === 'completed' ? 'Reabrir' : 'Completar'}
                          </button>
                          <button
                            onClick={() => deleteMilestone(ms.id)}
                            className="opacity-0 group-hover:opacity-100 transition-all p-1"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = 'var(--text-muted)')
                            }
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
                            className="flex items-center gap-1.5 text-[10px]"
                            style={{ color: 'var(--text-muted)' }}
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

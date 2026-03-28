'use client';
import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { MapPin, Plus, CheckCircle2, Circle, Clock, Loader2, X, AlertTriangle, Zap, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";

const STATUS_CFG = {
  planned:     { label: "Planificado",  color: "#484F58", pulse: false },
  in_progress: { label: "En Progreso", color: "#58A6FF", pulse: true  },
  completed:   { label: "Completado",  color: "#3FB950", pulse: false },
  at_risk:     { label: "En Riesgo",   color: "#F778BA", pulse: true  },
};

function MilestoneModal({ projectId, userId, onClose, onCreated }) {
  const supabase = createClient();
  const [form, setForm] = useState({ title: "", description: "", status: "planned", due_date: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("milestones").insert({
      ...form,
      project_id: projectId,
      user_id: userId,
      due_date: form.due_date || null,
    });
    setSaving(false);
    if (error) { toast.error("Error al crear hito"); return; }
    toast.success("Hito creado");
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-borders-strong rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono font-bold text-text-primary text-sm">Nuevo Hito del Roadmap</h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Título *</label>
            <input
              required
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Nombre del hito o fase..."
              className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Descripción</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="¿Qué se entregará en este hito?"
              className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Estado</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none"
              >
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <option key={k} value={k} className="bg-surface-card">{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha objetivo</label>
              <DatePicker
                value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-borders-strong text-text-muted text-sm hover:text-white transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:from-amber-400 hover:to-orange-400 transition-all">
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
  const [loading, setLoading]       = useState(true);
  const [userId, setUserId]         = useState(null);
  const [showModal, setShowModal]   = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id));
  }, []);

  const fetchMilestones = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("due_date", { ascending: true, nullsFirst: false });
    setMilestones(data || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  async function toggleComplete(milestone) {
    const newStatus = milestone.status === "completed" ? "in_progress" : "completed";
    await supabase.from("milestones").update({ status: newStatus }).eq("id", milestone.id);
    setMilestones(prev => prev.map(m => m.id === milestone.id ? { ...m, status: newStatus } : m));
    toast.success(newStatus === "completed" ? "Hito completado 🎉" : "Hito reabierto");
  }

  async function deleteMilestone(id) {
    await supabase.from("milestones").delete().eq("id", id);
    setMilestones(prev => prev.filter(m => m.id !== id));
    toast.success("Hito eliminado");
  }

  const total     = milestones.length;
  const completed = milestones.filter(m => m.status === "completed").length;
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = project?.color || "#58A6FF";

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-[#E3B341]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Roadmap</h1>
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            {completed}/{total} hitos
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-surface-elevated border border-borders-strong text-text-muted text-xs px-3 py-1.5 rounded-lg hover:text-text-primary hover:border-[#388BFD]/40 transition-all"
        >
          <Plus className="w-3.5 h-3.5 text-[#E3B341]" strokeWidth={2} />
          Añadir Hito
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Progress card */}
        <div className="bg-surface-card border border-borders-subtle rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-text-muted">Progreso total del proyecto</p>
            <span className="font-mono text-2xl font-bold text-text-primary">{progress}%</span>
          </div>
          <div className="h-[4px] bg-surface-elevated rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accentColor}, #3FB950)` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-text-muted">
            <span>{completed} completados</span>
            <span>{total - completed} pendientes</span>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-[#388BFD] animate-spin" />
          </div>
        ) : milestones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-card border border-borders-subtle flex items-center justify-center">
              <MapPin className="w-7 h-7 text-text-muted" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-text-muted">No hay hitos todavía.</p>
            <button onClick={() => setShowModal(true)}
              className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
              + Añadir el primer hito
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-surface-elevated" />
            <div className="space-y-4">
              {milestones.map((ms, i) => {
                const cfg = STATUS_CFG[ms.status] || STATUS_CFG.planned;
                const isOverdue = ms.due_date && new Date(ms.due_date) < new Date() && ms.status !== "completed";
                return (
                  <div
                    key={ms.id}
                    className="fade-in-up relative pl-14 group"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Timeline dot */}
                    <div
                      className="absolute left-3 top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                      style={{
                        borderColor: cfg.color,
                        background: ms.status === "completed" ? cfg.color : "#0D1117"
                      }}
                      onClick={() => toggleComplete(ms)}
                      title="Clic para marcar completado"
                    >
                      {ms.status === "completed" && <CheckCircle2 className="w-2.5 h-2.5 text-[#0D1117]" strokeWidth={2.5} />}
                      {cfg.pulse && ms.status !== "completed" && (
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
                      )}
                    </div>

                    <div className="bg-surface-card border border-borders-subtle rounded-xl p-4 hover:bg-surface-elevated transition-all">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`font-mono font-semibold text-sm ${
                              ms.status === "completed" ? "line-through text-text-muted" : "text-text-primary"
                            }`}>
                              {ms.title}
                            </h3>
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ color: cfg.color, background: `${cfg.color}15`, border: `1px solid ${cfg.color}25` }}>
                              {cfg.label}
                            </span>
                            {isOverdue && (
                              <span className="text-[9px] text-danger flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Vencido
                              </span>
                            )}
                          </div>
                          {ms.description && (
                            <p className="text-xs text-text-muted mt-1 leading-relaxed">{ms.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteMilestone(ms.id)}
                          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {ms.due_date && (
                        <div className="flex items-center gap-1 text-[10px] text-text-muted">
                          <Clock className="w-3 h-3" strokeWidth={1.5} />
                          <span>Objetivo: {new Date(ms.due_date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        </div>
                      )}
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

'use client';
import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Plus, CheckCircle2, ListTodo, Clock, Database, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BannerIA from "../components/BannerIA";
import ChatAgente from "../components/ChatAgente";

export default function ProjectDashboard() {
  const { project } = useOutletContext() || {};
  const navigate = useNavigate();
  const supabase = createClient();

  const [tasks, setTasks]           = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading]       = useState(true);

  const fetchData = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [{ data: tasksData }, { data: msData }] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", project.id),
      supabase.from("milestones").select("*").eq("project_id", project.id).order("due_date", { ascending: true }),
    ]);
    setTasks(tasksData || []);
    setMilestones(msData || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const total      = tasks.length;
  const completed  = tasks.filter(t => t.status === "completed").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const blocked    = tasks.filter(t => t.status === "blocked").length;
  const compPct    = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = project?.color || "#58A6FF";

  const upcomingTasks = tasks
    .filter(t => t.status !== "completed" && t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  const nextMilestone = milestones.find(m => m.status !== "completed");

  const stats = [
    { label: "Tareas totales", value: total,      color: "#8B949E",  icon: ListTodo   },
    { label: "Completadas",    value: completed,   color: "#3FB950",  icon: CheckCircle2 },
    { label: "En progreso",    value: inProgress,  color: "#58A6FF",  icon: Clock      },
    { label: "Bloqueadas",     value: blocked,     color: "#F778BA",  icon: AlertTriangle },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20 min-h-screen bg-surface-app">
        <Loader2 className="w-8 h-8 text-[#388BFD] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-app dot-grid">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-text-muted mb-0.5">
              <span>Proyectos</span><span>/</span>
              <span className="text-text-muted">{project?.name}</span>
            </div>
            <h1 className="font-mono text-base font-bold text-text-primary leading-none">{project?.name}</h1>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-[#3FB950]/25 text-success bg-[#3FB950]/8">
            <Database className="w-3 h-3" strokeWidth={1.5} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
            <span>Supabase</span>
          </div>
        </div>
        <button
          onClick={() => navigate(`/project/${project?.id}/tareas`)}
          className="flex items-center gap-2 bg-success text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-success transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nueva Tarea
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* AI Banner */}
        <BannerIA projectName={project?.name || "el proyecto"} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="fade-in-up bg-surface-card border border-borders-subtle rounded-lg px-4 py-3 flex items-center justify-between"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="text-[10px] text-text-muted mb-0.5">{stat.label}</p>
                  <p className="font-mono text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
                <Icon className="w-5 h-5" style={{ color: stat.color }} strokeWidth={1.5} />
              </div>
            );
          })}
        </div>

        {/* Progress + Next milestone */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Overall progress */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-muted">Progreso General</p>
              <span className="font-mono text-2xl font-bold text-text-primary">{compPct}%</span>
            </div>
            <div className="h-[4px] bg-surface-elevated rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${compPct}%`, background: `linear-gradient(90deg, ${accentColor}, #3FB950)` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>{completed} completadas</span>
              <span>{total - completed} pendientes</span>
            </div>
          </div>

          {/* Next milestone */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl p-5">
            <p className="text-xs font-semibold text-text-muted mb-3 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#E3B341]" strokeWidth={1.5} />
              Próximo Hito
            </p>
            {nextMilestone ? (
              <div>
                <p className="text-sm font-semibold text-text-primary mb-1">{nextMilestone.title}</p>
                {nextMilestone.description && (
                  <p className="text-xs text-text-muted mb-2 line-clamp-2">{nextMilestone.description}</p>
                )}
                {nextMilestone.due_date && (
                  <span className="text-[10px] text-[#E3B341] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(nextMilestone.due_date).toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}
                  </span>
                )}
              </div>
            ) : milestones.length === 0 ? (
              <p className="text-xs text-text-muted">No hay hitos. <button onClick={() => navigate(`/project/${project?.id}/roadmap`)} className="text-blue-400 hover:underline">Crear uno →</button></p>
            ) : (
              <p className="text-xs text-success">🎉 ¡Todos los hitos completados!</p>
            )}
          </div>
        </div>

        {/* Upcoming tasks + Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Upcoming tasks */}
          <div className="lg:col-span-2 bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-borders-subtle">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-accent-primary" strokeWidth={1.5} />
                <h3 className="font-mono text-sm font-semibold text-text-primary">Próximas Tareas</h3>
              </div>
              <button
                onClick={() => navigate(`/project/${project?.id}/tareas`)}
                className="text-[10px] text-text-muted hover:text-white transition-colors"
              >
                Ver todas →
              </button>
            </div>
            <div className="divide-y divide-[#21262D]">
              {upcomingTasks.length === 0 ? (
                <p className="px-5 py-4 text-xs text-text-muted">No hay tareas con fecha límite próximas.</p>
              ) : upcomingTasks.map(task => {
                const isOverdue = new Date(task.due_date) < new Date();
                return (
                  <div key={task.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-elevated transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{task.title}</p>
                      <p className={`text-[10px] mt-0.5 ${isOverdue ? "text-danger" : "text-text-muted"}`}>
                        {isOverdue ? "⚠ Vencida: " : ""}
                        {new Date(task.due_date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                      task.priority === "critical" ? "bg-[#F778BA]/10 text-danger" :
                      task.priority === "high" ? "bg-[#FFA657]/10 text-[#FFA657]" :
                      "bg-[#E3B341]/10 text-[#E3B341]"
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Chat */}
          <div className="flex flex-col gap-4">
            <ChatAgente projectName={project?.name || "el proyecto"} />
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { History, GitCommit, CheckCircle2, Loader2, Calendar, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const STATUS_COLORS = {
  completed:  { color: "#3FB950", bg: "bg-[#3FB950]/10", text: "text-success", label: "Completada" },
  in_progress:{ color: "#58A6FF", bg: "bg-[#58A6FF]/10", text: "text-accent-primary", label: "En Progreso" },
  pending:    { color: "#8B949E", bg: "bg-[#8B949E]/10", text: "text-text-muted", label: "Pendiente"  },
  blocked:    { color: "#F778BA", bg: "bg-[#F778BA]/10", text: "text-danger", label: "Bloqueada"  },
};

const PRIORITY_COLORS = {
  critical: "#F778BA",
  high:     "#FFA657",
  medium:   "#E3B341",
  low:      "#8B949E",
};

function groupByMonth(tasks) {
  const groups = {};
  for (const t of tasks) {
    const date = t.completed_at || t.updated_at || t.created_at;
    const key = new Date(date).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

export default function Historial() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();

  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilter]   = useState("all");
  const [expanded, setExpanded]     = useState({});

  const fetchHistory = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false });

    if (!error && data) setTasks(data);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { 
    fetchHistory(); 
    if (!project?.id) return;
    const channel = supabase.channel(`historial-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` }, (payload) => {
        fetchHistory();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project?.id, fetchHistory]);

  const filtered = filterStatus === "all"
    ? tasks
    : tasks.filter(t => t.status === filterStatus);

  const grouped = groupByMonth(filtered);

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Historial de Actividad</h1>
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            {filtered.length} registros
          </span>
        </div>
        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          {[
            { key: "all", label: "Todo" },
            { key: "completed", label: "Completadas" },
            { key: "in_progress", label: "En progreso" },
            { key: "pending", label: "Pendientes" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filterStatus === key
                  ? "bg-surface-elevated text-text-primary border border-[#388BFD]/40"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-[#388BFD] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-card border border-borders-subtle flex items-center justify-center">
              <History className="w-7 h-7 text-text-muted" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-text-muted">No hay actividad registrada aún.</p>
            <p className="text-xs text-text-muted">Las tareas creadas y modificadas aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([month, monthTasks]) => {
              const isOpen = expanded[month] !== false; // default open
              return (
                <div key={month}>
                  {/* Month header */}
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [month]: !isOpen }))}
                    className="flex items-center gap-2.5 mb-4 group"
                  >
                    <Calendar className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-muted transition-colors capitalize">
                      {month}
                    </span>
                    <span className="text-[10px] bg-surface-elevated text-text-muted px-1.5 py-0.5 rounded font-mono">
                      {monthTasks.length}
                    </span>
                    <ChevronDown
                      className={`w-3 h-3 text-text-muted transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      strokeWidth={1.5}
                    />
                  </button>

                  {/* Timeline entries */}
                  {isOpen && (
                    <div className="relative ml-2">
                      {/* Vertical line */}
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-surface-elevated" />
                      <div className="space-y-3">
                        {monthTasks.map((task, i) => {
                          const st = STATUS_COLORS[task.status] || STATUS_COLORS.pending;
                          const prioColor = PRIORITY_COLORS[task.priority] || "#8B949E";
                          const date = new Date(task.updated_at || task.created_at);
                          return (
                            <div
                              key={task.id}
                              className="fade-in-up flex items-start gap-4 pl-8 relative"
                              style={{ animationDelay: `${i * 30}ms` }}
                            >
                              {/* Dot on timeline */}
                              <div
                                className="absolute left-3.5 top-3 w-2 h-2 rounded-full ring-2 ring-[#0D1117] -translate-x-1/2"
                                style={{ background: st.color }}
                              />
                              {/* Card */}
                              <div className="flex-1 bg-surface-card border border-borders-subtle rounded-lg p-3.5 hover:border-borders-strong transition-all">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-xs font-medium text-text-primary leading-snug">{task.title}</p>
                                  <span
                                    className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded ${st.bg} ${st.text} border border-current/20`}
                                  >
                                    {st.label}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-[11px] text-text-muted mt-1 leading-relaxed line-clamp-2">
                                    {task.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[9px] font-medium" style={{ color: prioColor }}>
                                    {task.priority || "medium"}
                                  </span>
                                  <span className="text-[9px] text-text-muted">
                                    {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {task.due_date && (
                                    <span className="text-[9px] text-text-muted">
                                      📅 {new Date(task.due_date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                                    </span>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

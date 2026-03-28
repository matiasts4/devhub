'use client';

import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  History, CheckCircle2, Loader2, Calendar, ChevronDown,
  Download, BarChart3, Flag
} from "lucide-react";
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

const FILTER_OPTIONS = [
  { key: "all",         label: "Todo" },
  { key: "completed",   label: "Completadas" },
  { key: "in_progress", label: "En progreso" },
  { key: "pending",     label: "Pendientes" },
];

export default function Historial() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();

  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilter] = useState("all");
  const [expanded, setExpanded]   = useState({});

  const exportarCSV = () => {
    const header = "fecha,tarea,estado,prioridad,creada\n";
    const csv = tasks.map(t => {
      const fecha = t.completed_at || t.updated_at || t.created_at;
      return `${new Date(fecha).toISOString()},${t.title},${t.status},${t.priority},${t.created_at}`;
    }).join("\n");
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_swarm_${project?.id || 'export'}.csv`;
    a.click();
  };

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
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` }, () => {
        fetchHistory();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project?.id, fetchHistory]);

  const filtered = filterStatus === "all" ? tasks : tasks.filter(t => t.status === filterStatus);
  const grouped  = groupByMonth(filtered);

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#D2A8FF]/10 border border-[#D2A8FF]/20">
            <History className="w-3.5 h-3.5 text-[#D2A8FF]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-sm font-bold text-text-primary">Historial de Actividad</h1>
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            {filtered.length} registros
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                filterStatus === key
                  ? "bg-surface-elevated text-text-primary border-[#388BFD]/30"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Export Button & Stats */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex gap-2 justify-end mb-4">
          <button
            onClick={exportarCSV}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>

        <div className="bg-surface-card border border-borders-subtle rounded-xl p-5 fade-in-up">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent-primary" />
            Resumen del Swarm · Sprint Actual
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Tareas",              value: tasks.length,                                       color: "text-text-primary" },
              { label: "Completadas",               value: tasks.filter(t => t.status === 'completed').length, color: "text-success"       },
              { label: "En Progreso",               value: tasks.filter(t => t.status === 'in_progress').length,color: "text-accent-primary"},
              { label: "Bloqueadas",                value: tasks.filter(t => t.status === 'blocked').length,   color: "text-danger"        },
            ].map((s, i) => (
              <div key={i} className="p-3 bg-surface-elevated rounded-lg">
                <p className="text-xs text-text-muted mb-1">{s.label}</p>
                <p className={`font-mono text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
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
              const isOpen = expanded[month] !== false;
              return (
                <div key={month}>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [month]: !isOpen }))}
                    className="flex items-center gap-2.5 mb-4 group"
                  >
                    <Calendar className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-primary transition-colors capitalize">
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

                  {isOpen && (
                    <div className="relative ml-2">
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
                              <div
                                className="absolute left-3.5 top-3 w-2 h-2 rounded-full ring-2 ring-[#0D1117] -translate-x-1/2"
                                style={{ background: st.color }}
                              />
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
                                  <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: prioColor }}>
                                    <Flag className="w-2.5 h-2.5" />
                                    {task.priority || "medium"}
                                  </span>
                                  <span className="text-[9px] text-text-muted">
                                    {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {task.due_date && (
                                    <span className="text-[9px] text-text-muted flex items-center gap-1">
                                      <Calendar className="w-2.5 h-2.5" />
                                      {new Date(task.due_date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
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

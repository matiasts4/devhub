'use client';
import { useState, useEffect, useCallback } from "react";
import {
  Bot, Plug2, CheckCircle2, XCircle, Loader2, Terminal,
  RefreshCw, ListTodo, MapPin, FolderOpen, Sparkles, Info
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOutletContext } from "react-router-dom";

const TOOLS = [
  { name: "list_projects",     desc: "Listar todos los proyectos" },
  { name: "get_project",       desc: "Obtener detalles de un proyecto" },
  { name: "update_project",    desc: "Actualizar nombre, estado, progreso" },
  { name: "list_tasks",        desc: "Listar tareas (filtro por estado)" },
  { name: "create_task",       desc: "Crear nueva tarea" },
  { name: "update_task",       desc: "Cambiar estado, prioridad de tarea" },
  { name: "delete_task",       desc: "Eliminar una tarea" },
  { name: "list_milestones",   desc: "Listar hitos del roadmap" },
  { name: "create_milestone",  desc: "Crear nuevo hito" },
  { name: "update_milestone",  desc: "Actualizar estado de un hito" },
  { name: "get_dashboard",     desc: "Resumen global de todos los proyectos" },
];

export default function CentroIA() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [{ data: tasks }, { data: milestones }, { data: interactions }] = await Promise.all([
      supabase.from("tasks").select("id, status").eq("project_id", project.id),
      supabase.from("milestones").select("id, status").eq("project_id", project.id),
      supabase.from("ai_interactions").select("id", { count: "exact" }).eq("project_id", project.id),
    ]);
    setStats({
      tasks:       tasks?.length || 0,
      tasks_done:  tasks?.filter(t => t.status === "completed").length || 0,
      milestones:  milestones?.length || 0,
      ms_done:     milestones?.filter(m => m.status === "completed").length || 0,
      interactions: interactions?.length || 0,
    });
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-4 h-4 text-success" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Agente IA</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3FB950]/10 border border-[#3FB950]/20 text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
            MCP Local
          </span>
        </div>
        <button onClick={fetchStats} className="text-borders-strong hover:text-white transition-colors p-1.5 rounded-md hover:bg-surface-elevated">
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto w-full">
        {/* Left Column */}
        <div className="space-y-6">
          {/* MCP Status Banner */}
          <div className="bg-surface-card border border-[#3FB950]/25 rounded-xl p-5 flex gap-4" style={{ borderLeft: "3px solid #3FB950" }}>
            <div className="w-10 h-10 rounded-xl bg-[#3FB950]/10 border border-[#3FB950]/20 flex items-center justify-center flex-shrink-0">
              <Plug2 className="w-5 h-5 text-success" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-mono font-semibold text-sm text-text-primary">DevHub MCP Server</h2>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3FB950]/15 text-success border border-[#3FB950]/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
                  ACTIVO
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Antigravity está conectado a DevHub localmente vía MCP <code className="text-[#D2A8FF] font-mono text-[10px] bg-surface-elevated px-1 rounded">stdio</code>.
                Sin API key — acceso directo a tus datos de Supabase.
              </p>
            </div>
          </div>

          {/* Project stats */}
          {!loading && stats && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Tareas",     value: stats.tasks,        sub: `${stats.tasks_done} completadas`,  color: "#58A6FF",  icon: ListTodo   },
                { label: "Hitos",      value: stats.milestones,   sub: `${stats.ms_done} completados`,     color: "#E3B341",  icon: MapPin     },
                { label: "Proyecto",   value: project?.name?.slice(0,8) || "—", sub: project?.status || "", color: "#3FB950",  icon: FolderOpen },
                { label: "Interacc.",  value: stats.interactions, sub: "conversaciones IA",                color: "#D2A8FF",  icon: Sparkles   },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-surface-card border border-borders-subtle rounded-lg px-4 py-3 flex items-center justify-between fade-in-up" style={{ animationDelay: `${i*40}ms` }}>
                    <div>
                      <p className="text-[10px] text-text-secondary">{s.label}</p>
                      <p className="font-mono text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[9px] text-text-secondary">{s.sub}</p>
                    </div>
                    <Icon className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
                  </div>
                );
              })}
            </div>
          )}

          {/* How to use */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-borders-subtle">
              <Info className="w-3.5 h-3.5 text-accent-primary" strokeWidth={1.5} />
              <h3 className="font-mono text-sm font-semibold text-text-primary">Cómo usar el Agente IA</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-text-muted leading-relaxed">
                El agente IA es <strong className="text-text-primary">Antigravity (yo)</strong>. Puedes pedirme cualquier cosa sobre este proyecto directamente en el chat del lado —
                tengo acceso completo vía MCP a tus proyectos, tareas e hitos en Supabase.
              </p>
              <div className="space-y-1.5">
                {[
                  "Crea una tarea 'Configurar CI/CD' con prioridad alta",
                  "¿Cuántas tareas quedan pendientes en este proyecto?",
                  "Marca el hito de Deploy como completado",
                  "Dame un resumen del progreso de todos mis proyectos",
                  "Crea un hito 'MVP v1.0' para el 15 de abril",
                ].map(example => (
                  <div key={example} className="flex items-center gap-2 text-[10px] text-text-secondary bg-surface-app border border-borders-subtle rounded-lg px-3 py-1.5">
                    <Terminal className="w-3 h-3 flex-shrink-0 text-success" strokeWidth={1.5} />
                    <span className="font-mono">{example}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Tools list */}
          <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-borders-subtle">
              <Sparkles className="w-3.5 h-3.5 text-[#D2A8FF]" strokeWidth={1.5} />
              <h3 className="font-mono text-sm font-semibold text-text-primary">Herramientas MCP disponibles</h3>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-surface-elevated text-borders-strong">{TOOLS.length}</span>
            </div>
            <div className="divide-y divide-borders-subtle">
              {TOOLS.map(tool => (
                <div key={tool.name} className="flex items-center gap-3 px-5 py-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-success" strokeWidth={1.5} />
                  <code className="text-[10px] font-mono text-[#D2A8FF] w-[140px] flex-shrink-0">{tool.name}</code>
                  <span className="text-[10px] text-text-secondary leading-relaxed">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

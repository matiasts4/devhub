'use client';
import { useParams } from "next/navigation";
import { useState } from "react";
import { Plus, Users, CheckCircle2, ListTodo, Clock, Database } from "lucide-react";
import { toast } from "sonner";
import BannerIA from "../components/BannerIA";
import ChatAgente from "../components/ChatAgente";
import HistorialCommits from "../components/HistorialCommits";
import TareasActivas from "../components/TareasActivas";
import { mockProjects } from "../data/projects";

export default function ProjectDashboard() {
  const params = useParams();
  const project = mockProjects.find((p) => p.id === params.projectId);
  const [connected] = useState(true);

  if (!project) return null;

  const completionPct = Math.round((project.tareas.completadas / project.tareas.total) * 100);

  return (
    <div className="min-h-screen bg-[#0D1117] dot-grid">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#484F58] mb-0.5">
              <span>Proyectos</span>
              <span>/</span>
              <span className="text-[#8B949E]">{project.nombre}</span>
            </div>
            <h1 className="font-mono text-base font-bold text-[#F0F6FC] leading-none">{project.nombre}</h1>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${
              connected ? "border-[#3FB950]/25 text-[#3FB950] bg-[#3FB950]/8" : "border-red-500/25 text-red-400"
            }`}
          >
            <Database className="w-3 h-3" strokeWidth={1.5} />
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#3FB950] animate-pulse" : "bg-red-400"}`} />
            <span>{connected ? "MCP Conectado" : "Desconectado"}</span>
          </div>
        </div>
        <button
          data-testid="nueva-tarea-btn"
          onClick={() => toast.success("Nueva tarea creada", { description: "El agente IA comenzará el análisis." })}
          className="flex items-center gap-2 bg-[#238636] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nueva Tarea
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* AI Banner */}
        <BannerIA projectName={project.nombre} />

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tareas totales", value: project.tareas.total, color: "#8B949E", icon: ListTodo },
            { label: "Completadas", value: project.tareas.completadas, color: "#3FB950", icon: CheckCircle2 },
            { label: "En progreso", value: project.tareas.enProgreso, color: "#58A6FF", icon: Clock },
            { label: "Equipo", value: project.equipo.length, color: "#D2A8FF", icon: Users },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-lg px-4 py-3 flex items-center justify-between"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="text-[10px] text-[#484F58] mb-0.5">{stat.label}</p>
                  <p className="font-mono text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-[#21262D]" strokeWidth={1.5} />
              </div>
            );
          })}
        </div>

        {/* Sections Grid (Dynamic) */}
        <div>
          <h2 className="font-mono text-xs font-semibold text-[#8B949E] uppercase tracking-[0.12em] mb-3">
            Secciones del Proyecto
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {project.secciones.map((sec, i) => (
              <div
                key={sec.nombre}
                data-testid={`section-card-${i}`}
                className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-5 hover:bg-[#1C2333] hover:border-[#30363D] transition-all cursor-default"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-semibold" style={{ color: sec.color }}>{sec.nombre}</p>
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ color: sec.color, background: `${sec.color}14`, border: `1px solid ${sec.color}22` }}
                  >
                    {sec.badge}
                  </span>
                </div>
                <p className="font-mono text-3xl font-bold text-[#F0F6FC] mb-1 leading-none">
                  {sec.progreso}<span className="text-base font-normal text-[#8B949E]">%</span>
                </p>
                <p className="text-[10px] text-[#484F58] mb-3">
                  {sec.completadas}/{sec.tareas} tareas completadas
                </p>
                <div className="h-[3px] bg-[#21262D] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${sec.progreso}%`, background: sec.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <TareasActivas />
          </div>
          <div className="flex flex-col gap-4">
            <ChatAgente projectName={project.nombre} />
            <HistorialCommits />
          </div>
        </div>
      </div>
    </div>
  );
}

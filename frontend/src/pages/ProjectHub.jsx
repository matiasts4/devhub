import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Code2, GraduationCap, FlaskConical, User, Building2,
  Clock, ChevronRight, Cpu, CheckCircle2, Loader2, PauseCircle
} from "lucide-react";
import { mockProjects, projectTypes } from "../data/projects";

const typeIconMap = { Code2, GraduationCap, FlaskConical, User, Building2 };

const estadoConfig = {
  activo: { label: "Activo", color: "#3FB950", dot: "bg-[#3FB950]" },
  pausado: { label: "Pausado", color: "#E3B341", dot: "bg-[#E3B341]" },
  completado: { label: "Completado", color: "#8B949E", dot: "bg-[#8B949E]" },
};

const teamColors = ["#58A6FF", "#3FB950", "#F778BA", "#D2A8FF", "#E3B341"];

export default function ProjectHub() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("todos");

  const filtered = mockProjects.filter((p) => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "todos" || p.tipo === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="min-h-screen bg-[#0D1117] dot-grid">
      {/* Top bar */}
      <div className="border-b border-[#21262D] px-8 py-4 flex items-center justify-between bg-[#0D1117]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#58A6FF]/15 border border-[#58A6FF]/25 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
          </div>
          <span className="font-mono font-bold text-[#F0F6FC] text-sm tracking-wide">DevNexus AI</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484F58]" strokeWidth={1.5} />
            <input
              data-testid="hub-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proyecto..."
              className="bg-[#161B26] border border-[#21262D] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF]/50 w-52 transition-all"
            />
          </div>
          <button
            data-testid="nuevo-proyecto-hub-btn"
            onClick={() => {}}
            className="flex items-center gap-2 bg-[#238636] text-white font-medium px-4 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      <div className="px-8 py-8">
        {/* Header */}
        <div className="mb-8 fade-in-up">
          <h1 className="font-mono text-3xl font-bold text-[#F0F6FC] mb-1">
            Bienvenido de vuelta, Dev Admin
          </h1>
          <p className="text-[#8B949E] text-sm">
            Selecciona un proyecto para entrar al workspace — o crea uno nuevo.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "Proyectos activos", value: mockProjects.filter(p => p.estado === "activo").length, color: "#3FB950" },
            { label: "Tareas totales", value: mockProjects.reduce((a, p) => a + p.tareas.total, 0), color: "#58A6FF" },
            { label: "Completadas", value: mockProjects.reduce((a, p) => a + p.tareas.completadas, 0), color: "#D2A8FF" },
            { label: "En progreso", value: mockProjects.reduce((a, p) => a + p.tareas.enProgreso, 0), color: "#E3B341" },
          ].map((stat, i) => (
            <div
              key={i}
              className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-lg px-5 py-4"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-[#8B949E] text-xs mb-1">{stat.label}</p>
              <p className="font-mono text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[{ key: "todos", label: "Todos" }, ...Object.entries(projectTypes).map(([k, v]) => ({ key: k, label: v.label }))].map(({ key, label }) => (
            <button
              key={key}
              data-testid={`filter-type-${key}`}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterType === key
                  ? "bg-[#21262D] text-[#F0F6FC] border border-[#388BFD]/50"
                  : "text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Projects grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project, i) => {
            const tipo = projectTypes[project.tipo];
            const TypeIcon = typeIconMap[tipo?.icon] || Code2;
            const estado = estadoConfig[project.estado];
            return (
              <div
                key={project.id}
                data-testid={`project-card-${project.id}`}
                onClick={() => navigate(`/project/${project.id}/dashboard`)}
                className="fade-in-up project-card-hover bg-[#161B26] border border-[#21262D] rounded-xl p-5 cursor-pointer group"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${tipo?.color}18`, border: `1px solid ${tipo?.color}28` }}
                    >
                      <TypeIcon className="w-4 h-4" strokeWidth={1.5} style={{ color: tipo?.color }} />
                    </div>
                    <div>
                      <h3 className="font-mono font-semibold text-[#F0F6FC] text-sm leading-tight">{project.nombre}</h3>
                      <span className="text-[10px] font-medium" style={{ color: tipo?.color }}>{tipo?.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${estado.dot} ${project.estado === "activo" ? "animate-pulse" : ""}`} />
                    <span className="text-[10px]" style={{ color: estado.color }}>{estado.label}</span>
                  </div>
                </div>

                <p className="text-xs text-[#8B949E] leading-relaxed mb-4 line-clamp-2">{project.descripcion}</p>

                {/* Sections preview */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {project.secciones.map((sec) => (
                    <span
                      key={sec.nombre}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                      style={{ color: sec.color, background: `${sec.color}14`, border: `1px solid ${sec.color}22` }}
                    >
                      {sec.nombre}
                    </span>
                  ))}
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="h-[3px] bg-[#21262D] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#238636] transition-all duration-700"
                      style={{ width: `${project.progreso}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Team avatars */}
                    <div className="flex -space-x-2">
                      {project.equipo.slice(0, 3).map((m, mi) => (
                        <div
                          key={mi}
                          className="w-6 h-6 rounded-full border border-[#161B26] flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: teamColors[mi % teamColors.length] + "CC" }}
                          title={m}
                        >
                          {m.slice(0, 2)}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-[#484F58]">
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {project.ultimaActividad}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[#8B949E] opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Abrir</span>
                    <ChevronRight className="w-3 h-3" strokeWidth={2} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* New project card */}
          <div
            data-testid="new-project-card"
            className="fade-in-up bg-[#161B26]/50 border border-[#21262D] border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-[#161B26] hover:border-[#388BFD]/30 transition-all group min-h-[200px]"
            style={{ animationDelay: `${filtered.length * 60}ms` }}
          >
            <div className="w-10 h-10 rounded-full bg-[#21262D] flex items-center justify-center group-hover:bg-[#388BFD]/15 transition-colors">
              <Plus className="w-5 h-5 text-[#484F58] group-hover:text-[#58A6FF] transition-colors" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#8B949E] group-hover:text-[#F0F6FC] transition-colors">Nuevo Proyecto</p>
              <p className="text-[11px] text-[#484F58]">Software, Universidad, Personal...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

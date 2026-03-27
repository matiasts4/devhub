import { useState } from "react";
import { Bot, Cpu, ShieldCheck, Search, FileText, Play, Pause, Settings, Zap } from "lucide-react";
import { toast } from "sonner";

const agentes = [
  { id: 1, nombre: "NEXUS-7", rol: "Agente Desarrollador", descripcion: "Especialista en generación de código, refactoring e implementación de features completas.", modelo: "GPT-4o", capacidades: ["Generar código", "Refactoring", "Code review", "Docs"], estado: "activo", tareaActual: "Escribiendo componentes JWT...", completadas: 147, color: "#58A6FF", icon: Cpu },
  { id: 2, nombre: "NEXUS-3", rol: "Agente QA / Testing", descripcion: "Crea suites de tests unitarios, integración y E2E. Detecta bugs y vulnerabilidades.", modelo: "Claude 3.5", capacidades: ["Tests unitarios", "Tests E2E", "Bug detection", "Security scan"], estado: "activo", tareaActual: "Generando tests UserService...", completadas: 89, color: "#3FB950", icon: ShieldCheck },
  { id: 3, nombre: "NEXUS-9", rol: "Agente Arquitecto", descripcion: "Diseña arquitecturas escalables, esquemas de BD y patrones de diseño óptimos.", modelo: "Claude 3 Opus", capacidades: ["Arquitectura", "DB design", "Patrones", "Escalabilidad"], estado: "inactivo", tareaActual: "Sin tarea asignada", completadas: 56, color: "#D2A8FF", icon: Bot },
  { id: 4, nombre: "NEXUS-5", rol: "Agente Revisor", descripcion: "Revisa PRs, detecta code smells, sugiere mejoras de performance y seguridad.", modelo: "GPT-4o", capacidades: ["PR review", "Code smells", "Performance", "Best practices"], estado: "pausado", tareaActual: "Revisando PR #47 en cola...", completadas: 203, color: "#E3B341", icon: Search },
  { id: 5, nombre: "NEXUS-2", rol: "Agente Documentador", descripcion: "Genera documentación técnica, comentarios de código y guías de uso automáticamente.", modelo: "Gemini Pro", capacidades: ["OpenAPI docs", "README", "Comentarios", "Guías"], estado: "pausado", tareaActual: "Pendiente: documentar módulo pagos", completadas: 78, color: "#FFA657", icon: FileText },
];

const estadoConfig = {
  activo: { dot: "bg-[#3FB950] animate-pulse", label: "Activo", color: "#3FB950" },
  inactivo: { dot: "bg-[#484F58]", label: "Inactivo", color: "#484F58" },
  pausado: { dot: "bg-[#E3B341]", label: "Pausado", color: "#E3B341" },
};

export default function CentroIA() {
  const [agentesState, setAgentesState] = useState(agentes);

  const toggleAgente = (id) => {
    setAgentesState((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const next = a.estado === "activo" ? "pausado" : "activo";
        toast.success(`${a.nombre} ${next === "activo" ? "activado" : "pausado"}`);
        return { ...a, estado: next };
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-4 h-4 text-[#3FB950]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Agentes IA</h1>
          <span className="text-[10px] text-[#484F58] bg-[#21262D] px-2 py-0.5 rounded-full border border-[#30363D]">
            {agentesState.filter((a) => a.estado === "activo").length} activos
          </span>
        </div>
        <button
          data-testid="nuevo-agente-btn"
          onClick={() => toast.info("Configurando nuevo agente...")}
          className="flex items-center gap-2 bg-[#238636] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
          Nuevo Agente
        </button>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentesState.map((agente, i) => {
          const cfg = estadoConfig[agente.estado];
          const Icon = agente.icon;
          return (
            <div
              key={agente.id}
              data-testid={`agente-card-${agente.id}`}
              className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-5 hover:bg-[#1C2333] transition-all"
              style={{ animationDelay: `${i * 60}ms`, borderTop: `2px solid ${agente.color}30` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                    <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: agente.color }} />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-[#F0F6FC] text-sm" style={{ color: agente.color }}>{agente.nombre}</p>
                    <p className="text-[10px] text-[#8B949E]">{agente.rol}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className="text-[9px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                </div>
              </div>

              <p className="text-xs text-[#8B949E] leading-relaxed mb-3">{agente.descripcion}</p>

              <div className="bg-[#21262D] border border-[#30363D] rounded-lg px-3 py-2 mb-3">
                <p className="text-[9px] text-[#484F58] uppercase tracking-wider mb-0.5">Tarea actual</p>
                <p className="text-[11px] text-[#8B949E] truncate">{agente.tareaActual}</p>
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {agente.capacidades.map((cap) => (
                  <span key={cap} className="text-[9px] px-1.5 py-0.5 bg-[#21262D] text-[#8B949E] rounded border border-[#30363D]">{cap}</span>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#484F58]">
                  <span className="font-mono text-[#8B949E]">{agente.completadas}</span> completadas · {agente.modelo}
                </span>
                <div className="flex gap-1.5">
                  <button
                    data-testid={`toggle-agente-${agente.id}`}
                    onClick={() => toggleAgente(agente.id)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-medium transition-all ${
                      agente.estado === "activo"
                        ? "border-[#F778BA]/25 text-[#F778BA] hover:bg-[#F778BA]/8"
                        : "border-[#3FB950]/25 text-[#3FB950] hover:bg-[#3FB950]/8"
                    }`}
                  >
                    {agente.estado === "activo" ? <Pause className="w-3 h-3" strokeWidth={1.5} /> : <Play className="w-3 h-3" strokeWidth={1.5} />}
                    {agente.estado === "activo" ? "Pausar" : "Activar"}
                  </button>
                  <button
                    data-testid={`config-agente-${agente.id}`}
                    onClick={() => toast.info(`Configuración de ${agente.nombre}`)}
                    className="p-1.5 rounded-md text-[#484F58] hover:text-[#8B949E] hover:bg-[#21262D] transition-all"
                  >
                    <Settings className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

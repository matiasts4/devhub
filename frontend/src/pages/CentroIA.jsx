import { useState } from "react";
import { Bot, Cpu, Zap, FileText, Search, ShieldCheck, Play, Pause, Settings } from "lucide-react";
import { toast } from "sonner";

const agentes = [
  { id: 1, nombre: "NEXUS-7", rol: "Agente Desarrollador", descripcion: "Especialista en generación de código, refactoring y implementación de features completas.", modelo: "GPT-4o", capacidades: ["Generar código", "Refactoring", "Code review", "Documentación"], estado: "activo", tareaActual: "Escribiendo componentes de auth JWT...", tareasCompletadas: 147, color: "#00F0FF", icon: Cpu },
  { id: 2, nombre: "NEXUS-3", rol: "Agente QA / Testing", descripcion: "Crea suites de tests unitarios, integración y E2E. Detecta bugs y vulnerabilidades.", modelo: "Claude 3.5", capacidades: ["Tests unitarios", "Tests E2E", "Bug detection", "Security scan"], estado: "activo", tareaActual: "Generando tests para UserService...", tareasCompletadas: 89, color: "#39FF14", icon: ShieldCheck },
  { id: 3, nombre: "NEXUS-9", rol: "Agente Arquitecto", descripcion: "Diseña arquitecturas escalables, esquemas de BD y patrones de diseño óptimos.", modelo: "Claude 3 Opus", capacidades: ["Arquitectura", "DB design", "Patrones", "Escalabilidad"], estado: "inactivo", tareaActual: "Sin tarea asignada", tareasCompletadas: 56, color: "#FF007F", icon: Bot },
  { id: 4, nombre: "NEXUS-5", rol: "Agente Revisor", descripcion: "Revisa PRs, detecta code smells, sugiere mejoras de performance y seguridad.", modelo: "GPT-4o", capacidades: ["PR review", "Code smells", "Performance", "Best practices"], estado: "pausado", tareaActual: "Revisando PR #47 en cola...", tareasCompletadas: 203, color: "#FFE600", icon: Search },
  { id: 5, nombre: "NEXUS-2", rol: "Agente Documentador", descripcion: "Genera documentación técnica, comentarios de código y guías de uso automáticamente.", modelo: "Gemini Pro", capacidades: ["OpenAPI docs", "README", "Comentarios", "Guías"], estado: "pausado", tareaActual: "Pendiente: documentar módulo pagos", tareasCompletadas: 78, color: "#FF007F", icon: FileText },
];

const estadoConfig = {
  activo: { badge: "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25", dot: "bg-[#39FF14] animate-pulse", label: "Activo" },
  inactivo: { badge: "bg-white/5 text-slate-400 border-white/10", dot: "bg-slate-600", label: "Inactivo" },
  pausado: { badge: "bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/25", dot: "bg-[#FFE600]", label: "Pausado" },
};

export default function CentroIA() {
  const [agentesState, setAgentesState] = useState(agentes);

  const toggleAgente = (id) => {
    setAgentesState(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        const nuevoEstado = a.estado === "activo" ? "pausado" : "activo";
        toast.success(`NEXUS-${a.nombre.split("-")[1]} ${nuevoEstado === "activo" ? "activado" : "pausado"}`);
        return { ...a, estado: nuevoEstado };
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-[#39FF14]" strokeWidth={1.5} />
          <h1 className="font-mono text-lg font-bold text-white">Centro de IA</h1>
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
            {agentesState.filter(a => a.estado === "activo").length} activos
          </span>
        </div>
        <button
          data-testid="nuevo-agente-btn"
          onClick={() => toast.info("Configurando nuevo agente especializado...")}
          className="flex items-center gap-2 bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#39FF14]/25 transition-all active:scale-95"
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
              className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl p-5 hover:border-white/15 transition-all"
              style={{ animationDelay: `${i * 70}ms`, borderTopColor: agente.color, borderTopWidth: "2px" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${agente.color}18`, border: `1px solid ${agente.color}30` }}>
                    <Icon className="w-5 h-5" strokeWidth={1.5} style={{ color: agente.color }} />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-white text-sm">{agente.nombre}</p>
                    <p className="text-[10px] text-slate-400">{agente.rol}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-3">{agente.descripcion}</p>

              <div className="bg-white/3 border border-white/5 rounded-lg px-3 py-2 mb-3">
                <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wider">Tarea actual</p>
                <p className="text-xs text-slate-300 truncate">{agente.tareaActual}</p>
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {agente.capacidades.map(cap => (
                  <span key={cap} className="text-[9px] px-2 py-0.5 bg-white/5 border border-white/8 text-slate-400 rounded-md">
                    {cap}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-500">
                  <span className="font-mono text-white">{agente.tareasCompletadas}</span> tareas completadas · {agente.modelo}
                </div>
                <div className="flex gap-2">
                  <button
                    data-testid={`toggle-agente-${agente.id}`}
                    onClick={() => toggleAgente(agente.id)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-medium transition-all ${
                      agente.estado === "activo"
                        ? "bg-[#FF007F]/10 text-[#FF007F] border-[#FF007F]/25 hover:bg-[#FF007F]/20"
                        : "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25 hover:bg-[#39FF14]/20"
                    }`}
                  >
                    {agente.estado === "activo" ? <Pause className="w-3 h-3" strokeWidth={1.5} /> : <Play className="w-3 h-3" strokeWidth={1.5} />}
                    {agente.estado === "activo" ? "Pausar" : "Activar"}
                  </button>
                  <button
                    data-testid={`config-agente-${agente.id}`}
                    onClick={() => toast.info(`Abriendo configuración de ${agente.nombre}...`)}
                    className="text-slate-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
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

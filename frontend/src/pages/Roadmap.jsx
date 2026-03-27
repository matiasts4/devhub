'use client';
import { MapPin, CheckCircle2, Circle, Clock, Zap } from "lucide-react";
import { toast } from "sonner";

const fases = [
  {
    id: 1, nombre: "Fase 1 — Fundamentos", estado: "completada", periodo: "Sem 1–2", color: "#3FB950",
    hitos: [
      { nombre: "Setup del proyecto y CI/CD", completado: true },
      { nombre: "Autenticación base (JWT)", completado: true },
      { nombre: "Modelo de datos MongoDB", completado: true },
      { nombre: "API REST básica (CRUD)", completado: true },
    ],
  },
  {
    id: 2, nombre: "Fase 2 — Core Features", estado: "activa", periodo: "Sem 3–5", color: "#58A6FF",
    hitos: [
      { nombre: "Módulo de productos y catálogo", completado: true },
      { nombre: "Sistema de carrito de compras", completado: true },
      { nombre: "Integración Stripe (pagos)", completado: false },
      { nombre: "Gestión de inventario", completado: false },
    ],
  },
  {
    id: 3, nombre: "Fase 3 — UI/UX & Optimización", estado: "pendiente", periodo: "Sem 6–8", color: "#D2A8FF",
    hitos: [
      { nombre: "Diseño responsive completo", completado: false },
      { nombre: "Animaciones y microinteracciones", completado: false },
      { nombre: "Optimización Core Web Vitals", completado: false },
      { nombre: "Accesibilidad WCAG 2.1", completado: false },
    ],
  },
  {
    id: 4, nombre: "Fase 4 — Testing & Deploy", estado: "pendiente", periodo: "Sem 9–10", color: "#E3B341",
    hitos: [
      { nombre: "Tests de integración E2E", completado: false },
      { nombre: "Deploy producción (Kubernetes)", completado: false },
      { nombre: "Monitorización y alertas", completado: false },
    ],
  },
];

const estadoConfig = {
  completada: { color: "#3FB950", label: "Completada" },
  activa: { color: "#58A6FF", label: "En progreso" },
  pendiente: { color: "#484F58", label: "Pendiente" },
};

export default function Roadmap() {
  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-[#E3B341]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Roadmap & Fases</h1>
        </div>
        <button
          data-testid="recalcular-roadmap-btn"
          onClick={() => toast.success("Roadmap recalculado por IA")}
          className="flex items-center gap-2 bg-[#21262D] border border-[#30363D] text-[#8B949E] text-xs px-3 py-1.5 rounded-lg hover:text-[#F0F6FC] transition-all"
        >
          <Zap className="w-3.5 h-3.5 text-[#E3B341]" strokeWidth={1.5} />
          Recalcular IA
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Progress bar */}
        <div className="bg-[#161B26] border border-[#21262D] rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#8B949E]">Progreso total del proyecto</p>
            <span className="font-mono text-2xl font-bold text-[#F0F6FC]">42%</span>
          </div>
          <div className="h-[3px] bg-[#21262D] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#238636]" style={{ width: "42%" }} />
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-[#21262D]" />
          <div className="space-y-4">
            {fases.map((fase, i) => {
              const cfg = estadoConfig[fase.estado];
              const completados = fase.hitos.filter((h) => h.completado).length;
              return (
                <div
                  key={fase.id}
                  data-testid={`fase-${fase.id}`}
                  className="fade-in-up relative pl-14"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* Timeline dot */}
                  <div
                    className="absolute left-3 top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: fase.color, background: fase.estado === "completada" ? fase.color : "#0D1117" }}
                  >
                    {fase.estado === "completada" && <CheckCircle2 className="w-2.5 h-2.5 text-[#0D1117]" strokeWidth={2.5} />}
                    {fase.estado === "activa" && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: fase.color }} />}
                  </div>

                  <div className="bg-[#161B26] border border-[#21262D] rounded-xl p-5 hover:bg-[#1C2333] transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-mono font-semibold text-[#F0F6FC] text-sm">{fase.nombre}</h3>
                        <span className="text-[10px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[10px] text-[#484F58]">
                          <Clock className="w-3 h-3" strokeWidth={1.5} />{fase.periodo}
                        </span>
                        <span className="font-mono text-xs" style={{ color: fase.color }}>
                          {completados}/{fase.hitos.length}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {fase.hitos.map((hito, hi) => (
                        <div key={hi} className="flex items-center gap-2 text-xs">
                          {hito.completado
                            ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: fase.color }} strokeWidth={1.5} />
                            : <Circle className="w-3 h-3 text-[#30363D] flex-shrink-0" strokeWidth={1.5} />
                          }
                          <span className={hito.completado ? "text-[#8B949E]" : "text-[#484F58]"}>{hito.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

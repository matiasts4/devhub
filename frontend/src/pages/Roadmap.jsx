import { MapPin, CheckCircle2, Circle, Clock, ChevronRight, Zap } from "lucide-react";
import { toast } from "sonner";

const fases = [
  {
    id: 1,
    nombre: "Fase 1 — Fundamentos",
    estado: "completada",
    periodo: "Sem 1–2",
    color: "#39FF14",
    hitos: [
      { nombre: "Setup del proyecto y CI/CD", completado: true },
      { nombre: "Autenticación base (JWT)", completado: true },
      { nombre: "Modelo de datos MongoDB", completado: true },
      { nombre: "API REST básica (CRUD)", completado: true },
    ],
  },
  {
    id: 2,
    nombre: "Fase 2 — Core Features",
    estado: "activa",
    periodo: "Sem 3–5",
    color: "#00F0FF",
    hitos: [
      { nombre: "Módulo de productos y catálogo", completado: true },
      { nombre: "Sistema de carrito de compras", completado: true },
      { nombre: "Integración Stripe (pagos)", completado: false },
      { nombre: "Gestión de inventario", completado: false },
    ],
  },
  {
    id: 3,
    nombre: "Fase 3 — UI/UX & Optimización",
    estado: "pendiente",
    periodo: "Sem 6–8",
    color: "#FF007F",
    hitos: [
      { nombre: "Diseño responsive completo", completado: false },
      { nombre: "Animaciones y microinteracciones", completado: false },
      { nombre: "Optimización Core Web Vitals", completado: false },
      { nombre: "Accesibilidad WCAG 2.1", completado: false },
    ],
  },
  {
    id: 4,
    nombre: "Fase 4 — Testing & Deploy",
    estado: "pendiente",
    periodo: "Sem 9–10",
    color: "#FFE600",
    hitos: [
      { nombre: "Tests de integración E2E", completado: false },
      { nombre: "Load testing con Locust", completado: false },
      { nombre: "Deploy producción (Kubernetes)", completado: false },
      { nombre: "Monitorización y alertas", completado: false },
    ],
  },
];

const estadoConfig = {
  completada: { badge: "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25", label: "Completada" },
  activa: { badge: "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25", label: "En progreso" },
  pendiente: { badge: "bg-white/5 text-slate-400 border-white/10", label: "Pendiente" },
};

export default function Roadmap() {
  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-[#FFE600]" strokeWidth={1.5} />
          <h1 className="font-mono text-lg font-bold text-white">Roadmap & Fases</h1>
        </div>
        <button
          data-testid="generar-roadmap-btn"
          onClick={() => toast.success("Roadmap actualizado por IA", { description: "NEXUS-9 ha recalculado los tiempos estimados." })}
          className="flex items-center gap-2 bg-[#FFE600]/15 text-[#FFE600] border border-[#FFE600]/30 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#FFE600]/25 transition-all active:scale-95"
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
          Recalcular IA
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Progress overview */}
        <div className="bg-[#111827]/60 border border-white/8 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400">Progreso Total del Proyecto</p>
            <span className="font-mono text-2xl font-bold text-white">42%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#39FF14]/60 via-[#00F0FF] to-[#00F0FF]/40"
              style={{ width: "42%" }}
            />
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#39FF14]" /> 1 fase completada</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00F0FF]" /> 1 fase activa</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/20" /> 2 fases pendientes</span>
          </div>
        </div>

        {/* Fases Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-white/10" />

          <div className="space-y-4">
            {fases.map((fase, i) => {
              const cfg = estadoConfig[fase.estado];
              const completados = fase.hitos.filter(h => h.completado).length;
              return (
                <div
                  key={fase.id}
                  data-testid={`fase-${fase.id}`}
                  className="fade-in-up relative pl-14"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  {/* Circle on timeline */}
                  <div
                    className="absolute left-3.5 top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: fase.color,
                      background: fase.estado === "completada" ? fase.color : "#0B0F19",
                    }}
                  >
                    {fase.estado === "completada" && <CheckCircle2 className="w-3 h-3 text-[#0B0F19]" strokeWidth={2.5} />}
                    {fase.estado === "activa" && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: fase.color }} />}
                  </div>

                  <div
                    className="bg-[#111827]/60 border border-white/8 rounded-xl p-5 hover:border-white/15 transition-all"
                    style={{ borderLeftColor: fase.color, borderLeftWidth: "2px" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-mono font-semibold text-white text-sm">{fase.nombre}</h3>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" strokeWidth={1.5} />
                          {fase.periodo}
                        </span>
                        <span className="font-mono text-xs" style={{ color: fase.color }}>
                          {completados}/{fase.hitos.length}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {fase.hitos.map((hito, hi) => (
                        <div key={hi} className="flex items-center gap-2 text-xs">
                          {hito.completado ? (
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: fase.color }} strokeWidth={1.5} />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" strokeWidth={1.5} />
                          )}
                          <span className={hito.completado ? "text-slate-300" : "text-slate-500"}>{hito.nombre}</span>
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

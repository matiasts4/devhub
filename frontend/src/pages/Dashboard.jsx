import { useState } from "react";
import { Plus, Database } from "lucide-react";
import { toast } from "sonner";
import MetricCard from "../components/MetricCard";
import BannerIA from "../components/BannerIA";
import TareasActivas from "../components/TareasActivas";
import ChatAgente from "../components/ChatAgente";
import HistorialCommits from "../components/HistorialCommits";
import UltimasInteracciones from "../components/UltimasInteracciones";

const metricCards = [
  { id: "security", title: "Seguridad y Auth", value: "85%", subtitle: "Progreso completado", icon: "Shield", accentColor: "#39FF14", progressValue: 85, badge: "Activo", trend: "+5% esta semana" },
  { id: "ui-ux", title: "UI / UX", value: "12/15", subtitle: "Tareas completadas", icon: "Palette", accentColor: "#00F0FF", progressValue: 80, badge: "En progreso", trend: "3 tareas pendientes" },
  { id: "backend", title: "Backend & Base de Datos", value: "En rev.", subtitle: "Esperando revisión", icon: "Database", accentColor: "#FF007F", progressValue: 60, badge: "Revisión", trend: "2 PRs abiertos" },
  { id: "tech-debt", title: "Deuda Técnica", value: "3", subtitle: "Alertas de refactorización", icon: "AlertTriangle", accentColor: "#FFE600", progressValue: 30, badge: "Crítico", trend: "Requiere atención" },
];

export default function Dashboard() {
  const [connected] = useState(true);

  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      {/* Top Header */}
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-semibold leading-none mb-0.5">
              Proyecto Activo
            </p>
            <h1 className="font-mono text-lg font-bold text-white leading-none">
              E-commerce V2
            </h1>
          </div>
          <div className="h-6 border-l border-white/10" />
          <div
            data-testid="connection-status"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${
              connected
                ? "bg-[#39FF14]/8 border-[#39FF14]/20 text-[#39FF14]"
                : "bg-red-500/8 border-red-500/20 text-red-400"
            }`}
          >
            <Database className="w-3 h-3" strokeWidth={1.5} />
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#39FF14] animate-pulse" : "bg-red-400"}`} />
            <span>{connected ? "Tauri · MongoDB Conectada" : "Sin conexión"}</span>
          </div>
        </div>

        <button
          data-testid="nueva-tarea-btn"
          onClick={() => toast.success("Nueva tarea creada por IA", { description: "NEXUS-7 comenzará el análisis en breve." })}
          className="flex items-center gap-2 bg-[#00F0FF] text-[#0B0F19] font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#00F0FF]/85 hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nueva Tarea IA
        </button>
      </div>

      {/* Main Content */}
      <div className="px-6 py-5 space-y-5">
        {/* AI Banner */}
        <BannerIA />

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card, index) => (
            <MetricCard key={card.id} {...card} index={index} />
          ))}
        </div>

        {/* Bottom Grid: Tasks+Interactions (left) | Chat+Commits (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left col (2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <TareasActivas />
            <UltimasInteracciones />
          </div>

          {/* Right col (1/3) */}
          <div className="flex flex-col gap-4">
            <ChatAgente />
            <HistorialCommits />
          </div>
        </div>
      </div>
    </div>
  );
}

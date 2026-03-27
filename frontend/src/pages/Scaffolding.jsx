import { useState } from "react";
import { Layers, Check, Cpu, Globe, Server, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

const templates = [
  { id: 1, nombre: "Full Stack SaaS", descripcion: "React + FastAPI + MongoDB + Auth JWT + Docker", tags: ["React", "FastAPI", "MongoDB", "Docker"], icon: Globe, color: "#58A6FF", popular: true },
  { id: 2, nombre: "Next.js + PostgreSQL", descripcion: "App Router, Prisma ORM, NextAuth, TailwindCSS", tags: ["Next.js", "PostgreSQL", "Prisma"], icon: Server, color: "#3FB950", popular: true },
  { id: 3, nombre: "Microservicios", descripcion: "FastAPI x3 + API Gateway + Redis + RabbitMQ", tags: ["FastAPI", "Redis", "RabbitMQ", "Docker"], icon: Cpu, color: "#D2A8FF", popular: false },
  { id: 4, nombre: "Seguridad Avanzada", descripcion: "OAuth2, RBAC, Rate Limiting, JWT Rotation", tags: ["OAuth2", "RBAC", "Redis", "FastAPI"], icon: Shield, color: "#E3B341", popular: false },
];

const sugerenciasIA = [
  { id: 1, paquete: "stripe ^14.0.0", motivo: "Módulo de pagos sin SDK", urgencia: "Alta" },
  { id: 2, paquete: "redis ^4.6.0", motivo: "Mejora rendimiento del caché 40%", urgencia: "Media" },
  { id: 3, paquete: "pytest-asyncio ^0.23.0", motivo: "Tests async sin cobertura", urgencia: "Baja" },
];

const urgenciaColor = { Alta: "#FFA657", Media: "#E3B341", Baja: "#3FB950" };

export default function Scaffolding() {
  const [instalados, setInstalados] = useState([]);

  const instalar = (pkg) => {
    setInstalados((prev) => [...prev, pkg]);
    toast.success(`Instalando: ${pkg}`);
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Scaffolding & Stack</h1>
        </div>
        <button
          data-testid="generar-stack-btn"
          onClick={() => toast.info("Analizando proyecto para generar stack óptimo...")}
          className="flex items-center gap-2 bg-[#21262D] border border-[#30363D] text-[#8B949E] font-medium px-3 py-1.5 rounded-lg text-xs hover:text-[#F0F6FC] hover:border-[#484F58] transition-all"
        >
          <Cpu className="w-3.5 h-3.5" strokeWidth={1.5} />
          Generar con IA
        </button>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Templates */}
        <div className="lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#484F58] font-semibold mb-3">Plantillas de Stack</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map((t, i) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  data-testid={`template-${t.id}`}
                  className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-4 hover:bg-[#1C2333] hover:border-[#30363D] transition-all cursor-pointer"
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => toast.success(`Aplicando: ${t.nombre}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: t.color }} />
                    {t.popular && <span className="text-[9px] text-[#58A6FF] bg-[#388BFD]/12 px-1.5 py-0.5 rounded-full border border-[#388BFD]/20">Popular</span>}
                  </div>
                  <h3 className="font-mono font-semibold text-sm text-[#F0F6FC] mb-1">{t.nombre}</h3>
                  <p className="text-[11px] text-[#8B949E] mb-3">{t.descripcion}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#21262D] text-[#484F58] rounded border border-[#30363D]">{tag}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sugerencias IA */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#484F58] font-semibold mb-3">Sugerencias IA</p>
          <div className="space-y-2">
            {sugerenciasIA.map((s, i) => (
              <div
                key={s.id}
                data-testid={`sugerencia-${s.id}`}
                className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-4"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <code className="text-[11px] font-mono" style={{ color: urgenciaColor[s.urgencia] }}>{s.paquete}</code>
                  <span className="text-[9px] font-medium" style={{ color: urgenciaColor[s.urgencia] }}>{s.urgencia}</span>
                </div>
                <p className="text-[10px] text-[#8B949E] mb-3">{s.motivo}</p>
                {instalados.includes(s.paquete) ? (
                  <span className="flex items-center gap-1 text-[10px] text-[#3FB950]"><Check className="w-3 h-3" /> Instalado</span>
                ) : (
                  <button
                    data-testid={`instalar-${s.id}`}
                    onClick={() => instalar(s.paquete)}
                    className="text-[10px] bg-[#238636] text-white px-2.5 py-1 rounded-md hover:bg-[#2EA043] transition-colors font-medium"
                  >
                    Instalar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

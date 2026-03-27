import { useState } from "react";
import { Layers, Plus, Package, Check, X, Cpu, Globe, Server, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

const templates = [
  { id: 1, nombre: "Full Stack SaaS", descripcion: "React + FastAPI + MongoDB + Auth JWT + Docker", tags: ["React", "FastAPI", "MongoDB", "Docker"], icon: Globe, color: "#00F0FF", popular: true },
  { id: 2, nombre: "Next.js + PostgreSQL", descripcion: "App Router, Prisma ORM, NextAuth, TailwindCSS", tags: ["Next.js", "PostgreSQL", "Prisma", "NextAuth"], icon: Server, color: "#39FF14", popular: true },
  { id: 3, nombre: "Microservicios", descripcion: "FastAPI x3 + API Gateway + Redis + RabbitMQ", tags: ["FastAPI", "Redis", "RabbitMQ", "Docker"], icon: Cpu, color: "#FF007F", popular: false },
  { id: 4, nombre: "Seguridad Avanzada", descripcion: "OAuth2, RBAC, Rate Limiting, JWT Rotation", tags: ["OAuth2", "RBAC", "Redis", "FastAPI"], icon: Shield, color: "#FFE600", popular: false },
  { id: 5, nombre: "API REST Minimal", descripcion: "FastAPI + MongoDB + Pydantic V2 + Tests", tags: ["FastAPI", "MongoDB", "Pytest"], icon: Zap, color: "#00F0FF", popular: false },
];

const sugerenciasIA = [
  { id: 1, paquete: "stripe ^14.0.0", motivo: "Módulo de pagos detectado sin SDK", modulo: "Pagos", urgencia: "Alta" },
  { id: 2, paquete: "redis ^4.6.0", motivo: "Mejoraría rendimiento del caché un 40%", modulo: "Performance", urgencia: "Media" },
  { id: 3, paquete: "pytest-asyncio ^0.23.0", motivo: "Tests async sin cobertura completa", modulo: "Testing", urgencia: "Baja" },
  { id: 4, paquete: "pydantic-settings ^2.0.0", motivo: "Variables de entorno sin validación tipada", modulo: "Config", urgencia: "Media" },
];

const urgenciaStyle = {
  Alta: "text-[#FF007F] bg-[#FF007F]/10 border-[#FF007F]/25",
  Media: "text-[#FFE600] bg-[#FFE600]/10 border-[#FFE600]/25",
  Baja: "text-[#39FF14] bg-[#39FF14]/10 border-[#39FF14]/25",
};

export default function Scaffolding() {
  const [instalados, setInstalados] = useState([]);

  const instalar = (paquete) => {
    setInstalados(prev => [...prev, paquete]);
    toast.success(`Instalando: ${paquete}`, { description: "Ejecutando pip install / yarn add..." });
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-[#FF007F]" strokeWidth={1.5} />
          <h1 className="font-mono text-lg font-bold text-white">Scaffolding & Stack</h1>
        </div>
        <button
          data-testid="nuevo-stack-btn"
          onClick={() => toast.info("Analizando proyecto para generar stack óptimo...")}
          className="flex items-center gap-2 bg-[#FF007F]/20 text-[#FF007F] border border-[#FF007F]/30 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#FF007F]/30 transition-all active:scale-95"
        >
          <Cpu className="w-3.5 h-3.5" strokeWidth={1.5} />
          Generar con IA
        </button>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Templates */}
        <div className="lg:col-span-2">
          <h2 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
            Plantillas de Stack
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map((t, i) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  data-testid={`template-${t.id}`}
                  className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl p-4 hover:border-white/15 transition-all cursor-pointer group"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => toast.success(`Aplicando template: ${t.nombre}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${t.color}18`, border: `1px solid ${t.color}30` }}>
                      <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: t.color }} />
                    </div>
                    {t.popular && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25 rounded-full font-medium">
                        Popular
                      </span>
                    )}
                  </div>
                  <h3 className="font-mono font-semibold text-sm text-white mb-1">{t.nombre}</h3>
                  <p className="text-xs text-slate-400 mb-3">{t.descripcion}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 bg-white/5 border border-white/8 text-slate-400 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sugerencias IA */}
        <div>
          <h2 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FFE600]" strokeWidth={1.5} />
            Sugerencias IA
          </h2>
          <div className="space-y-2">
            {sugerenciasIA.map((s, i) => (
              <div
                key={s.id}
                data-testid={`sugerencia-${s.id}`}
                className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl p-4"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <code className="text-[11px] font-mono text-[#00F0FF]">{s.paquete}</code>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${urgenciaStyle[s.urgencia]}`}>
                    {s.urgencia}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">{s.motivo}</p>
                <div className="flex gap-2">
                  {instalados.includes(s.paquete) ? (
                    <span className="flex items-center gap-1 text-[10px] text-[#39FF14]">
                      <Check className="w-3 h-3" /> Instalado
                    </span>
                  ) : (
                    <>
                      <button
                        data-testid={`instalar-${s.id}`}
                        onClick={() => instalar(s.paquete)}
                        className="flex items-center gap-1 text-[10px] bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/25 px-2 py-1 rounded-md hover:bg-[#39FF14]/20 transition-all"
                      >
                        <Check className="w-3 h-3" /> Instalar
                      </button>
                      <button
                        data-testid={`ignorar-${s.id}`}
                        className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded-md border border-white/8 hover:border-white/15 transition-all"
                      >
                        Ignorar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Sparkles, X, Check, Package, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";

const suggestions = [
  {
    id: 1,
    icon: Package,
    category: "Instalación de Paquetes",
    message: "Para el módulo de pagos, te sugiero agregar 'Stripe SDK'. ¿Aceptar e instalar dependencias?",
    tech: "stripe ^14.0.0",
    impact: "Alta",
  },
  {
    id: 2,
    icon: ShieldCheck,
    category: "Seguridad",
    message: "El componente AuthGuard tiene 2 rutas sin proteger. ¿Deseas que aplique los middlewares de seguridad automáticamente?",
    tech: "Parches de seguridad",
    impact: "Crítica",
  },
  {
    id: 3,
    icon: Zap,
    category: "Optimización",
    message: "Detecto 4 consultas N+1 en ProductService. ¿Quieres que optimice las queries con eager loading?",
    tech: "Query Optimization",
    impact: "Media",
  },
];

export default function BannerIA() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  if (dismissed) return null;

  const s = suggestions[currentIdx];
  const Icon = s.icon;

  const handleAccept = () => {
    setAccepting(true);
    setTimeout(() => {
      toast.success(`Instalando: ${s.tech}`, {
        description: "Ejecutando en segundo plano. Te notificaré cuando termine.",
      });
      setAccepting(false);
      setCurrentIdx((prev) => (prev + 1) % suggestions.length);
    }, 600);
  };

  const handleReject = () => {
    if (currentIdx < suggestions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setDismissed(true);
    }
    toast.info("Sugerencia rechazada", { description: "Puedes revisarla más tarde en el Centro de IA." });
  };

  return (
    <div
      data-testid="banner-ia"
      className="fade-in-up mb-6 bg-gradient-to-r from-[#00F0FF]/8 via-[#111827]/60 to-[#111827]/60 border border-[#00F0FF]/20 rounded-xl p-4 flex items-start gap-4 shimmer relative overflow-hidden"
    >
      <div className="w-9 h-9 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-[#00F0FF]" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-[0.15em] text-[#00F0FF] font-semibold">
            Sugerencia IA
          </span>
          <span className="text-[10px] text-slate-500">·</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <Icon className="w-3 h-3" strokeWidth={1.5} />
            {s.category}
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
              s.impact === "Crítica"
                ? "bg-[#FF007F]/10 text-[#FF007F] border border-[#FF007F]/25"
                : s.impact === "Alta"
                ? "bg-[#FFE600]/10 text-[#FFE600] border border-[#FFE600]/25"
                : "bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/25"
            }`}
          >
            {s.impact}
          </span>
        </div>
        <p className="text-sm text-slate-200 leading-snug">{s.message}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          data-testid="banner-accept-btn"
          onClick={handleAccept}
          disabled={accepting}
          className="flex items-center gap-1.5 bg-[#00F0FF] text-[#0B0F19] text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#00F0FF]/80 hover:shadow-[0_0_12px_rgba(0,240,255,0.35)] transition-all active:scale-95 disabled:opacity-60"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
          Aceptar
        </button>
        <button
          data-testid="banner-reject-btn"
          onClick={handleReject}
          className="flex items-center gap-1.5 text-slate-400 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:text-white hover:bg-white/5 transition-all active:scale-95"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
          Rechazar
        </button>
      </div>

      <button
        data-testid="banner-dismiss-btn"
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-slate-600 hover:text-slate-400 transition-colors"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

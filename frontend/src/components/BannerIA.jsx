import { useState } from "react";
import { Sparkles, X, Check, Package, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";

const getSuggestions = (projectName) => [
  {
    id: 1, icon: Package, category: "Dependencias",
    message: `Para ${projectName}, sugiero agregar 'Stripe SDK' para el módulo de pagos. ¿Instalar dependencias?`,
    tech: "stripe ^14.0.0", impact: "Alta",
  },
  {
    id: 2, icon: ShieldCheck, category: "Seguridad",
    message: `Detecté 2 rutas sin proteger en ${projectName}. ¿Aplicar middlewares de autenticación automáticamente?`,
    tech: "Auth Middleware", impact: "Crítica",
  },
  {
    id: 3, icon: Zap, category: "Optimización",
    message: `Hay 4 consultas N+1 en el servicio principal. ¿Optimizar queries con eager loading?`,
    tech: "Query Optimization", impact: "Media",
  },
];

export default function BannerIA({ projectName = "el proyecto" }) {
  const suggestions = getSuggestions(projectName);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  if (dismissed) return null;

  const s = suggestions[currentIdx];
  const Icon = s.icon;

  const impactConfig = {
    Crítica: { color: "#F778BA", bg: "#F778BA14", border: "#F778BA22" },
    Alta: { color: "#E3B341", bg: "#E3B34114", border: "#E3B34122" },
    Media: { color: "#3FB950", bg: "#3FB95014", border: "#3FB95022" },
  };
  const imp = impactConfig[s.impact];

  const handleAccept = () => {
    setAccepting(true);
    setTimeout(() => {
      toast.success(`Aplicando: ${s.tech}`, { description: "Ejecutando en segundo plano." });
      setAccepting(false);
      setCurrentIdx((prev) => (prev + 1) % suggestions.length);
    }, 500);
  };

  const handleReject = () => {
    toast.info("Sugerencia ignorada");
    if (currentIdx < suggestions.length - 1) setCurrentIdx((p) => p + 1);
    else setDismissed(true);
  };

  return (
    <div
      data-testid="banner-ia"
      className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-4 flex items-start gap-4 relative overflow-hidden"
      style={{ borderLeft: `2px solid #58A6FF` }}
    >
      <div className="w-8 h-8 rounded-lg bg-[#388BFD]/15 border border-[#388BFD]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-[#58A6FF]" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold text-[#58A6FF] uppercase tracking-[0.1em]">Sugerencia IA</span>
          <span className="text-[#30363D]">·</span>
          <span className="flex items-center gap-1 text-[10px] text-[#8B949E]">
            <Icon className="w-3 h-3" strokeWidth={1.5} />
            {s.category}
          </span>
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ color: imp.color, background: imp.bg, border: `1px solid ${imp.border}` }}
          >
            {s.impact}
          </span>
        </div>
        <p className="text-sm text-[#F0F6FC] leading-snug">{s.message}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          data-testid="banner-accept-btn"
          onClick={handleAccept}
          disabled={accepting}
          className="flex items-center gap-1.5 bg-[#238636] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#2EA043] transition-colors active:scale-95 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
          Aceptar
        </button>
        <button
          data-testid="banner-reject-btn"
          onClick={handleReject}
          className="text-xs text-[#8B949E] px-3 py-1.5 rounded-lg border border-[#30363D] hover:border-[#484F58] hover:text-[#F0F6FC] transition-all"
        >
          Ignorar
        </button>
      </div>

      <button
        data-testid="banner-dismiss-btn"
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-[#30363D] hover:text-[#484F58] transition-colors"
      >
        <X className="w-3 h-3" strokeWidth={2} />
      </button>
    </div>
  );
}

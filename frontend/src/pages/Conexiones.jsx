import { useState } from "react";
import { Plug2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Wifi } from "lucide-react";
import { toast } from "sonner";

const conexiones = [
  { id: 1, nombre: "Claude API (Anthropic)", descripcion: "Conexión al modelo Claude 3.5 Sonnet para agentes NEXUS-3 y NEXUS-9", estado: "conectado", latencia: "142ms", version: "claude-3-5-sonnet", color: "#FF007F" },
  { id: 2, nombre: "OpenAI API", descripcion: "GPT-4o para agentes NEXUS-7 y NEXUS-5. Usado en generación de código principal.", estado: "conectado", latencia: "89ms", version: "gpt-4o-2024-08", color: "#39FF14" },
  { id: 3, nombre: "MongoDB Local", descripcion: "Base de datos local del proyecto. Collections: users, products, orders, sessions", estado: "conectado", latencia: "3ms", version: "v7.0.14", color: "#00F0FF" },
  { id: 4, nombre: "Gemini Pro (Google)", descripcion: "Modelo Gemini para agente NEXUS-2 (documentación) y análisis de contexto.", estado: "conectado", latencia: "210ms", version: "gemini-2.0-flash", color: "#FFE600" },
  { id: 5, nombre: "GitHub MCP", descripcion: "Integración con repositorios GitHub. Gestión de PRs, commits y branches.", estado: "error", latencia: "—", version: "mcp-gh v1.2", color: "#FF007F" },
  { id: 6, nombre: "Filesystem MCP", descripcion: "Acceso al sistema de archivos local. Lectura/escritura de código del proyecto.", estado: "conectado", latencia: "1ms", version: "mcp-fs v2.1", color: "#39FF14" },
  { id: 7, nombre: "Tauri Bridge", descripcion: "Puente de comunicación con la aplicación desktop Tauri. IPC y eventos nativos.", estado: "advertencia", latencia: "5ms", version: "tauri v2.0", color: "#FFE600" },
];

const estadoConfig = {
  conectado: { icon: CheckCircle2, badge: "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25", iconColor: "text-[#39FF14]", dot: "bg-[#39FF14] animate-pulse", label: "Conectado" },
  error: { icon: XCircle, badge: "bg-[#FF007F]/10 text-[#FF007F] border-[#FF007F]/25", iconColor: "text-[#FF007F]", dot: "bg-[#FF007F]", label: "Error" },
  advertencia: { icon: AlertCircle, badge: "bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/25", iconColor: "text-[#FFE600]", dot: "bg-[#FFE600]", label: "Advertencia" },
};

export default function Conexiones() {
  const [loading, setLoading] = useState(null);

  const reconectar = (id, nombre) => {
    setLoading(id);
    setTimeout(() => {
      setLoading(null);
      toast.success(`${nombre} reconectado exitosamente`);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug2 className="w-5 h-5 text-[#FF007F]" strokeWidth={1.5} />
          <h1 className="font-mono text-lg font-bold text-white">Conexiones MCP</h1>
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
            {conexiones.filter(c => c.estado === "conectado").length}/{conexiones.length} activas
          </span>
        </div>
        <button
          data-testid="agregar-conexion-btn"
          onClick={() => toast.info("Abriendo asistente de nueva conexión MCP...")}
          className="flex items-center gap-2 bg-[#FF007F]/15 text-[#FF007F] border border-[#FF007F]/30 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#FF007F]/25 transition-all active:scale-95"
        >
          <Plug2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          Agregar Conexión
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Status summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Activas", value: conexiones.filter(c => c.estado === "conectado").length, color: "#39FF14" },
            { label: "Con advertencia", value: conexiones.filter(c => c.estado === "advertencia").length, color: "#FFE600" },
            { label: "Con error", value: conexiones.filter(c => c.estado === "error").length, color: "#FF007F" },
          ].map((s, i) => (
            <div key={i} className="bg-[#111827]/60 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">{s.label}</span>
              <span className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Connections list */}
        <div className="space-y-3">
          {conexiones.map((con, i) => {
            const cfg = estadoConfig[con.estado];
            const StatusIcon = cfg.icon;
            return (
              <div
                key={con.id}
                data-testid={`conexion-${con.id}`}
                className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl p-5 flex items-center gap-4 hover:border-white/15 transition-all"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111827] ${cfg.dot}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-mono font-semibold text-sm text-white">{con.nombre}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{con.descripcion}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-[10px] font-mono text-slate-500">{con.version}</code>
                    {con.latencia !== "—" && (
                      <span className="text-[10px] text-slate-500">Latencia: <span className="text-slate-300 font-mono">{con.latencia}</span></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusIcon className={`w-4 h-4 ${cfg.iconColor}`} strokeWidth={1.5} />
                  <button
                    data-testid={`reconectar-${con.id}`}
                    onClick={() => reconectar(con.id, con.nombre)}
                    disabled={loading === con.id}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:border-white/20 hover:text-white transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading === con.id ? "animate-spin" : ""}`} strokeWidth={1.5} />
                    Reconectar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  Plug2, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Plus, Terminal, Github, Database, Cloud, HardDrive, Cpu, Globe, Wifi
} from "lucide-react";
import { toast } from "sonner";

const categorias = {
  llm: { label: "Modelos LLM", icon: Cpu, color: "#58A6FF" },
  mcp: { label: "Servidores MCP", icon: Terminal, color: "#D2A8FF" },
  db: { label: "Base de Datos", icon: Database, color: "#3FB950" },
  cloud: { label: "Cloud & DevOps", icon: Cloud, color: "#E3B341" },
  runtime: { label: "Runtime Local", icon: HardDrive, color: "#F778BA" },
};

const conexionesData = [
  {
    id: 1, categoria: "llm", nombre: "Claude API (Anthropic)",
    descripcion: "Claude 3.5 Sonnet para agentes NEXUS-3 y NEXUS-9. Usado en análisis de arquitectura y QA.",
    estado: "conectado", latencia: "142ms", version: "claude-3-5-sonnet-20241022",
    endpoint: "https://api.anthropic.com/v1",
    agentes: ["NEXUS-3", "NEXUS-9"],
  },
  {
    id: 2, categoria: "llm", nombre: "OpenAI API",
    descripcion: "GPT-4o para agentes NEXUS-7 y NEXUS-5. Modelo principal para generación de código.",
    estado: "conectado", latencia: "89ms", version: "gpt-4o-2024-11-20",
    endpoint: "https://api.openai.com/v1",
    agentes: ["NEXUS-7", "NEXUS-5"],
  },
  {
    id: 3, categoria: "llm", nombre: "Gemini (Google)",
    descripcion: "Gemini 2.0 Flash para agente NEXUS-2. Generación de documentación y análisis de contexto.",
    estado: "conectado", latencia: "210ms", version: "gemini-2.0-flash",
    endpoint: "https://generativelanguage.googleapis.com",
    agentes: ["NEXUS-2"],
  },
  {
    id: 4, categoria: "mcp", nombre: "GitHub MCP Server",
    descripcion: "Integración con GitHub. Gestión de repositorios, PRs, commits, issues y branches.",
    estado: "error", latencia: "—", version: "mcp-gh v1.2.0",
    endpoint: "stdio: npx @modelcontextprotocol/server-github",
    agentes: ["NEXUS-7", "NEXUS-5"],
  },
  {
    id: 5, categoria: "mcp", nombre: "Filesystem MCP Server",
    descripcion: "Acceso al sistema de archivos local. Lectura, escritura y navegación del código del proyecto.",
    estado: "conectado", latencia: "1ms", version: "mcp-fs v2.1.0",
    endpoint: "stdio: npx @modelcontextprotocol/server-filesystem",
    agentes: ["NEXUS-7", "NEXUS-3", "NEXUS-9"],
  },
  {
    id: 6, categoria: "mcp", nombre: "Brave Search MCP",
    descripcion: "Búsqueda web para agentes. Permite consultar documentación, errores y dependencias en tiempo real.",
    estado: "conectado", latencia: "320ms", version: "mcp-brave v1.0.2",
    endpoint: "stdio: npx @modelcontextprotocol/server-brave-search",
    agentes: ["NEXUS-7", "NEXUS-9"],
  },
  {
    id: 7, categoria: "db", nombre: "MongoDB Local",
    descripcion: "Base de datos local del proyecto. Collections: users, products, orders, sessions.",
    estado: "conectado", latencia: "3ms", version: "MongoDB v7.0.14",
    endpoint: "mongodb://localhost:27017",
    agentes: [],
  },
  {
    id: 8, categoria: "runtime", nombre: "Tauri Bridge",
    descripcion: "Puente de comunicación IPC con la aplicación desktop Tauri. Eventos nativos y sistema de archivos.",
    estado: "advertencia", latencia: "5ms", version: "tauri v2.0.0",
    endpoint: "ipc://localhost",
    agentes: [],
  },
];

const estadoConfig = {
  conectado: {
    icon: CheckCircle2, iconColor: "text-[#3FB950]",
    dot: "bg-[#3FB950] animate-pulse", label: "Conectado",
    labelColor: "#3FB950",
  },
  error: {
    icon: XCircle, iconColor: "text-[#F778BA]",
    dot: "bg-[#F778BA]", label: "Error",
    labelColor: "#F778BA",
  },
  advertencia: {
    icon: AlertCircle, iconColor: "text-[#E3B341]",
    dot: "bg-[#E3B341]", label: "Advertencia",
    labelColor: "#E3B341",
  },
};

export default function Conexiones() {
  const [loading, setLoading] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  const [expandido, setExpandido] = useState(null);

  const reconectar = (id, nombre) => {
    setLoading(id);
    setTimeout(() => {
      setLoading(null);
      toast.success(`${nombre} reconectado`, { description: "Conexión restablecida exitosamente." });
    }, 1500);
  };

  const filtered = filtro === "todas"
    ? conexionesData
    : conexionesData.filter((c) => c.categoria === filtro || c.estado === filtro);

  const stats = {
    conectado: conexionesData.filter((c) => c.estado === "conectado").length,
    advertencia: conexionesData.filter((c) => c.estado === "advertencia").length,
    error: conexionesData.filter((c) => c.estado === "error").length,
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug2 className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Conexiones MCP</h1>
          <span className="text-[10px] text-[#484F58] bg-[#21262D] px-2 py-0.5 rounded-full border border-[#30363D]">
            {stats.conectado}/{conexionesData.length} activas
          </span>
        </div>
        <button
          data-testid="agregar-conexion-btn"
          onClick={() => toast.info("Abriendo asistente de nueva conexión MCP...")}
          className="flex items-center gap-2 bg-[#238636] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nueva Conexión
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Conectadas", value: stats.conectado, color: "#3FB950" },
            { label: "Con advertencia", value: stats.advertencia, color: "#E3B341" },
            { label: "Con error", value: stats.error, color: "#F778BA" },
          ].map((s, i) => (
            <div
              key={i}
              className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-lg px-5 py-4 flex items-center justify-between"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <p className="text-xs text-[#8B949E]">{s.label}</p>
              <p className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {[
            { key: "todas", label: "Todas" },
            { key: "llm", label: "LLM" },
            { key: "mcp", label: "MCP Servers" },
            { key: "db", label: "Base de Datos" },
            { key: "runtime", label: "Runtime" },
            { key: "error", label: "Con error" },
          ].map(({ key, label }) => (
            <button
              key={key}
              data-testid={`filtro-conexion-${key}`}
              onClick={() => setFiltro(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filtro === key
                  ? "bg-[#21262D] text-[#F0F6FC] border border-[#388BFD]/40"
                  : "text-[#8B949E] border border-transparent hover:text-[#F0F6FC] hover:bg-[#161B26]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Connections grouped by category */}
        {Object.entries(categorias).map(([catKey, cat]) => {
          const items = filtered.filter((c) => c.categoria === catKey);
          if (items.length === 0) return null;
          const CatIcon = cat.icon;
          return (
            <div key={catKey} className="mb-5">
              <div className="flex items-center gap-2 mb-2 px-1">
                <CatIcon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: cat.color }} />
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: cat.color }}>
                  {cat.label}
                </p>
                <span className="text-[9px] text-[#484F58] bg-[#21262D] px-1.5 py-0.5 rounded-full border border-[#30363D]">
                  {items.filter(i => i.estado === "conectado").length}/{items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.map((con, i) => {
                  const cfg = estadoConfig[con.estado];
                  const StatusIcon = cfg.icon;
                  const isExpanded = expandido === con.id;

                  return (
                    <div
                      key={con.id}
                      data-testid={`conexion-${con.id}`}
                      className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden hover:border-[#30363D] transition-all"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      {/* Main row */}
                      <div
                        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer"
                        onClick={() => setExpandido(isExpanded ? null : con.id)}
                      >
                        {/* Status dot + icon */}
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-lg bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                            <Wifi className="w-4 h-4 text-[#484F58]" strokeWidth={1.5} />
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161B26] ${cfg.dot}`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-mono font-semibold text-sm text-[#F0F6FC]">{con.nombre}</p>
                            <span className="text-[9px] font-medium" style={{ color: cfg.labelColor }}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-[#8B949E] truncate">{con.descripcion}</p>
                        </div>

                        {/* Meta + actions */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {con.latencia !== "—" && (
                            <div className="text-right hidden sm:block">
                              <p className="text-[9px] text-[#484F58] uppercase tracking-wider">Latencia</p>
                              <p className="font-mono text-xs text-[#8B949E]">{con.latencia}</p>
                            </div>
                          )}
                          <StatusIcon className={`w-4 h-4 flex-shrink-0 ${cfg.iconColor}`} strokeWidth={1.5} />
                          <button
                            data-testid={`reconectar-${con.id}`}
                            onClick={(e) => { e.stopPropagation(); reconectar(con.id, con.nombre); }}
                            disabled={loading === con.id}
                            className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#484F58] hover:text-[#F0F6FC] transition-all disabled:opacity-40 font-medium"
                          >
                            <RefreshCw className={`w-3 h-3 ${loading === con.id ? "animate-spin" : ""}`} strokeWidth={1.5} />
                            Reconectar
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-5 py-4 border-t border-[#21262D] bg-[#0D1117] space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.12em] text-[#484F58] mb-1 font-semibold">Versión</p>
                              <code className="text-xs font-mono text-[#8B949E]">{con.version}</code>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.12em] text-[#484F58] mb-1 font-semibold">Latencia</p>
                              <p className="font-mono text-xs" style={{ color: con.latencia === "—" ? "#484F58" : "#3FB950" }}>
                                {con.latencia}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.12em] text-[#484F58] mb-1 font-semibold">Endpoint</p>
                            <code className="text-[10px] font-mono text-[#D2A8FF] bg-[#21262D] px-2 py-1 rounded border border-[#30363D] block truncate">
                              {con.endpoint}
                            </code>
                          </div>
                          {con.agentes.length > 0 && (
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.12em] text-[#484F58] mb-1.5 font-semibold">Agentes usando esta conexión</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {con.agentes.map((ag) => (
                                  <span key={ag} className="text-[9px] font-mono px-2 py-0.5 bg-[#388BFD]/12 text-[#58A6FF] rounded-full border border-[#388BFD]/20">
                                    {ag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => toast.info(`Editando configuración de ${con.nombre}...`)}
                              className="text-[10px] px-3 py-1.5 rounded-lg border border-[#30363D] text-[#8B949E] hover:text-[#F0F6FC] hover:border-[#484F58] transition-all"
                            >
                              Editar configuración
                            </button>
                            <button
                              onClick={() => toast.error(`${con.nombre} desconectado`, { description: "Agentes que dependían de esta conexión quedarán inactivos." })}
                              className="text-[10px] px-3 py-1.5 rounded-lg border border-[#F778BA]/20 text-[#F778BA]/70 hover:text-[#F778BA] hover:border-[#F778BA]/40 transition-all"
                            >
                              Desconectar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

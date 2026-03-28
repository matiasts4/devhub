'use client';
import { useState, useEffect, useCallback } from "react";
import {
  Plug2, Plus, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Loader2, X, Wifi, Trash2, ChevronDown, ChevronUp
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const TYPE_CONFIG = {
  github:  { label: "GitHub",  color: "#F0F6FC" },
  linear:  { label: "Linear",  color: "#5E6AD2" },
  notion:  { label: "Notion",  color: "#FFFFFF" },
  jira:    { label: "Jira",    color: "#0052CC" },
  slack:   { label: "Slack",   color: "#4A154B" },
  generic: { label: "Genérico", color: "#8B949E" },
};

function AddConnectionModal({ onClose, onCreated }) {
  const supabase = createClient();
  const [form, setForm] = useState({ name: "", type: "generic", endpoint_url: "", api_key: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      toast.error("Debes iniciar sesion para crear conexiones MCP");
      return;
    }

    const { error } = await supabase.from("mcp_connections").insert({
      user_id: user.id,
      name: form.name,
      type: form.type || "generic",
      endpoint_url: form.endpoint_url || null,
      api_key_encrypted: form.api_key || null,
      config: {},
      is_active: true,
    });

    setSaving(false);

    if (error) {
      toast.error(error.message || "Error al crear conexion");
      return;
    }

    toast.success("Conexión creada");
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-borders-strong rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono font-bold text-text-primary text-sm">Nueva Conexión MCP</h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Nombre *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="ej. GitHub Personal" className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500/50 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none">
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k} className="bg-surface-card">{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Endpoint URL</label>
            <input value={form.endpoint_url} onChange={e => setForm(p => ({ ...p, endpoint_url: e.target.value }))}
              placeholder="https://api.example.com o stdio://..." className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500/50 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">API Key / Token</label>
            <input type="password" value={form.api_key} onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))}
              placeholder="sk-..." className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500/50 transition-colors" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-borders-strong text-text-muted text-sm hover:text-white transition-all">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:from-purple-400 hover:to-indigo-500 transition-all">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear Conexión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Conexiones() {
  const supabase = createClient();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [expanded, setExpanded]       = useState(null);
  const [toggling, setToggling]       = useState(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("mcp_connections")
      .select("id, name, type, endpoint_url, is_active, last_sync, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("No se pudieron cargar las conexiones MCP");
      setConnections([]);
      setLoading(false);
      return;
    }

    setConnections(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  async function toggleActive(conn) {
    setToggling(conn.id);
    await supabase.from("mcp_connections").update({ is_active: !conn.is_active }).eq("id", conn.id);
    setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, is_active: !c.is_active } : c));
    toast.success(conn.is_active ? "Conexión desactivada" : "Conexión activada");
    setToggling(null);
  }

  async function deleteConnection(id, name) {
    await supabase.from("mcp_connections").delete().eq("id", id);
    setConnections(prev => prev.filter(c => c.id !== id));
    toast.success(`${name} eliminada`);
  }

  const active   = connections.filter(c => c.is_active).length;
  const inactive = connections.length - active;

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug2 className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Conexiones MCP</h1>
          <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full border border-borders-strong">
            {active}/{connections.length} activas
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-success text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-success transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nueva Conexión
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Activas",    value: active,                   color: "#3FB950" },
            { label: "Inactivas",  value: inactive,                 color: "#484F58" },
            { label: "Total",      value: connections.length,       color: "#8B949E" },
          ].map((s, i) => (
            <div key={i} className="bg-surface-card border border-borders-subtle rounded-lg px-5 py-4 flex items-center justify-between fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <p className="text-xs text-text-muted">{s.label}</p>
              <p className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Connections list */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 text-[#388BFD] animate-spin" /></div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-card border border-borders-subtle flex items-center justify-center">
              <Plug2 className="w-7 h-7 text-text-muted" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-text-muted">No hay conexiones configuradas.</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-[#D2A8FF] hover:text-purple-300 underline underline-offset-2">
              + Añadir primera conexión MCP
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((conn, i) => {
              const typeCfg = TYPE_CONFIG[conn.type] || TYPE_CONFIG.generic;
              const isExpanded = expanded === conn.id;
              return (
                <div key={conn.id} className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden hover:border-borders-strong transition-all fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-center gap-4 px-5 py-3.5 cursor-pointer group" onClick={() => setExpanded(isExpanded ? null : conn.id)}>
                    {/* Icon */}
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-borders-strong flex items-center justify-center">
                        <Wifi className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161B26] ${conn.is_active ? "bg-[#3FB950] animate-pulse" : "bg-[#484F58]"}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-semibold text-sm text-text-primary">{conn.name}</p>
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-surface-elevated border border-borders-strong" style={{ color: typeCfg.color }}>
                          {typeCfg.label}
                        </span>
                        <span className={`text-[9px] font-medium ${conn.is_active ? "text-success" : "text-text-muted"}`}>
                          {conn.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      {conn.endpoint_url && (
                        <p className="text-xs text-text-muted truncate mt-0.5">{conn.endpoint_url}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); toggleActive(conn); }}
                        disabled={toggling === conn.id}
                        className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
                          conn.is_active
                            ? "border-[#F778BA]/25 text-danger hover:bg-[#F778BA]/8"
                            : "border-[#3FB950]/25 text-success hover:bg-[#3FB950]/8"
                        }`}
                      >
                        {toggling === conn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : conn.is_active ? "Desactivar" : "Activar"}
                      </button>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="px-5 py-4 border-t border-borders-subtle bg-surface-app space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Tipo</p>
                          <p className="text-text-muted">{typeCfg.label}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Creada</p>
                          <p className="text-text-muted">{new Date(conn.created_at).toLocaleDateString("es-ES")}</p>
                        </div>
                        {conn.last_sync && (
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Último sync</p>
                            <p className="text-text-muted">{new Date(conn.last_sync).toLocaleString("es-ES")}</p>
                          </div>
                        )}
                      </div>
                      {conn.endpoint_url && (
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Endpoint</p>
                          <code className="text-[10px] font-mono text-[#D2A8FF] bg-surface-elevated px-2 py-1 rounded border border-borders-strong block truncate">{conn.endpoint_url}</code>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => deleteConnection(conn.id, conn.name)}
                          className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border border-[#F778BA]/20 text-danger/70 hover:text-danger hover:border-[#F778BA]/40 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && <AddConnectionModal onClose={() => setShowModal(false)} onCreated={fetchConnections} />}
    </div>
  );
}

'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plug2,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  Wifi,
  Trash2,
  ChevronDown,
  ChevronUp,
  Code2,
  MessageSquare,
  Layers,
  LayoutDashboard,
  Globe,
  Zap,
  Info,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import {
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspaceSectionSurfaceStyle,
  getWorkspaceSectionHeaderStripStyle,
  getWorkspaceStatusPillStyle,
  getWorkspaceDataTileStyle,
} from './workspacePageChrome';
import {
  panelStyle,
  pillStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  inputStyle,
} from '@/chrome/morphology';

const TYPE_CONFIG = {
  github: { label: 'GitHub', color: '#F0F6FC', Icon: Code2, desc: 'Repositorios y PRs' },
  linear: { label: 'Linear', color: '#5E6AD2', Icon: Layers, desc: 'Gestión de proyectos' },
  notion: { label: 'Notion', color: '#FFFFFF', Icon: LayoutDashboard, desc: 'Wiki y documentos' },
  jira: { label: 'Jira', color: '#0052CC', Icon: Layers, desc: 'Issue tracking' },
  slack: { label: 'Slack', color: '#4A154B', Icon: MessageSquare, desc: 'Comunicación de equipo' },
  generic: { label: 'Genérico', color: '#8B949E', Icon: Globe, desc: 'API o endpoint genérico' },
};

// ─── Add Connection Modal ─────────────────────────────────────────────────────
function AddConnectionModal({ onClose, onCreated }) {
  const db = createClient();
  const [form, setForm] = useState({ name: '', type: 'generic', endpoint_url: '', api_key: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await db.from('mcp_connections').insert({
      id: `conn-${Date.now()}`,
      user_id: 'local-user',
      name: form.name,
      type: form.type || 'generic',
      endpoint_url: form.endpoint_url || null,
      api_key_encrypted: form.api_key || null,
      config: {},
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Error al crear conexión');
      return;
    }
    toast.success('Conexión creada');
    onCreated();
    onClose();
  }

  const selectedType = TYPE_CONFIG[form.type] || TYPE_CONFIG.generic;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[46px] bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-borders-strong rounded-none p-6 w-full max-w-md shadow-2xl fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#D2A8FF]/10 border border-[#D2A8FF]/20 flex items-center justify-center">
              <Plug2 className="w-3.5 h-3.5 text-[#D2A8FF]" strokeWidth={1.5} />
            </div>
            <h2 className="font-mono font-bold text-text-primary text-sm">Nueva Conexión MCP</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="cursor-pointer w-7 h-7 rounded-lg hover:bg-surface-elevated flex items-center justify-center text-text-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
              Nombre *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="ej. GitHub Personal"
              className="w-full bg-surface-app border border-borders-strong px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#D2A8FF]/50 focus:ring-1 focus:ring-[#D2A8FF]/10 transition-colors cursor-pointer"
            />
          </div>

          {/* Type — icon grid */}
          <div>
            <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-2">
              Tipo de conexión
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([k, v]) => {
                const isSelected = form.type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, type: k }))}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-none border text-center transition-all"
                    style={
                      isSelected
                        ? { background: `${v.color}12`, borderColor: `${v.color}40` }
                        : { background: 'var(--surface-app)', borderColor: 'var(--border-strong)' }
                    }
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: `${v.color}15`, border: `1px solid ${v.color}30` }}
                    >
                      <v.Icon
                        className="w-3.5 h-3.5"
                        style={{ color: v.color }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold leading-tight"
                      style={{ color: isSelected ? v.color : 'var(--text-muted)' }}
                    >
                      {v.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedType.desc && (
              <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" style={{ color: selectedType.color }} />
                {selectedType.desc}
              </p>
            )}
          </div>

          {/* Endpoint URL */}
          <div>
            <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
              Endpoint URL
            </label>
            <input
              value={form.endpoint_url}
              onChange={(e) => setForm((p) => ({ ...p, endpoint_url: e.target.value }))}
              placeholder="https://api.example.com o stdio://..."
              className="w-full bg-surface-app border border-borders-strong px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#D2A8FF]/50 focus:ring-1 focus:ring-[#D2A8FF]/10 transition-colors font-mono text-xs cursor-pointer"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs text-text-muted font-semibold uppercase tracking-wider mb-1.5">
              API Key / Token
            </label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))}
              placeholder="sk-..."
              className="w-full bg-surface-app border border-borders-strong px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#D2A8FF]/50 focus:ring-1 focus:ring-[#D2A8FF]/10 transition-colors cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-borders-strong text-text-muted text-sm hover:text-white transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
              style={btnPrimaryStyle({ size: 'md' })}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Creando...' : 'Crear Conexión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export default function Conexiones() {
  const db = useMemo(() => createClient(), []);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [toggling, setToggling] = useState(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from('mcp_connections')
      .select('id, name, type, endpoint_url, is_active, last_sync, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('No se pudieron cargar las conexiones MCP');
      setConnections([]);
    } else {
      setConnections(data || []);
    }
    setLoading(false);
  }, [db]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  async function toggleActive(conn) {
    setToggling(conn.id);
    await db.from('mcp_connections').update({ is_active: !conn.is_active }).eq('id', conn.id);
    setConnections((prev) =>
      prev.map((c) => (c.id === conn.id ? { ...c, is_active: !c.is_active } : c))
    );
    toast.success(conn.is_active ? 'Conexión desactivada' : 'Conexión activada');
    setToggling(null);
  }

  async function deleteConnection(id, name) {
    await db.from('mcp_connections').delete().eq('id', id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast.success(`"${name}" eliminada`);
  }

  const active = connections.filter((c) => c.is_active).length;
  const inactive = connections.length - active;

  return (
    <div className="min-h-screen core-page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between core-sticky-header"
        style={getWorkspacePageHeaderStyle()}
      >
        <div className="flex items-center gap-3">
          <WorkspacePageTitle
            icon={Plug2}
            title="Conexiones MCP"
            badges={[
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
                {active}/{connections.length} activas
              </span>,
            ]}
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 font-semibold px-3.5 py-2 text-xs transition-all active:scale-95 cursor-pointer"
          style={btnPrimaryStyle({ size: 'sm' })}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Nueva Conexión
        </button>
      </div>

      <div style={getWorkspacePageContentStyle()}>
        {/* Info Banner — as a card with header */}
        <div
          className="overflow-hidden mb-6 fade-in-up core-panel"
          style={panelStyle({ tone: 'accent' })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={getWorkspaceSectionHeaderStripStyle({ tone: 'accent' })}
          >
            <div
              className="w-9 h-9 rounded-none flex items-center justify-center"
              style={pillStyle({ tone: 'accent' })}
            >
              <Zap
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <h3
                className="typography-card-title"
                style={{ color: 'var(--accent-primary)' }}
              >
                Model Context Protocol (MCP)
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Qué es y cómo funciona
              </p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Las conexiones MCP permiten a Antigravity acceder a herramientas externas:
              repositorios GitHub, bases de datos, APIs y más. Cada conexión expone un conjunto de{' '}
              <strong style={{ color: 'var(--text-primary)' }}>tools</strong> que el agente puede
              invocar directamente durante el planning y la ejecución.
            </p>
          </div>
        </div>

        {/* Stats — as a card with header */}
        <div
          className="overflow-hidden mb-6 fade-in-up core-panel"
          style={getWorkspaceSectionSurfaceStyle()}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={getWorkspaceSectionHeaderStripStyle()}
          >
            <div
              className="w-9 h-9 rounded-none flex items-center justify-center"
              style={pillStyle({ tone: 'success' })}
            >
              <Wifi className="w-4 h-4" style={{ color: 'var(--success)' }} strokeWidth={1.5} />
            </div>
            <div>
              <h3
                className="typography-card-title"
                style={{ color: 'var(--text-primary)' }}
              >
                Estado de Conexiones
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Resumen de actividad
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Activas', value: active, color: 'var(--success)' },
                { label: 'Inactivas', value: inactive, color: 'var(--text-muted)' },
                { label: 'Total', value: connections.length, color: 'var(--text-secondary)' },
              ].map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded-none core-kpi-card"
                  style={{
                    ...getWorkspaceDataTileStyle(s.color),
                    background: `color-mix(in srgb, ${s.color} 12%, var(--chrome-panel-fill))`,
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {s.label}
                  </p>
                  <p className="font-mono text-2xl font-bold" style={{ color: s.color }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Connections list — as a card with header */}
        <div
          className="overflow-hidden fade-in-up core-panel"
          style={panelStyle()}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={getWorkspaceSectionHeaderStripStyle({ tone: 'neutral' })}
          >
            <div
              className="w-9 h-9 rounded-none flex items-center justify-center"
              style={pillStyle({ tone: 'accent' })}
            >
              <Plug2
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <h3
                className="typography-card-title"
                style={{ color: 'var(--text-primary)' }}
              >
                Conexiones Configuradas
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {connections.length}{' '}
                {connections.length === 1 ? 'conexión registrada' : 'conexiones registradas'}
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2
                  className="w-7 h-7 animate-spin"
                  style={{ color: 'var(--accent-primary)' }}
                />
              </div>
            ) : connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div
                  className="w-14 h-14 rounded-none flex items-center justify-center"
                  style={pillStyle()}
                >
                  <Plug2
                    className="w-7 h-7"
                    style={{ color: 'var(--text-muted)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No hay conexiones configuradas.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="text-xs underline underline-offset-2 transition-colors cursor-pointer"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  + Añadir primera conexión MCP
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((conn, i) => {
                  const typeCfg = TYPE_CONFIG[conn.type] || TYPE_CONFIG.generic;
                  const isExpanded = expanded === conn.id;
                  return (
                    <div
                      key={conn.id}
                      className="overflow-hidden transition-all fade-in-up hover:border-[var(--border-strong)]"
                      style={{
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border-subtle)',
                        animationDelay: `${i * 30}ms`,
                      }}
                    >
                      {/* Row */}
                      <div
                        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer group"
                        onClick={() => setExpanded(isExpanded ? null : conn.id)}
                      >
                        {/* Type icon */}
                        <div className="relative shrink-0">
                          <div
                            className="w-9 h-9 rounded-none flex items-center justify-center"
                            style={{
                              ...pillStyle(),
                              background: `color-mix(in srgb, ${typeCfg.color} 12%, var(--chrome-control-fill))`,
                              borderColor: `color-mix(in srgb, ${typeCfg.color} 30%, var(--chrome-border-color))`,
                            }}
                          >
                            <typeCfg.Icon
                              className="w-4 h-4"
                              style={{ color: typeCfg.color }}
                              strokeWidth={1.5}
                            />
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${conn.is_active ? 'animate-pulse' : ''}`}
                            style={{
                              background: conn.is_active ? 'var(--success)' : 'var(--text-muted)',
                              borderColor: 'var(--surface-app)',
                            }}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className="font-mono font-semibold text-sm"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {conn.name}
                            </p>
                            <span
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md border"
                              style={{
                                color: typeCfg.color,
                                background: `color-mix(in srgb, ${typeCfg.color} 10%, var(--chrome-control-fill))`,
                                borderColor: `color-mix(in srgb, ${typeCfg.color} 24%, var(--chrome-border-color))`,
                              }}
                            >
                              {typeCfg.label}
                            </span>
                            <span
                              className="text-[11px] font-medium"
                              style={{
                                color: conn.is_active ? 'var(--success)' : 'var(--text-muted)',
                              }}
                            >
                              {conn.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          {conn.endpoint_url && (
                            <p
                              className="text-xs truncate mt-0.5 font-mono"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {conn.endpoint_url}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActive(conn);
                            }}
                            disabled={toggling === conn.id}
                            className="text-xs px-3 py-1.5 border font-medium transition-all disabled:opacity-40"
                            style={{
                              borderColor: conn.is_active
                                ? 'color-mix(in srgb, var(--danger) 25%, transparent)'
                                : 'color-mix(in srgb, var(--success) 25%, transparent)',
                              color: conn.is_active ? 'var(--danger)' : 'var(--success)',
                              background: conn.is_active
                                ? 'color-mix(in srgb, var(--danger) 8%, transparent)'
                                : 'color-mix(in srgb, var(--success) 8%, transparent)',
                            }}
                          >
                            {toggling === conn.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : conn.is_active ? (
                              'Desactivar'
                            ) : (
                              'Activar'
                            )}
                          </button>
                          {isExpanded ? (
                            <ChevronUp
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          ) : (
                            <ChevronDown
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div
                          className="px-5 py-4 space-y-4"
                          style={{
                            borderTop: '1px solid var(--border-subtle)',
                            background: 'var(--surface-app)',
                          }}
                        >
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p
                                className="text-[11px] uppercase tracking-wider mb-1 font-semibold"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Tipo
                              </p>
                              <p style={{ color: 'var(--text-primary)' }}>{typeCfg.label}</p>
                            </div>
                            <div>
                              <p
                                className="text-[11px] uppercase tracking-wider mb-1 font-semibold"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Creada
                              </p>
                              <p style={{ color: 'var(--text-primary)' }}>
                                {new Date(conn.created_at).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            {conn.last_sync && (
                              <div>
                                <p
                                  className="text-[11px] uppercase tracking-wider mb-1 font-semibold"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  Último sync
                                </p>
                                <p style={{ color: 'var(--text-primary)' }}>
                                  {new Date(conn.last_sync).toLocaleString('es-ES')}
                                </p>
                              </div>
                            )}
                          </div>
                          {conn.endpoint_url && (
                            <div>
                              <p
                                className="text-[11px] uppercase tracking-wider mb-1.5 font-semibold"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Endpoint
                              </p>
                              <code
                                className="text-xs font-mono px-3 py-1.5 border block truncate"
                                style={{
                                  color: 'var(--accent-primary)',
                                  background: 'var(--surface-elevated)',
                                  borderColor: 'var(--border-strong)',
                                }}
                              >
                                {conn.endpoint_url}
                              </code>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => deleteConnection(conn.id, conn.name)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border transition-all hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] cursor-pointer"
                              style={{
                                borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)',
                                color: 'color-mix(in srgb, var(--danger) 70%, transparent)',
                                background: 'color-mix(in srgb, var(--danger) 6%, transparent)',
                              }}
                            >
                              <Trash2 className="w-3 h-3" /> Eliminar
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
        </div>
      </div>

      {showModal && (
        <AddConnectionModal onClose={() => setShowModal(false)} onCreated={fetchConnections} />
      )}
    </div>
  );
}

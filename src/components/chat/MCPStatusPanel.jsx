import { useState, useCallback } from 'react';
import {
  Server,
  ChevronDown,
  ChevronRight,
  Wrench,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  formatFreshnessLabel,
  getFreshnessLabel,
  getAuthorityLabel,
  getHealthStatusLabel,
} from '@/lib/operations/presenters';

const statusConfig = {
  connected: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    label: 'Conectado',
  },
  disconnected: {
    icon: XCircle,
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    label: 'Desconectado',
  },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Error' },
};

function ServerCard({ server }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[server.status] || statusConfig.disconnected;
  const StatusIcon = cfg.icon;
  const authorityLabel = getAuthorityLabel(server.authority);
  const freshnessLabel = server.freshness_ms
    ? formatFreshnessLabel(server.freshness_ms)
    : server.freshness
      ? getHealthStatusLabel(server.freshness)
      : null;

  return (
    <div
      className="border rounded-xl overflow-hidden"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
    >
      {/* Server header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
        style={{ color: 'var(--text-primary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-mono font-medium truncate block"
            style={{ color: 'var(--text-secondary)' }}
          >
            {server.name}
          </span>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <span className={`text-[10px] ${cfg.color} font-medium`}>{cfg.label}</span>
            {server.authority ? (
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {authorityLabel}
              </span>
            ) : null}
            {freshnessLabel ? (
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {freshnessLabel}
              </span>
            ) : null}
          </div>
          {server.status_reason ? (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {server.status_reason}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {server.tools?.length || 0} tools
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </button>

      {/* Tool list */}
      {expanded && server.tools && server.tools.length > 0 && (
        <div
          className="border-t px-3 py-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {server.tools.map((tool, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--surface-muted) 50%, transparent)' }}
            >
              <Wrench
                className="w-3 h-3 mt-0.5 flex-shrink-0"
                style={{ color: 'var(--text-muted)' }}
              />
              <div className="min-w-0">
                <p
                  className="text-[11px] font-mono truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {tool.name}
                </p>
                {tool.description && (
                  <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {tool.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceList({ evidence = [] }) {
  if (!evidence.length) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {evidence.map((item, index) => (
        <p
          key={`${item.kind || 'evidence'}-${item.ref || index}`}
          className="text-[10px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {item.kind}
          {item.ref ? ` · ${item.ref}` : ''}
          {item.authority ? ` · ${getAuthorityLabel(item.authority)}` : ''}
        </p>
      ))}
    </div>
  );
}

function ProbeCard({ probe }) {
  const cfg = statusConfig[probe.status] || statusConfig.disconnected;
  const StatusIcon = cfg.icon;

  return (
    <div
      className="border rounded-xl px-3 py-2.5"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
    >
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {probe.key}
            </span>
            <span className={`text-[10px] ${cfg.color} font-medium`}>
              {getHealthStatusLabel(probe.status)}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {getAuthorityLabel(probe.authority)}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {getFreshnessLabel(probe.freshness)}
            </span>
          </div>
          {probe.reason ? (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {probe.reason}
            </p>
          ) : null}
          <EvidenceList evidence={probe.evidence} />
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }) {
  return (
    <div
      className="border rounded-xl px-3 py-2.5"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
    >
      <div className="flex items-start gap-2">
        <Wrench className="w-3.5 h-3.5 mt-0.5" style={{ color: 'var(--text-muted)' }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {tool.name}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {getAuthorityLabel(tool.authority)}
            </span>
            {tool.control_plane ? (
              <span className="text-[10px] text-emerald-400 font-medium">Control plane</span>
            ) : (
              <span className="text-[10px] text-amber-400 font-medium">No control plane</span>
            )}
            {tool.safe_action ? (
              <span className="text-[10px] text-emerald-400 font-medium">Acción segura</span>
            ) : null}
          </div>
          {tool.description ? (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {tool.description}
            </p>
          ) : null}
          {tool.reason ? (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {tool.reason}
            </p>
          ) : null}
          <EvidenceList evidence={tool.evidence} />
        </div>
      </div>
    </div>
  );
}

function SmokeSummary({ smoke }) {
  if (!smoke) return null;

  return (
    <div
      className="border rounded-xl px-3 py-2.5"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
          smoke
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {getHealthStatusLabel(
            smoke.status === 'pass' ? 'healthy' : smoke.status === 'fail' ? 'offline' : 'degraded'
          )}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {(smoke.checks || []).map((check) => (
          <ProbeCard key={check.key} probe={check} />
        ))}
      </div>
    </div>
  );
}

export default function MCPStatusPanel({
  servers = [],
  snapshot: snapshotProp = null,
  collapsed = false,
  onRefresh,
}) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const handleRefresh = useCallback(() => {
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  const snapshot = snapshotProp || (!Array.isArray(servers) && servers?.doctor ? servers : null);
  const serverList = Array.isArray(servers) ? servers : snapshot?.servers || [];
  const totalTools = serverList.reduce((sum, s) => sum + (s.tools?.length || 0), 0);
  const connectedCount = serverList.filter((s) => s.status === 'connected').length;
  const title = snapshot ? 'MCP Control Center' : 'MCP Servers';

  return (
    <div
      style={{
        background: 'var(--surface-muted)',
        borderColor: 'var(--border-strong)',
        borderWidth: 1,
      }}
      className="rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: 1, borderColor: 'var(--border-strong)' }}
      >
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <Server className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {connectedCount}/{serverList.length} · {totalTools} tools
          </span>
        </button>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.background = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
              title="Refrescar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed((v) => !v)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Server list */}
      {!isCollapsed && (
        <div className="p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {snapshot ? (
            <>
              <div className="space-y-2">
                {(snapshot.doctor?.probes || []).map((probe) => (
                  <ProbeCard key={probe.key} probe={probe} />
                ))}
              </div>

              <div className="space-y-2">
                {(snapshot.list_tools?.tools || []).map((tool) => (
                  <ToolCard key={`${tool.authority}-${tool.name}`} tool={tool} />
                ))}
              </div>

              <SmokeSummary smoke={snapshot.smoke} />
            </>
          ) : serverList.length === 0 ? (
            <div
              className="text-center py-6 text-xs font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              No hay servidores MCP configurados
            </div>
          ) : (
            serverList.map((server, i) => <ServerCard key={server.name || i} server={server} />)
          )}
        </div>
      )}
    </div>
  );
}

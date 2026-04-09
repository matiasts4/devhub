import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Cpu,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const getStatusConfig = (quotaData) => {
  if (quotaData.status === 'exhausted') {
    return {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      label: 'Agotado',
    };
  }
  if (quotaData.status === 'error' || quotaData.status === 'unknown') {
    return {
      icon: AlertCircle,
      color: 'text-orange-400',
      bg: 'bg-orange-400/10',
      label: 'Error',
    };
  }
  return {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    label: 'Disponible',
  };
};

function ProfileCard({ profileData }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = getStatusConfig(profileData);
  const StatusIcon = cfg.icon;

  const usedPercent = profileData.quotaUsedPercent ?? 0;
  // Determine color of progress bar based on usage
  const progressColor = usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-orange-500' : 'bg-emerald-500';

  return (
    <div
      className="border rounded-xl overflow-hidden"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
    >
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
            {profileData.profile === 'default' || !profileData.profile ? 'Principal' : profileData.profile}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] ${cfg.color} font-medium`}>{cfg.label}</span>
            {profileData.quotaUsedPercent !== null && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                ({profileData.quotaUsedPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <div
          className="border-t px-3 py-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {profileData.quotaUsedPercent !== null && (
            <div className="space-y-1 mt-1">
              <div className="flex justify-between text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                <span>Uso ({profileData.model || 'modelo'})</span>
                <span>{profileData.quotaUsedPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                <div 
                  className={`h-full transition-all duration-500 ${progressColor}`} 
                  style={{ width: `${Math.min(100, Math.max(0, profileData.quotaUsedPercent))}%` }}
                />
              </div>
            </div>
          )}
          
          {profileData.resetIn && (
            <div className="flex items-center justify-between text-[10px] font-mono rounded bg-opacity-50 px-2 py-1.5" style={{ background: 'var(--surface-muted)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Resetea en:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{profileData.resetIn}</span>
            </div>
          )}

          {profileData.error && (
            <div className="flex items-start gap-1.5 text-[10px] text-red-400 p-1.5 rounded bg-red-400/10">
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span className="break-words">{profileData.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GeminiQuotasPanel({ collapsed = false }) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [isLoading, setIsLoading] = useState(false);
  const [quotas, setQuotas] = useState([]);

  const fetchQuotas = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/agents/quotas');
      if (!res.ok) throw new Error('Error al cargar cuotas');
      const data = await res.json();
      if (data.success && data.quotas) {
        setQuotas(data.quotas);
      }
    } catch (err) {
      toast.error('Ocurrió un problema al obtener las cuotas de Gemini');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Solo cargamos si el panel no está colapsado y nunca se han cargado,
    // o para inicializarlos
    fetchQuotas();
  }, [fetchQuotas]);

  const availableCount = quotas.filter((q) => q.status === 'available').length;

  return (
    <div
      style={{
        background: 'var(--surface-muted)',
        borderColor: 'var(--border-strong)',
        borderWidth: 1,
      }}
      className="rounded-xl overflow-hidden mt-3"
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: 1, borderColor: 'var(--border-strong)' }}
      >
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <Cpu className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Gemini Profiles
          </h3>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {isLoading ? 'Checheando...' : `${availableCount}/${quotas.length} diponibles`}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchQuotas();
            }}
            disabled={isLoading}
            className={`p-1.5 rounded-lg transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.background = 'var(--surface-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Refrescar Cuotas"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
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

      {!isCollapsed && (
        <div className="p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {isLoading && quotas.length === 0 ? (
           <div className="text-center py-6 text-xs font-mono flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
             <Loader2 className="w-4 h-4 animate-spin" /> Evaluando perfiles y límites de APIs...
           </div>
          ) : quotas.length === 0 ? (
            <div
              className="text-center py-6 text-xs font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              No hay perfiles de Gemini configurados en ~/.gemini-profiles
            </div>
          ) : (
            quotas.map((profileData, i) => (
              <ProfileCard key={profileData.profile || i} profileData={profileData} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

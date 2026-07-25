'use client';
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { sileo } from 'sileo';
import { panelStyle, btnPrimaryStyle, btnSecondaryStyle } from '@/chrome/morphology';

const AGENTS_LIST = [
  { id: 'kimi', name: 'Kimi Code', desc: 'Detección por hooks TOML (~/.kimi-code/config.toml)' },
  { id: 'claude', name: 'Claude Code', desc: 'Detección por hooks JSON (~/.claude/settings.json)' },
  {
    id: 'opencode',
    name: 'OpenCode CLI',
    desc: 'Detección por plugin JS (opencode/plugins/devhub-agent-state.js)',
  },
];

export default function AgentHooksSettingsSection() {
  const [statuses, setStatuses] = useState({
    kimi: { installed: false, exists: false },
    claude: { installed: false, exists: false },
    opencode: { installed: false, exists: false },
  });
  const [loading, setLoading] = useState(true);
  const [busyAgent, setBusyAgent] = useState(null);

  const fetchStatuses = async () => {
    try {
      const res = await fetch('/api/terminal/agent-hooks/installer');
      if (res.ok) {
        const data = await res.json();
        if (data.statuses) {
          setStatuses(data.statuses);
        }
      }
    } catch (err) {
      console.error('Failed to fetch agent hook statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleToggleInstall = async (agentId, isCurrentlyInstalled) => {
    setBusyAgent(agentId);
    try {
      const res = await fetch('/api/terminal/agent-hooks/installer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: agentId,
          action: isCurrentlyInstalled ? 'uninstall' : 'install',
        }),
      });

      if (res.ok) {
        sileo.success({
          title: `Hooks de ${agentId} ${isCurrentlyInstalled ? 'desinstalados' : 'instalados'} exitosamente`,
        });
        await fetchStatuses();
      } else {
        const data = await res.json();
        sileo.error({ title: data.error || 'Error al cambiar estado de los hooks' });
      }
    } catch (err) {
      sileo.error({ title: 'Error de red: ' + err.message });
    } finally {
      setBusyAgent(null);
    }
  };

  return (
    <div className="overflow-hidden space-y-4" style={panelStyle()}>
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{
          borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
          background: 'var(--chrome-panel-fill-emphasis)',
        }}
      >
        <div className="w-9 h-9 flex items-center justify-center rounded-none bg-blue-500/10 text-blue-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Detección precisa de agentes (Hooks de Lifecycle)
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Permite que el agente reporte directamente su estado (running/blocked/idle) a DevHub
            eliminando el parpadeo en streaming largo.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          <div
            className="flex items-center gap-2 text-xs py-4"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando estado de hooks...
          </div>
        ) : (
          AGENTS_LIST.map((item) => {
            const status = statuses[item.id] || { installed: false };
            const isInstalled = Boolean(status.installed);
            const isBusy = busyAgent === item.id;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 border transition-colors"
                style={{
                  borderColor: 'var(--chrome-border-color)',
                  background: 'var(--chrome-panel-fill)',
                }}
              >
                <div className="flex items-center gap-3">
                  {isInstalled ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-zinc-500 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 font-mono uppercase font-medium border ${
                          isInstalled
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
                        }`}
                      >
                        {isInstalled
                          ? 'Instalado (Autoridad activada)'
                          : 'No instalado (Fallback a pantalla)'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {item.desc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleToggleInstall(item.id, isInstalled)}
                  className="px-3 py-1.5 text-xs font-mono font-medium border transition-all disabled:opacity-50"
                  style={isInstalled ? btnSecondaryStyle() : btnPrimaryStyle()}
                >
                  {isBusy ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...
                    </span>
                  ) : isInstalled ? (
                    'Desinstalar Hook'
                  ) : (
                    'Instalar Hook'
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

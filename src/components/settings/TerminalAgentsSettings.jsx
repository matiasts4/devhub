'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Shield, ShieldOff, Zap } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import { pillStyle } from '@/chrome/morphology';
import {
  AGENT_LAUNCH_CATALOG,
  readAgentLaunchPreferences,
  writeAgentLaunchPreferences,
  toggleAgentYolo,
  isAgentYoloEnabled,
} from '@/lib/terminal/agentLaunchPreferences';

export default function TerminalAgentsSettings() {
  const [prefs, setPrefs] = useState(() => readAgentLaunchPreferences());

  const handleToggle = useCallback((agentId) => {
    setPrefs((prev) => {
      const next = toggleAgentYolo(prev, agentId);
      return writeAgentLaunchPreferences(next);
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Modo de permisos por agente
        </h4>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Configurá qué agentes se lanzan con permisos elevados (modo yolo / auto-aprobación).
          Aplica al abrir desde el modal de nuevo workspace y desde el centro de comandos
          (Ctrl+Shift+P). Los cambios se guardan al instante.
        </p>
      </div>

      {/* Agent list */}
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          className="overflow-hidden"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-none bg-[var(--accent-primary)]/15">
              <Bot className="h-4 w-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Agentes TUI
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Permisos de lanzamiento para cada agente.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-2" data-testid="agent-launch-prefs-list">
            {AGENT_LAUNCH_CATALOG.map((agent) => {
              const enabled = isAgentYoloEnabled(prefs, agent.id);
              const supportsYolo = agent.yoloFlag !== null;

              return (
                <div
                  key={agent.id}
                  data-testid={`agent-launch-pref-row-${agent.id}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                  style={{
                    borderColor: enabled ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    background: enabled ? 'var(--chrome-control-fill)' : 'transparent',
                  }}
                >
                  {/* Icon */}
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: enabled ? 'var(--accent-primary)' : 'var(--text-muted)',
                      background: 'var(--surface-card)',
                    }}
                  >
                    {enabled ? <Zap size={14} /> : <Shield size={14} />}
                  </span>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <span
                      className="block truncate text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {agent.label}
                    </span>
                    <span
                      className="block truncate text-[10px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {supportsYolo
                        ? `${agent.description} · ${agent.yoloFlag}`
                        : agent.description}
                    </span>
                  </div>

                  {/* Yolo flag badge */}
                  {supportsYolo && (
                    <span
                      className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                      style={pillStyle({ tone: enabled ? 'success' : 'neutral' })}
                    >
                      {agent.yoloFlag}
                    </span>
                  )}

                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Lanzar ${agent.label} con permisos elevados`}
                    disabled={!supportsYolo}
                    onClick={() => handleToggle(agent.id)}
                    data-testid={`agent-launch-pref-toggle-${agent.id}`}
                    className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                      background: enabled ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <span
                      className="absolute rounded-full bg-white shadow transition-transform"
                      style={{
                        top: '50%',
                        left: 2,
                        width: 20,
                        height: 20,
                        transform: `translate(${enabled ? 20 : 0}px, -50%)`,
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-6 py-3 border-t" style={{ borderColor: 'var(--chrome-border-color)' }}>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <ShieldOff className="inline w-3 h-3 mr-1" style={{ verticalAlign: '-2px' }} />
              Los agentes sin soporte de yolo (como OpenCode) gestionan permisos internamente en su
              TUI. El modo yolo se aplica automáticamente al lanzar desde el modal de nuevo
              workspace o el centro de comandos rápido.
            </p>
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}

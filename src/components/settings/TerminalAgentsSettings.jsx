'use client';

import { useEffect, useState } from 'react';
import { Bot, Server, Activity } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import { pillStyle } from '@/chrome/morphology';

export default function TerminalAgentsSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const res = await fetch('/api/agenthub/opencode/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudo consultar el estado');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const isRunning = status?.running;

  return (
    <div className="space-y-6">
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
                Agentes y Swarm
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Estado del servidor de agentes y sesiones activas.
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {loading ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Consultando estado…
              </p>
            ) : error ? (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            ) : (
              <>
                <div
                  className="flex items-center justify-between p-3 rounded-xl border"
                  style={chromeSurfaceStyle({ surface: 'panel' })}
                >
                  <div className="flex items-center gap-3">
                    <Server className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Servidor OpenCode
                    </span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded"
                    style={pillStyle({ tone: isRunning ? 'success' : 'danger' })}
                  >
                    <Activity className="w-3 h-3" />
                    {isRunning ? 'Activo' : 'Idle'}
                  </span>
                </div>

                {isRunning && (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Puerto', value: status.port || '—' },
                      { label: 'PID', value: status.pid || '—' },
                      { label: 'Sesiones activas', value: status.activeSessions ?? '—' },
                      { label: 'Máx. concurrente', value: status.maxConcurrent ?? '—' },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="p-3 rounded-xl border"
                        style={chromeSurfaceStyle({ surface: 'panel' })}
                      >
                        <p
                          className="text-[10px] uppercase tracking-wide"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {label}
                        </p>
                        <p
                          className="text-lg font-mono mt-1"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Para configurar proveedores LLM, modelos y límites de concurrencia, visitá la
                  sección <strong>Swarm</strong> o <strong>LLM</strong> desde el dashboard del
                  proyecto.
                </p>
              </>
            )}
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}

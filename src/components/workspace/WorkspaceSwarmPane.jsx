'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Bot, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import {
  composeControlRoomSnapshot,
  selectSwarmControlPrimarySurface,
} from '@/lib/operations/swarmControl';
import SwarmTopologyGraph from '../control-room/SwarmTopologyGraph';

export default function WorkspaceSwarmPane({
  project,
  dockState = {},
  onDockStateChange = null,
}) {
  const [fetchedInput, setFetchedInput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (project?.id) {
        params.set('project_id', project.id);
      }

      const response = await fetch(
        params.size
          ? `/api/agenthub/operations/health?${params.toString()}`
          : '/api/agenthub/operations/health',
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status} al obtener estado.`);
      }

      const payload = await response.json();
      const nextInput =
        payload.control_room_input ||
        payload.control_room_snapshot_input ||
        payload.control_room ||
        null;

      if (nextInput) {
        setFetchedInput(nextInput);
      } else {
        // Fallback: use payload directly if structured as control room
        setFetchedInput(payload);
      }
    } catch (err) {
      console.error('Failed to load swarm health snapshot in dock pane:', err);
      setError(err?.message || 'No se pudo obtener el estado del swarm.');
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    loadSnapshot();

    // Poll every 5 seconds while mounted to keep topology live
    const interval = setInterval(loadSnapshot, 5000);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  const snapshot = useMemo(() => {
    return composeControlRoomSnapshot(
      fetchedInput ? { ...fetchedInput, project } : project ? { project } : {}
    );
  }, [fetchedInput, project]);

  const primarySurface = useMemo(() => {
    return selectSwarmControlPrimarySurface(snapshot);
  }, [snapshot]);

  const roster = useMemo(() => {
    return primarySurface?.hero?.roster || [];
  }, [primarySurface]);

  const topology = useMemo(() => {
    return primarySurface?.hero?.topology || null;
  }, [primarySurface]);

  const isActive = primarySurface?.mode === 'active';

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-[linear-gradient(180deg,#09111b_0%,#060b12_100%)] text-[var(--text-primary)]"
      data-testid="workspace-swarm-pane"
    >
      {/* Toolbar */}
      <div className="flex h-11 items-center justify-between border-b border-[var(--border-subtle)] bg-[#07111c] px-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--accent-primary)]" />
          <span className="text-sm font-semibold tracking-wide">
            Swarm de Agentes
          </span>
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              isActive
                ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.65)]'
                : 'bg-slate-500'
            }`}
            title={isActive ? 'Swarm activo' : 'Swarm inactivo'}
          />
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span
              className="flex items-center gap-1 text-[10px] text-rose-400"
              title={error}
            >
              <AlertTriangle className="h-3 w-3" />
              Error de conexión
            </span>
          )}
          <button
            type="button"
            onClick={loadSnapshot}
            disabled={loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
            aria-label="Recargar"
            title="Recargar topología"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onDockStateChange && (
            <button
              type="button"
              onClick={() => {
                onDockStateChange((currentState) => ({
                  ...currentState,
                  visible: true,
                  activeTab: 'swarm',
                  maximized: !currentState.maximized,
                  maximizedView: 'swarm',
                }));
              }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.05]"
              aria-label={
                dockState?.maximized && dockState?.maximizedView === 'swarm'
                  ? 'Restaurar panel'
                  : 'Maximizar panel'
              }
              title={
                dockState?.maximized && dockState?.maximizedView === 'swarm'
                  ? 'Restaurar panel'
                  : 'Maximizar panel'
              }
            >
              {dockState?.maximized && dockState?.maximizedView === 'swarm' ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto">
        <div className="h-full flex flex-col gap-4">
          {/* Main interactive topology graph */}
          <div className="flex-1 min-h-[300px]">
            <SwarmTopologyGraph
              roster={roster}
              topology={topology}
              variant="full"
              className="h-full border-white/5"
            />
          </div>

          {/* Quick info card */}
          {isActive ? (
            <div
              className="rounded-xl border p-3"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
              }}
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Foco del Swarm
              </h4>
              <p className="mt-1.5 text-sm font-semibold">
                {primarySurface?.hero?.title}
              </p>
              {primarySurface?.hero?.highlights?.[0] && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {primarySurface.hero.highlights[0]}
                </p>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl border p-4 text-center"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'rgba(255,255,255,0.01)',
              }}
            >
              <p className="text-xs text-[var(--text-muted)]">
                No hay un swarm corriendo para este proyecto.
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Lanzalo desde la pestaña de SwarmControl.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

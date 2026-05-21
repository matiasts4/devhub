import React from 'react';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';

export default function SwarmTypeCatalogPanel({
  catalog,
  selectedSwarmTypeId = null,
  onSelectSwarmType,
  onLaunch,
}) {
  const swarmTypes = Array.isArray(catalog?.swarm_types) ? catalog.swarm_types : [];

  return (
    <section aria-label="Tipos de swarm" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Tipos de swarm</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Preparación liviana para elegir presets y defaults iniciales.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {swarmTypes.map((swarmType) => {
          const selected = swarmType.id === selectedSwarmTypeId;

          return (
            <SurfaceCard key={swarmType.id} emphasized={selected} className="p-4">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectSwarmType?.(swarmType.id)}
                className="w-full text-left"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{swarmType.label}</h3>
                    <div className="flex flex-wrap gap-2">
                      <SurfacePill>{swarmType.readiness}</SurfacePill>
                      {selected ? <SurfacePill tone="accent">Seleccionado</SurfacePill> : null}
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {swarmType.summary}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(swarmType.defaults_preview || []).map((item) => (
                    <SurfacePill key={item}>{item}</SurfacePill>
                  ))}
                </div>

                {swarmType.topology?.label ? (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Preview · {swarmType.topology.label}
                  </p>
                ) : null}
              </button>

              <div
                className="mt-4 flex items-center justify-between gap-3 border-t pt-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Ajustá defaults iniciales desde el wizard.
                </span>
                <button
                  type="button"
                  onClick={() => onLaunch?.(swarmType.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={{
                    borderColor: 'rgba(255,176,64,0.24)',
                    background: 'rgba(255,176,64,0.12)',
                  }}
                >
                  Configurar
                </button>
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </section>
  );
}

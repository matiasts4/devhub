import React from 'react';
import { btnPrimaryStyle, pillStyle, sectionSurfaceStyle } from '../../chrome/morphology';
import ActiveSwarmTowerPanel from './ActiveSwarmTowerPanel';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';

export default function SwarmPrimarySurface({ surface, onPrimaryAction }) {
  if (surface?.mode === 'active') {
    return (
      <section aria-label="Superficie primaria de swarm">
        <ActiveSwarmTowerPanel hero={surface.hero} onPrimaryAction={onPrimaryAction} />
      </section>
    );
  }

  const hero = surface?.hero || {};
  return (
    <section aria-label="Superficie primaria de swarm">
      <SurfaceCard emphasized className="p-5 md:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <SurfacePill tone="accent">Launchpad</SurfacePill>
              <SurfacePill>{hero.authority || 'unavailable'}</SurfacePill>
              <SurfacePill>{hero.freshness || 'unavailable'}</SurfacePill>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {hero.title || 'Lanzá un swarm nuevo'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {hero.highlights?.[0] || 'Elegí una plantilla y después afiná el tipo de swarm.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <SurfacePill tone="accent">
                {hero.recommendedTemplate?.label || 'Plantilla sugerida'}
              </SurfacePill>
              <SurfacePill>{`${hero.stats?.activeAgents || 0} agentes activos`}</SurfacePill>
              <SurfacePill>{`${hero.stats?.queueDepth || 0} tasks en cola`}</SurfacePill>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['1', 'Elegir equipo', 'Director + agentes listos'],
                ['2', 'Configurar misión', 'Path, provider y roles'],
                ['3', 'Abrir terminales', 'Workspace + runtime requests'],
              ].map(([step, title, summary]) => (
                <div
                  key={step}
                  className="p-3"
                  style={sectionSurfaceStyle()}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center text-xs font-bold"
                      style={{
                        ...pillStyle({ tone: 'accent' }),
                        width: '1.5rem',
                        height: '1.5rem',
                        padding: 0,
                        justifyContent: 'center',
                        borderRadius: '9999px',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      {step}
                    </span>
                    <p className="text-sm font-semibold">{title}</p>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {summary}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="space-y-4 p-4"
            style={sectionSurfaceStyle({ emphasized: true })}
          >
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Launch console
              </p>
              <h3 className="mt-2 text-base font-semibold">
                {hero.recommendedTemplate?.label || 'Plantilla recomendada'}
              </h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {hero.recommendedTemplate?.summary || hero.highlights?.[0]}
              </p>
            </div>

            <button
              type="button"
              disabled={hero?.primaryCta?.disabled}
              onClick={() => onPrimaryAction?.(hero?.primaryCta)}
              className="w-full disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                ...btnPrimaryStyle({ size: 'lg' }),
                width: '100%',
                height: 'auto',
                padding: '0.75rem 1rem',
                justifyContent: 'flex-start',
                textAlign: 'left',
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              {hero?.primaryCta?.label || 'Elegir plantilla recomendada'}
            </button>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {hero.highlights?.[1] ||
                'Lanza un workspace y abre las terminales del roster seleccionado.'}
            </p>
          </div>
        </div>
      </SurfaceCard>
    </section>
  );
}

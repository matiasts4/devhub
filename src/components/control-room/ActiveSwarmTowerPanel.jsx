import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';
import SwarmTopologyGraph from './SwarmTopologyGraph';
import { btnPrimaryStyle, dataTileStyle } from '../../chrome/morphology';
import { formatToken } from './utils';

function statLabel(value, singular, plural) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

export default function ActiveSwarmTowerPanel({ hero, onPrimaryAction }) {
  const roster = Array.isArray(hero?.roster) ? hero.roster : [];
  const director = roster.find((member) => member.isDirector) || roster[0] || null;
  const workers = roster.filter((member) => member.id !== director?.id);

  return (
    <SurfaceCard emphasized className="p-5 md:p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SurfacePill tone="accent">Swarm activo</SurfacePill>
            <SurfacePill>{formatToken(hero?.authority || 'unavailable')}</SurfacePill>
            <SurfacePill>{formatToken(hero?.freshness || 'unavailable')}</SurfacePill>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {hero?.title || 'Swarm activo'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Estado {formatToken(hero?.status || 'unknown')} ·{' '}
              {hero?.highlights?.[0] || 'Tomá el foco principal desde la vista durable.'}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <MetricStat
              label="Agentes activos"
              value={statLabel(hero?.stats?.activeAgents || 0, 'agente', 'agentes')}
            />
            <MetricStat
              label="Cola durable"
              value={statLabel(hero?.stats?.queueDepth || 0, 'task', 'tasks')}
            />
            <MetricStat
              label="Aprobaciones"
              value={statLabel(hero?.stats?.pendingApprovals || 0, 'pendiente', 'pendientes')}
            />
            <MetricStat
              label="Entregas"
              value={statLabel(hero?.stats?.pendingDeliveries || 0, 'pendiente', 'pendientes')}
            />
          </div>

          <div className="min-w-0 space-y-3">
            <button
              type="button"
              disabled={hero?.primaryCta?.disabled}
              onClick={() => {
                const cta = hero?.primaryCta;
                if (!cta || cta?.disabled) return;
                onPrimaryAction?.(cta);
              }}
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
              {hero?.primaryCta?.label || 'Continuar swarm'}
            </button>

            {hero?.primaryCta?.reason ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {hero.primaryCta.reason}
              </p>
            ) : null}

            {hero?.nextFocus ? (
              <SurfaceCard className="p-3">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Siguiente foco
                </p>
                <p className="mt-2 text-sm font-medium">{hero.nextFocus.title}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {hero.nextFocus.status}
                  {hero.nextFocus.priority ? ` · ${hero.nextFocus.priority}` : ''}
                </p>
              </SurfaceCard>
            ) : null}

            {hero?.identityHealth ? (
              <SurfaceCard className="p-3">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Identidad launch
                </p>
                <p className="mt-2 text-sm font-medium">
                  {hero.identityHealth.status === 'healthy'
                    ? 'Consistente entre UI, DB y runtime'
                    : `${hero.identityHealth.issueCount} desalineaciones detectadas`}
                </p>
                {hero.identityHealth.status !== 'healthy' &&
                Array.isArray(hero.identityHealth.issues) &&
                hero.identityHealth.issues.length > 0 ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {hero.identityHealth.issues[0]}
                  </p>
                ) : null}
              </SurfaceCard>
            ) : null}
          </div>
        </div>

        <div aria-label="Topología visual del swarm activo">
          <SwarmTopologyGraph roster={roster} topology={hero?.topology || null} variant="full" />
        </div>
      </div>
    </SurfaceCard>
  );
}

function MetricStat({ label, value }) {
  return (
    <div className="px-3 py-2.5" style={dataTileStyle()}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

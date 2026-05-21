import React from 'react';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';

function statLabel(value, singular, plural) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

function SwarmNode({ member, compact = false }) {
  const isDirector = member?.isDirector;

  return (
    <div
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      style={{
        background: isDirector
          ? 'radial-gradient(circle at 50% 0%, rgba(255,176,64,0.24), rgba(255,176,64,0.07) 62%, rgba(255,255,255,0.02))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))',
        borderColor: isDirector ? 'rgba(255,176,64,0.34)' : 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} flex shrink-0 items-center justify-center rounded-full border text-sm font-bold`}
          style={{
            background: isDirector ? 'rgba(255,111,0,0.22)' : 'rgba(88,166,255,0.12)',
            borderColor: isDirector ? 'rgba(255,176,64,0.4)' : 'rgba(88,166,255,0.24)',
            color: isDirector ? '#ffb040' : 'var(--text-primary)',
          }}
        >
          {member?.label?.charAt(0) || '?'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{member?.label || 'Agent'}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            {member?.status || 'unknown'}
            {member?.workspaceId ? ` · ${member.workspaceId}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ActiveSwarmTowerPanel({ hero }) {
  const roster = Array.isArray(hero?.roster) ? hero.roster : [];
  const director = roster.find((member) => member.isDirector) || roster[0] || null;
  const workers = roster.filter((member) => member.id !== director?.id);

  return (
    <SurfaceCard emphasized className="p-5 md:p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.25fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SurfacePill tone="accent">Swarm activo</SurfacePill>
            <SurfacePill>{hero?.authority || 'unavailable'}</SurfacePill>
            <SurfacePill>{hero?.freshness || 'unavailable'}</SurfacePill>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {hero?.title || 'Swarm activo'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Estado {hero?.status || 'unknown'} ·{' '}
              {hero?.highlights?.[0] || 'Tomá el foco principal desde la vista durable.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SurfacePill tone="accent">
              {statLabel(hero?.stats?.activeAgents || 0, 'agente activo', 'agentes activos')}
            </SurfacePill>
            <SurfacePill>
              {statLabel(hero?.stats?.queueDepth || 0, 'task en cola', 'tasks en cola')}
            </SurfacePill>
            <SurfacePill>
              {statLabel(
                hero?.stats?.pendingApprovals || 0,
                'aprobación pendiente',
                'aprobaciones pendientes'
              )}
            </SurfacePill>
            <SurfacePill>
              {statLabel(
                hero?.stats?.pendingDeliveries || 0,
                'entrega pendiente',
                'entregas pendientes'
              )}
            </SurfacePill>
          </div>

          <div className="min-w-0 space-y-3">
            <button
              type="button"
              disabled={hero?.primaryCta?.disabled}
              className="w-full rounded-xl border px-4 py-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: 'rgba(255,176,64,0.12)',
                borderColor: 'rgba(255,176,64,0.26)',
                color: 'var(--text-primary)',
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
          </div>
        </div>

        <div
          className="rounded-[26px] border p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(5,8,12,0.72), rgba(255,176,64,0.045))',
            borderColor: 'rgba(255,176,64,0.16)',
          }}
          aria-label="Topología visual del swarm activo"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Roster operativo
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Director central + {workers.length} agentes terminales.
              </p>
            </div>
            <SurfacePill tone="accent">
              {roster.length || hero?.stats?.activeAgents || 0} miembros
            </SurfacePill>
          </div>

          {director ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_170px_1fr] lg:items-center">
              <div className="grid gap-3">
                {workers.slice(0, Math.ceil(workers.length / 2)).map((member) => (
                  <SwarmNode key={member.id} member={member} compact />
                ))}
              </div>

              <div className="relative">
                <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-[rgba(255,176,64,0.16)] lg:block" />
                <SwarmNode member={director} />
              </div>

              <div className="grid gap-3">
                {workers.slice(Math.ceil(workers.length / 2)).map((member) => (
                  <SwarmNode key={member.id} member={member} compact />
                ))}
              </div>
            </div>
          ) : (
            <p
              className="rounded-2xl border p-4 text-sm"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Sin roster activo proyectado todavía.
            </p>
          )}

          {hero?.topology?.connections?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {hero.topology.connections.slice(0, 6).map((connection) => (
                <SurfacePill key={connection}>{connection}</SurfacePill>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}

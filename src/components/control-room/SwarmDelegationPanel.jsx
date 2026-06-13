import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CompactPanelShell, formatRelativeTime, metaTextStyle, truncateId } from './utils';
import { useSwarmBusSnapshot } from '@/lib/hooks/useSwarmBusSnapshot';

function summarizeBody(body, max = 72) {
  const text = String(body || '').trim();
  if (!text) return '—';
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.instruction) return String(parsed.instruction).slice(0, max);
      if (parsed.message) return String(parsed.message).slice(0, max);
      if (parsed.change) return `Change: ${parsed.change}`;
    } catch {
      /* plain */
    }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function WorkerDelegationRow({ role, pending = [], recent = [], lastChat = null }) {
  const pendingCount = pending.length;
  const lastDelivered = recent[0] || null;
  const status =
    pendingCount > 0 ? 'pending' : lastDelivered ? 'delivered' : lastChat ? 'chat' : 'idle';

  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-default)' }}
      data-testid={`delegation-row-${role}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[rgba(241,245,249,0.95)]">{role}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background:
              status === 'pending'
                ? 'rgba(251,191,36,0.18)'
                : status === 'delivered'
                  ? 'rgba(52,211,153,0.16)'
                  : 'rgba(148,163,184,0.12)',
            color:
              status === 'pending'
                ? 'rgb(251,191,36)'
                : status === 'delivered'
                  ? 'rgb(52,211,153)'
                  : 'rgba(148,163,184,0.9)',
          }}
        >
          {status === 'pending'
            ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`
            : status === 'delivered'
              ? 'entregada'
              : status === 'chat'
                ? 'chat'
                : 'idle'}
        </span>
      </div>

      {pendingCount > 0 ? (
        <p className="mt-1 text-[10px] leading-snug" style={metaTextStyle()}>
          Proxima: {summarizeBody(pending[0]?.body)}
        </p>
      ) : null}

      {lastDelivered ? (
        <p className="mt-1 text-[10px] leading-snug" style={metaTextStyle()}>
          Ultima entrega {formatRelativeTime(lastDelivered.consumed_at)} —{' '}
          {summarizeBody(lastDelivered.body, 56)}
        </p>
      ) : null}

      {lastChat ? (
        <p className="mt-1 text-[10px] leading-snug" style={metaTextStyle()}>
          Chat {lastChat.from_role}→{lastChat.to_role}: {summarizeBody(lastChat.body, 48)}
        </p>
      ) : null}
    </div>
  );
}

export default function SwarmDelegationPanel({
  missionId = null,
  workerRoles = [],
  onActivateZed = null,
  activateState = { submitting: false, error: null },
  standbyMode = false,
}) {
  const { snapshot, loading, error, lastFetchedAt, refresh } = useSwarmBusSnapshot(missionId, {
    enabled: Boolean(missionId),
  });

  const rows = useMemo(() => {
    const roles = workerRoles.length
      ? workerRoles
      : Array.from(
          new Set([
            ...(snapshot?.inbox_pending || []).map((r) => r.to_role),
            ...(snapshot?.inbox_recent_consumed || []).map((r) => r.to_role),
          ])
        ).filter(Boolean);

    const pendingByRole = (snapshot?.inbox_pending || []).reduce((acc, row) => {
      const key = row?.to_role;
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const recentByRole = (snapshot?.inbox_recent_consumed || []).reduce((acc, row) => {
      const key = row?.to_role;
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const chatByRole = (snapshot?.chat_recent || []).reduce((acc, row) => {
      const key = row?.to_role;
      if (!key || key === 'all') return acc;
      if (!acc[key]) acc[key] = row;
      return acc;
    }, {});

    return roles.map((role) => ({
      role,
      pending: pendingByRole[role] || [],
      recent: recentByRole[role] || [],
      lastChat: chatByRole[role] || null,
    }));
  }, [snapshot, workerRoles]);

  const deliveryEvents = (snapshot?.events_recent || []).filter(
    (evt) => evt?.kind === 'inbox_delivered'
  );

  return (
    <div data-testid="swarm-delegation-panel">
      <CompactPanelShell
        title="Delegaciones (bus)"
        description="Directivas team_inbox, entregas y ACK en tiempo real."
        count={rows.length}
        items={rows}
        renderItem={(row) => (
          <WorkerDelegationRow
            key={row.role}
            role={row.role}
            pending={row.pending}
            recent={row.recent}
            lastChat={row.lastChat}
          />
        )}
        emptyMessage={missionId ? 'Sin workers en roster.' : 'Sin mision activa.'}
        ariaLabel="Delegaciones del swarm"
        headerExtra={
          <div className="flex flex-wrap items-center gap-2">
            {standbyMode && onActivateZed ? (
              <Button
                type="button"
                size="sm"
                variant="devhubGhost"
                disabled={activateState.submitting}
                onClick={onActivateZed}
                data-testid="activate-zed-button"
              >
                {activateState.submitting ? 'Activando…' : 'Activar ZED'}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="devhubGhost"
              disabled={loading || !missionId}
              onClick={() => refresh()}
            >
              Actualizar
            </Button>
          </div>
        }
      />
      <div className="mt-2 space-y-1 px-1 text-[10px]" style={metaTextStyle()}>
        <p>
          Mision: {missionId ? truncateId(missionId) : '—'}
          {lastFetchedAt ? ` · ${formatRelativeTime(lastFetchedAt)}` : ''}
        </p>
        {error ? <p className="text-[rgb(248,113,113)]">{error}</p> : null}
        {deliveryEvents.length ? (
          <p>{deliveryEvents.length} evento(s) inbox_delivered en snapshot.</p>
        ) : null}
      </div>
    </div>
  );
}

import React from 'react';
import {
  CompactPanelShell,
  CompactRow,
  formatEvidence,
  formatLiveHint,
  formatMissingSource,
  formatRelativeTime,
  formatToken,
  metaTextStyle,
  StatusPill,
  truncateId,
} from './utils';
import SwarmPhaseBadge from '@/components/SwarmPhaseBadge';
import SwarmReactivateButton from '@/components/SwarmReactivateButton';

export default function AgentsClaimsPanel({ agents = [], missionId = null, onReactivate = null }) {
  // Wrap renderAgent in a closure so it has access to missionId and onReactivate
  const renderAgentWithContext = (agent) =>
    renderAgent(agent, { missionId, onReactivate });

  return (
    <CompactPanelShell
      title="Agentes y asignaciones"
      description="Tareas reclamadas, lease, workspace y autoridad."
      count={agents.length}
      items={agents}
      renderItem={renderAgentWithContext}
      emptyMessage="Sin agentes durables en este snapshot."
      ariaLabel="Agentes y asignaciones"
    />
  );
}

function renderAgent(agent, ctx) {
  const { missionId, onReactivate } = ctx || {};
  const leaseText = agent.lease_expires_at
    ? `Lease: ${formatRelativeTime(agent.lease_expires_at)}`
    : 'Sin lease';

  const canReactivate = agent.supervisor_state === 'paused' || agent.supervisor_state === 'idle';

  return (
    <div
      key={agent.agent_id}
      className="rounded-lg border px-2 py-1.5"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-default)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <CompactRow
          status={agent.supervisor_state}
          primary={agent.agent_id}
          secondary={`${agent.task_id ? truncateId(agent.task_id) : 'Sin tarea'} · ${leaseText}`}
          badge={agent.phase ? <SwarmPhaseBadge phase={agent.phase} /> : null}
          timestamp={agent.freshness}
        />
        {canReactivate && missionId && (
          <SwarmReactivateButton
            missionId={missionId}
            agentId={agent.agent_id}
            sessionId={agent.session_id}
            sessionStatus={agent.supervisor_state}
            onReactivate={onReactivate}
            className="flex-shrink-0"
          />
        )}
      </div>

      {/* Compact meta row */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
        <span className="text-[10px]" style={metaTextStyle()}>
          WS: {agent.workspace_id ? truncateId(agent.workspace_id) : '—'}
        </span>
        <span className="text-[10px]" style={metaTextStyle()}>
          Run: {agent.run_id ? truncateId(agent.run_id) : '—'}
        </span>
        <StatusPill status={agent.authority} />
      </div>

      {/* Evidence / hints */}
      {(agent.evidence_refs || agent.missing_source || agent.live_hint) && (
        <div className="mt-1 px-2">
          <span className="text-[10px]" style={metaTextStyle()}>
            {formatEvidence(agent.evidence_refs)}
          </span>
          {agent.missing_source && (
            <span className="text-[10px]" style={metaTextStyle()}>
              {' '}
              · {formatMissingSource(agent.missing_source)}
            </span>
          )}
          {agent.live_hint && (
            <span className="text-[10px]" style={metaTextStyle()}>
              {' '}
              · {formatLiveHint(agent.live_hint)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

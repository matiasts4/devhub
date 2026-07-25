import DGChainRow from './DGChainRow';
import DGApprovalGate from './DGApprovalGate';
import { useState } from 'react';
import {
  CountBadge,
  StatusPill,
  metaTextStyle,
  panelListStyle,
  panelShellStyle,
  renderEmptyCopy,
  truncateId,
} from './utils';

export default function DGObserverSidebar({
  activeMissionId,
  timelineRows,
  pollingState,
  pendingApproval,
  error,
  lastPollAt,
  retry,
  onApprove,
  onReject,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isStale = lastPollAt && Date.now() - lastPollAt > 30_000;

  const missionId = activeMissionId;
  const hasMission = Boolean(missionId);

  return (
    <section
      className="border p-4 h-full min-h-[200px] flex flex-col"
      style={panelShellStyle()}
      aria-label="Director General observer"
    >
      <header className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Director General</h2>
            {hasMission && <CountBadge count={timelineRows.length} />}
          </div>
          {hasMission && (
            <span className="text-xs font-mono" style={metaTextStyle()}>
              {truncateId(missionId)}
            </span>
          )}
        </div>

        {hasMission && (
          <div className="flex items-center gap-2 mt-1">
            <StatusPill status={pollingState === 'polling' ? 'in_progress' : pollingState} />
            {pollingState === 'error' && (
              <span className="text-xs" style={{ color: '#f87171' }}>
                Reconectando...
              </span>
            )}
          </div>
        )}

        <p className="text-sm mt-1" style={metaTextStyle()}>
          {hasMission
            ? 'Mission chain · timeline de la misión activa.'
            : 'Sin misión activa — iniciá una desde el Launchpad.'}
        </p>
      </header>

      {!collapsed && (
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-0.5" style={panelListStyle()}>
          {!hasMission
            ? renderEmptyCopy('Sin misión activa — iniciá una desde el Launchpad.')
            : timelineRows.length === 0
              ? renderEmptyCopy('Sin eventos en este snapshot.')
              : timelineRows.map((row, index) => (
                  <div key={`${row.id || row.timestamp || index}`}>
                    <DGChainRow row={row} />
                  </div>
                ))}

          {/* Active approval gate */}
          {pendingApproval && hasMission && (
            <DGApprovalGate
              missionId={missionId}
              approvalItem={pendingApproval}
              onApprove={onApprove}
              onReject={onReject}
              error={error}
              retry={retry}
            />
          )}

          {/* Error banner */}
          {error && !pendingApproval && (
            <div
              className="text-xs rounded px-3 py-2"
              style={{
                backgroundColor: 'rgba(239,68,68,0.08)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {error}
            </div>
          )}

          {/* Stale warning */}
          {pollingState === 'polling' && !error && isStale && (
            <p className="text-xs text-center" style={metaTextStyle()}>
              Director no responde — persiste esperando.
            </p>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <button
        type="button"
        className="mt-3 text-xs shrink-0"
        style={{ color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? '▷ Expandir' : '△ Colapsar'}
      </button>
    </section>
  );
}

import { TerminalSquare, ChevronRight, Loader2, Check, XCircle } from 'lucide-react';
import React, { useMemo } from 'react';

/**
 * SubagentBadge — Mini-badge que aparece debajo del mensaje del orquestador
 * cuando hay subagentes activos o recientes. Estilo similar al "ctrl+x down view subagents"
 * de OpenCode.
 *
 * Props:
 *   - subagents: array de { id, agentProfile, status, sessionId, toolCount, doneTools }
 *   - onViewSubagent: (subagentId) => void — callback para ver el subagente
 *   - compact: boolean — si true, muestra solo el badge sin lista expandible
 */
export default function SubagentBadge({ subagents = [], onViewSubagent, compact = false }) {
  const [expanded, setExpanded] = React.useState(false);

  const activeSubagents = useMemo(
    () => subagents.filter((s) => s.status === 'running'),
    [subagents]
  );

  const completedSubagents = useMemo(
    () => subagents.filter((s) => s.status === 'success'),
    [subagents]
  );

  const errorSubagents = useMemo(
    () => subagents.filter((s) => s.status === 'error' || s.status === 'aborted'),
    [subagents]
  );

  if (subagents.length === 0) return null;

  const totalActive = activeSubagents.length;
  const totalCompleted = completedSubagents.length;
  const totalErrors = errorSubagents.length;

  return (
    <div
      className="mt-2 ml-4 pl-3 border-l-2 border-dashed"
      style={{ borderColor: 'var(--accent-primary)', opacity: 0.7 }}
    >
      {/* Header del badge — siempre visible */}
      <button
        onClick={() => !compact && setExpanded((v) => !v)}
        className={`flex items-center gap-2 text-[10px] font-mono ${compact ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
        style={{ color: 'var(--accent-primary)' }}
      >
        <TerminalSquare className="w-3 h-3" />
        <span>
          {totalActive > 0
            ? `${totalActive} subagente${totalActive > 1 ? 's' : ''} activo${totalActive > 1 ? 's' : ''}`
            : `${totalCompleted} subagente${totalCompleted > 1 ? 's' : ''} completado${totalCompleted > 1 ? 's' : ''}`}
          {totalErrors > 0 && ` · ${totalErrors} error${totalErrors > 1 ? 'es' : ''}`}
        </span>
        {!compact && <span className="ml-1">{expanded ? '▼' : '▶'}</span>}
      </button>

      {/* Lista expandible de subagentes */}
      {!compact && expanded && (
        <div className="mt-1.5 space-y-1">
          {subagents.map((sa) => {
            const isRunning = sa.status === 'running';
            const isError = sa.status === 'error' || sa.status === 'aborted';
            const statusColor = isRunning
              ? 'var(--warning, #f59e0b)'
              : isError
                ? 'var(--danger, #f87171)'
                : 'var(--success, #34d399)';

            return (
              <button
                key={sa.id}
                onClick={() => onViewSubagent?.(sa)}
                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]"
                style={{ color: 'var(--text-muted)' }}
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {isRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: statusColor }} />
                  ) : isError ? (
                    <XCircle className="w-3 h-3" style={{ color: statusColor }} />
                  ) : (
                    <Check className="w-3 h-3" style={{ color: statusColor }} />
                  )}
                </div>

                {/* Agent name */}
                <span
                  className="text-[10px] font-mono truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {sa.agentProfile || 'Sub-Agent'}
                </span>

                {/* Tool progress */}
                {sa.toolCount > 0 && (
                  <span
                    className="text-[9px] font-mono flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {isRunning ? `${sa.doneTools || 0}/${sa.toolCount}` : `${sa.toolCount}`} tools
                  </span>
                )}

                <ChevronRight
                  className="w-2.5 h-2.5 ml-auto flex-shrink-0"
                  style={{ color: 'var(--text-muted)', opacity: 0.4 }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

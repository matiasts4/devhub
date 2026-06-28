'use client';

import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import usePanelAgentStatus from '@/hooks/usePanelAgentStatus';
import {
  PANEL_STATUS,
  shouldShowPanelStatus,
} from '@/components/terminal/utils/panelStatusHelpers';

function formatLastUpdated(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
}

function DetailRow({ label, value, muted = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--text-muted)] shrink-0">{label}</span>
      <span
        className={cn(
          'text-right truncate max-w-[140px]',
          muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * PanelStatusBadge — clickable status indicator for a terminal panel header.
 *
 * Shows a compact badge with a colored dot and opens a small popover with
 * details when clicked. Hidden for idle/unknown states.
 */
export default function PanelStatusBadge({
  panelId,
  terminalId,
  agentRun = null,
  initialCommand = null,
  connectionState = null,
  pollingInterval,
  enabled = true,
}) {
  const { status, label, isPulsing, style, lastUpdated, error, details } = usePanelAgentStatus(
    panelId,
    {
      terminalId,
      agentRun,
      initialCommand,
      connectionState,
      pollingInterval,
      enabled,
    }
  );

  const visible = useMemo(() => shouldShowPanelStatus(status, { alwaysShow: false }), [status]);

  if (!visible || !style) return null;

  const updatedAt = formatLastUpdated(lastUpdated);
  const isError = status === PANEL_STATUS.ERROR;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`panel-status-badge-${panelId}`}
          data-panel-status={status}
          className={cn(
            'pointer-events-auto inline-flex h-[18px] shrink-0 items-center gap-1 rounded border px-1.5 text-[9px] font-bold uppercase tracking-[0.05em] transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--accent-rgb,88,166,255),0.5)]',
            style.border,
            style.bg,
            style.text
          )}
          aria-label={`Estado del panel: ${label}`}
          title={`Estado: ${label}${updatedAt ? ` · actualizado ${updatedAt}` : ''}`}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full flex-shrink-0',
              style.dot,
              isPulsing && 'animate-pulse'
            )}
            aria-hidden="true"
          />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-64 border border-[var(--chrome-border-color)] bg-[var(--surface-card)] p-3 text-xs shadow-md"
      >
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[var(--border-subtle)]">
          <span className={cn('h-2 w-2 rounded-full', style.dot, isPulsing && 'animate-pulse')} />
          <span className="font-semibold text-[var(--text-primary)]">{label}</span>
          {updatedAt && (
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">{updatedAt}</span>
          )}
        </div>

        <div className="space-y-1.5">
          {details?.connectionState && (
            <DetailRow label="Conexión" value={details.connectionState} />
          )}
          {details?.agentRun?.selectedAgent && (
            <DetailRow label="Agente" value={details.agentRun.selectedAgent} />
          )}
          {details?.agentRun?.taskTitle && (
            <DetailRow label="Tarea" value={details.agentRun.taskTitle} />
          )}
          {details?.apiStatus && details.apiStatus !== status && (
            <DetailRow label="API" value={details.apiStatus} />
          )}
          {error && isError && <div className="pt-1 text-[10px] text-rose-300">Error: {error}</div>}
        </div>

        <div className="mt-3 text-[10px] text-[var(--text-muted)] leading-tight">
          Hacé clic fuera para cerrar.
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { PANEL_STATUS };

import { ChevronUp, ChevronLeft, ChevronRight, Loader2, Cpu } from 'lucide-react';
import { useMemo } from 'react';
import { normalizeSubagentStatus } from '@/lib/agenthubSubagentState';

/**
 * SubagentFooter — Panel compacto estilo OpenCode que aparece cuando un subagente está activo.
 * Muestra: nombre del agente, progreso de herramientas, tokens, y navegación parent/prev/next.
 *
 * Props:
 *   - agentName: string — nombre del subagente activo
 *   - toolCount: number — total de herramientas ejecutadas
 *   - doneTools: number — herramientas completadas
 *   - tokens: number — tokens consumidos
 *   - status: 'running' | 'success' | 'error' | 'aborted'
 *   - onNavigate: (direction: 'parent' | 'prev' | 'next') => void
 *   - hasParent: boolean — si existe una sesión padre para navegar
 *   - siblingIndex: number — índice del subagente entre hermanos (1-based)
 *   - siblingTotal: number — total de subagentes hermanos
 */
export default function SubagentFooter({
  agentName = 'Sub-Agent',
  toolCount = 0,
  doneTools = 0,
  tokens = 0,
  status = 'running',
  onNavigate,
  hasParent = false,
  siblingIndex = 0,
  siblingTotal = 0,
}) {
  const normalizedStatus = normalizeSubagentStatus(status);
  const isRunning = normalizedStatus === 'running';

  // Color de acento según estado
  const accentColor = isRunning
    ? 'var(--warning, #f59e0b)'
    : normalizedStatus === 'success'
      ? 'var(--success, #34d399)'
      : 'var(--danger, #f87171)';

  // Formatear tokens
  const formattedTokens = useMemo(() => {
    if (tokens === 0) return null;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  }, [tokens]);

  return (
    <div
      className="flex items-center justify-between px-4 py-2 border-t flex-shrink-0"
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--border-subtle)',
        borderTopColor: accentColor,
        borderTopWidth: '2px',
      }}
    >
      {/* Lado izquierdo: info del agente */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Icono de estado */}
        <div
          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            background: isRunning
              ? 'color-mix(in srgb, var(--warning) 15%, transparent)'
              : status === 'success'
                ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                : 'color-mix(in srgb, var(--danger) 15%, transparent)',
          }}
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--warning)' }} />
          ) : (
            <Cpu className="w-3 h-3" style={{ color: accentColor }} />
          )}
        </div>

        {/* Nombre del agente */}
        <span
          className="text-[11px] font-bold uppercase tracking-wider flex-shrink-0"
          style={{ color: accentColor }}
        >
          {agentName}
        </span>

        {/* Progreso de herramientas */}
        {toolCount > 0 && (
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {isRunning ? `${doneTools}/${toolCount}` : `${toolCount}`} herramientas
          </span>
        )}

        {/* Tokens */}
        {formattedTokens && (
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {formattedTokens} tokens
          </span>
        )}

        {/* Navegación entre hermanos */}
        {siblingTotal > 1 && (
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            ({siblingIndex} de {siblingTotal})
          </span>
        )}
      </div>

      {/* Lado derecho: navegación */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Parent */}
        {hasParent && onNavigate && (
          <button
            onClick={() => onNavigate('parent')}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
            style={{ color: 'var(--text-muted)' }}
            title="Volver al orquestador"
          >
            <ChevronUp className="w-3 h-3" />
            Parent
            <kbd
              className="ml-1 px-1 rounded text-[9px]"
              style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}
            >
              ↑
            </kbd>
          </button>
        )}

        {/* Prev */}
        {siblingTotal > 1 && siblingIndex > 1 && onNavigate && (
          <button
            onClick={() => onNavigate('prev')}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
            style={{ color: 'var(--text-muted)' }}
            title="Subagente anterior"
          >
            <ChevronLeft className="w-3 h-3" />
            Prev
          </button>
        )}

        {/* Next */}
        {siblingTotal > 1 && siblingIndex < siblingTotal && onNavigate && (
          <button
            onClick={() => onNavigate('next')}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
            style={{ color: 'var(--text-muted)' }}
            title="Siguiente subagente"
          >
            Next
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

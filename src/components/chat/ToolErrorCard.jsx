import { useState, useCallback } from 'react';
import { XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Generic icon fallback ────────────────────────────────────────────────────
export default function ToolErrorCard({ tool }) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);

  const timing = tool.timeEnd && tool.timeStart ? tool.timeEnd - tool.timeStart : null;

  // Extract error message from output or input
  const errorMsg = tool.toolOutput || 'Error desconocido';
  const primaryArg = tool.toolInput ? Object.values(tool.toolInput)[0] : null;
  const primaryArgStr =
    typeof primaryArg === 'string'
      ? primaryArg.length > 80
        ? '…' + primaryArg.slice(-77)
        : primaryArg
      : null;

  return (
    <div className="pl-3 transition-all duration-200" style={{ borderLeft: '2px solid #f87171' }}>
      {/* Header */}
      <button onClick={handleToggle} className="w-full flex items-center gap-2 py-1 text-left">
        {/* Error icon */}
        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-red-400">
          <XCircle className="w-3 h-3" />
        </div>

        {/* Tool name */}
        <span className="text-[11px] font-mono font-medium text-red-300">
          {tool.toolName || 'tool'}
        </span>

        {/* Primary arg */}
        {primaryArgStr && (
          <span
            className="text-[10px] font-mono truncate flex-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {primaryArgStr}
          </span>
        )}

        {/* Status */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {timing !== null && (
            <span
              className="text-[9px] font-mono"
              style={{ color: 'var(--text-muted)', opacity: 0.6 }}
            >
              {timing}ms
            </span>
          )}
          <span className="text-[9px] text-red-500 uppercase font-bold tracking-widest">error</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {expanded ? (
              <ChevronDown className="w-2.5 h-2.5" />
            ) : (
              <ChevronRight className="w-2.5 h-2.5" />
            )}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      <div
        className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div
            className="px-3 pb-3 space-y-2 border-t pt-2"
            style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
          >
            {/* Error message */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <p className="text-[9px] uppercase font-bold tracking-widest text-red-400">Error</p>
              </div>
              <pre
                className="text-[10px] font-mono whitespace-pre-wrap break-all rounded p-2 max-h-32 overflow-auto"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                }}
              >
                {errorMsg}
              </pre>
            </div>

            {/* Input (collapsible within) */}
            {tool.toolInput && (
              <div>
                <p
                  className="text-[9px] uppercase font-bold mb-1 tracking-widest"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Input
                </p>
                <pre
                  className="text-[10px] font-mono whitespace-pre-wrap break-all rounded p-1.5 max-h-24 overflow-auto"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {JSON.stringify(tool.toolInput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

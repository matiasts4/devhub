import {
  Terminal,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Maximize2,
} from 'lucide-react';
import OutputViewerModal from './OutputViewerModal';
import { useState, useCallback, useMemo } from 'react';
import { ansiToHtml } from './utils/ansiToHtml';

export default function BashToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const isRunning = tool.toolStatus === 'running';
  const isDone = tool.toolStatus === 'completed';
  const isError = tool.toolStatus === 'error';
  const timing = tool.timeEnd && tool.timeStart ? tool.timeEnd - tool.timeStart : null;

  // Extract command from toolInput
  const command = useMemo(() => {
    if (!tool.toolInput) return '';
    const val = Object.values(tool.toolInput)[0];
    return typeof val === 'string' ? val : JSON.stringify(val);
  }, [tool.toolInput]);

  const outputHtml = useMemo(() => ansiToHtml(tool.toolOutput || ''), [tool.toolOutput]);

  const handleCopy = useCallback(
    async (e) => {
      e.stopPropagation();
      if (!tool.toolOutput) return;
      await navigator.clipboard.writeText(tool.toolOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [tool.toolOutput]
  );

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);

  // Status colors
  const statusColor = isRunning
    ? 'text-amber-400'
    : isDone
      ? 'text-emerald-400'
      : isError
        ? 'text-red-400'
        : 'text-[color:var(--text-muted)]';

  const lineBorderColor = isRunning ? '#f59e0b' : isError ? '#f87171' : 'var(--border-strong)';

  return (
    <>
      <div
        className="pl-3 transition-all duration-200"
        style={{ borderLeft: `2px solid ${lineBorderColor}` }}
      >
        {/* Header */}
        <button onClick={handleToggle} className="w-full flex items-center gap-2 py-1 text-left">
          {/* Status icon */}
          <div className={`w-4 h-4 flex-shrink-0 flex items-center justify-center ${statusColor}`}>
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isDone ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : isError ? (
              <XCircle className="w-3 h-3" />
            ) : (
              <Terminal className="w-3 h-3" />
            )}
          </div>

          {/* Title */}
          <span
            className={`text-[11px] font-mono font-medium
              ${isRunning ? 'text-amber-300' : isDone ? 'text-emerald-300' : isError ? 'text-red-300' : 'text-[color:var(--text-secondary)]'}`}
          >
            Terminal
          </span>

          {/* Command preview */}
          {command && (
            <span
              className="text-[10px] font-mono truncate flex-1"
              style={{ color: 'var(--text-muted)' }}
            >
              $ {command.length > 60 ? '…' + command.slice(-57) : command}
            </span>
          )}

          {/* Timing + chevron */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {timing !== null && (
              <span
                className="text-[9px] font-mono"
                style={{ color: 'var(--text-muted)', opacity: 0.6 }}
              >
                {timing}ms
              </span>
            )}
            {isRunning && (
              <span className="text-[9px] text-amber-500 uppercase font-bold tracking-widest">
                running
              </span>
            )}
            {isError && (
              <span className="text-[9px] text-red-500 uppercase font-bold tracking-widest">
                error
              </span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>
              {expanded ? (
                <ChevronDown className="w-2.5 h-2.5" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5" />
              )}
            </span>
          </div>
        </button>

        {/* Expanded output */}
        <div
          className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div
              className="px-3 pb-3 border-t pt-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {/* Command header */}
              {command && (
                <div
                  className="text-[10px] font-mono px-2 py-1 rounded-t mb-0"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span className="text-emerald-400">$</span> {command}
                </div>
              )}

              {/* Output */}
              {tool.toolOutput && (
                <div className="relative">
                  <pre
                    className="text-[10px] font-mono whitespace-pre-wrap break-all rounded p-2 max-h-[240px] overflow-auto"
                    style={{
                      background: 'var(--surface-elevated)',
                      color: 'var(--text-secondary)',
                      borderTopLeftRadius: command ? 0 : undefined,
                      borderTopRightRadius: command ? 0 : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: outputHtml }}
                  />

                  {/* Hover actions */}
                  <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={handleCopy}
                      className="p-1 rounded bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
                      title="Copiar output"
                    >
                      {copied ? (
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 text-[color:var(--text-muted)]" />
                      )}
                    </button>
                    {tool.toolOutput.length > 1200 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFull(true);
                        }}
                        className="p-1 rounded bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
                        title="Ver completo"
                      >
                        <Maximize2 className="w-2.5 h-2.5 text-[color:var(--accent-primary)]" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* No output */}
              {!tool.toolOutput && !isRunning && (
                <div
                  className="text-[10px] font-mono px-2 py-1 rounded"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-muted)',
                  }}
                >
                  (sin output)
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full output modal */}
      <OutputViewerModal
        isOpen={showFull}
        onClose={() => setShowFull(false)}
        title="Terminal — Output completo"
        content={tool.toolOutput}
      />
    </>
  );
}

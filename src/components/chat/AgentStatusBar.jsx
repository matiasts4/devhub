import { useEffect, useState, useRef } from 'react';
import { Cpu, Loader2 } from 'lucide-react';

/**
 * AgentStatusBar — Barra de estado fija al fondo, estilo OpenCode.
 *
 * Muestra:
 *  ■ AgentName  model · provider  |  N toolcalls · Xs  |  XXX.XK tokens  esc  ctrl+p
 *
 * Visible solo cuando hay un agente activo (isActive = true).
 */
export default function AgentStatusBar({
  isActive = false,
  agentName = 'Orquestador',
  model = '',
  tokenCount = 0,
  tokenLimit = 200000,
  toolCallCount = 0,
  onInterrupt,
  onCommandPalette,
}) {
  // Elapsed timer — seconds since activated
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isActive]);

  const formatElapsed = (s) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  };

  const tokenPercent = tokenLimit > 0 ? Math.min(100, Math.round((tokenCount / tokenLimit) * 100)) : 0;
  const tokenK = tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}K` : tokenCount;

  // Clean model string — strip provider prefixes
  const cleanModel = model
    ? model
        .replace(/^openai\/|^anthropic\/|^google\//i, '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-latest$/, '')
    : '';

  if (!isActive) return null;

  return (
    <div
      className="flex items-center gap-0 text-[11px] font-mono overflow-hidden flex-shrink-0"
      style={{
        background: 'var(--surface-elevated)',
        borderTop: '1px solid var(--border-subtle)',
        height: '24px',
        minHeight: '24px',
      }}
    >
      {/* Agent indicator — pulsing dot + name */}
      <div
        className="flex items-center gap-1.5 px-3 h-full"
        style={{ borderRight: '1px solid var(--border-subtle)' }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
          style={{ background: 'var(--accent-primary)' }}
        />
        <span
          className="font-semibold truncate max-w-[120px]"
          style={{ color: 'var(--text-primary)' }}
        >
          {agentName}
        </span>
      </div>

      {/* Model */}
      {cleanModel && (
        <div
          className="flex items-center gap-1 px-3 h-full"
          style={{ borderRight: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <Cpu className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate max-w-[160px]">{cleanModel}</span>
        </div>
      )}

      {/* Toolcalls + elapsed */}
      <div
        className="flex items-center gap-2 px-3 h-full"
        style={{ borderRight: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        {toolCallCount > 0 && (
          <>
            <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
            <span>{toolCallCount} toolcalls</span>
            <span>·</span>
          </>
        )}
        <span>{formatElapsed(elapsed)}</span>
      </div>

      {/* Token usage */}
      {tokenCount > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 h-full"
          style={{ borderRight: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <span>{tokenK}</span>
          {tokenLimit > 0 && (
            <span style={{ color: tokenPercent > 80 ? 'var(--warning, #f59e0b)' : 'var(--text-muted)' }}>
              ({tokenPercent}%)
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Shortcuts */}
      <div
        className="flex items-center gap-4 px-3 h-full"
        style={{ borderLeft: '1px solid var(--border-subtle)' }}
      >
        {/* esc interrupt */}
        <button
          onClick={onInterrupt}
          className="flex items-center gap-1.5 transition-colors hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
          title="Interrumpir agente (Esc)"
        >
          <kbd
            className="px-1 py-0 rounded text-[9px] font-mono"
            style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            esc
          </kbd>
          <span className="text-[10px]">interrupt</span>
        </button>

        {/* ctrl+p command palette */}
        {onCommandPalette && (
          <button
            onClick={onCommandPalette}
            className="flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title="Command Palette (Ctrl+P)"
          >
            <kbd
              className="px-1 py-0 rounded text-[9px] font-mono"
              style={{
                background: 'var(--surface-hover)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-secondary)',
              }}
            >
              ctrl+p
            </kbd>
            <span className="text-[10px]">commands</span>
          </button>
        )}
      </div>
    </div>
  );
}

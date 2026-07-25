import { Terminal, Loader2, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

// ─── Tool Icon Helper ─────────────────────────────────────────────────────────

const TOOL_ICONS = {
  read: 'read',
  read_file: 'read',
  grep: 'search',
  glob: 'search',
  bash: 'terminal',
  shell: 'terminal',
  write: 'write',
  write_file: 'write',
  edit: 'write',
  create_file: 'write',
};

function getToolCategory(toolName) {
  if (!toolName) return 'terminal';
  const lower = toolName.toLowerCase();
  for (const [key, cat] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return cat;
  }
  return 'terminal';
}

const CATEGORY_COLORS = {
  read: 'var(--accent-primary)',
  search: 'var(--text-muted)',
  terminal: 'var(--warning)',
  write: 'var(--success)',
};

// ─── Trace Entry Row ──────────────────────────────────────────────────────────

function TraceEntryRow({ trace }) {
  const isTool = trace.trace_type === 'tool' || trace.tool_name;
  const label = isTool
    ? trace.tool_name || 'tool'
    : trace.trace_type === 'reasoning'
      ? 'thinking'
      : trace.trace_type || 'text';

  const statusColor =
    trace.tool_status === 'running'
      ? 'var(--warning)'
      : trace.tool_status === 'error'
        ? 'var(--danger)'
        : trace.tool_status === 'completed'
          ? 'var(--success)'
          : 'var(--text-muted)';

  const category = getToolCategory(trace.tool_name);
  const iconColor = CATEGORY_COLORS[category] || 'var(--text-muted)';

  const outputPreview = useMemo(() => {
    const output = trace.tool_output || trace.content || '';
    if (!output) return null;
    const cleaned = output.replace(/\n/g, ' ').trim();
    return cleaned.length > 80 ? cleaned.slice(0, 80) + '…' : cleaned;
  }, [trace.tool_output, trace.content]);

  return (
    <div className="flex items-center gap-2 py-1">
      <span style={{ color: statusColor }}>
        {trace.tool_status === 'running' ? (
          <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
        ) : trace.tool_status === 'error' ? (
          <XCircle className="w-3 h-3 inline mr-1" />
        ) : trace.tool_status === 'completed' ? (
          <CheckCircle2 className="w-3 h-3 inline mr-1" />
        ) : (
          <Terminal className="w-3 h-3 inline mr-1" />
        )}
      </span>
      <span className="text-[10px] font-mono font-medium" style={{ color: iconColor }}>
        {label}
      </span>
      {trace.duration_ms && (
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {trace.duration_ms}ms
        </span>
      )}
      {outputPreview && (
        <span
          className="text-[10px] font-mono truncate flex-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {outputPreview}
        </span>
      )}
    </div>
  );
}

// ─── LiveTracePreview ─────────────────────────────────────────────────────────

export default function LiveTracePreview({ traces = [], isRunning = false, onExpand }) {
  const [hasNewTrace, setHasNewTrace] = useState(false);
  const prevCountRef = useRef(0);
  const pulseTimeoutRef = useRef(null);

  // Detect new traces arriving — trigger a brief highlight pulse
  useEffect(() => {
    if (traces.length > prevCountRef.current && prevCountRef.current > 0) {
      setHasNewTrace(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => setHasNewTrace(false), 1200);
    }
    prevCountRef.current = traces.length;
  }, [traces.length]);

  // Show last 2 trace entries
  const lastTraces = useMemo(() => traces.slice(-2), [traces]);

  if (lastTraces.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Esperando actividad…
      </p>
    );
  }

  return (
    <div
      className="rounded-lg p-3 transition-all duration-300"
      style={{
        background: hasNewTrace
          ? 'color-mix(in srgb, var(--warning) 5%, var(--surface-app))'
          : 'var(--surface-app)',
        border: '1px solid var(--border-subtle)',
        boxShadow: hasNewTrace
          ? '0 0 0 1px color-mix(in srgb, var(--warning) 30%, transparent) inset'
          : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          Última actividad
        </p>
        {isRunning && (
          <span
            className="flex items-center gap-1 text-[10px] font-mono"
            style={{ color: 'var(--warning)' }}
          >
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            en vivo
          </span>
        )}
      </div>

      <div className="space-y-1">
        {lastTraces.map((t, i) => (
          <TraceEntryRow key={t.id || i} trace={t} />
        ))}
      </div>

      {onExpand && (
        <button
          onClick={onExpand}
          className="mt-2 flex items-center gap-1 text-[10px] font-mono transition-colors cursor-pointer"
          style={{
            color: 'var(--accent-primary)',
            background: 'transparent',
            border: 'none',
          }}
        >
          <Eye className="w-3 h-3" />
          Ver trace completo
        </button>
      )}
    </div>
  );
}

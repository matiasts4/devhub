import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Loader2,
  Activity,
  FileEdit,
  Wrench,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  active: { color: 'var(--success)', label: 'Activo' },
  working: { color: 'var(--warning)', label: 'Ejecutando' },
  running: { color: 'var(--accent-primary)', label: 'Running' },
  idle: { color: 'var(--text-muted)', label: 'Idle' },
  error: { color: 'var(--danger)', label: 'Error' },
  thinking: { color: 'var(--accent-primary)', label: 'Thinking' },
  completed: { color: 'var(--success)', label: 'Completado' },
};

// ─── Elapsed Time Counter ─────────────────────────────────────────────────────

function useElapsedTime(isRunning, startTime) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (isRunning && startTime) {
      startRef.current = new Date(startTime).getTime();
    } else if (!isRunning && startRef.current) {
      setElapsed(Date.now() - startRef.current);
      startRef.current = null;
    }
  }, [isRunning, startTime]);

  useEffect(() => {
    if (!isRunning || !startRef.current) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = useCallback((ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, []);

  return { elapsed, formatted: formatTime(elapsed) };
}

// ─── Progress Bar with Color Transitions ──────────────────────────────────────

function ProgressBar({ completed, total }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Color transitions: green (>70%) → amber (40-70%) → red (<40%)
  const barColor =
    percentage >= 70 ? 'var(--success)' : percentage >= 40 ? 'var(--warning)' : 'var(--danger)';

  const bgColor = 'var(--surface-elevated)';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          Progreso
        </span>
        <span className="text-[10px] font-mono font-semibold" style={{ color: barColor }}>
          {completed}/{total} ({percentage}%)
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: bgColor }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}

// ─── Metric Pill ──────────────────────────────────────────────────────────────

function MetricPill({ icon: Icon, label, value }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{ background: 'var(--surface-elevated)' }}
    >
      <Icon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
        {label}:
      </span>
      <span
        className="text-[10px] font-mono font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── AgentMetricsCard ─────────────────────────────────────────────────────────

export default function AgentMetricsCard({
  agent,
  session,
  traces = [],
  isRunning,
  onExpand,
  onViewTrace,
  onKill,
}) {
  const [expanded, setExpanded] = useState(false);

  const status = (session?.status || agent?.status || 'idle').toLowerCase();
  const badge = STATUS_BADGE[status] || STATUS_BADGE.idle;

  const cardBorderColor =
    status === 'working' || status === 'running' || status === 'thinking'
      ? 'var(--warning)'
      : status === 'error'
        ? 'var(--danger)'
        : status === 'completed'
          ? 'var(--success)'
          : 'var(--border-subtle)';

  const isWorking = ['working', 'running', 'thinking', 'active'].includes(status);

  // Calculate metrics from traces
  const { toolsCompleted, totalTools, filesModified } = useMemo(() => {
    const toolTraces = traces.filter((t) => t.trace_type === 'tool' || t.tool_name);
    const completed = toolTraces.filter(
      (t) => t.tool_status === 'completed' || t.tool_status === 'done'
    ).length;
    const files = new Set();
    toolTraces.forEach((t) => {
      if (t.tool_name && /write|edit|create|read/i.test(t.tool_name)) {
        const input = t.tool_input;
        if (input && typeof input === 'object') {
          const filePath = input.file_path || input.path || input.filename;
          if (filePath) files.add(filePath);
        }
      }
    });
    return {
      toolsCompleted: completed,
      totalTools: toolTraces.length,
      filesModified: files.size,
    };
  }, [traces]);

  // Elapsed time
  const { formatted: elapsedTime } = useElapsedTime(
    isWorking,
    session?.created_at || session?.started_at
  );

  const agentName = session?.title || agent?.name || agent?.agent_name || 'Sin nombre';
  const agentModel = session?.agent_model || agent?.model || 'N/A';

  return (
    <div
      className="rounded-xl transition-all hover:border-[var(--border-strong)]"
      style={{
        background: 'var(--surface-muted)',
        borderTop: `1px solid ${cardBorderColor}`,
        borderRight: `1px solid ${cardBorderColor}`,
        borderBottom: `1px solid ${cardBorderColor}`,
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid',
        borderLeftColor: cardBorderColor,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: isWorking
                ? 'color-mix(in srgb, var(--warning) 10%, transparent)'
                : 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              border: `1px solid ${
                isWorking
                  ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                  : 'color-mix(in srgb, var(--accent-primary) 20%, transparent)'
              }`,
            }}
          >
            {isWorking ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--warning)' }} />
            ) : (
              <Activity
                className="w-4 h-4"
                strokeWidth={1.5}
                style={{ color: 'var(--accent-primary)' }}
              />
            )}
          </div>
          <div>
            <h3
              className="font-mono font-semibold text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              {agentName}
            </h3>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {agentModel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2 py-1 rounded-lg border"
            style={{
              color: badge.color,
              background: `color-mix(in srgb, ${badge.color} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${badge.color} 20%, transparent)`,
            }}
          >
            {badge.label}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-muted)',
            }}
            title={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          {onViewTrace && (
            <button
              onClick={() => onViewTrace(session)}
              className="p-1.5 rounded-lg transition-colors hover:text-[var(--accent-primary)] cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                color: 'var(--text-muted)',
              }}
              title="Ver trace completo"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          )}
          {onKill && (
            <button
              onClick={() => onKill(session?.id)}
              className="p-1.5 rounded-lg transition-colors hover:text-[var(--danger)] cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                color: 'var(--text-muted)',
              }}
              title="Terminar sesión"
            >
              <Loader2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <MetricPill
            icon={Wrench}
            label="Herramientas"
            value={`${toolsCompleted}/${totalTools}`}
          />
          <MetricPill icon={FileEdit} label="Archivos" value={filesModified} />
          <MetricPill icon={Clock} label="Tiempo" value={elapsedTime} />
        </div>

        {/* Progress Bar */}
        <ProgressBar completed={toolsCompleted} total={totalTools} />
      </div>

      {/* Expanded: Live Trace Preview */}
      {expanded && onExpand && (
        <div
          className="px-4 pb-3"
          style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}
        >
          {onExpand()}
        </div>
      )}
    </div>
  );
}

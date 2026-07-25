import { Clock, Info } from 'lucide-react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ─── Agent Type Colors ────────────────────────────────────────────────────────

const AGENT_TYPE_COLORS = [
  { base: 'var(--accent-primary)' },
  { base: 'var(--info)' },
  { base: 'var(--success)' },
  { base: 'var(--warning)' },
  { base: 'var(--danger)' },
  { base: 'var(--text-muted)' },
];

function getColorForAgent(index) {
  const { base } = AGENT_TYPE_COLORS[index % AGENT_TYPE_COLORS.length];
  return {
    base,
    bg: `color-mix(in srgb, ${base} 30%, transparent)`,
    border: `color-mix(in srgb, ${base} 60%, transparent)`,
  };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function TimelineTooltip({ session, x, y, visible }) {
  if (!visible || !session) return null;

  const status = (session.status || 'idle').toLowerCase();
  const startedAt = session.created_at || session.started_at;
  const duration = startedAt
    ? (() => {
        const start = new Date(startedAt).getTime();
        const end = session.updated_at ? new Date(session.updated_at).getTime() : Date.now();
        const ms = end - start;
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      })()
    : 'N/A';

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        left: x,
        top: y - 10,
        transform: 'translate(-50%, -100%)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-soft)',
        minWidth: '180px',
      }}
    >
      <p className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
        {session.title || 'Sin título'}
      </p>
      <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
        Estado: {status}
      </p>
      <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
        Duración: {duration}
      </p>
      {session.agent_model && (
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          Modelo: {session.agent_model}
        </p>
      )}
    </div>
  );
}

// ─── Timeline Row ─────────────────────────────────────────────────────────────

function TimelineRow({ session, index, timeRange, onHover, onLeave, onClick }) {
  const colors = getColorForAgent(index);
  const startedAt = session.created_at || session.started_at;
  const endedAt = session.updated_at;

  const handleMouseEnter = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      onHover(session, rect.left + rect.width / 2, rect.top);
    },
    [session, onHover]
  );

  if (!startedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  const leftPct = ((start - timeRange.min) / (timeRange.max - timeRange.min)) * 100;
  const widthPct = Math.max(
    ((end - start) / (timeRange.max - timeRange.min)) * 100,
    1.5 // minimum visible width
  );

  const status = (session.status || 'idle').toLowerCase();
  const isRunning = ['working', 'running', 'active', 'thinking'].includes(status);

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Agent name — clickable */}
      <div
        className="w-32 shrink-0 text-right cursor-pointer hover:underline"
        onClick={() => onClick?.(session)}
        title="Ver sesión"
      >
        <p
          className="text-[11px] font-mono truncate"
          style={{ color: 'var(--text-secondary)' }}
          title={session.title || 'Sin título'}
        >
          {session.title || 'Sin título'}
        </p>
      </div>

      {/* Timeline bar — clickable */}
      <div className="flex-1 relative h-6">
        <div
          className="absolute h-4 rounded-sm cursor-pointer transition-all hover:opacity-90 hover:shadow-lg"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            opacity: isRunning ? 1 : 0.7,
            boxShadow: isRunning ? `0 0 8px ${colors.border}` : 'none',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onLeave}
          onClick={() => onClick?.(session)}
          title={`Click para ver: ${session.title || 'Sin título'}`}
        >
          {/* Running indicator */}
          {isRunning && (
            <div
              className="absolute right-0 top-0 bottom-0 rounded-r-sm animate-pulse"
              style={{
                width: '4px',
                background: colors.base,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Time Axis ────────────────────────────────────────────────────────────────

function TimeAxis({ timeRange, totalWidth }) {
  const ticks = useMemo(() => {
    const range = timeRange.max - timeRange.min;
    const tickCount = Math.max(4, Math.min(8, Math.floor(totalWidth / 120)));
    const step = range / tickCount;
    const result = [];
    for (let i = 0; i <= tickCount; i++) {
      const time = new Date(timeRange.min + step * i);
      result.push({
        pct: (i / tickCount) * 100,
        label: time.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      });
    }
    return result;
  }, [timeRange, totalWidth]);

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-32 shrink-0" />
      <div className="flex-1 relative h-4">
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${tick.pct}%`, transform: 'translateX(-50%)' }}
          >
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {tick.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SwarmTimeline ────────────────────────────────────────────────────────────

export default function SwarmTimeline({
  sessions = [],
  _tracesBySession = {},
  onSessionClick: _onSessionClick,
}) {
  const [tooltip, setTooltip] = useState({ visible: false, session: null, x: 0, y: 0 });
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate time range
  const timeRange = useMemo(() => {
    if (sessions.length === 0) {
      const now = Date.now();
      return { min: now - 3600000, max: now };
    }

    let min = Infinity;
    let max = 0;
    sessions.forEach((s) => {
      const start = s.created_at || s.started_at;
      const end = s.updated_at;
      if (start) {
        const t = new Date(start).getTime();
        if (t < min) min = t;
      }
      if (end) {
        const t = new Date(end).getTime();
        if (t > max) max = t;
      }
    });

    if (min === Infinity) {
      const now = Date.now();
      return { min: now - 3600000, max: now };
    }
    if (max === 0) max = Date.now();

    // Add 5% padding on each side
    const padding = (max - min) * 0.05;
    return { min: min - padding, max: max + padding };
  }, [sessions]);

  const handleHover = useCallback((session, x, y) => {
    setTooltip({ visible: true, session, x, y });
  }, []);

  const handleLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (sessions.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{
          background: 'var(--surface-muted)',
          border: '1px dashed var(--border-subtle)',
        }}
      >
        <Clock
          className="w-6 h-6 mx-auto mb-2"
          strokeWidth={1}
          style={{ color: 'var(--text-muted)' }}
        />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No hay sesiones para mostrar en la línea de tiempo.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <Clock className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Línea de Tiempo del Swarm
        </h3>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {sessions.length} sesion{sessions.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Timeline body */}
      <div ref={containerRef} className="p-4 relative overflow-x-auto">
        <TimeAxis timeRange={timeRange} totalWidth={containerWidth} />

        <div
          className="mt-2"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '8px',
          }}
        >
          {sessions.map((session, i) => (
            <TimelineRow
              key={session.id || i}
              session={session}
              index={i}
              timeRange={timeRange}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ))}
        </div>

        {/* Tooltip */}
        <TimelineTooltip
          session={tooltip.session}
          x={tooltip.x}
          y={tooltip.y}
          visible={tooltip.visible}
        />
      </div>

      {/* Legend */}
      <div
        className="px-6 py-2 flex items-center gap-4 flex-wrap"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-muted)',
        }}
      >
        <Info className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          Barras = duración de sesión · Pulso = en ejecución · Hover = detalles
        </span>
      </div>
    </div>
  );
}

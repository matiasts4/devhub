import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_COLORS, formatToken } from './utils';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeStatus(status) {
  return String(status || 'unknown')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function getNodeTheme(status) {
  const key = normalizeStatus(status);
  return (
    STATUS_COLORS[key] || {
      bg: 'rgba(107,114,128,0.10)',
      color: '#9ca3af',
      dot: '#6b7280',
    }
  );
}

function nodeInitial(label, isDirector) {
  if (isDirector) return 'D';
  const clean = String(label || 'W').trim();
  return clean.charAt(0).toUpperCase() || 'W';
}

export default function AgentTopologyGraph({ roster = [], topology = null, onViewAgent = null }) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(760);

  useEffect(() => {
    if (!containerRef.current) return;

    if (typeof ResizeObserver === 'undefined') {
      if (containerRef.current.clientWidth) {
        setContainerWidth(containerRef.current.clientWidth);
      }
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const director = useMemo(
    () => roster.find((member) => member?.isDirector) || roster[0] || null,
    [roster]
  );
  const workers = useMemo(
    () => roster.filter((member) => member?.id && member.id !== director?.id),
    [roster, director]
  );

  const layout = useMemo(() => {
    if (!director) {
      return { width: containerWidth, height: 300, nodes: [], lines: [] };
    }

    const width = Math.max(320, containerWidth);
    const compact = width < 760;
    const baseHeight = compact ? 390 : 450;
    const extraHeight = workers.length > 6 ? (workers.length - 6) * 14 : 0;
    const height = baseHeight + extraHeight;

    const centerX = width / 2;
    const centerY = compact ? height * 0.43 : height * 0.46;
    const workerRadius = compact ? 26 : 30;
    const directorRadius = compact ? 34 : 40;

    const ringRadiusX = compact ? Math.min(width * 0.34, 150) : Math.min(width * 0.36, 250);
    const ringRadiusY = compact ? Math.min(height * 0.27, 120) : Math.min(height * 0.28, 145);

    const safePadding = compact ? 48 : 64;

    const directorNode = {
      id: director.id || 'director',
      label: director.label || 'Director',
      status: director.status,
      isDirector: true,
      x: centerX,
      y: centerY,
      r: directorRadius,
      workspaceId: director.workspaceId,
      runId: director.runId,
    };

    const workerNodes = workers.map((worker, index) => {
      const angle = -Math.PI / 2 + (index * (2 * Math.PI)) / Math.max(workers.length, 1);
      const rawX = centerX + ringRadiusX * Math.cos(angle);
      const rawY = centerY + ringRadiusY * Math.sin(angle);

      return {
        id: worker.id,
        label: worker.label || 'Worker',
        status: worker.status,
        isDirector: false,
        x: clamp(rawX, safePadding, width - safePadding),
        y: clamp(rawY, safePadding, height - safePadding - 54),
        r: workerRadius,
        workspaceId: worker.workspaceId,
        runId: worker.runId,
      };
    });

    const lines = workerNodes.map((workerNode) => ({
      key: `${directorNode.id}-${workerNode.id}`,
      sourceId: directorNode.id,
      targetId: workerNode.id,
      x1: directorNode.x,
      y1: directorNode.y,
      x2: workerNode.x,
      y2: workerNode.y,
    }));

    return {
      width,
      height,
      nodes: [directorNode, ...workerNodes],
      lines,
    };
  }, [director, workers, containerWidth]);

  const isNodeHighlighted = useCallback(
    (nodeId) => {
      if (!hoveredNode) return false;
      if (nodeId === hoveredNode) return true;
      return layout.lines.some(
        (line) =>
          (line.sourceId === hoveredNode && line.targetId === nodeId) ||
          (line.targetId === hoveredNode && line.sourceId === nodeId)
      );
    },
    [hoveredNode, layout.lines]
  );

  const activeCount = roster.filter((member) =>
    [
      'active',
      'working',
      'lease_active',
      'online',
      'thinking',
      'asking_questions',
      'running',
    ].includes(member?.status)
  ).length;
  const staleCount = roster.length - activeCount;

  if (!director) {
    return (
      <div
        className="flex h-28 items-center justify-center border text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        Sin topología activa: no hay Director ni agentes vivos en este snapshot.
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden border"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--chrome-panel-fill)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Topología Director ⇄ Agentes
          </span>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Briefings salen del Director; reportes/evidencia vuelven al Director.
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 text-[10px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {topology?.label ? <span>{topology.label}</span> : null}
          <span>{activeCount} vivos</span>
          {staleCount ? <span>{staleCount} vencidos/fuera de línea</span> : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          minHeight: '320px',
          height: `${layout.height}px`,
          background: 'var(--surface-muted)',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="none"
          className="absolute inset-0"
          aria-hidden="true"
        >
          {layout.lines.map((line) => {
            const highlighted =
              hoveredNode && (line.sourceId === hoveredNode || line.targetId === hoveredNode);

            return (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={highlighted ? 'rgba(96,165,250,0.65)' : 'rgba(96,165,250,0.28)'}
                strokeWidth={highlighted ? 2.4 : 1.3}
                strokeDasharray={highlighted ? '0' : '4 5'}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const theme = getNodeTheme(node.status);
          const highlighted = isNodeHighlighted(node.id);

          return (
            <div key={node.id} className="absolute" style={{ left: 0, top: 0 }}>
              <button
                type="button"
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onViewAgent?.(node.id)}
                className="absolute flex items-center justify-center rounded-none border-2 text-sm font-semibold"
                style={{
                  left: `${node.x - node.r}px`,
                  top: `${node.y - node.r}px`,
                  width: `${node.r * 2}px`,
                  height: `${node.r * 2}px`,
                  color: node.isDirector ? '#fbbf24' : 'var(--text-primary)',
                  borderColor: highlighted ? '#22c55e' : '#3f3f46',
                  background: node.isDirector ? '#141416' : '#141416',
                  boxShadow: highlighted ? '3px 3px 0px 0px #22c55e' : '3px 3px 0px 0px #27272a',
                }}
                title={`${node.label} · ${formatToken(node.status)}`}
                aria-label={`${node.label} estado ${formatToken(node.status)}`}
              >
                {nodeInitial(node.label, node.isDirector)}
              </button>

              <div
                className="absolute text-center"
                style={{
                  left: `${node.x - 60}px`,
                  top: `${node.y + node.r + 6}px`,
                  width: '120px',
                }}
              >
                <p
                  className="text-[11px] font-semibold leading-tight"
                  style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}
                >
                  {node.label}
                </p>
                <div
                  className="mt-1 inline-flex items-center gap-1 rounded-none border-2 px-2 py-0.5 text-[10px]"
                  style={{ background: '#141416', color: theme.color, borderColor: theme.dot }}
                >
                  <span className="h-1.5 w-1.5 rounded-none" style={{ background: theme.dot }} />
                  {formatToken(node.status)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-[10px]"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: '#4ade80' }}
          />
          vivo
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: '#64748b' }}
          />
          vencido/fuera de línea
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: '#f87171' }}
          />
          error
        </span>
        <span className="ml-auto">
          {roster.length} agente{roster.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_COLORS, formatToken } from './utils';
import {
  Target,
  Code2,
  Settings,
  Eye,
  Terminal,
  Layout,
  Compass,
  BarChart2,
  FileCheck,
  Wrench,
  Bot,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const ACTIVE_STATUSES = new Set([
  'active',
  'working',
  'running',
  'lease_active',
  'online',
  'thinking',
  'asking_questions',
]);

const ROLE_ICONS = {
  director: Target,
  coder: Code2,
  builder: Settings,
  auditor: Eye,
  qa: Eye,
  devops: Terminal,
  architect: Layout,
  scout: Compass,
  analyst: BarChart2,
  evidence: FileCheck,
  'recovery ops': Wrench,
};

function getRoleIcon(label) {
  const key = String(label || '')
    .toLowerCase()
    .trim();
  return ROLE_ICONS[key] || Bot;
}

function isEdgeActive(sourceStatus, targetStatus) {
  return (
    ACTIVE_STATUSES.has(normalizeStatus(sourceStatus)) ||
    ACTIVE_STATUSES.has(normalizeStatus(targetStatus))
  );
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function getNodeDimensions(node, compact) {
  if (node?.isDirector) {
    return {
      width: compact ? 124 : 164,
      height: compact ? 40 : 50,
    };
  }

  return {
    width: compact ? 115 : 155,
    height: compact ? 36 : 46,
  };
}

// ── Layout engine ────────────────────────────────────────────────────────────

function computeInitialLayout(nodes, width, height, compact) {
  if (nodes.length === 0) return [];

  const centerX = width / 2;
  const centerY = height / 2;
  const director = nodes.find((n) => n.isDirector) || nodes[0];
  const workers = nodes.filter((n) => n.id !== director.id);

  const pad = compact ? 44 : 60;
  const nodeR = compact ? 22 : 28;
  const dirR = compact ? 30 : 36;
  const ringRx = Math.min((width - pad * 2) * 0.38, compact ? 130 : 210);
  const ringRy = Math.min((height - pad * 2) * 0.34, compact ? 90 : 140);

  const positioned = [
    {
      ...director,
      x: centerX,
      y: centerY,
      r: dirR,
    },
  ];

  workers.forEach((w, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(workers.length, 1);
    positioned.push({
      ...w,
      x: clamp(centerX + ringRx * Math.cos(angle), pad, width - pad),
      y: clamp(centerY + ringRy * Math.sin(angle), pad, height - pad),
      r: nodeR,
    });
  });

  return positioned;
}

// ── Edge component ───────────────────────────────────────────────────────────

function TopologyEdge({ x1, y1, x2, y2, active, highlighted, compact }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;

  // Curved path via quadratic bezier (slight curve for visual interest)
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const curve = len * 0.08;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;

  const pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  const sw = highlighted ? 2.2 : compact ? 1.2 : 1.5;

  if (active) {
    return (
      <g>
        {/* Background glow */}
        <path d={pathD} fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth={sw + 4} />
        {/* Base line */}
        <path
          d={pathD}
          fill="none"
          stroke={highlighted ? 'rgba(74,222,128,0.7)' : 'rgba(74,222,128,0.35)'}
          strokeWidth={sw}
        />
        {/* Animated dash overlay */}
        <path
          d={pathD}
          fill="none"
          stroke={highlighted ? '#4ade80' : 'rgba(74,222,128,0.75)'}
          strokeWidth={sw}
          strokeDasharray="7, 7"
          className="topology-edge-active"
        />
      </g>
    );
  }

  // Not active
  return (
    <path
      d={pathD}
      fill="none"
      stroke={highlighted ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}
      strokeWidth={sw}
    />
  );
}

function TopologyNode({
  node,
  highlighted,
  selected,
  compact,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onClick,
}) {
  const theme = getNodeTheme(node.status);
  const isActive = ACTIVE_STATUSES.has(normalizeStatus(node.status));
  const IconComponent = getRoleIcon(node.label);

  const dimensions = getNodeDimensions(node, compact);
  const w = dimensions.width;
  const h = dimensions.height;

  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className={`absolute select-none flex items-center gap-2 px-2.5 py-1.5 rounded-none border-2 transition-all duration-300 ${
        isActive ? 'topology-node-active-glow' : ''
      }`}
      style={{
        left: `${node.x - w / 2}px`,
        top: `${node.y - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        cursor: 'grab',
        zIndex: selected ? 20 : highlighted ? 15 : 10,
        borderColor: selected ? 'var(--accent-primary)' : 'var(--chrome-border-color)',
        background: selected ? 'var(--chrome-panel-fill)' : 'var(--chrome-panel-fill)',
        boxShadow: 'var(--chrome-shadow-control)',
        transform: highlighted || selected ? 'scale(1.04)' : 'scale(1)',
        transition:
          'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s, background-color 0.2s, box-shadow 0.2s',
      }}
      title={`${node.label} · ${formatToken(node.status)}`}
      aria-label={`${node.label} estado ${formatToken(node.status)}`}
    >
      {/* Icon Wrapper on the Left */}
      <div
        className="relative flex items-center justify-center shrink-0 rounded-none"
        style={{
          width: compact ? '22px' : '28px',
          height: compact ? '22px' : '28px',
          background: node.isDirector ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)',
          border: node.isDirector
            ? '2px solid var(--accent-shadow)'
            : 'var(--chrome-border-width) solid var(--chrome-border-color)',
        }}
      >
        <IconComponent
          className="shrink-0 text-slate-400"
          style={{
            width: compact ? '12px' : '15px',
            height: compact ? '12px' : '15px',
            color: node.isDirector ? '#fbbf24' : '#94a3b8',
          }}
        />

        {/* Status Dot / Ring Indicator */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-none border-2 border-[#0b0f19]"
          style={{
            background: theme.dot,
            boxShadow: 'none',
          }}
        />
      </div>

      {/* Info on the Right */}
      <div className="flex flex-col items-start min-w-0 flex-1 leading-tight text-left">
        <span
          className={`font-semibold truncate w-full tracking-wide ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
          style={{ color: node.isDirector ? '#fbbf24' : '#f1f5f9' }}
        >
          {node.label}
        </span>
        <span
          className={`font-mono text-[8.5px] uppercase tracking-wider ${
            compact ? 'mt-0' : 'mt-0.5'
          }`}
          style={{ color: theme.color }}
        >
          {formatToken(node.status)}
        </span>
      </div>
    </button>
  );
}

function injectStyles() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__swarmTopologyStylesInjected) return;
  window.__swarmTopologyStylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes topology-dash-flow {
      to { stroke-dashoffset: -28; }
    }
    .topology-edge-active {
      animation: topology-dash-flow 1.2s linear infinite;
    }
    @keyframes brutal-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .topology-pulse {
      animation: brutal-blink 1s ease-in-out infinite;
    }
    .topology-node-active-glow {
      animation: none;
      border-color: var(--accent-primary) !important;
      box-shadow: 4px 4px 0px 0px var(--accent-primary) !important;
    }
  `;
  document.head.appendChild(style);
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * SwarmTopologyGraph — reusable interactive topology graph.
 *
 * @param {Object} props
 * @param {Array}  props.roster   - Array of { id, label, status, isDirector, workspaceId, runId }
 * @param {Object} props.topology - { label, roles, connections } — optional static definition
 * @param {string} props.variant  - 'full' (default) | 'compact'
 * @param {Function} props.onSelectAgent - callback(agentId) when a node is clicked
 * @param {string} props.className
 */
export default function SwarmTopologyGraph({
  roster = [],
  topology = null,
  variant = 'full',
  onSelectAgent = null,
  className = '',
}) {
  const compact = variant === 'compact';
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: compact ? 160 : 280 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [dragState, setDragState] = useState(null); // { nodeId, offsetX, offsetY }
  const [manualPositions, setManualPositions] = useState(null); // Map<id, {xRatio, yRatio}>

  useEffect(() => {
    injectStyles();
  }, []);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    if (el.clientWidth) {
      setContainerSize({
        width: el.clientWidth,
        height: compact
          ? Math.max(160, el.clientWidth * 0.28)
          : Math.max(260, el.clientWidth * 0.38),
      });
    }

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setContainerSize({
          width: w,
          height: compact ? Math.max(160, w * 0.28) : Math.max(260, w * 0.38),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);

  // Build node data from roster
  const nodes = useMemo(() => {
    if (roster.length === 0) return [];
    return roster.map((member) => ({
      id: member.id || `node-${Math.random().toString(36).slice(2, 6)}`,
      label: member.label || member.role || 'Agent',
      status: member.status || 'unknown',
      isDirector: Boolean(member.isDirector),
      workspaceId: member.workspaceId || null,
      runId: member.runId || null,
    }));
  }, [roster]);

  // Build edges from topology connections or default star pattern
  const edges = useMemo(() => {
    const director = nodes.find((n) => n.isDirector) || nodes[0];
    if (!director || nodes.length < 2) return [];

    if (topology?.connections?.length) {
      // Parse "A → B" string connections into node id pairs
      const nodesByLabel = new Map(nodes.map((n) => [n.label.toLowerCase(), n]));
      return topology.connections
        .map((conn) => {
          const parts = String(conn)
            .split('→')
            .map((s) => s.trim().toLowerCase());
          if (parts.length !== 2) return null;
          const source = nodesByLabel.get(parts[0]);
          const target = nodesByLabel.get(parts[1]);
          if (!source || !target) return null;
          return {
            from: source.id,
            to: target.id,
            sourceStatus: source.status,
            targetStatus: target.status,
          };
        })
        .filter(Boolean);
    }

    // Default: star topology — director ↔ each worker
    const workers = nodes.filter((n) => n.id !== director.id);
    return workers.flatMap((w) => [
      { from: director.id, to: w.id, sourceStatus: director.status, targetStatus: w.status },
      { from: w.id, to: director.id, sourceStatus: w.status, targetStatus: director.status },
    ]);
  }, [nodes, topology]);

  // Deduplicate edges for rendering (keep one visual line per pair)
  const visualEdges = useMemo(() => {
    const seen = new Set();
    return edges.filter((e) => {
      const key = [e.from, e.to].sort().join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [edges]);

  // Initial layout computation
  const layoutNodes = useMemo(() => {
    return computeInitialLayout(nodes, containerSize.width, containerSize.height, compact);
  }, [nodes, containerSize.width, containerSize.height, compact]);

  // Keep only overrides that still belong to existing nodes.
  useEffect(() => {
    setManualPositions((prev) => {
      if (!prev || prev.size === 0) return prev;

      const nodeIds = new Set(nodes.map((node) => node.id));
      let changed = false;
      const next = new Map();

      prev.forEach((value, key) => {
        if (nodeIds.has(key)) {
          next.set(key, value);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [nodes]);

  // Apply drag overrides using ratio-based positions so nodes stay connected after resize.
  const displayNodes = useMemo(() => {
    if (!manualPositions) return layoutNodes;

    return layoutNodes.map((n) => {
      const pos = manualPositions.get?.(n.id);
      if (pos) {
        const dims = getNodeDimensions(n, compact);
        const minX = dims.width / 2;
        const maxX = Math.max(minX, containerSize.width - dims.width / 2);
        const minY = dims.height / 2;
        const maxY = Math.max(minY, containerSize.height - dims.height / 2);

        return {
          ...n,
          x: clamp(pos.xRatio * containerSize.width, minX, maxX),
          y: clamp(pos.yRatio * containerSize.height, minY, maxY),
        };
      }

      return n;
    });
  }, [layoutNodes, manualPositions, compact, containerSize.width, containerSize.height]);

  const nodesById = useMemo(() => {
    return new Map(displayNodes.map((n) => [n.id, n]));
  }, [displayNodes]);

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e, nodeId) => {
      e.preventDefault();
      e.stopPropagation();
      const node = displayNodes.find((n) => n.id === nodeId);
      if (!node) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      setDragState({
        nodeId,
        offsetX: localX - node.x,
        offsetY: localY - node.y,
      });
    },
    [displayNodes]
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const draggedNode = displayNodes.find((node) => node.id === dragState.nodeId);
      const dims = getNodeDimensions(draggedNode, compact);

      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const minX = dims.width / 2;
      const maxX = Math.max(minX, containerSize.width - dims.width / 2);
      const minY = dims.height / 2;
      const maxY = Math.max(minY, containerSize.height - dims.height / 2);

      const x = clamp(localX - dragState.offsetX, minX, maxX);
      const y = clamp(localY - dragState.offsetY, minY, maxY);

      setManualPositions((prev) => {
        const next = new Map(prev || []);
        next.set(dragState.nodeId, {
          xRatio: containerSize.width > 0 ? x / containerSize.width : 0.5,
          yRatio: containerSize.height > 0 ? y / containerSize.height : 0.5,
        });
        return next;
      });
    };

    const handleUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, containerSize, compact, displayNodes]);

  // ── Hover highlighting ───────────────────────────────────────────────────

  const connectedToHovered = useMemo(() => {
    if (!hoveredNode) return new Set();
    const connected = new Set();
    edges.forEach((e) => {
      if (e.from === hoveredNode) connected.add(e.to);
      if (e.to === hoveredNode) connected.add(e.from);
    });
    return connected;
  }, [hoveredNode, edges]);

  const isNodeHighlighted = useCallback(
    (nodeId) => {
      if (!hoveredNode) return false;
      return nodeId === hoveredNode || connectedToHovered.has(nodeId);
    },
    [hoveredNode, connectedToHovered]
  );

  const selectedNodeObj = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find((n) => n.id === selectedNode) || null;
  }, [selectedNode, nodes]);

  const SelectedIconComponent = useMemo(() => {
    if (!selectedNodeObj) return null;
    return getRoleIcon(selectedNodeObj.label);
  }, [selectedNodeObj]);

  const selectedNodeTheme = useMemo(() => {
    if (!selectedNodeObj) return null;
    return getNodeTheme(selectedNodeObj.status);
  }, [selectedNodeObj]);

  // ── Stats ────────────────────────────────────────────────────────────────

  const activeCount = roster.filter((m) => ACTIVE_STATUSES.has(normalizeStatus(m?.status))).length;
  const totalCount = roster.length;

  // ── Empty state ──────────────────────────────────────────────────────────

  if (nodes.length === 0) {
    return (
      <div
        className={`flex items-center justify-center border text-xs ${className}`}
        style={{
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
          height: compact ? '80px' : '120px',
        }}
      >
        No topology data available
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden border ${className}`}
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--chrome-panel-fill)',
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {compact ? 'Topology' : 'Swarm Topology'}
          </span>
          {topology?.label && !compact && (
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              · {topology.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#4ade80' }} />
            {activeCount} activo{activeCount === 1 ? '' : 's'}
          </span>
          <span>· {totalCount} total</span>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          height: `${containerSize.height}px`,
          minHeight: compact ? '160px' : '280px',
          background: compact ? 'var(--surface-muted)' : 'var(--surface-muted)',
          cursor: dragState ? 'grabbing' : 'default',
        }}
        onClick={() => {
          setSelectedNode(null);
          onSelectAgent?.(null);
        }}
      >
        {/* SVG edges */}
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {visualEdges.map((edge) => {
            const source = nodesById.get(edge.from);
            const target = nodesById.get(edge.to);
            if (!source || !target) return null;

            const active = isEdgeActive(edge.sourceStatus, edge.targetStatus);
            const highlighted =
              hoveredNode && (edge.from === hoveredNode || edge.to === hoveredNode);

            return (
              <TopologyEdge
                key={`${edge.from}-${edge.to}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                active={active}
                highlighted={highlighted}
                compact={compact}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {displayNodes.map((node) => (
          <TopologyNode
            key={node.id}
            node={node}
            highlighted={isNodeHighlighted(node.id)}
            selected={selectedNode === node.id}
            compact={compact}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNode(node.id);
              onSelectAgent?.(node.id);
            }}
          />
        ))}
      </div>

      {/* Footer / Agent Inspector */}
      {!compact && (
        <div className="border-t border-[var(--border-subtle)] bg-[#070c14]/90 backdrop-blur-md px-4 py-3">
          {selectedNodeObj ? (
            <div className="flex items-center justify-between gap-4 animate-fadeIn">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex items-center justify-center rounded-lg p-2 shrink-0"
                  style={{
                    color: selectedNodeObj.isDirector ? '#fbbf24' : 'var(--text-secondary)',
                    border: 'var(--chrome-border-width) solid var(--chrome-border-color)',
                    background: 'var(--chrome-panel-fill)',
                    boxShadow: 'var(--chrome-shadow-control)',
                  }}
                >
                  <SelectedIconComponent className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {selectedNodeObj.label}
                    </span>
                    <span
                      className="inline-flex items-center rounded-none px-2 py-0.5 text-[9px] font-medium border-2"
                      style={{
                        background: 'var(--chrome-panel-fill)',
                        color: selectedNodeTheme.color,
                        borderColor: selectedNodeTheme.dot,
                      }}
                    >
                      <span
                        className="mr-1 h-1 w-1 rounded-none"
                        style={{ background: selectedNodeTheme.dot }}
                      />
                      {formatToken(selectedNodeObj.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                    {selectedNodeObj.workspaceId && (
                      <span className="flex items-center gap-1">
                        <span className="text-[9px] text-[var(--text-secondary)] font-sans">
                          Workspace:
                        </span>
                        <span className="text-sky-400 select-all">
                          {selectedNodeObj.workspaceId}
                        </span>
                      </span>
                    )}
                    {selectedNodeObj.runId && (
                      <span className="flex items-center gap-1">
                        <span className="text-[9px] text-[var(--text-secondary)] font-sans">
                          Run:
                        </span>
                        <span className="text-indigo-400 select-all">{selectedNodeObj.runId}</span>
                      </span>
                    )}
                    {!selectedNodeObj.workspaceId && !selectedNodeObj.runId && (
                      <span>Sin workspace o run activo asignado</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="text-[10px] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/5"
                onClick={() => {
                  setSelectedNode(null);
                  onSelectAgent?.(null);
                }}
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-pulse" />
                Seleccioná un agente en el grafo para inspeccionar sus detalles
              </span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
                Arrastrá nodos para reorganizar la topología
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import {
  Loader2,
  XCircle,
  Brain,
  Cpu,
  MessageSquare,
  GitBranch,
  Search,
  Copy,
  Check,
  Maximize2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import OutputViewerModal from './OutputViewerModal';
import ContextToolGroup from './ContextToolGroup';
import BashToolCard from './BashToolCard';
import ToolErrorCard from './ToolErrorCard';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class TraceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-3 text-red-400 text-[11px] font-mono gap-2">
          <XCircle className="w-3 h-3" />
          Error renderizando traces
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Context tool set for grouping ────────────────────────────────────────────
const CONTEXT_GROUP_TOOLS = new Set([
  'read',
  'read_file',
  'readFile',
  'glob',
  'grep',
  'search',
  'list',
  'ls',
  'directory',
]);

// ─── Bash tool name detection ─────────────────────────────────────────────────
function isBashTool(toolName) {
  if (!toolName) return false;
  return /bash|execute_command|shell/i.test(toolName);
}

// ─── Group consecutive context tools ─────────────────────────────────────────
function groupTraces(parts) {
  const groups = [];
  let currentGroup = [];

  for (const part of parts) {
    if (part.type === 'tool' && CONTEXT_GROUP_TOOLS.has(part.toolName?.toLowerCase())) {
      currentGroup.push(part);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ type: 'context-group', tools: currentGroup });
        currentGroup = [];
      }
      groups.push({ type: 'single', part });
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ type: 'context-group', tools: currentGroup });
  }
  return groups;
}

// ─── Reasoning Row (compact) ─────────────────────────────────────────────────
function ReasoningRow({ text }) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const safeText =
    typeof text === 'string'
      ? text
      : text == null
        ? 'Sin reasoning disponible'
        : JSON.stringify(text);
  const displayText = safeText.trim() ? safeText : 'Sin reasoning disponible';
  const preview = displayText.length > 120 ? displayText.slice(0, 120) + '…' : displayText;
  const isTruncated = displayText.length > 120;

  return (
    <>
      <div className="flex gap-2 items-start">
        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center mt-0.5">
          <Brain className="w-3 h-3 text-violet-400 opacity-70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[9px] text-violet-400/70 uppercase font-bold tracking-widest mb-1 hover:text-violet-300 transition-colors"
            >
              Thinking
              {expanded ? (
                <span className="text-[8px]">▼</span>
              ) : (
                <span className="text-[8px]">▶</span>
              )}
            </button>
            {isTruncated && (
              <button
                onClick={() => setShowFull(true)}
                className="text-[10px] font-mono flex items-center gap-1 transition-colors hover:opacity-80 cursor-pointer"
                style={{ color: 'var(--accent-primary)' }}
              >
                Ver completo
              </button>
            )}
          </div>
          <p
            className="text-[11px] italic font-mono leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--text-muted)' }}
          >
            {expanded ? displayText : preview}
          </p>
        </div>
      </div>

      <OutputViewerModal
        isOpen={showFull}
        onClose={() => setShowFull(false)}
        title="Reasoning"
        content={displayText}
        language="text"
      />
    </>
  );
}

// ─── Text Row (compact) ──────────────────────────────────────────────────────
function TextRow({ text, isStreaming }) {
  const safeText = typeof text === 'string' ? text : JSON.stringify(text);

  return (
    <div className="flex gap-2 items-start">
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center mt-0.5">
        <MessageSquare className="w-3 h-3 opacity-60" style={{ color: 'var(--accent-primary)' }} />
      </div>
      <p
        className="flex-1 text-[12px] leading-relaxed whitespace-pre-wrap font-sans"
        style={{ color: 'var(--text-secondary)' }}
      >
        {safeText}
        {isStreaming && (
          <span
            className="inline-block w-1 h-3 ml-0.5 animate-pulse rounded-sm align-middle"
            style={{ background: 'var(--accent-primary)' }}
          />
        )}
      </p>
    </div>
  );
}

// ─── Subtask Row (compact) ───────────────────────────────────────────────────
function SubtaskRow({ part }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center mt-0.5">
        <GitBranch className="w-3 h-3 text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-cyan-400/70 tracking-widest">
            Sub-Agente
          </span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
            {part.agentName}
          </span>
        </div>
        {part.content && (
          <p className="mt-1 text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
            {part.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Filter trace parts ───────────────────────────────────────────────────────
function filterTraceParts(trace, { searchTerm, filterType, filterStatus }) {
  if (!trace || trace.length === 0) return trace;

  let result = trace;

  // Filter by type
  if (filterType && filterType !== 'all') {
    result = result.filter((p) => p.type === filterType);
  }

  // Filter by status (only applies to tool parts)
  if (filterStatus && filterStatus !== 'all') {
    result = result.filter((p) => {
      if (p.type !== 'tool') return true; // non-tool parts pass through
      return p.toolStatus === filterStatus;
    });
  }

  // Full-text search
  if (searchTerm && searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    result = result.filter((p) => {
      if (p.type === 'tool') {
        return (
          (p.toolName || '').toLowerCase().includes(q) ||
          (p.toolOutput || '').toLowerCase().includes(q) ||
          JSON.stringify(p.toolInput || '')
            .toLowerCase()
            .includes(q)
        );
      }
      if (p.type === 'reasoning' || p.type === 'text') {
        return (p.content || '').toLowerCase().includes(q);
      }
      if (p.type === 'subtask') {
        return (
          (p.agentName || '').toLowerCase().includes(q) ||
          (p.content || '').toLowerCase().includes(q)
        );
      }
      return false;
    });
  }

  return result;
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function AgentTracePanel({
  trace = [],
  isRunning = false,
  searchTerm = '',
  filterType = 'all',
  filterStatus = 'all',
}) {
  const scrollRef = useRef(null);

  // Auto-scroll mientras corre
  useEffect(() => {
    if (isRunning && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [trace, isRunning]);

  // useMemo for filtered traces
  const filteredTrace = useMemo(
    () => filterTraceParts(trace, { searchTerm, filterType, filterStatus }),
    [trace, searchTerm, filterType, filterStatus]
  );

  // Group consecutive context tools
  const groupedTrace = useMemo(() => groupTraces(filteredTrace), [filteredTrace]);

  // Trace counts
  const traceCounts = useMemo(() => {
    const counts = { tool: 0, reasoning: 0, text: 0, subtask: 0, total: trace.length };
    trace.forEach((p) => {
      if (counts[p.type] !== undefined) counts[p.type]++;
    });
    return counts;
  }, [trace]);

  if (trace.length === 0 && !isRunning) {
    return (
      <div
        className="flex items-center justify-center py-3 text-[11px] font-mono gap-2"
        style={{ color: 'var(--text-muted)' }}
      >
        <Cpu className="w-3 h-3" />
        Sin actividad registrada
      </div>
    );
  }

  return (
    <TraceErrorBoundary>
      {/* Trace count header */}
      {trace.length > 0 && (
        <div
          className="px-4 pt-2 flex items-center gap-3 text-[10px] font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>{traceCounts.total} traces</span>
          {traceCounts.tool > 0 && <span>{traceCounts.tool} tools</span>}
          {traceCounts.reasoning > 0 && <span>{traceCounts.reasoning} reasoning</span>}
          {traceCounts.text > 0 && <span>{traceCounts.text} text</span>}
          {traceCounts.subtask > 0 && <span>{traceCounts.subtask} subtasks</span>}
          {searchTerm && (
            <span style={{ color: 'var(--accent-primary)' }}>
              · filtrado: {filteredTrace.length}
            </span>
          )}
        </div>
      )}

      <div ref={scrollRef} className="overflow-y-auto scroll-smooth px-3 py-2 space-y-1.5">
        {groupedTrace.map((group, i) => {
          if (group.type === 'context-group') {
            return (
              <ContextToolGroup
                key={`ctx-${i}`}
                tools={group.tools}
                isRunning={isRunning && group.tools.some((t) => t.toolStatus === 'running')}
              />
            );
          }

          const part = group.part;

          if (part.type === 'reasoning') {
            return <ReasoningRow key={part.id || i} text={part.content} />;
          }

          if (part.type === 'tool') {
            // Error tools get dedicated error card
            if (part.toolStatus === 'error') {
              return <ToolErrorCard key={part.id || i} tool={part} />;
            }
            // Bash tools get terminal card
            if (isBashTool(part.toolName)) {
              return <BashToolCard key={part.id || i} tool={part} />;
            }
            // Remaining tools fall back to a minimal generic row
            return <GenericToolRow key={part.id || i} part={part} />;
          }

          if (part.type === 'subtask') {
            return <SubtaskRow key={part.id || i} part={part} />;
          }

          if (part.type === 'text' && part.content?.trim()) {
            const isLast = i === groupedTrace.length - 1;
            return (
              <TextRow key={part.id || i} text={part.content} isStreaming={isRunning && isLast} />
            );
          }

          return null;
        })}

        {filteredTrace.length === 0 &&
          trace.length > 0 &&
          (searchTerm || filterType !== 'all' || filterStatus !== 'all') && (
            <div
              className="flex items-center justify-center py-3 text-[11px] font-mono gap-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <Search className="w-3 h-3" />
              Sin resultados para los filtros actuales
            </div>
          )}

        {isRunning && trace.length === 0 && (
          <div
            className="flex items-center gap-2 text-[11px] font-mono"
            style={{ color: 'var(--warning, #f59e0b)' }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Conectando al agente…
          </div>
        )}
      </div>
    </TraceErrorBoundary>
  );
}

// ─── Generic Tool Row — estilo OpenCode: border-l de color, siempre visible ──
function GenericToolRow({ part }) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const isRunning = part.toolStatus === 'running';
  const isDone = part.toolStatus === 'completed';
  const isError = part.toolStatus === 'error';
  const timing = part.timeEnd && part.timeStart ? part.timeEnd - part.timeStart : null;

  // Colores de estado
  const borderColor = isRunning
    ? '#f59e0b'
    : isDone
      ? '#34d399'
      : isError
        ? '#f87171'
        : 'var(--border-strong)';

  const statusColor = isRunning
    ? 'text-amber-400'
    : isDone
      ? 'text-emerald-400'
      : isError
        ? 'text-red-400'
        : 'text-[color:var(--text-muted)]';

  // Primer argumento como hint
  const primaryArg = part.toolInput ? Object.values(part.toolInput)[0] : null;
  const primaryArgStr =
    typeof primaryArg === 'string'
      ? primaryArg.length > 60
        ? '…' + primaryArg.slice(-55)
        : primaryArg
      : null;

  const outputTruncated = part.toolOutput && part.toolOutput.length > 1200;
  const displayOutput = showFull
    ? part.toolOutput
    : part.toolOutput
      ? part.toolOutput.slice(0, 1200)
      : '';

  const handleViewFull = useCallback((e) => {
    e.stopPropagation();
    setShowFull(true);
  }, []);

  const handleCopyOutput = useCallback(
    async (e) => {
      e.stopPropagation();
      if (!part.toolOutput) return;
      await navigator.clipboard.writeText(part.toolOutput);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    },
    [part.toolOutput]
  );

  const hasDetails = !!(part.toolInput || part.toolOutput);

  return (
    <>
      <div
        className="pl-3 transition-all duration-200"
        style={{ borderLeft: `2px solid ${borderColor}` }}
      >
        {/* ── Header: siempre visible ── */}
        <button
          onClick={() => hasDetails && setExpanded((v) => !v)}
          className={`w-full flex items-center gap-2 py-1 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {/* Status icon */}
          <div className={`flex-shrink-0 ${statusColor}`}>
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isDone ? (
              <Check className="w-3 h-3" />
            ) : isError ? (
              <XCircle className="w-3 h-3" />
            ) : (
              <Loader2 className="w-3 h-3 opacity-30" />
            )}
          </div>

          {/* Tool name */}
          <span className={`text-[11px] font-mono font-semibold flex-shrink-0 ${statusColor}`}>
            {part.toolName || 'tool'}
          </span>

          {/* Primary arg — muted hint */}
          {primaryArgStr && (
            <span
              className="text-[10px] font-mono truncate flex-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {primaryArgStr}
            </span>
          )}

          {/* Right side: timing + chevron */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {timing !== null && (
              <span
                className="text-[9px] font-mono"
                style={{ color: 'var(--text-muted)', opacity: 0.5 }}
              >
                {timing}ms
              </span>
            )}
            {hasDetails &&
              (expanded ? (
                <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              ))}
          </div>
        </button>

        {/* ── Expandible: input + output ── */}
        <div
          className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="pb-2 space-y-2 pt-1">
              {part.toolInput && (
                <div>
                  <p
                    className="text-[9px] uppercase font-bold mb-1 tracking-widest"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Input
                  </p>
                  <pre
                    className="text-[10px] font-mono whitespace-pre-wrap break-all rounded p-2 max-h-28 overflow-auto"
                    style={{
                      background: 'var(--surface-elevated)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {JSON.stringify(part.toolInput, null, 2)}
                  </pre>
                </div>
              )}
              {part.toolOutput && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p
                      className="text-[9px] uppercase font-bold tracking-widest"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Output
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyOutput}
                        className="text-[10px] font-mono flex items-center gap-1 transition-colors hover:opacity-80 cursor-pointer"
                        style={{ color: copiedOutput ? '#34d399' : 'var(--text-muted)' }}
                        title="Copiar output"
                      >
                        {copiedOutput ? (
                          <Check className="w-2.5 h-2.5" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                        {copiedOutput ? 'Copiado' : 'Copiar'}
                      </button>
                      {outputTruncated && (
                        <button
                          onClick={handleViewFull}
                          className="text-[10px] font-mono flex items-center gap-1 transition-colors hover:opacity-80 cursor-pointer"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          <Maximize2 className="w-2.5 h-2.5" /> Ver completo
                        </button>
                      )}
                    </div>
                  </div>
                  <pre
                    className="text-[10px] font-mono whitespace-pre-wrap break-all rounded p-2 max-h-40 overflow-auto"
                    style={{
                      background: 'var(--surface-elevated)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {displayOutput}
                    {outputTruncated && !showFull ? '\n…[truncado]' : ''}
                  </pre>
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
        title={`${part.toolName || 'tool'} — Output`}
        content={part.toolOutput}
      />
    </>
  );
}

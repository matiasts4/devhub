import { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  FolderOpen,
  Globe,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

// ─── Context tool type detection ──────────────────────────────────────────────
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

// ─── Icon per tool type ───────────────────────────────────────────────────────
const TOOL_ICON_MAP = {
  read: FileText,
  read_file: FileText,
  readFile: FileText,
  grep: Search,
  glob: Search,
  search: Search,
  list: FolderOpen,
  ls: FolderOpen,
  directory: FolderOpen,
  web: Globe,
  fetch: Globe,
  webSearch: Globe,
};

function getToolIcon(toolName) {
  if (!toolName) return FileText;
  const lower = toolName.toLowerCase();
  for (const [key, Icon] of Object.entries(TOOL_ICON_MAP)) {
    if (lower.includes(key)) return Icon;
  }
  return FileText;
}

// ─── Human-readable tool label ────────────────────────────────────────────────
function toolLabel(toolName) {
  if (!toolName) return 'tool';
  const labels = {
    read: 'leído',
    read_file: 'leído',
    readFile: 'leído',
    glob: 'búsqueda glob',
    grep: 'grep',
    search: 'búsqueda',
    list: 'listado',
    ls: 'listado',
    directory: 'listado',
  };
  const lower = toolName.toLowerCase();
  for (const [key, label] of Object.entries(labels)) {
    if (lower.includes(key)) return label;
  }
  return toolName;
}

// ─── Summary builder ──────────────────────────────────────────────────────────
function buildSummary(tools) {
  const counts = { read: 0, search: 0, list: 0 };
  for (const t of tools) {
    const lower = (t.toolName || '').toLowerCase();
    if (lower.includes('read')) counts.read++;
    else if (lower.includes('glob') || lower.includes('grep') || lower.includes('search'))
      counts.search++;
    else if (lower.includes('list') || lower.includes('ls') || lower.includes('directory'))
      counts.list++;
  }
  const parts = [];
  if (counts.read > 0)
    parts.push(
      `${counts.read} archivo${counts.read !== 1 ? 's' : ''} leído${counts.read !== 1 ? 's' : ''}`
    );
  if (counts.search > 0) parts.push(`${counts.search} búsqueda${counts.search !== 1 ? 's' : ''}`);
  if (counts.list > 0) parts.push(`${counts.list} listado${counts.list !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

// ─── ContextToolGroup ─────────────────────────────────────────────────────────
export default function ContextToolGroup({ tools = [], isRunning = false }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = !isRunning && tools.every((t) => t.toolStatus === 'completed');
  const hasError = tools.some((t) => t.toolStatus === 'error');

  const summary = useMemo(() => buildSummary(tools), [tools]);
  const totalTiming = useMemo(() => {
    return tools.reduce((acc, t) => {
      if (t.timeEnd && t.timeStart) return acc + (t.timeEnd - t.timeStart);
      return acc;
    }, 0);
  }, [tools]);

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);

  const titleText = isRunning
    ? 'Recolectando contexto...'
    : hasError
      ? 'Contexto parcial'
      : 'Contexto recolectado';

  return (
    <div
      className={`group rounded-lg border transition-all duration-200
        ${isRunning ? 'border-amber-500/30 bg-amber-500/5' : ''}
        ${isDone ? 'border-[color:var(--border-subtle)] bg-transparent' : ''}
        ${hasError ? 'border-red-500/30 bg-red-500/5' : ''}
      `}
    >
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {/* Status icon */}
        <div
          className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded
            ${isRunning ? 'text-amber-400' : isDone ? 'text-emerald-400' : hasError ? 'text-red-400' : 'text-[color:var(--text-muted)]'}`}
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isDone ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : hasError ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
        </div>

        {/* Title */}
        <span
          className={`text-[11px] font-mono font-medium
            ${isRunning ? 'text-amber-300' : isDone ? 'text-emerald-300' : hasError ? 'text-red-300' : 'text-amber-300'}`}
        >
          {titleText}
        </span>

        {/* Summary */}
        {summary && (
          <span
            className="text-[10px] font-mono truncate flex-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {summary}
          </span>
        )}

        {/* Timing + chevron */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {totalTiming > 0 && (
            <span
              className="text-[9px] font-mono"
              style={{ color: 'var(--text-muted)', opacity: 0.6 }}
            >
              {totalTiming}ms
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

      {/* Expanded tool lines */}
      <div
        className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div
            className="px-3 pb-2 space-y-0.5 border-t pt-1.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {tools.map((tool, idx) => {
              const Icon = getToolIcon(tool.toolName);
              const primaryArg = tool.toolInput ? Object.values(tool.toolInput)[0] : null;
              const primaryArgStr =
                typeof primaryArg === 'string'
                  ? primaryArg.length > 80
                    ? '…' + primaryArg.slice(-77)
                    : primaryArg
                  : null;
              const t = tool.toolStatus;
              const toolIsRunning = t === 'running';
              const toolIsError = t === 'error';

              return (
                <div
                  key={tool.id || idx}
                  className="flex items-center gap-2 px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {/* Tool icon */}
                  <div
                    className={`w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center
                      ${toolIsRunning ? 'text-amber-400' : toolIsError ? 'text-red-400' : 'text-[color:var(--text-muted)]'}`}
                  >
                    {toolIsRunning ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Icon className="w-2.5 h-2.5" />
                    )}
                  </div>

                  {/* Tool name */}
                  <span className="min-w-[60px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {toolLabel(tool.toolName)}
                  </span>

                  {/* Primary arg */}
                  {primaryArgStr && (
                    <span
                      className="truncate flex-1"
                      style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                    >
                      {primaryArgStr}
                    </span>
                  )}

                  {/* Per-tool timing */}
                  {tool.timeEnd && tool.timeStart && (
                    <span
                      className="flex-shrink-0"
                      style={{ color: 'var(--text-muted)', opacity: 0.5 }}
                    >
                      {tool.timeEnd - tool.timeStart}ms
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

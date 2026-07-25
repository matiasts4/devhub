import { Search, Filter, X } from 'lucide-react';
import { useState, useCallback } from 'react';

/**
 * TraceSearchBar — Search and filter bar for agent traces.
 *
 * Props:
 *   onSearch(term: string) — called when the user types a search term
 *   onFilter(filters: { trace_type?: string, tool_status?: string }) — called when filters change
 *   onClear() — called when the user clears the search
 */
export default function TraceSearchBar({ onSearch, onFilter, onClear }) {
  const [term, setTerm] = useState('');
  const [traceType, setTraceType] = useState('all');
  const [toolStatus, setToolStatus] = useState('all');

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      setTerm(value);
      onSearch(value);
    },
    [onSearch]
  );

  const handleTraceTypeChange = useCallback(
    (e) => {
      const value = e.target.value;
      setTraceType(value);
      onFilter({ trace_type: value, tool_status: toolStatus });
    },
    [onFilter, toolStatus]
  );

  const handleToolStatusChange = useCallback(
    (e) => {
      const value = e.target.value;
      setToolStatus(value);
      onFilter({ trace_type: traceType, tool_status: value });
    },
    [onFilter, traceType]
  );

  const handleClear = useCallback(() => {
    setTerm('');
    setTraceType('all');
    setToolStatus('all');
    onClear();
  }, [onClear]);

  const hasActiveFilters = term || traceType !== 'all' || toolStatus !== 'all';

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 border-b"
      style={{ borderColor: 'var(--border-color, #2a2a2a)' }}
    >
      {/* Search input row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--text-muted, #888)' }}
          />
          <input
            type="text"
            value={term}
            onChange={handleInputChange}
            placeholder="Buscar en traces…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm font-mono bg-transparent border focus:outline-none focus:ring-1 transition-all"
            style={{
              borderColor: 'var(--border-color, #2a2a2a)',
              color: 'var(--text-primary, #e0e0e0)',
            }}
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="p-2 rounded-lg hover:bg-surface-elevated transition-colors"
            style={{ color: 'var(--text-muted, #888)' }}
            aria-label="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <Filter
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: 'var(--text-muted, #888)' }}
        />
        <select
          value={traceType}
          onChange={handleTraceTypeChange}
          className="flex-1 px-2 py-1.5 rounded-md text-xs font-mono bg-transparent border focus:outline-none focus:ring-1 transition-all"
          style={{
            borderColor: 'var(--border-color, #2a2a2a)',
            color: 'var(--text-primary, #e0e0e0)',
          }}
        >
          <option value="all">Todos los tipos</option>
          <option value="tool_call">Tool Call</option>
          <option value="llm">LLM</option>
          <option value="system">System</option>
        </select>
        <select
          value={toolStatus}
          onChange={handleToolStatusChange}
          className="flex-1 px-2 py-1.5 rounded-md text-xs font-mono bg-transparent border focus:outline-none focus:ring-1 transition-all"
          style={{
            borderColor: 'var(--border-color, #2a2a2a)',
            color: 'var(--text-primary, #e0e0e0)',
          }}
        >
          <option value="all">Todos los estados</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
      </div>
    </div>
  );
}

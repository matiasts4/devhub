'use client';

import { ChevronLeft, ChevronRight, Search, Terminal, X } from 'lucide-react';
import TerminalTTY from '@/components/TerminalTTY';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 760;

export default function TerminalSidePanel({
  isOpen,
  onClose,
  activeAgents = [],
  defaultWidth = DEFAULT_WIDTH,
}) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTabId, setActiveTabId] = useState(null);
  const [query, setQuery] = useState('');
  const tabsRef = useRef([]);
  const seenRef = useRef(new Set());

  const tabs = useMemo(() => {
    const nextTabs = [...tabsRef.current];
    const byId = new Map(nextTabs.map((tab) => [tab.id, tab]));

    for (const agent of activeAgents) {
      const tabId = `agent-${agent.id}`;
      if (!seenRef.current.has(agent.id)) {
        seenRef.current.add(agent.id);
        nextTabs.push({
          id: tabId,
          terminalId: tabId,
          name: agent.name || `agent-${String(agent.id).slice(0, 6)}`,
          status: agent.status || 'running',
          agentId: agent.id,
        });
        continue;
      }

      const existing = byId.get(tabId);
      if (existing) {
        existing.status = agent.status || existing.status;
        existing.name = agent.name || existing.name;
      }
    }

    tabsRef.current = nextTabs;
    return nextTabs;
  }, [activeAgents]);

  useEffect(() => {
    if (!isOpen) return;
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
  }, [isOpen, tabs, activeTabId]);

  useEffect(() => {
    if (!isOpen) {
      tabsRef.current = [];
      seenRef.current.clear();
      setActiveTabId(null);
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isResizing) return;

    const handleMove = (event) => {
      const next = window.innerWidth - event.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isOpen, isResizing]);

  const closeTab = useCallback(
    (event, tabId) => {
      event.stopPropagation();
      const nextTabs = tabs.filter((tab) => tab.id !== tabId);
      tabsRef.current = nextTabs;

      if (activeTabId === tabId) {
        setActiveTabId(nextTabs.length ? nextTabs[nextTabs.length - 1].id : null);
      }
    },
    [tabs, activeTabId]
  );

  const submitSearch = useCallback(
    (direction = 'next') => {
      if (!activeTabId || !query.trim()) return;
      const active = tabs.find((tab) => tab.id === activeTabId);
      if (!active) return;

      window.dispatchEvent(
        new CustomEvent('devhub:terminal-search', {
          detail: {
            targetId: active.terminalId,
            query: query.trim(),
            direction,
          },
        })
      );
    },
    [activeTabId, query, tabs]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex" style={{ width }}>
      <button
        type="button"
        className="h-full w-1 cursor-col-resize"
        style={{ background: 'var(--border-subtle)' }}
        onMouseDown={() => setIsResizing(true)}
        aria-label="Resize terminal panel"
      />

      <div
        className="flex h-full w-full flex-col border-l"
        style={{ background: 'var(--surface-app)', borderColor: 'var(--border-subtle)' }}
      >
        <header
          className="flex items-center justify-between border-b px-2 py-1"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-card)' }}
        >
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Terminales
            </span>
          </div>
          <button
            type="button"
            className="rounded p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_70%,transparent)]"
            onClick={onClose}
            style={{ color: 'var(--text-muted)' }}
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className="flex items-center gap-2 border-b px-2 py-1"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch('next');
            }}
            placeholder="Buscar en salida"
            className="h-7 flex-1 rounded border px-2 text-xs outline-none"
            style={{
              background: 'var(--surface-card)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            className="rounded border p-1"
            onClick={() => {
              submitSearch('prev');
            }}
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
            title="Anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded border p-1"
            onClick={() => {
              submitSearch('next');
            }}
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
            title="Siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className="flex h-9 items-end gap-1 overflow-x-auto border-b px-1"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-muted)' }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isDone = tab.status === 'completed' || tab.status === 'idle';
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className="group flex h-7 min-w-[120px] max-w-[180px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-2"
                style={{
                  background: isActive ? 'var(--surface-app)' : 'transparent',
                  borderColor: isActive ? 'var(--border-strong)' : 'var(--border-subtle)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: isDone ? 'var(--success)' : 'var(--warning)' }}
                />
                <span className="truncate text-[11px] font-mono">{tab.name}</span>
                <button
                  type="button"
                  onClick={(event) => closeTab(event, tab.id)}
                  className="ml-auto rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div
          className="relative flex-1 overflow-hidden"
          style={{ background: 'var(--surface-app)' }}
        >
          {tabs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Terminal className="h-8 w-8" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No hay terminales activas
              </p>
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className="absolute inset-0"
                style={{
                  visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                  opacity: tab.id === activeTabId ? 1 : 0,
                  zIndex: tab.id === activeTabId ? 10 : 0,
                }}
              >
                <TerminalTTY id={tab.terminalId} hideTitleBar autoFocus={tab.id === activeTabId} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

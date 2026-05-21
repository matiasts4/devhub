import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, ChevronDown, TerminalSquare } from 'lucide-react';
import TerminalTTY from './TerminalTTY';

/**
 * Pure function: returns display label for a tab.
 * Restored tabs get a ↺ prefix.
 * Shows tab.name if available, otherwise "Terminal N" (1-indexed).
 *
 * @param {{ id: string, name: string, restored?: boolean }} tab
 * @param {number} index - 0-based index
 * @returns {string}
 */
export function getTabLabel(tab, index) {
  const base = tab.name && tab.name.trim() ? tab.name : `Terminal ${index + 1}`;
  return tab.restored ? `↺ ${base}` : base;
}

export function getRestoredTabLabel(tab, index) {
  return getTabLabel(tab, index);
}

/**
 * Pure function: returns CSS class string for a tab's active/inactive state.
 * Active: amber bottom border (2px), elevated background.
 * Inactive: card background, dimmer.
 *
 * @param {boolean} isActive
 * @returns {string}
 */
export function getActiveTabStyle(isActive) {
  if (isActive) {
    return 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border-b-2 border-[var(--accent-primary)]';
  }
  return 'bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]';
}

/**
 * Pure function: returns visibility classes for the close (×) button.
 * Active tab: always visible. Inactive: hidden, shown on group hover.
 *
 * @param {boolean} isActive
 * @returns {string}
 */
export function getCloseButtonVisibility(isActive) {
  if (isActive) return 'opacity-100 hover:bg-white/10';
  return 'opacity-0 group-hover:opacity-100 hover:bg-white/10';
}

export default function TerminalTabsManager({ onClose, cwd }) {
  const [tabs, setTabs] = useState([{ id: '1', name: 'matias@kali: ~' }]);
  const [activeTabId, setActiveTabId] = useState('1');
  const counterRef = useRef(1);

  // On mount: fetch restored sessions and reconcile tabs
  useEffect(() => {
    async function reconcile() {
      try {
        const res = await fetch('/api/terminal/sessions', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverSessions = Array.isArray(data.sessions) ? data.sessions : [];
        const restored = serverSessions.filter((s) => s.restored);

        if (restored.length === 0) return;

        // Build tabs from restored sessions, deduplicated by terminalId
        const seenIds = new Set();
        const restoredTabs = [];
        for (const s of restored) {
          const tabId = s.terminalId || s.id;
          if (!tabId || seenIds.has(tabId)) continue;
          seenIds.add(tabId);
          restoredTabs.push({
            id: tabId,
            name: s.title || s.cwd || '',
            restored: true,
            cwd: s.cwd || undefined,
          });
        }

        if (restoredTabs.length === 0) return;

        // Update counterRef to avoid id collisions
        setTabs(restoredTabs);
        setActiveTabId(restoredTabs[0].id);
        counterRef.current = restoredTabs.length;
      } catch {
        // Network error — keep default tab
      }
    }

    reconcile();
  }, []);

  const addTab = () => {
    counterRef.current += 1;
    const newId = String(counterRef.current);
    setTabs((prev) => [...prev, { id: newId, name: '' }]);
    setActiveTabId(newId);
  };

  const removeTab = (e, idToRemove) => {
    e.stopPropagation();
    const newTabs = tabs.filter((t) => t.id !== idToRemove);
    if (newTabs.length === 0) {
      onClose();
      return;
    }
    setTabs(newTabs);
    if (activeTabId === idToRemove) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--surface-app)] overflow-hidden">
      {/* Compact Tab Strip — max-height 32px */}
      <div className="flex items-stretch max-h-[32px] h-[32px] bg-[var(--surface-card)] select-none shrink-0 border-b border-[var(--border-subtle)]">
        <div className="flex-1 overflow-x-auto flex items-stretch no-scrollbar">
          {tabs.map((tab, index) => (
            <motion.div
              key={tab.id}
              layout
              onClick={() => setActiveTabId(tab.id)}
              className={`group relative flex items-center gap-1.5 h-full px-2.5 cursor-pointer min-w-[100px] max-w-[160px] transition-colors border-r border-[var(--border-subtle)] ${getActiveTabStyle(activeTabId === tab.id)}`}
            >
              <TerminalSquare className="w-3 h-3 opacity-60 shrink-0" strokeWidth={2} />
              <span className="truncate font-mono text-[11px] tracking-tight leading-none flex-1">
                {getTabLabel(tab, index)}
              </span>
              <button
                onClick={(e) => removeTab(e, tab.id)}
                className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-opacity text-[12px] shrink-0 ${getCloseButtonVisibility(activeTabId === tab.id)}`}
                aria-label="Cerrar pestaña"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* + button — right side */}
        <button
          onClick={addTab}
          className="w-8 h-full flex items-center justify-center hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 border-l border-[var(--border-subtle)]"
          title="Nueva pestaña"
          aria-label="Nueva pestaña"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Global Panel Controls */}
        <button
          onClick={onClose}
          className="w-8 h-full flex items-center justify-center hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 border-l border-[var(--border-subtle)]"
          title="Cerrar panel inferior"
          aria-label="Cerrar panel inferior"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal Bodies Area — all remain mounted, active one shown */}
      <div className="flex-1 relative bg-[var(--surface-app)]">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => (
            <motion.div
              key={tab.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: activeTabId === tab.id ? 1 : 0 }}
              transition={{ duration: 0.12, ease: 'easeInOut' }}
              style={{
                zIndex: activeTabId === tab.id ? 10 : 0,
                pointerEvents: activeTabId === tab.id ? 'auto' : 'none',
              }}
            >
              <TerminalTTY cwd={tab.cwd || cwd} autoFocus={activeTabId === tab.id} hideTitleBar={true} restored={tab.restored} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * QuickActionsPalette — fast, direct-to-action command palette (Ctrl+Shift+P).
 *
 * A searchable modal of predefined actions (plain terminal, agent terminals,
 * browser). Selecting an action executes it immediately — no AI, no intent
 * parsing. Works in both normal workspace mode and pizarra mode by reusing
 * the zed-open-terminal / zed-open-url event bridge.
 *
 * Visual language follows the DevHub morphology chrome system: all chrome
 * geometry (radius, borders, shadows, fills) and accent color come from the
 * `--chrome-*` / `--accent-primary` tokens via src/chrome/morphology.js, so
 * the palette re-skins automatically with theme/morphology changes. Motion
 * follows the patterns of CommandBar.jsx.
 *
 * @module components/quickActions/QuickActionsPalette
 */

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command } from 'cmdk';
import {
  Search,
  Terminal,
  Sparkles,
  Rocket,
  SquareTerminal,
  Moon,
  Code,
  Bot,
  Globe,
} from 'lucide-react';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { panelStyle } from '@/chrome/morphology';
import { TRANSITION } from '@/components/ui/system/motion-tokens';
import { useQuickActionsPalette } from '@/lib/quickActions/useQuickActionsPalette';
import {
  QUICK_ACTIONS,
  QUICK_ACTION_GROUPS,
  filterQuickActions,
} from '@/lib/quickActions/quickActionRegistry';
import { executeQuickAction } from '@/lib/quickActions/executeQuickAction';

// Map registry icon names to lucide-react components.
const ICON_MAP = {
  terminal: Terminal,
  sparkles: Sparkles,
  rocket: Rocket,
  'square-terminal': SquareTerminal,
  moon: Moon,
  code: Code,
  bot: Bot,
  globe: Globe,
};

// Render order for the groups.
const GROUP_ORDER = [
  QUICK_ACTION_GROUPS.TERMINALS,
  QUICK_ACTION_GROUPS.AGENTS,
  QUICK_ACTION_GROUPS.TOOLS,
];

function ActionIcon({ name }) {
  const Icon = ICON_MAP[name] || Terminal;
  return (
    <Icon
      className="h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--accent-primary)_80%,transparent)]"
      aria-hidden="true"
    />
  );
}

/**
 * QuickActionsPalette component.
 *
 * @param {Object} props
 * @param {string|null} [props.cwd] - Project working directory for terminal spawns.
 */
export default function QuickActionsPalette({ cwd = null }) {
  const { isOpen, close } = useQuickActionsPalette();
  const [query, setQuery] = useState('');

  const motionMode = useMotionMode();
  const isReduced = motionMode === 'reduced';
  const isAmplified = motionMode === 'amplified';

  // Filter actions from the registry using the tested helper.
  const filtered = useMemo(() => filterQuickActions(query), [query]);

  // Group filtered actions preserving GROUP_ORDER.
  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      actions: filtered.filter((action) => action.group === group),
    })).filter((entry) => entry.actions.length > 0);
  }, [filtered]);

  const handleSelect = useCallback(
    (action) => {
      executeQuickAction(action, { cwd });
      close();
    },
    [cwd, close]
  );

  // Reset the query each time the palette closes.
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <Command.Dialog
          open={isOpen}
          onOpenChange={close}
          label="Acciones rápidas"
          shouldFilter={false}
          className="fixed inset-0 z-50"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={isReduced ? TRANSITION.reduced : TRANSITION.base}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          {/* Palette panel */}
          <motion.div
            initial={
              isReduced
                ? { opacity: 0 }
                : { opacity: 0, y: isAmplified ? -16 : -10, scale: isAmplified ? 0.96 : 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              isReduced
                ? { opacity: 0 }
                : { opacity: 0, y: isAmplified ? -16 : -10, scale: isAmplified ? 0.96 : 0.98 }
            }
            transition={isReduced ? TRANSITION.reduced : TRANSITION.enter}
            className="fixed top-[18%] left-1/2 w-full max-w-xl -translate-x-1/2 px-4"
          >
            <div
              className="overflow-hidden backdrop-blur-xl"
              style={{
                ...panelStyle(),
                borderColor:
                  'color-mix(in srgb, var(--accent-primary) 25%, var(--chrome-border-color))',
              }}
            >
              <Command label="Acciones rápidas" className="flex flex-col">
                {/* Search input */}
                <div
                  className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4"
                  {...{ 'cmdk-input-wrapper': '' }}
                >
                  <Search
                    className="h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--accent-primary)_70%,transparent)]"
                    aria-hidden="true"
                  />
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Buscar una acción… (terminal, agente, browser)"
                    className="h-12 w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    autoFocus
                    aria-label="Buscar acción rápida"
                  />
                  <kbd className="hidden shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--chrome-control-fill)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline-block">
                    Ctrl+Shift+P
                  </kbd>
                </div>

                {/* Results */}
                <Command.List className="max-h-[320px] overflow-y-auto overflow-x-hidden p-2">
                  <Command.Empty className="py-8 text-center text-sm text-[var(--text-muted)]">
                    Sin resultados para «{query}»
                  </Command.Empty>

                  {grouped.map(({ group, actions }) => (
                    <Command.Group
                      key={group}
                      heading={group}
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)]"
                    >
                      {actions.map((action) => (
                        <Command.Item
                          key={action.id}
                          onSelect={() => handleSelect(action)}
                          className="group flex cursor-pointer select-none items-center gap-3 rounded-[var(--chrome-radius-control)] px-3 py-2.5 text-sm outline-none data-[selected=true]:border data-[selected=true]:border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] data-[selected=true]:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
                        >
                          <ActionIcon name={action.icon} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-[var(--text-primary)]">
                              {action.label}
                            </span>
                            <span className="truncate text-xs text-[var(--text-muted)]">
                              {action.description}
                            </span>
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                            ↵
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ))}
                </Command.List>
              </Command>

              {/* Footer hints */}
              <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--chrome-panel-fill-emphasis)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
                <span>
                  <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--chrome-control-fill)] px-1.5 py-0.5 font-mono text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  navegar
                </span>
                <span>
                  <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--chrome-control-fill)] px-1.5 py-0.5 font-mono text-[10px]">
                    ↵
                  </kbd>{' '}
                  ejecutar
                </span>
                <span>
                  <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--chrome-control-fill)] px-1.5 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>{' '}
                  cerrar
                </span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[color-mix(in_srgb,var(--accent-primary)_50%,transparent)]">
                  {QUICK_ACTIONS.length} acciones
                </span>
              </div>
            </div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}

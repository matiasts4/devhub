'use client';
import { Layers, Plus } from 'lucide-react';

export const MAX_WORKSPACE_WINDOWS = 5;

const VARIANT_CLASS = {
  header:
    'pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-1.5 h-[30px]',
  overlay:
    'pointer-events-auto absolute top-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[rgba(8,14,24,0.88)] px-1.5 py-1 shadow-[0_6px_24px_rgba(0,0,0,0.38)] backdrop-blur-md',
};

/**
 * Compact switcher for workspace windows (V1, V2…) — max 5 per workspace.
 * `variant="header"` lives in the top bar next to Browser/Editor/Swarm.
 */
export default function WorkspaceWindowSwitcher({
  views = [],
  activeViewId,
  visible = true,
  variant = 'header',
  maxWindows = MAX_WORKSPACE_WINDOWS,
  onSelectView,
  onAddView,
}) {
  if (!visible || !views.length) return null;

  const capped = views.slice(0, maxWindows);
  const canAdd = views.length < maxWindows;
  const shellClass = VARIANT_CLASS[variant] || VARIANT_CLASS.header;

  return (
    <div
      data-testid="workspace-window-switcher"
      data-variant={variant}
      className={shellClass}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)]"
        title="Ventanas del workspace"
        aria-hidden
      >
        <Layers className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>

      <div className="flex items-center gap-0.5">
        {capped.map((view, index) => {
          const active = view.id === activeViewId;
          const label = String(index + 1);
          return (
            <button
              key={view.id}
              type="button"
              data-testid={`workspace-window-switch-${index + 1}`}
              onClick={() => onSelectView?.(view.id)}
              title={view.name || `Ventana ${label}`}
              aria-label={`Ventana ${label}`}
              aria-pressed={active}
              className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-[11px] font-mono font-bold transition-all duration-150 ${
                active
                  ? 'bg-[rgba(139,92,246,0.28)] text-violet-200 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.45)]'
                  : 'text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {canAdd ? (
        <button
          type="button"
          data-testid="workspace-window-switch-add"
          onClick={() => onAddView?.()}
          title="Nueva ventana (máx. 5)"
          aria-label="Agregar ventana"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

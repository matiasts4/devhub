'use client';

import { Plus, X } from 'lucide-react';

/**
 * Compact V1/V2 indicator for normal terminal view.
 * Hidden by default — appears briefly on window switch or when hovering the bottom edge.
 */
export default function WorkspaceViewFloater({
  views = [],
  activeViewId,
  visible = false,
  onSelectView,
  onAddView,
  onRemoveView,
  onHoverZoneEnter,
  onHoverZoneLeave,
}) {
  if (!views.length) return null;

  const activeIndex = Math.max(
    0,
    views.findIndex((v) => v.id === activeViewId)
  );

  return (
    <>
      <div
        data-testid="workspace-view-hover-zone"
        className="absolute bottom-0 left-0 right-0 h-7 z-20"
        onMouseEnter={onHoverZoneEnter}
        onMouseLeave={onHoverZoneLeave}
        aria-hidden
      />
      <div
        data-testid="workspace-view-floater"
        data-visible={visible ? 'true' : 'false'}
        className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.25)] bg-[rgba(8,14,24,0.92)] px-2 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all duration-200 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateX(-50%) translateY(${visible ? 0 : 8}px)`,
          pointerEvents: visible ? 'auto' : 'none',
        }}
        onMouseEnter={onHoverZoneEnter}
        onMouseLeave={onHoverZoneLeave}
      >
        {views.map((view, index) => {
          const label = view.name || `V${index + 1}`;
          const active = view.id === activeViewId;
          return (
            <button
              key={view.id}
              type="button"
              data-testid={`workspace-view-floater-tab-${index + 1}`}
              onClick={() => onSelectView?.(view.id)}
              title={`Vista ${label}`}
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-mono font-semibold transition-colors ${
                active
                  ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
              {views.length > 1 ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Cerrar ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveView?.(view.id);
                  }}
                  className="inline-flex rounded p-0.5 opacity-50 hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="workspace-view-floater-add"
          onClick={() => onAddView?.()}
          title="Nueva ventana"
          aria-label="Agregar ventana"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3 w-3" />
        </button>
        <span
          data-testid="workspace-view-floater-badge"
          className="ml-0.5 rounded-full px-1.5 text-[9px] font-mono font-semibold text-[var(--text-muted)]"
        >
          {activeIndex + 1}/{views.length}
        </span>
      </div>
    </>
  );
}
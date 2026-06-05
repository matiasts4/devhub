// PanelRendererSelect — per-panel renderer switcher presentational component.
//
// Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-selection/spec.md
// Design: openspec/changes/terminal-renderer-xterm-webgl/design.md §5.1.2
//
// Mounts inside the existing panel-header-actions row of
// WorkspaceTerminalSurface.jsx (the same surface reused by pizarra via
// renderWorkspacePanel.jsx). The component is purely presentational:
// the parent owns the preference state and supplies the resolved
// `currentMode`. On click, the parent receives `onChange(mode)` and is
// expected to call setPanelRendererPreference(prefs, wsId, panelId, mode).
//
// Contract:
//   <PanelRendererSelect
//     panelId="p1"
//     currentMode="xterm"                            // resolved renderer for this panel
//     availableModes={['xterm-webgl', 'vte-experimental']}
//     onChange={(mode) => void}                      // parent callback
//     disabled={false}                                // optional, defaults to false
//     disabledReason={null}                           // optional, shown via title attr
//   />
//
// The trigger button exposes data-testid="panel-renderer-select-${panelId}"
// and data-active-renderer="${currentMode}". The dropdown is a
// role="listbox" with role="option" children. Each option has its own
// data-testid="panel-renderer-option-${value}-${panelId}" for direct
// querying in tests.
//
// When the current mode is 'vte-experimental', the trigger is rendered
// as aria-disabled (the VTE backend has no JS-driven switch; the user
// must change the workspace default or panel preference from a higher
// surface). The `title` attribute surfaces the reason.
//
// The `canvas` row is always rendered for discoverability (RS-05) but
// is non-selectable: aria-disabled="true", disabled, and a click does
// NOT call onChange (per design §D-6).
//
// The `RENDERER_SELECT_OPTIONS` array is exported for testability and
// for any future caller that wants to render the same option list
// elsewhere (e.g. a settings modal).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, ChevronDown } from 'lucide-react';

export const RENDERER_SELECT_OPTIONS = Object.freeze([
  { value: 'inherit', label: 'Inherit (use workspace default)', selectable: true },
  { value: 'xterm-webgl', label: 'xterm + WebGL', selectable: true },
  { value: 'vte-experimental', label: 'GTK VTE', selectable: true },
  { value: 'canvas', label: 'canvas (Coming soon)', selectable: false },
]);

function getOptionLabel(value) {
  const entry = RENDERER_SELECT_OPTIONS.find((opt) => opt.value === value);
  return entry ? entry.label : value;
}

function isSelectable(value) {
  const entry = RENDERER_SELECT_OPTIONS.find((opt) => opt.value === value);
  return entry ? entry.selectable : true;
}

export default function PanelRendererSelect({
  panelId,
  currentMode = 'xterm',
  availableModes = ['xterm-webgl'],
  onChange,
  disabled = false,
  disabledReason = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click so a stray click in the panel doesn't leave
  // the dropdown hovering over the terminal body.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Close on Escape so keyboard users can dismiss.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleTriggerClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (disabled) return;
      setIsOpen((prev) => !prev);
    },
    [disabled]
  );

  const handleOptionClick = useCallback(
    (event, option) => {
      event.stopPropagation();
      if (!isSelectable(option.value)) return;
      setIsOpen(false);
      onChange?.(option.value);
    },
    [onChange]
  );

  // VTE-experimental: the runtime path is not JS-switchable (the panel
  // must be re-launched under GTK VTE). Surface as aria-disabled and
  // via title; the dropdown still opens so the user can see the
  // available options for the next launch.
  const isVteActive = currentMode === 'vte-experimental';
  const triggerTitle = isVteActive
    ? disabledReason || 'GTK VTE es el backend activo. Cámbialo desde el default del workspace.'
    : 'Cambiar renderer del panel';
  const triggerAriaDisabled = disabled || isVteActive;

  // Resolved current label for the trigger (shows the friendly name).
  const triggerLabel = getOptionLabel(currentMode) || currentMode;

  return (
    <div
      ref={containerRef}
      className="relative"
      data-testid={`panel-renderer-select-wrap-${panelId}`}
    >
      <button
        type="button"
        data-testid={`panel-renderer-select-${panelId}`}
        data-active-renderer={currentMode}
        data-open={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-disabled={triggerAriaDisabled ? 'true' : 'false'}
        disabled={triggerAriaDisabled}
        title={triggerTitle}
        onClick={handleTriggerClick}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors ${
          isVteActive
            ? 'text-[rgba(148,163,184,0.85)]'
            : 'text-[var(--text-muted)] hover:border-white/10 hover:bg-white/10 hover:text-[var(--text-secondary)]'
        }`}
      >
        <Monitor className="h-3 w-3" aria-hidden="true" />
        <span className="max-w-[120px] truncate">{triggerLabel}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          data-testid={`panel-renderer-listbox-${panelId}`}
          aria-label="Renderer del panel"
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] overflow-hidden rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.32)] bg-[#0d1320] py-1 text-[11px] shadow-[0_12px_28px_rgba(2,6,23,0.46)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {RENDERER_SELECT_OPTIONS.map((option) => {
            const isCurrent = option.value === currentMode;
            const isDisabledRow = !isSelectable(option.value);
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isCurrent ? 'true' : 'false'}
                aria-disabled={isDisabledRow ? 'true' : 'false'}
                data-testid={`panel-renderer-option-${option.value}-${panelId}`}
                data-option-value={option.value}
                title={isDisabledRow ? 'Canvas renderer todavía no está disponible' : undefined}
                onClick={(event) => handleOptionClick(event, option)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${
                  isCurrent
                    ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[rgb(241,245,249)]'
                    : 'text-[rgba(226,232,240,0.92)] hover:bg-white/5'
                } ${isDisabledRow ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <span>{option.label}</span>
                {isCurrent ? <span aria-hidden="true">•</span> : null}
                {isDisabledRow ? (
                  <span aria-hidden="true" className="text-[rgba(148,163,184,0.65)]">
                    soon
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

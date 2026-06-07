// renderWorkspacePanel — standalone JSX function for rendering a single terminal panel.
// Extracted from TerminalWorkspacesManager.jsx (lines 494-702).
// NOT a React component — called from JSX, not rendered with < />.

import React from 'react';
import { SplitSquareVertical, SplitSquareHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import TerminalTTY from '../../TerminalTTY';
import { derivePanelCommandMetadata } from '../utils/semanticMetadata';
import PanelRendererSelect from './PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from './terminalRendererPreferences';

function renderWorkspacePanel(
  panel,
  {
    activePanelId,
    activeWsId,
    isActivePanel,
    isVisibleInLayout,
    cwd,
    wsId,
    setActivePanelIds,
    onClosePanel,
    onSplitRight,
    onSplitDown,
    onToggleFocus,
    isFocusedPanel,
    requestedRendererMode,
    onResetRendererToXterm,
    onSetPanelRenderer,
    onActivatePanel,
    panelLabel,
    panelSemanticMetadata,
    suspendNativeSurface,
    nativeSurfacePolicy,
  }
) {
  const isActive = panel.id === activePanelId && activeWsId === wsId;
  const panelChromeSafeZoneMinTop = 34;
  const semanticMetadata =
    panelSemanticMetadata || derivePanelCommandMetadata(panel?.initialCommand);
  const swarmRole = semanticMetadata?.swarmRole || panel?.swarmRole || null;

  return (
    <div
      key={panel.id}
      data-testid={`panel-slot-${panel.id}`}
      className={`group relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-visible rounded-lg border ${
        isActive
          ? 'border-[rgba(var(--accent-rgb,88,166,255),0.45)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb,88,166,255),0.18)]'
          : 'border-transparent'
      }`}
      style={swarmRole ? { '--swarm-role-rgb': swarmRole.rgb } : undefined}
      onMouseDown={() => {
        if (onActivatePanel) {
          onActivatePanel(panel.id);
          return;
        }
        setActivePanelIds((prev) => ({ ...prev, [wsId]: panel.id }));
      }}
    >
      {swarmRole ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-0 z-20 w-1 rounded-r-full bg-[rgba(var(--swarm-role-rgb),0.9)] shadow-[0_0_18px_rgba(var(--swarm-role-rgb),0.36)]"
        />
      ) : null}
      <div
        data-testid={`panel-safe-zone-${panel.id}`}
        data-native-safe-zone="floating-chrome"
        data-safe-zone-min-top={String(panelChromeSafeZoneMinTop)}
        className="pointer-events-none relative min-h-9 shrink-0 overflow-visible px-2 pt-1"
        style={{ minHeight: `${panelChromeSafeZoneMinTop}px` }}
      >
        {/* Agent info bar — centered, prominent */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center justify-center px-4">
          <div
            data-testid={`panel-semantic-header-${panel.id}`}
            data-panel-metadata-source={semanticMetadata.source}
            className="flex min-w-0 items-center gap-2 text-[11px] leading-none"
            title={semanticMetadata.fullText}
          >
            {swarmRole ? (
              <span
                data-testid={`panel-role-badge-${panel.id}`}
                className="inline-flex h-5 shrink-0 items-center rounded-md border border-[rgba(var(--swarm-role-rgb),0.42)] bg-[rgba(var(--swarm-role-rgb),0.14)] px-2 text-[9px] font-black tracking-[0.08em] text-[rgb(var(--swarm-role-rgb))] shadow-[0_0_16px_rgba(var(--swarm-role-rgb),0.12)]"
              >
                {swarmRole.abbrev}
              </span>
            ) : null}
            <span
              data-testid={`panel-semantic-primary-${panel.id}`}
              className="truncate align-middle font-bold text-[rgba(241,245,249,0.95)]"
            >
              {semanticMetadata.primary}
            </span>
            {semanticMetadata.secondary ? (
              <>
                <span aria-hidden="true" className="mx-0.5 shrink-0 text-[rgba(148,163,184,0.55)]">
                  {' · '}
                </span>
                <span
                  data-testid={`panel-semantic-secondary-${panel.id}`}
                  className="max-w-[200px] truncate align-middle text-[rgba(148,163,184,0.85)]"
                >
                  {semanticMetadata.secondary}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {/* Subtle gradient overlay */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-[calc(100%-0.125rem)] rounded-t-[14px] border-b border-transparent bg-[linear-gradient(180deg,rgba(15,23,36,0.22),rgba(15,23,36,0.02))] transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-70'
          }`}
        />
        {/* Panel controls — top-right */}
        <div
          className="pointer-events-none absolute right-1.5 top-1 z-10"
          data-testid={`panel-chrome-overlay-${panel.id}`}
          data-floating-placement="inside-top-right"
          aria-label={`Panel ${panelLabel || panel.id} controls`}
        >
          <div
            className={`pointer-events-auto flex items-center gap-0.5 rounded-lg border px-0.5 py-0.5 backdrop-blur-md transition-colors ${
              isActive
                ? 'border-[rgba(var(--accent-rgb,88,166,255),0.32)] bg-[#0d1320]/92 shadow-[0_10px_24px_rgba(2,6,23,0.34)]'
                : 'border-white/10 bg-[#0d1320]/82 shadow-[0_8px_20px_rgba(2,6,23,0.24)]'
            }`}
            data-testid={`panel-header-actions-${panel.id}`}
            title={`Panel ${panelLabel || panel.id} actions`}
          >
            {SHOW_RENDERER_SWITCH ? (
              <PanelRendererSelect
                panelId={panel.id}
                currentMode={requestedRendererMode}
                availableModes={['xterm-webgl', 'xterm']}
                onChange={(mode) => onSetPanelRenderer?.(mode)}
              />
            ) : null}
            <button
              type="button"
              data-testid={`panel-split-right-${panel.id}`}
              data-size="comfortable"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
              title="Dividir a la derecha"
              aria-label="Dividir a la derecha"
              onClick={(e) => {
                e.stopPropagation();
                onSplitRight?.();
              }}
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid={`panel-split-down-${panel.id}`}
              data-size="comfortable"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
              title="Dividir hacia abajo"
              aria-label="Dividir hacia abajo"
              onClick={(e) => {
                e.stopPropagation();
                onSplitDown?.();
              }}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid={`panel-focus-${panel.id}`}
              data-size="comfortable"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
              title={isFocusedPanel ? 'Salir de focus' : 'Focus terminal'}
              aria-label={isFocusedPanel ? 'Salir de focus' : 'Focus terminal'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFocus?.();
              }}
            >
              {isFocusedPanel ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              data-testid={`panel-close-${panel.id}`}
              data-size="comfortable"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-[#ff7b72]"
              title="Cerrar terminal"
              aria-label="Cerrar terminal"
              onClick={(e) => {
                e.stopPropagation();
                onClosePanel?.();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 bg-[#0f1724] p-px"
        data-testid={`panel-body-${panel.id}`}
      >
        <div className="h-full w-full overflow-hidden rounded-[10px] bg-[var(--surface-app)]">
          <TerminalTTY
            id={panel.id}
            cwd={panel.cwd || cwd}
            swarmContext={panel.swarmContext || null}
            hideTitleBar={true}
            showQuickCopyButton={false}
            autoFocus={isActive}
            isActivePanel={Boolean(isActivePanel ?? isActive)}
            isVisibleInLayout={Boolean(isVisibleInLayout)}
            initialCommand={panel.initialCommand}
            requestedRendererMode={requestedRendererMode}
            onResetRendererToXterm={onResetRendererToXterm}
            onActivatePanel={onActivatePanel}
            suspendNativeSurface={Boolean(suspendNativeSurface)}
            nativeSurfacePolicy={nativeSurfacePolicy || 'live'}
          />
        </div>
      </div>
    </div>
  );
}

export default renderWorkspacePanel;

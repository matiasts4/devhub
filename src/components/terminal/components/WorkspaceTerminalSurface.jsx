// WorkspaceTerminalSurface — per-workspace panel grid: columns, Panel/PanelGroup/PanelResizeHandle, TerminalTTY instances.
// Extracted from TerminalWorkspacesManager.jsx.

import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { SplitSquareVertical, SplitSquareHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import TerminalTTY from '../../TerminalTTY';
import { derivePanelSemanticMetadata } from '../utils/semanticMetadata';
import PanelRendererSelect from './PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from '../terminalRendererPreferences';

function WorkspaceTerminalSurface({
  workspace,
  activeWsId,
  activePanelId,
  isVisible,
  cwd,
  focusedPanelId,
  focusedPanelByWorkspace,
  agentRunsByPanel,
  terminalRendererPreferences,
  shouldSuspendNativeSurfaces,
  nativeSurfacePolicy,
  isDraggingInternalSplit,
  setIsDraggingInternalSplit,
  // Handlers
  setActivePanelIds,
  handleClosePanel,
  handleSplit,
  togglePanelFocus,
  activateWorkspacePanel,
  handleResetPanelRendererToXterm,
  handleSetPanelRenderer,
  resolveRequestedRenderer,
  getPanelDisplayLabel,
  wsDockState,
  updateWsDockState,
}) {
  const focusedPanel = focusedPanelId
    ? workspace.columns?.flatMap((col) => col.panels || []).find((p) => p.id === focusedPanelId)
    : null;

  const isBrowserFullscreen =
    wsDockState?.maximized === true && wsDockState?.maximizedView === 'browser';

  const renderPanel = (panel, isFocused) => {
    const isActive = panel.id === activePanelId && activeWsId === workspace.id;
    const semanticMetadata = derivePanelSemanticMetadata(panel, agentRunsByPanel?.[panel.id]);
    const swarmRole = semanticMetadata?.swarmRole || panel?.swarmRole || null;

    // Verification aid for "xterm-webgl is always the one used, including on Windows + swarm".
    // When you launch a swarm, the panels created here will have swarmRole and will have
    // resolved to xterm-webgl (or the plain xterm internal fallback only if webgl probe fails at runtime).
    if (swarmRole && typeof console !== 'undefined') {
      // One-time per panel for easy confirmation in devtools while testing on Windows.
      // You should see this for every agent role terminal (director, coder, etc.).
      console.debug('[swarm-terminal-renderer]', {
        panelId: panel.id,
        role: swarmRole?.roleKey || swarmRole,
        resolvedRenderer: resolvedRendererMode,
        note: 'Should be xterm-webgl (or xterm only on webgl failure). VTE paths are disabled.',
      });
    }
    const panelChromeSafeZoneMinTop = 34;
    // Resolve the per-panel renderer once so the chrome switcher and the
    // TerminalTTY below stay in lockstep. See
    // openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-selection/spec.md
    // RS-03 / RS-04.
    const resolvedRendererMode =
      resolveRequestedRenderer?.({
        workspaceId: workspace.id,
        panelId: panel.id,
        prefs: terminalRendererPreferences,
      }) || 'xterm';

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
          if (activateWorkspacePanel) {
            activateWorkspacePanel(workspace.id, panel.id);
            return;
          }
          setActivePanelIds((prev) => ({ ...prev, [workspace.id]: panel.id }));
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
                  <span
                    aria-hidden="true"
                    className="mx-0.5 shrink-0 text-[rgba(148,163,184,0.55)]"
                  >
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
          <div
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 h-[calc(100%-0.125rem)] rounded-t-[14px] border-b border-transparent bg-[linear-gradient(180deg,rgba(15,23,36,0.22),rgba(15,23,36,0.02))] transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-70'
            }`}
          />
          <div
            className="pointer-events-none absolute right-1.5 top-1 z-10"
            data-testid={`panel-chrome-overlay-${panel.id}`}
            data-floating-placement="inside-top-right"
            aria-label={`Panel ${getPanelDisplayLabel(workspace, panel.id) || panel.id} controls`}
          >
            <div
              className={`pointer-events-auto flex items-center gap-0.5 rounded-lg border px-0.5 py-0.5 backdrop-blur-md transition-colors ${
                isActive
                  ? 'border-[rgba(var(--accent-rgb,88,166,255),0.32)] bg-[#0d1320]/92 shadow-[0_10px_24px_rgba(2,6,23,0.34)]'
                  : 'border-white/10 bg-[#0d1320]/82 shadow-[0_8px_20px_rgba(2,6,23,0.24)]'
              }`}
              data-testid={`panel-header-actions-${panel.id}`}
              title={`Panel ${getPanelDisplayLabel(workspace, panel.id) || panel.id} actions`}
            >
              {SHOW_RENDERER_SWITCH ? (
                <PanelRendererSelect
                  panelId={panel.id}
                  currentMode={resolvedRendererMode}
                  availableModes={['xterm-webgl', 'xterm']}
                  onChange={(mode) => handleSetPanelRenderer?.(workspace.id, panel.id, mode)}
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
                  handleSplit?.(panel.id, 'horizontal');
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
                  handleSplit?.(panel.id, 'vertical');
                }}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-testid={`panel-focus-${panel.id}`}
                data-size="comfortable"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
                title={isFocused ? 'Salir de focus' : 'Focus terminal'}
                aria-label={isFocused ? 'Salir de focus' : 'Focus terminal'}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePanelFocus?.(panel.id);
                }}
              >
                {isFocused ? (
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
                  handleClosePanel?.(panel.id);
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
              isActivePanel={Boolean(isActive)}
              isVisibleInLayout={Boolean(activeWsId === workspace.id && isVisible)}
              initialCommand={panel.initialCommand}
              requestedRendererMode={resolvedRendererMode}
              onResetRendererToXterm={() =>
                handleResetPanelRendererToXterm?.(workspace.id, panel.id)
              }
              onActivatePanel={(panelId) => activateWorkspacePanel?.(workspace.id, panelId)}
              suspendNativeSurface={Boolean(
                activeWsId === workspace.id && isVisible && shouldSuspendNativeSurfaces
              )}
              nativeSurfacePolicy={nativeSurfacePolicy || 'live'}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPanelContent = (panel, isFocused = false) => {
    return renderPanel(panel, isFocused);
  };

  return (
    <div
      key={workspace.id}
      data-testid={`workspace-shell-${workspace.id}`}
      className={`absolute inset-0 p-1.5 ${activeWsId === workspace.id && isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{
        zIndex: activeWsId === workspace.id ? 10 : 0,
      }}
    >
      <PanelGroup
        direction="horizontal"
        className={`w-full h-full ${isBrowserFullscreen ? 'hidden' : ''}`}
        aria-hidden={isBrowserFullscreen}
      >
        <Panel
          key={`${workspace.id}-terminal-grid`}
          minSize={18}
          className="flex flex-col bg-[#0c1018] rounded-xl overflow-hidden border border-[var(--border-subtle)]"
        >
          {/* Terminal bodies — preserve real split geometry */}
          <div className="flex-1 relative overflow-hidden min-h-0">
            {focusedPanel ? (
              <div
                className="h-full w-full"
                data-testid={`workspace-focused-panel-${focusedPanel.id}`}
              >
                {renderPanelContent(focusedPanel, true)}
              </div>
            ) : (
              <PanelGroup
                key={`workspace-columns-layout-${workspace.id}-${workspace.columns
                  .map(
                    (column) =>
                      `${column.id}:${(column.panels || []).map((panel) => panel.id).join(',')}`
                  )
                  .join('|')}`}
                direction="horizontal"
                className="h-full w-full"
                data-testid={`workspace-columns-${workspace.id}`}
                data-layout-direction="horizontal"
              >
                {workspace.columns.map((column, columnIndex) => (
                  <React.Fragment key={column.id}>
                    <Panel minSize={18} className="min-w-0 min-h-0">
                      {column.panels.length > 1 ? (
                        <PanelGroup
                          key={`workspace-column-layout-${column.id}-${(column.panels || [])
                            .map((panel) => panel.id)
                            .join(',')}`}
                          direction="vertical"
                          className="h-full w-full"
                          data-testid={`workspace-column-panels-${column.id}`}
                          data-layout-direction="vertical"
                        >
                          {column.panels.map((panel, panelIndex) => (
                            <React.Fragment key={panel.id}>
                              <Panel
                                minSize={20}
                                className="min-h-0 min-w-0"
                                data-testid={`workspace-column-${column.id}`}
                              >
                                {renderPanelContent(panel, false)}
                              </Panel>
                              {panelIndex < column.panels.length - 1 ? (
                                <PanelResizeHandle
                                  className="relative z-30 h-3 shrink-0 flex items-center justify-center bg-[#0f1724] border-t border-b border-[rgba(var(--accent-rgb,88,166,255),0.14)] hover:bg-[#142036] transition-colors"
                                  data-testid={`workspace-row-resize-handle-${column.id}-${panel.id}`}
                                  onDragging={setIsDraggingInternalSplit}
                                  onPointerDown={() => setIsDraggingInternalSplit(true)}
                                  onPointerUp={() => setIsDraggingInternalSplit(false)}
                                  onMouseDown={() => setIsDraggingInternalSplit(true)}
                                  onMouseUp={() => setIsDraggingInternalSplit(false)}
                                >
                                  <div className="h-px w-full bg-[rgba(var(--accent-rgb,88,166,255),0.78)] shadow-[0_0_10px_rgba(var(--accent-rgb,88,166,255),0.45)]" />
                                </PanelResizeHandle>
                              ) : null}
                            </React.Fragment>
                          ))}
                        </PanelGroup>
                      ) : (
                        <div
                          className="h-full w-full"
                          data-testid={`workspace-column-${column.id}`}
                        >
                          {renderPanelContent(column.panels[0], false)}
                        </div>
                      )}
                    </Panel>
                    {columnIndex < workspace.columns.length - 1 ? (
                      <PanelResizeHandle
                        className="relative z-30 w-3 shrink-0 flex items-center justify-center bg-[#0f1724] border-l border-r border-[rgba(var(--accent-rgb,88,166,255),0.14)] hover:bg-[#142036] transition-colors"
                        data-testid={`split-column-resize-handle-${workspace.id}-${column.id}`}
                        onDragging={setIsDraggingInternalSplit}
                        onPointerDown={() => setIsDraggingInternalSplit(true)}
                        onPointerUp={() => setIsDraggingInternalSplit(false)}
                        onMouseDown={() => setIsDraggingInternalSplit(true)}
                        onMouseUp={() => setIsDraggingInternalSplit(false)}
                      >
                        <div className="h-full w-px bg-[rgba(var(--accent-rgb,88,166,255),0.78)] shadow-[0_0_10px_rgba(var(--accent-rgb,88,166,255),0.45)]" />
                      </PanelResizeHandle>
                    ) : null}
                  </React.Fragment>
                ))}
              </PanelGroup>
            )}
          </div>
        </Panel>

        {/* Right dock resize handle */}
        {wsDockState?.visible && !wsDockState.maximized ? (
          <PanelResizeHandle
            key={`${workspace.id}-right-dock-resize`}
            className="relative w-3 flex items-center justify-center z-20 cursor-col-resize"
            data-testid="workspace-right-dock-resize-handle"
            onDragging={() => {}}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#2a344a]" />
            <div className="w-1 h-12 rounded-full bg-[#3a4e70] hover:bg-[var(--accent-primary)] transition-colors cursor-pointer" />
          </PanelResizeHandle>
        ) : null}
        {/* Right dock panel placeholder */}
        {wsDockState?.visible && !wsDockState.maximized ? (
          <Panel
            key={`${workspace.id}-right-dock-panel`}
            minSize={wsDockState.maximized ? 100 : 20}
            maxSize={100}
            defaultSize={wsDockState.maximized ? 100 : wsDockState.size}
            onResize={(size) => {
              if (!wsDockState.maximized) updateWsDockState({ size });
            }}
            className="pointer-events-none flex flex-col"
            data-testid="workspace-right-dock-panel"
          >
            <div
              data-testid="workspace-right-dock-placeholder"
              className="h-full w-full pointer-events-none"
            />
          </Panel>
        ) : null}
      </PanelGroup>
    </div>
  );
}

export default WorkspaceTerminalSurface;

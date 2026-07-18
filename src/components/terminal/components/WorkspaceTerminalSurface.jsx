// WorkspaceTerminalSurface — per-workspace panel grid shell extracted from TerminalWorkspacesManager.jsx.

import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Terminal, Globe, FileCode2 } from 'lucide-react';
import {
  resolveWorkspaceShellVisibilityStyle,
  resolveWorkspaceWindowVisibilityStyle,
} from '../workspaceAnimProps';
import { getTerminalGridShellStyle } from '../terminalChromeStyles';
import {
  resolveActiveWorkspaceWindowId,
  resolvePanelVisibleInLayout,
  resolveWorkspaceWindowsForRender,
} from '@/lib/terminal/workspaceWindowRender';
import { getPanelIdsFromColumns } from '@/components/terminal/models/workspaceStateModel';
import { MIN_RIGHT_DOCK_SIZE } from '../../workspace/rightDockState';
import { resolveVisibleTerminalPanelCountForRenderer } from '../terminalRendererCapabilities';

function columnContainsFocusedPanel(column, focusedPanelId) {
  if (!focusedPanelId) return true;
  return (column?.panels || []).some((panel) => panel.id === focusedPanelId);
}

function resolveFocusPanelSlotClassName({ focusedPanelId, panelId }) {
  if (!focusedPanelId) return 'h-full w-full min-h-0 min-w-0';
  if (focusedPanelId === panelId) {
    return 'absolute inset-0 z-20 h-full w-full min-h-0 min-w-0';
  }
  return 'hidden';
}

/** Split between stacked terminals only — minimal thickness, elongated grip (not dock splits). */
function TerminalRowSplitHandle({ testId, onDragging }) {
  return (
    <PanelResizeHandle
      className="relative z-30 h-[3px] shrink-0 flex items-center justify-center cursor-row-resize group"
      data-testid={testId}
      onDragging={onDragging}
    >
      <div
        className="h-px w-[min(100%,18rem)] rounded-full bg-[#3a4e70]/85 group-hover:bg-[var(--accent-primary)] transition-colors"
        aria-hidden
      />
    </PanelResizeHandle>
  );
}

function TerminalColSplitHandle({ testId, onDragging }) {
  return (
    <PanelResizeHandle
      className="relative z-30 w-[3px] shrink-0 flex items-center justify-center cursor-col-resize group"
      data-testid={testId}
      onDragging={onDragging}
    >
      <div
        className="w-px h-[min(100%,18rem)] rounded-full bg-[#3a4e70]/85 group-hover:bg-[var(--accent-primary)] transition-colors"
        aria-hidden
      />
    </PanelResizeHandle>
  );
}

function WorkspaceTerminalSurface({
  ws,
  workspaceGridKey,
  activeWsId,
  isVisible,
  isFullscreenBrowser,
  hideRightDockPanel,
  wsDockState,
  workspaceWindows,
  activeWindowIds,
  focusedPanelId,
  totalPanelCount,
  totalTerminalPanelCount,
  isWorkspaceVisibleInLayout,
  panelSubtabsBarRef,
  rightDockPlaceholderRef,
  renderWorkspaceWindowBar,
  renderWorkspacePanelSlot,
  resolvePanelVisibleInLayout: resolvePanelVisibleInLayoutProp,
  handleSplit,
  splitWithKind,
  handlePanelGroupLayout,
  handleInternalSplitDragging,
  handleDockDragging,
  handleRightDockPanelResize,
}) {
  return (
    <div
      key={workspaceGridKey}
      data-testid={`workspace-shell-${ws.id}`}
      data-ws-active={!isFullscreenBrowser && activeWsId === ws.id && isVisible ? 'true' : 'false'}
      aria-hidden={activeWsId !== ws.id || !isVisible}
      className="absolute inset-0 p-0"
      style={{
        zIndex: activeWsId === ws.id ? 10 : 0,
        ...resolveWorkspaceShellVisibilityStyle({
          isActiveWorkspace: activeWsId === ws.id,
          isManagerVisible: isVisible,
          isFullscreenTakeover: isFullscreenBrowser,
        }),
      }}
    >
      <PanelGroup
        direction="horizontal"
        className={`w-full h-full ${isFullscreenBrowser ? 'hidden' : ''}`}
        aria-hidden={isFullscreenBrowser}
      >
        <Panel
          key={`${ws.id}-terminal-grid`}
          minSize={18}
          className="flex flex-col bg-[var(--surface-app)] rounded-none overflow-hidden"
          style={getTerminalGridShellStyle()}
        >
          {renderWorkspaceWindowBar(ws, wsDockState)}

          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-focus-mode={focusedPanelId ? 'true' : undefined}
          >
            {(totalPanelCount ?? totalTerminalPanelCount) === 0 ? (
              <div
                data-testid="workspace-empty-terminal-state"
                className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center"
              >
                <div className="flex flex-col items-center gap-2 max-w-sm">
                  <Terminal className="w-8 h-8 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Este workspace no tiene espacios activos.
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Añadí un terminal, browser o files para empezar.
                  </p>
                </div>
                <div
                  className="flex flex-wrap items-center justify-center gap-2"
                  data-testid="workspace-starter-chips"
                >
                  <button
                    type="button"
                    data-testid="workspace-add-terminal"
                    onClick={() =>
                      splitWithKind ? splitWithKind('terminal') : handleSplit('horizontal')
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] px-3 py-2 text-sm font-medium text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-rgb,88,166,255),0.18)]"
                  >
                    <Terminal className="w-4 h-4" />
                    Terminal
                  </button>
                  <button
                    type="button"
                    data-testid="workspace-add-browser"
                    onClick={() => splitWithKind?.('browser')}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  >
                    <Globe className="w-4 h-4" />
                    Browser
                  </button>
                  <button
                    type="button"
                    data-testid="workspace-add-files"
                    onClick={() => splitWithKind?.('files')}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  >
                    <FileCode2 className="w-4 h-4" />
                    Files
                  </button>
                </div>
              </div>
            ) : (
              resolveWorkspaceWindowsForRender(ws, workspaceWindows).map((window) => {
                const activeWindowIdForWs = resolveActiveWorkspaceWindowId(
                  ws.id,
                  workspaceWindows,
                  activeWindowIds
                );
                const isActiveWindow = window.id === activeWindowIdForWs;
                const windowColumns = window.columns?.length > 0 ? window.columns : ws.columns;
                const activeWindowPanelIds = getPanelIdsFromColumns(windowColumns);
                const windowPanelCount = activeWindowPanelIds.length;
                const windowTerminalPanelCount = (windowColumns || []).reduce(
                  (sum, col) =>
                    sum +
                    (col?.panels || []).filter((panel) => {
                      const kind = panel?.kind || 'terminal';
                      return kind === 'terminal';
                    }).length,
                  0
                );
                const windowVisibleTerminalPanelCount = resolveVisibleTerminalPanelCountForRenderer(
                  {
                    focusedPanelId,
                    totalTerminalPanelCount: windowTerminalPanelCount,
                    totalPanelCount: windowPanelCount,
                  }
                );
                const resolveWindowPanelVisibleInLayout = (panelId) =>
                  isActiveWindow &&
                  (resolvePanelVisibleInLayoutProp || resolvePanelVisibleInLayout)({
                    isWorkspaceVisibleInLayout,
                    focusedPanelId,
                    panelId,
                    activeWindowPanelIds,
                  });

                return (
                  <div
                    key={`${ws.id}-view-${window.id}`}
                    className={`absolute inset-0 min-h-0 min-w-0 ${isActiveWindow && isVisible ? '' : 'pointer-events-none'}`}
                    aria-hidden={!isActiveWindow || !isVisible}
                    data-testid={
                      isActiveWindow
                        ? `workspace-window-active-${window.id}`
                        : `workspace-window-parked-${window.id}`
                    }
                    style={{
                      zIndex: isActiveWindow ? 2 : 1,
                      ...resolveWorkspaceWindowVisibilityStyle({
                        isActiveWindow,
                        isFullscreenTakeover: isFullscreenBrowser,
                        isManagerVisible: isVisible,
                      }),
                    }}
                  >
                    <PanelGroup
                      direction="horizontal"
                      className="h-full w-full"
                      data-testid={`workspace-columns-${ws.id}`}
                      data-workspace-window-id={window.id}
                      data-layout-direction="horizontal"
                      onLayout={isActiveWindow ? handlePanelGroupLayout : undefined}
                    >
                      {windowColumns.map((column, columnIndex) => {
                        const columnHiddenInFocus =
                          Boolean(focusedPanelId) &&
                          !columnContainsFocusedPanel(column, focusedPanelId);
                        return (
                          <React.Fragment key={`${window.id}-${column.id}`}>
                            <Panel
                              minSize={focusedPanelId ? 0 : 18}
                              className={`min-h-0 min-w-0 ${columnHiddenInFocus ? 'hidden' : ''}`}
                            >
                              {column.panels.length > 1 ? (
                                <PanelGroup
                                  direction="vertical"
                                  className="h-full w-full"
                                  data-testid={`workspace-column-panels-${column.id}`}
                                  data-layout-direction="vertical"
                                  onLayout={isActiveWindow ? handlePanelGroupLayout : undefined}
                                >
                                  {column.panels.map((panel, panelIndex) => (
                                    <React.Fragment key={panel.id}>
                                      <Panel
                                        minSize={focusedPanelId ? 0 : 20}
                                        className={`min-h-0 min-w-0 overflow-visible ${focusedPanelId && focusedPanelId !== panel.id ? 'hidden' : ''}`}
                                        data-testid={`workspace-column-${column.id}`}
                                      >
                                        <div
                                          className={resolveFocusPanelSlotClassName({
                                            focusedPanelId,
                                            panelId: panel.id,
                                          })}
                                        >
                                          {renderWorkspacePanelSlot(panel, {
                                            isVisibleInLayout: resolveWindowPanelVisibleInLayout(
                                              panel.id
                                            ),
                                            isWorkspaceShellVisible: isWorkspaceVisibleInLayout,
                                            visibleTerminalPanelCount:
                                              windowVisibleTerminalPanelCount,
                                          })}
                                        </div>
                                      </Panel>
                                      {isActiveWindow &&
                                      !focusedPanelId &&
                                      panelIndex < column.panels.length - 1 ? (
                                        <TerminalRowSplitHandle
                                          testId={`workspace-row-resize-handle-${column.id}-${panel.id}`}
                                          onDragging={handleInternalSplitDragging}
                                        />
                                      ) : null}
                                    </React.Fragment>
                                  ))}
                                </PanelGroup>
                              ) : (
                                <div
                                  className="h-full w-full overflow-visible"
                                  data-testid={`workspace-column-${column.id}`}
                                >
                                  <div
                                    className={resolveFocusPanelSlotClassName({
                                      focusedPanelId,
                                      panelId: column.panels[0].id,
                                    })}
                                  >
                                    {renderWorkspacePanelSlot(column.panels[0], {
                                      isVisibleInLayout: resolveWindowPanelVisibleInLayout(
                                        column.panels[0].id
                                      ),
                                      isWorkspaceShellVisible: isWorkspaceVisibleInLayout,
                                      visibleTerminalPanelCount: windowVisibleTerminalPanelCount,
                                    })}
                                  </div>
                                </div>
                              )}
                            </Panel>
                            {isActiveWindow &&
                            !focusedPanelId &&
                            columnIndex < windowColumns.length - 1 ? (
                              <TerminalColSplitHandle
                                testId={`split-column-resize-handle-${ws.id}-${column.id}`}
                                onDragging={handleInternalSplitDragging}
                              />
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </PanelGroup>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {wsDockState.visible && !wsDockState.maximized ? (
          <PanelResizeHandle
            key={`${ws.id}-right-dock-resize`}
            className="relative w-3 flex items-center justify-center z-20 cursor-col-resize"
            data-testid="workspace-right-dock-resize-handle"
            onDragging={handleDockDragging}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#2a344a]" />
            <div className="w-1 h-12 rounded-full bg-[#3a4e70] hover:bg-[var(--accent-primary)] transition-colors cursor-pointer" />
          </PanelResizeHandle>
        ) : null}
        {wsDockState.visible && !wsDockState.maximized && !hideRightDockPanel ? (
          <Panel
            key={`${ws.id}-right-dock-panel`}
            minSize={wsDockState.maximized ? 100 : MIN_RIGHT_DOCK_SIZE}
            maxSize={100}
            defaultSize={wsDockState.maximized ? 100 : wsDockState.size}
            onResize={(size) => {
              handleRightDockPanelResize(size, { maximized: wsDockState.maximized });
            }}
            className="pointer-events-none flex flex-col"
            data-testid="workspace-right-dock-panel"
          >
            <div
              ref={activeWsId === ws.id ? rightDockPlaceholderRef : undefined}
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

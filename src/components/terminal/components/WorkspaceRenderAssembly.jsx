// WorkspaceRenderAssembly — main workspace shell JSX extracted from TerminalWorkspacesManager.jsx (Slice 8).

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  X,
  Minus,
  LayoutGrid,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Folder,
  Bot,
  History,
  RefreshCw,
  Clock3,
  Grip,
  Globe,
  FileCode2,
  Wand2,
  Terminal,
  Settings,
} from 'lucide-react';
import { getWorkspaceAnimProps, resolveRightDockTakeoverChromeStyle } from '../workspaceAnimProps';
import { getWorkspaceShellChromeStyle, getWorkspaceTopBarStyle } from '../terminalChromeStyles';
import {
  buildStableWorkspaceShellKey,
  getPanelIdsFromColumns,
  resolveWorkspaceAllWindowsTerminalPanelCount,
} from '../models/workspaceStateModel';
import {
  inferSwarmRoleKey,
  derivePanelSemanticMetadata,
  shortPath,
} from '../models/swarmRoleModel';
import { countPanelsInColumns } from '@/lib/terminal/workspaceSurfaceReconcile';
import {
  resolveActiveWorkspaceWindowId,
  resolvePanelVisibleInLayout,
} from '@/lib/terminal/workspaceWindowRender';
import { resolveRequestedRenderer } from '../terminalRendererPreferences';
import { dispatchZedOverlayToggle } from '@/lib/asistente/zedOverlayEvents';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NotificationCenter from '../../NotificationCenter';
import TerminalSettingsModal from '../../TerminalSettingsModal';
import TerminalRestoreSettingsModal from '../../TerminalRestoreSettingsModal';
import WorkspaceTerminalSetupModal from '../../WorkspaceTerminalSetupModal';
import ZedAmbientOverlay from '../../asistente/ZedAmbientOverlay';
import WorkspaceRightDock from '../../workspace/WorkspaceRightDock';
import WorkspaceWindowSwitcher from './WorkspaceWindowSwitcher';
import WorkspaceWindowTabBar from './WorkspaceWindowTabBar';
import WorkspaceTerminalSurface from './WorkspaceTerminalSurface';
import { renderWorkspacePanel } from './renderWorkspacePanel';
import SwarmLaunchWizardModal from '../../control-room/SwarmLaunchWizardModal';
import { DEFAULT_RIGHT_DOCK_STATE } from '../../workspace/rightDockState';
import { applyWorkspaceWindowSelectDockState } from '../../workspace/rightDockLayout';
import { getTauriMainWindow } from '@/lib/tauri/mainWindow';

export default function WorkspaceRenderAssembly(props) {
  const {
    managerRootRef,
    shortcutHint,
    isMaximized,
    workspaces,
    activeWsId,
    draggedWsId,
    dragOverWsId,
    browserWindowStates,
    switchWorkspace,
    handleWorkspaceTabPointerDown,
    handleWorkspaceTabPointerMove,
    endWorkspaceTabDrag,
    addWorkspace,
    removeWorkspace,
    closeWorkspaceBrowserWindow,
    getWorkspaceDisplayLabel,
    getAllPanelIds,
    workspaceWindows,
    activeWindowIds,
    pizarraPendingViewId,
    setPizarraPendingViewId,
    pizarraOwnsLiveSurfaces,
    effectiveRightDockState,
    isVisible,
    switchWindowInWorkspace,
    addWindowToWorkspace,
    activeWorkspace,
    handleSplit,
    setIsGridLauncherOpen,
    handleApplyGrid,
    gridCommand,
    setGridCommand,
    rightDockState,
    handleRightDockTabSelect,
    activeBrowserWindowState,
    openTerminalSwarmLauncher,
    activeSwarmLaunchSummary,
    projectId,
    setRestoreSettingsModal,
    resumableStatus,
    resumableSessions,
    resumableError,
    isLoadingResumableSessions,
    refreshResumableSessions,
    reopenActionError,
    setReopenActionError,
    reopenOpenCodeSession,
    workspaceGridAreaRef,
    heavySurfacesReady,
    rightDockMeasuredBounds,
    isFullscreenBrowser,
    hideRightDockPanel,
    updateRightDockState,
    focusedPanelByWorkspace,
    shouldSuspendNativeSurfaces,
    activePanelId,
    editingPanelId,
    editingValue,
    renameError,
    startPanelRename,
    updateEditingValue,
    commitPanelRename,
    cancelPanelRename,
    cwd,
    setActivePanelIds,
    handleClosePanel,
    togglePanelFocus,
    panelNavPulseId,
    activateWorkspacePanel,
    agentRunsByPanel,
    nativeSurfacePolicy,
    terminalRendererPreferences,
    handleResetPanelRendererToXterm,
    handleSetPanelRenderer,
    getPanelConnectionState,
    coldMountOrdinalByPanelId,
    swarmInboxPendingByRole,
    swarmDelegatedRoleKeys,
    handleTerminalConnectionStateChange,
    panelSubtabsBarRef,
    rightDockPlaceholderRef,
    getPanelDisplayLabel,
    handlePanelGroupLayout,
    handleInternalSplitDragging,
    handleDockDragging,
    handleRightDockPanelResize,
    hasMountedRightDock,
    rightDockLayerRef,
    rightDockAnimProps,
    dockLayerVisible,
    rightDockLayerChromeStyle,
    isDraggingDock,
    updateBrowserWindowState,
    removeWindowFromWorkspace,
    operatorCards,
    confirmCard,
    cancelCard,
    swarmLaunchWizardOpen,
    swarmLaunchCatalog,
    swarmLaunchPreview,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardOpen,
    setSwarmLaunchWizardStep,
    updateSwarmLaunchDraft,
    handleTerminalSwarmLaunch,
    swarmLaunchSubmitState,
    setSwarmLaunchSubmitState,
    terminalSettingsModal,
    setTerminalSettingsModal,
    restoreSettingsModal,
    workspaceTerminalSetupOpen,
    setWorkspaceTerminalSetupOpen,
    createWorkspaceWithTerminalCount,
    getActiveWorkspaceTerminalPanelCount,
    getWorkspaceTerminals,
    getWorkspaceWindows,
    showWorkspacePathChip,
  } = props;

  const getTauriWindow = useCallback(async () => getTauriMainWindow(), []);

  const [isWinMaximized, setIsWinMaximized] = useState(false);

  useEffect(() => {
    let unlisten;
    (async () => {
      const win = await getTauriWindow();
      if (!win) return;
      const current = await win.isMaximized().catch(() => false);
      setIsWinMaximized(current);
      unlisten = await win
        .onResized(async () => {
          const max = await win.isMaximized().catch(() => false);
          setIsWinMaximized(max);
        })
        .catch(() => null);
    })();
    return () => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    };
  }, [getTauriWindow]);

  const handleWinMinimize = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.minimize().catch(() => {});
  }, [getTauriWindow]);

  const handleWinToggleMaximize = useCallback(async () => {
    const win = await getTauriWindow();
    if (!win) return;
    const current = await win.isMaximized().catch(() => false);
    if (current) {
      await win.unmaximize().catch(() => {});
    } else {
      await win.maximize().catch(() => {});
    }
  }, [getTauriWindow]);

  const handleWinClose = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.close().catch(() => {});
  }, [getTauriWindow]);

  const renderWorkspaceWindowBar = useCallback(
    (ws, wsDockState, updateWsDockState) => {
      const viewTabs = workspaceWindows[ws.id] || [];
      const splitRightLabel = 'Dividir a la derecha';
      const splitDownLabel = 'Dividir hacia abajo';
      const isFullscreenMode = wsDockState.maximized === true;
      const isBrowserFullscreen = isFullscreenMode && wsDockState.maximizedView === 'browser';
      const isSwarmFullscreen = isFullscreenMode && wsDockState.maximizedView === 'swarm';
      const activeWindowId = activeWindowIds[ws.id] || viewTabs[0]?.id;
      const terminalPanelCount = countPanelsInColumns(ws.columns);

      return (
        <div
          ref={activeWsId === ws.id ? panelSubtabsBarRef : null}
          data-testid="panel-subtabs-bar"
          aria-hidden="true"
          className="hidden h-10 items-center justify-between px-2.5 shrink-0 border-b border-[rgba(var(--accent-rgb,88,166,255),0.22)] bg-[var(--surface-card)] select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden pr-2">
            {viewTabs.map((view, idx) => {
              const isActive =
                !isBrowserFullscreen && !isSwarmFullscreen && view.id === activeWindowId;
              return (
                <button
                  key={view.id}
                  data-testid={`panel-tab-p${idx + 1}`}
                  onClick={() => {
                    switchWindowInWorkspace(ws.id, view.id);
                    if (isFullscreenMode) {
                      updateWsDockState((current) => applyWorkspaceWindowSelectDockState(current));
                    }
                  }}
                  className={`group h-6 shrink-0 px-2.5 rounded-sm text-[11px] font-mono font-semibold border flex items-center gap-1.5 transition-colors ${
                    isActive
                      ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] border-[rgba(var(--accent-rgb,88,166,255),0.35)]'
                      : 'text-[var(--text-muted)] bg-transparent border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]'
                  }`}
                  title={`Vista V${idx + 1}`}
                >
                  V{idx + 1}
                  {viewTabs.length > 1 ? (
                    <span
                      role="button"
                      aria-label={`Cerrar V${idx + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWindowFromWorkspace(ws.id, view.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-4 h-4 rounded-md hover:bg-white/15 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
            {isFullscreenMode ? (
              <>
                <button
                  type="button"
                  data-testid="panel-tab-browser"
                  onClick={() => {
                    updateWsDockState((current) => ({
                      visible: true,
                      activeTab: 'browser',
                      maximized: true,
                      maximizedView: 'browser',
                      browserLayoutEpoch: (Number(current.browserLayoutEpoch) || 0) + 1,
                    }));
                  }}
                  className={`h-6 shrink-0 px-2.5 rounded-sm text-[11px] font-mono font-semibold border flex items-center gap-1.5 transition-colors ${
                    isBrowserFullscreen
                      ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] border-[rgba(var(--accent-rgb,88,166,255),0.35)]'
                      : 'text-[var(--text-muted)] bg-transparent border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Vista Browser"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Browser
                </button>
                <button
                  type="button"
                  data-testid="panel-tab-swarm"
                  onClick={() => {
                    updateWsDockState({
                      visible: true,
                      activeTab: 'swarm',
                      maximized: true,
                      maximizedView: 'swarm',
                    });
                  }}
                  className={`h-6 shrink-0 px-2.5 rounded-sm text-[11px] font-mono font-semibold border flex items-center gap-1.5 transition-colors ${
                    isSwarmFullscreen
                      ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] border-[rgba(var(--accent-rgb,88,166,255),0.35)]'
                      : 'text-[var(--text-muted)] bg-transparent border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Vista Swarm"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Swarm
                </button>
              </>
            ) : null}
            <button
              data-testid="panel-subtabs-add"
              onClick={() => addWindowToWorkspace(ws.id)}
              className="h-6 w-6 shrink-0 flex items-center justify-center rounded-sm transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)]"
              title="Nueva vista"
              aria-label="Agregar vista"
            >
              <Plus className="w-4 h-4" />
            </button>
            {terminalPanelCount === 0 ? (
              <button
                type="button"
                data-testid="panel-subtabs-add-terminal"
                onClick={() => handleSplit('horizontal')}
                className="h-6 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-sm text-[11px] font-mono font-semibold border transition-colors text-[var(--accent-primary)] border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.18)]"
                title="Nueva terminal"
                aria-label="Nueva terminal"
              >
                <Terminal className="w-3.5 h-3.5" />
                Terminal
              </button>
            ) : null}
            {!isFullscreenMode ? (
              <>
                <button
                  type="button"
                  data-testid="panel-subtabs-split-right"
                  onClick={() => handleSplit('horizontal', activePanelId)}
                  className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-colors border text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06]"
                  title={splitRightLabel}
                  aria-label={splitRightLabel}
                >
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="panel-subtabs-split-down"
                  onClick={() => handleSplit('vertical', activePanelId)}
                  className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-colors border text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06]"
                  title={splitDownLabel}
                  aria-label={splitDownLabel}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 min-w-0 items-center justify-end gap-2 overflow-hidden">
            {cwd && showWorkspacePathChip ? (
              <span
                data-testid="panel-subtabs-cwd-chip"
                className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono border"
                style={{
                  color: 'var(--accent-primary)',
                  borderColor: 'rgba(var(--accent-rgb,88,166,255),0.35)',
                  background: 'rgba(var(--accent-rgb,88,166,255),0.08)',
                  maxWidth: '220px',
                }}
                title={cwd}
              >
                <Folder className="w-3 h-3" />
                <span className="truncate">{shortPath(cwd)}</span>
              </span>
            ) : null}
          </div>
        </div>
      );
    },
    [
      workspaceWindows,
      activeWindowIds,
      activeWsId,
      cwd,
      showWorkspacePathChip,
      switchWindowInWorkspace,
      removeWindowFromWorkspace,
      addWindowToWorkspace,
      handleSplit,
      activePanelId,
    ]
  );

  return (
    <motion.div
      ref={managerRootRef}
      className="relative flex flex-col h-full w-full bg-[var(--surface-app)] overflow-hidden"
      style={getWorkspaceShellChromeStyle()}
      {...getWorkspaceAnimProps(isMaximized)}
    >
      {shortcutHint ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="terminal-shortcut-hint"
          className="pointer-events-none absolute bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(13,17,23,0.94)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg"
        >
          {shortcutHint}
        </div>
      ) : null}
      <div
        key="workspace-top-tab-bar"
        data-testid="workspace-top-tab-bar"
        className="relative z-[120] flex items-center min-h-[42px] bg-[var(--surface-app)] select-none shrink-0 px-2 gap-1.5 devhub-titlebar-no-drag"
        style={{
          ...getWorkspaceShellChromeStyle(),
          ...getWorkspaceTopBarStyle(),
          WebkitAppRegion: 'no-drag',
          appRegion: 'no-drag',
        }}
      >
        <div
          className="flex min-w-0 items-center overflow-hidden devhub-titlebar-no-drag"
          style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' }}
          data-testid="workspace-top-tab-bar-controls"
        >
          <WorkspaceWindowTabBar
            workspaces={workspaces}
            activeWsId={activeWsId}
            draggedWsId={draggedWsId}
            dragOverWsId={dragOverWsId}
            browserWindowStates={browserWindowStates}
            switchWorkspace={switchWorkspace}
            handleWorkspaceTabPointerDown={handleWorkspaceTabPointerDown}
            handleWorkspaceTabPointerMove={handleWorkspaceTabPointerMove}
            endWorkspaceTabDrag={endWorkspaceTabDrag}
            addWorkspace={addWorkspace}
            removeWorkspace={removeWorkspace}
            closeWorkspaceBrowserWindow={closeWorkspaceBrowserWindow}
            getWorkspaceDisplayLabel={getWorkspaceDisplayLabel}
            getAllPanelIds={getAllPanelIds}
          />
        </div>

        <div
          className="flex-1 self-stretch min-w-[12px] min-h-[34px] cursor-default"
          data-testid="workspace-window-drag-strip"
          data-tauri-drag-region
          onDoubleClick={handleWinToggleMaximize}
          style={{ WebkitAppRegion: 'drag', appRegion: 'drag' }}
          aria-label="Arrastrar ventana"
          title="Arrastrar ventana (doble click maximiza)"
        />

        <div
          className="flex items-center gap-1.5 shrink-0 devhub-titlebar-no-drag"
          style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' }}
          data-testid="workspace-top-tab-bar-actions"
        >
          <WorkspaceWindowSwitcher
            variant="header"
            views={workspaceWindows[activeWsId] || []}
            activeViewId={
              pizarraPendingViewId ||
              activeWindowIds[activeWsId] ||
              workspaceWindows[activeWsId]?.[0]?.id
            }
            visible={isVisible}
            onSelectView={(windowId) => {
              const pizarraUiActive =
                pizarraOwnsLiveSurfaces ||
                (effectiveRightDockState.visible &&
                  effectiveRightDockState.activeTab === 'pizarra');
              if (pizarraUiActive) {
                setPizarraPendingViewId(windowId);
                window.dispatchEvent(
                  new CustomEvent('devhub:pizarra-select-view', {
                    detail: { windowId, workspaceId: activeWsId },
                  })
                );
                return;
              }
              switchWindowInWorkspace(activeWsId, windowId);
            }}
            onAddView={() => addWindowToWorkspace(activeWsId)}
          />

          {countPanelsInColumns(activeWorkspace?.columns || []) === 0 ? (
            <button
              type="button"
              data-testid="header-add-terminal"
              onClick={() => handleSplit('horizontal')}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] px-2.5 text-[11px] font-mono font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-rgb,88,166,255),0.18)]"
              title="Nueva terminal"
              aria-label="Nueva terminal"
            >
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </button>
          ) : null}

          <div className="w-px h-5 bg-white/10 shrink-0" aria-hidden />

          {/* Action Buttons: Grid, Browser, Editor, Swarm, Notifications, Dock Toggle */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Grid Launcher */}
            <DropdownMenu onOpenChange={setIsGridLauncherOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="workspace-grid-launcher-trigger"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all cursor-pointer select-none"
                  title="Lanzar Cuadrícula"
                >
                  <Grip className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[280px] bg-[#0d1320] border-[#273146] text-gray-100 p-2 z-50"
                data-testid="workspace-grid-launcher-content"
              >
                <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-400">
                  Grillas Predefinidas
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: '2 Paneles', cols: 2, rows: 1 },
                    { label: '4 Paneles', cols: 2, rows: 2 },
                    { label: '6 Paneles', cols: 3, rows: 2 },
                  ].map((layout) => (
                    <button
                      key={layout.label}
                      onClick={() => handleApplyGrid(layout.cols, layout.rows)}
                      className="flex flex-col items-center justify-center p-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
                    >
                      <LayoutGrid className="w-6 h-6 mb-1 text-gray-400" />
                      <span className="text-[10px] font-semibold">{layout.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 px-1 mb-1">
                  <label className="text-[10px] uppercase text-gray-400 font-semibold mb-1 block">
                    Comando Inicial
                  </label>
                  <input
                    type="text"
                    value={gridCommand}
                    onChange={(e) => setGridCommand(e.target.value)}
                    placeholder="ej. opencode"
                    className="w-full bg-[#111826] border border-[#273146] rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              data-testid="right-dock-tab-browser"
              data-pizarra-active-tab={
                rightDockState.activeTab === 'browser' && rightDockState.visible ? 'true' : 'false'
              }
              onClick={() => handleRightDockTabSelect('browser')}
              className={`relative inline-flex items-center justify-center h-7 w-7 rounded-sm transition-all ${
                rightDockState.activeTab === 'browser' && rightDockState.visible
                  ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] outline outline-1 -outline-offset-1 outline-inset outline-[var(--accent-primary)]'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05]'
              }`}
              title="Browser (Ctrl+Shift+B)"
            >
              <Globe className="w-4 h-4" />
              {activeBrowserWindowState?.open ? (
                <span
                  className="absolute -bottom-px -right-px h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-[#0d1320] shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  data-testid="right-dock-tab-browser-indicator"
                  title="Ventana browser activa en segundo plano"
                />
              ) : null}
            </button>
            <button
              type="button"
              data-testid="right-dock-tab-editor"
              data-pizarra-active-tab={
                rightDockState.activeTab === 'editor' && rightDockState.visible ? 'true' : 'false'
              }
              onClick={() => handleRightDockTabSelect('editor')}
              className={`inline-flex items-center justify-center h-7 w-7 rounded-sm transition-all ${
                rightDockState.activeTab === 'editor' && rightDockState.visible
                  ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] outline outline-1 -outline-offset-1 outline-inset outline-[var(--accent-primary)]'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05]'
              }`}
              title="Editor / archivos (Ctrl+Shift+E)"
            >
              <FileCode2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="right-dock-tab-swarm"
              data-pizarra-active-tab={
                rightDockState.activeTab === 'swarm' && rightDockState.visible ? 'true' : 'false'
              }
              onClick={() => handleRightDockTabSelect('swarm')}
              className={`inline-flex items-center justify-center h-7 w-7 rounded-sm transition-all ${
                rightDockState.activeTab === 'swarm' && rightDockState.visible
                  ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] outline outline-1 -outline-offset-1 outline-inset outline-[var(--accent-primary)]'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05]'
              }`}
              title="Show swarm topology"
            >
              <Bot className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="right-dock-tab-zed"
              onClick={() => dispatchZedOverlayToggle()}
              className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-gray-500 transition-all hover:text-gray-200 hover:bg-white/[0.05]"
              title="Zed asistente (Ctrl+Shift+Z)"
            >
              <span className="text-xs font-bold" style={{ color: 'inherit' }}>
                Z
              </span>
            </button>
            <label
              className="relative inline-flex items-center cursor-pointer select-none"
              title="Pizarra canvas"
            >
              <input
                type="checkbox"
                data-testid="pizarra-mode-switch"
                checked={rightDockState.maximized && rightDockState.maximizedView === 'pizarra'}
                onChange={() => handleRightDockTabSelect('pizarra')}
                className="sr-only"
              />
              <div
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                  rightDockState.maximized && rightDockState.maximizedView === 'pizarra'
                    ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.5)]'
                    : 'bg-[rgba(255,255,255,0.15)]'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full shadow-md transition-transform duration-200 ${
                    rightDockState.maximized && rightDockState.maximizedView === 'pizarra'
                      ? 'translate-x-4 bg-[var(--accent-primary)]'
                      : 'translate-x-0.5 bg-gray-400'
                  }`}
                  style={{ transition: 'transform 200ms ease' }}
                />
              </div>
              <LayoutGrid
                className={`ml-2 w-4 h-4 ${
                  rightDockState.maximized && rightDockState.maximizedView === 'pizarra'
                    ? 'text-[var(--accent-primary)]'
                    : 'text-gray-500'
                }`}
              />
            </label>
            <button
              type="button"
              onClick={openTerminalSwarmLauncher}
              className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-orange-300/80 transition-all hover:text-orange-200 hover:bg-orange-400/10"
              title="Lanzar swarm desde terminales"
              aria-label="Lanzar swarm desde terminales"
              data-testid="workspace-swarm-launch-button"
            >
              <Wand2 className="h-4 w-4" />
            </button>
            {activeSwarmLaunchSummary?.launchId ? (
              <span
                className="max-w-[220px] truncate text-[10px] text-[var(--text-muted)]"
                data-testid="workspace-swarm-active-summary"
                title={`${activeSwarmLaunchSummary.title} · ${activeSwarmLaunchSummary.count} paneles · cerrá el workspace para finalizar`}
              >
                {activeSwarmLaunchSummary.title} · {activeSwarmLaunchSummary.count}
              </span>
            ) : null}

            <div className="w-px h-5 bg-white/10 mx-1" />

            <NotificationCenter projectId={projectId} variant="topbar" />

            <button
              type="button"
              onClick={() => setRestoreSettingsModal({ open: true })}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all cursor-pointer select-none"
              title="Configuración de restauración de terminales"
              aria-label="Configuración de restauración de terminales"
              data-testid="terminal-restore-settings-btn"
            >
              <Settings className="w-4 h-4" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all cursor-pointer select-none"
                  title="Reopen sessions"
                  aria-label="Reopen sessions"
                >
                  <History className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[380px] max-h-[420px] overflow-y-auto bg-[#0d1320] border-[#273146] text-gray-100">
                <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-gray-400">
                  <span>Agent Sessions</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      refreshResumableSessions();
                    }}
                    className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-white"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isLoadingResumableSessions ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />

                {isLoadingResumableSessions && (
                  <div className="px-2 py-3 text-xs text-gray-400 flex items-center gap-2">
                    <Clock3 className="w-3.5 h-3.5 animate-pulse" />
                    Loading recent sessions...
                  </div>
                )}

                {!isLoadingResumableSessions && resumableStatus === 'error' && resumableError && (
                  <div className="px-2 py-3 text-xs text-red-300 flex items-center justify-between gap-3">
                    <span>{resumableError.message}</span>
                    {resumableError.retryable !== false ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          refreshResumableSessions();
                        }}
                        className="inline-flex items-center gap-1 text-xs text-red-200 hover:text-white"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    ) : null}
                  </div>
                )}

                {reopenActionError && (
                  <div className="px-2 py-3 text-xs text-red-300">{reopenActionError}</div>
                )}

                {!isLoadingResumableSessions &&
                  resumableStatus !== 'error' &&
                  resumableSessions.length === 0 && (
                    <div className="px-2 py-3 text-xs text-gray-400">No recent sessions found.</div>
                  )}

                {!isLoadingResumableSessions &&
                  resumableSessions.map((session) => (
                    <DropdownMenuItem
                      key={session.sessionId}
                      className="flex flex-col items-start gap-1 px-2 py-2 cursor-pointer"
                      onSelect={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          await reopenOpenCodeSession(session);
                        } catch (err) {
                          setReopenActionError(String(err?.message || err || 'Reopen failed'));
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-xs font-medium text-gray-200 truncate">
                          {session.title || session.sessionId}
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto">
                          {session.lastActiveAt
                            ? new Date(session.lastActiveAt).toLocaleTimeString()
                            : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-[10px] text-gray-500 truncate">
                          {session.workspaceId}
                        </span>
                        <span className="text-[10px] text-gray-600">·</span>
                        <span className="text-[10px] text-gray-500 truncate">
                          {session.agentId}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Window Controls */}
          <div
            className="flex items-center h-full shrink-0 gap-2.5 ml-2 pl-2 border-l border-[rgba(255,255,255,0.07)] devhub-titlebar-no-drag"
            style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' }}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleWinMinimize();
              }}
              className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#2f323e] hover:bg-[#434857] transition-colors"
              title="Minimize"
            >
              <Minus
                className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
                strokeWidth={3}
              />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleWinToggleMaximize();
              }}
              className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#464a57] hover:bg-[#5b6070] transition-colors"
              title={isWinMaximized ? 'Restore' : 'Maximize'}
            >
              <Plus
                className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
                strokeWidth={3}
              />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleWinClose();
              }}
              className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#B80096] hover:bg-[#D600AE] transition-colors"
              title="Close"
            >
              <X className="w-2.5 h-2.5 text-black stroke-[3px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Grid Area */}
      <div key="workspace-grid-shell" className="flex-1 flex bg-[#080b12] relative overflow-hidden">
        {/* Terminal Grid */}
        <div ref={workspaceGridAreaRef} className="flex-1 relative min-w-0">
          {!heavySurfacesReady ? (
            <div
              data-testid="terminal-manager-booting"
              className="flex h-full w-full items-center justify-center"
              aria-busy="true"
              aria-label="Preparando terminales"
            >
              <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : null}
          {heavySurfacesReady
            ? workspaces.map((ws, wsIndex) => {
                const workspaceGridKey = buildStableWorkspaceShellKey('workspace-grid', ws.id);
                const wsDockState =
                  activeWsId === ws.id ? effectiveRightDockState : { ...DEFAULT_RIGHT_DOCK_STATE };
                const updateWsDockState = updateRightDockState;
                const focusedPanelId = focusedPanelByWorkspace[ws.id];
                const isWorkspaceVisibleInLayout =
                  !isFullscreenBrowser && activeWsId === ws.id && isVisible;
                const shouldSuspendWorkspaceNativeSurfaces =
                  isWorkspaceVisibleInLayout && shouldSuspendNativeSurfaces;
                const totalTerminalPanelCount = resolveWorkspaceAllWindowsTerminalPanelCount(
                  ws,
                  workspaceWindows
                );
                const visibleTerminalPanelCount = focusedPanelId ? 1 : totalTerminalPanelCount;
                const activeWindowIdForLayout = resolveActiveWorkspaceWindowId(
                  ws.id,
                  workspaceWindows,
                  activeWindowIds
                );
                const activeWindowForLayout =
                  workspaceWindows?.[ws.id]?.find((w) => w.id === activeWindowIdForLayout) || null;
                const activeWindowPanelIds = getPanelIdsFromColumns(
                  activeWindowForLayout?.columns || ws.columns || []
                );
                const renderWorkspacePanelSlot = (panel, panelRenderOptions = {}) =>
                  renderWorkspacePanel(panel, {
                    activePanelId,
                    activeWsId,
                    isActivePanel: activePanelId === panel.id && activeWsId === ws.id,
                    isVisibleInLayout:
                      panelRenderOptions.isVisibleInLayout ??
                      resolvePanelVisibleInLayout({
                        isWorkspaceVisibleInLayout,
                        focusedPanelId,
                        panelId: panel.id,
                        activeWindowPanelIds,
                      }),
                    isWorkspaceShellVisible:
                      panelRenderOptions.isWorkspaceShellVisible ?? isWorkspaceVisibleInLayout,
                    visibleTerminalPanelCount:
                      panelRenderOptions.visibleTerminalPanelCount ?? visibleTerminalPanelCount,
                    panelLabel: getPanelDisplayLabel(ws, panel.id),
                    renameEditing: editingPanelId === panel.id,
                    renameValue: editingPanelId === panel.id ? editingValue : '',
                    renameError: editingPanelId === panel.id ? renameError : null,
                    onStartRename: (pnl, label) => startPanelRename(pnl, label),
                    onRenameValueChange: (val) => updateEditingValue(val),
                    onCommitRename: (pnl, overrideValue) =>
                      commitPanelRename(pnl, ws.id, overrideValue),
                    onCancelRename: () => cancelPanelRename(),
                    cwd,
                    wsId: ws.id,
                    setActivePanelIds,
                    onClosePanel: () => handleClosePanel(panel.id),
                    onSplitRight: () => handleSplit('horizontal', panel.id),
                    onSplitDown: () => handleSplit('vertical', panel.id),
                    onToggleFocus: () => togglePanelFocus(ws.id, panel.id),
                    isFocusedPanel: focusedPanelId === panel.id,
                    navigationPulseActive: panelNavPulseId === panel.id,
                    onActivatePanel: (panelId) => activateWorkspacePanel(ws.id, panelId),
                    panelSemanticMetadata: derivePanelSemanticMetadata(
                      panel,
                      agentRunsByPanel[panel.id]
                    ),
                    agentRun: agentRunsByPanel[panel.id] || null,
                    inboxPendingCount:
                      swarmInboxPendingByRole?.[
                        panel?.swarmRole?.roleKey ||
                          inferSwarmRoleKey({
                            ...(agentRunsByPanel[panel.id] || {}),
                            ...(panel?.swarmContext || {}),
                            roleKey: panel?.swarmRole?.roleKey,
                          })
                      ] || 0,
                    suspendNativeSurface: shouldSuspendWorkspaceNativeSurfaces,
                    nativeSurfacePolicy,
                    requestedRendererMode: resolveRequestedRenderer({
                      workspaceId: ws.id,
                      panelId: panel.id,
                      prefs: terminalRendererPreferences,
                    }),
                    onResetRendererToXterm: () => handleResetPanelRendererToXterm(ws.id, panel.id),
                    onSetPanelRenderer: (mode) => handleSetPanelRenderer(ws.id, panel.id, mode),
                    connectionState: getPanelConnectionState(panel),
                    coldMountOrdinal: coldMountOrdinalByPanelId[panel.id] ?? 0,
                    deferLiveSurfaceToPizarra: pizarraOwnsLiveSurfaces,
                    pizarraOwnsLiveSurfaces,
                    swarmDelegatedRoleKeys,
                    onConnectionStateChange: handleTerminalConnectionStateChange,
                  });
                return (
                  <WorkspaceTerminalSurface
                    key={workspaceGridKey}
                    ws={ws}
                    workspaceGridKey={workspaceGridKey}
                    activeWsId={activeWsId}
                    isVisible={isVisible}
                    isFullscreenBrowser={isFullscreenBrowser}
                    hideRightDockPanel={hideRightDockPanel}
                    wsDockState={wsDockState}
                    workspaceWindows={workspaceWindows}
                    activeWindowIds={activeWindowIds}
                    focusedPanelId={focusedPanelId}
                    totalTerminalPanelCount={totalTerminalPanelCount}
                    isWorkspaceVisibleInLayout={isWorkspaceVisibleInLayout}
                    panelSubtabsBarRef={panelSubtabsBarRef}
                    rightDockPlaceholderRef={rightDockPlaceholderRef}
                    renderWorkspaceWindowBar={(workspace, dockState) =>
                      renderWorkspaceWindowBar(workspace, dockState, updateWsDockState)
                    }
                    renderWorkspacePanelSlot={renderWorkspacePanelSlot}
                    resolvePanelVisibleInLayout={resolvePanelVisibleInLayout}
                    handleSplit={handleSplit}
                    handlePanelGroupLayout={handlePanelGroupLayout}
                    handleInternalSplitDragging={handleInternalSplitDragging}
                    handleDockDragging={handleDockDragging}
                    handleRightDockPanelResize={handleRightDockPanelResize}
                  />
                );
              })
            : null}
          {(effectiveRightDockState.visible || hasMountedRightDock) && activeWorkspace ? (
            <motion.div
              ref={rightDockLayerRef}
              {...rightDockAnimProps}
              data-testid="workspace-right-dock-layer"
              data-dock-layer-visible={dockLayerVisible ? 'true' : 'false'}
              aria-hidden={!dockLayerVisible}
              className={`absolute overflow-hidden rounded-xl border border-[var(--border-subtle)] flex flex-col ${
                dockLayerVisible ? '' : 'pointer-events-none'
              }`}
              style={{
                ...rightDockLayerChromeStyle,
                ...resolveRightDockTakeoverChromeStyle(isFullscreenBrowser),
                zIndex: isFullscreenBrowser ? 200 : 50,
                willChange: isDraggingDock ? 'left, width, opacity' : 'opacity',
              }}
            >
              <WorkspaceRightDock
                project={{ id: projectId, local_path: cwd }}
                workspaceId={activeWorkspace.id}
                dockState={effectiveRightDockState}
                onDockStateChange={updateRightDockState}
                layoutReady={
                  Boolean(heavySurfacesReady) &&
                  (Boolean(rightDockMeasuredBounds) || Boolean(isFullscreenBrowser))
                }
                layoutSyncKey={effectiveRightDockState.browserLayoutEpoch ?? 0}
                browserWindowState={browserWindowStates?.[activeWorkspace.id] || null}
                onBrowserWindowStateChange={updateBrowserWindowState}
                workspaceWindows={workspaceWindows?.[activeWorkspace.id] || []}
                activeWorkspaceWindowId={activeWindowIds?.[activeWorkspace.id] || null}
                onWorkspaceWindowSelect={(windowId) => {
                  const pizarraTabActive =
                    pizarraOwnsLiveSurfaces || effectiveRightDockState.activeTab === 'pizarra';
                  if (pizarraTabActive) {
                    // pizarra-view-switch-complete (dispatched by PizarraPane)
                    // is the single source of truth for finalizing the switch.
                    // Re-dispatching devhub:pizarra-select-view here created a
                    // loop where the pane started the animation again before
                    // activeWorkspaceWindowId could be updated.
                    setPizarraPendingViewId(windowId);
                    return;
                  }
                  switchWindowInWorkspace(activeWorkspace.id, windowId);
                  if (effectiveRightDockState.maximized) {
                    updateRightDockState((current) => applyWorkspaceWindowSelectDockState(current));
                  }
                }}
                onWorkspaceWindowAdd={() => addWindowToWorkspace(activeWorkspace.id)}
                onWorkspaceWindowRemove={(windowId) =>
                  removeWindowFromWorkspace(activeWorkspace.id, windowId)
                }
                executionCards={operatorCards}
                onCardConfirm={confirmCard}
                onCardCancel={cancelCard}
              />
              {isDraggingDock ? (
                <div
                  data-testid="workspace-right-dock-drag-overlay"
                  className="pointer-events-none absolute inset-0 z-50 cursor-col-resize"
                />
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </div>

      <SwarmLaunchWizardModal
        key="terminal-swarm-launch-wizard"
        open={swarmLaunchWizardOpen}
        catalog={swarmLaunchCatalog}
        preview={swarmLaunchPreview}
        currentStep={swarmLaunchWizardStep}
        onClose={() => setSwarmLaunchWizardOpen(false)}
        onStepChange={setSwarmLaunchWizardStep}
        onDraftChange={updateSwarmLaunchDraft}
        onLaunch={handleTerminalSwarmLaunch}
        submitState={swarmLaunchSubmitState}
        onSubmitStateChange={setSwarmLaunchSubmitState}
      />

      <TerminalSettingsModal
        open={terminalSettingsModal.open}
        onClose={() => setTerminalSettingsModal((prev) => ({ ...prev, open: false }))}
        panelId={terminalSettingsModal.panelId}
        sessionId={terminalSettingsModal.sessionId}
        sessionType={terminalSettingsModal.sessionType}
        restorePolicy={terminalSettingsModal.restorePolicy}
        cwd={terminalSettingsModal.cwd}
      />

      <TerminalRestoreSettingsModal
        open={restoreSettingsModal.open}
        onClose={() => setRestoreSettingsModal({ open: false })}
      />

      <WorkspaceTerminalSetupModal
        open={workspaceTerminalSetupOpen}
        onClose={() => setWorkspaceTerminalSetupOpen(false)}
        onConfirm={createWorkspaceWithTerminalCount}
        defaultInitialCommand={gridCommand}
      />

      <ZedAmbientOverlay
        sessionKey={`devhub-zed-chat-${projectId || 'default'}`}
        getTerminalPanelCount={getActiveWorkspaceTerminalPanelCount}
        getWorkspaceTerminals={getWorkspaceTerminals}
        getWorkspaceWindows={getWorkspaceWindows}
      />
    </motion.div>
  );
}

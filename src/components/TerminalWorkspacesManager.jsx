import WorkspaceRenderAssembly from './terminal/components/WorkspaceRenderAssembly';
import {
  createDefaultTerminalRendererPreferences,
  resolveRequestedRenderer,
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
} from './terminal/terminalRendererPreferences';
import WorkspaceSurfaceRegistryProvider from '@/components/workspace/WorkspaceSurfaceRegistryProvider';
import { SharedDockStoreProvider } from './workspace/hooks/useSharedDockState';
import RightDockSharedMirror from './workspace/RightDockSharedMirror';
import SharedSurfacesProvider from './workspace/SharedSurfacesProvider';
import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { useNativeBrowserHostEffects } from '@/lib/desktop/useNativeBrowserHostEffects';
import {
  applyRightDockLayerBounds,
  shouldDeferRightDockSizePersist,
} from './terminal/rightDockLayerSync';

import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import {
  createPanel,
  createDefaultWorkspaceState,
  getPanelIdsFromColumns,
  resolveWorkspacePanelId,
  normalizePanelKind,
  setPanelKindInWorkspaceTree,
} from './terminal/models/workspaceStateModel';
import {
  getSwarmSnapshotStorageKey,
  readAgentRunsByPanel,
  resolvePanelStartupConnectionState,
} from './terminal/models/swarmRoleModel';
import {
  getDisplayName as getPanelDisplayNameFromStore,
  setDisplayName as setPanelDisplayNameInStore,
} from '@/lib/terminal/panelDisplayName';
import { nameFromId } from '@/lib/asistente/zedTerminalResolver';
import { countPanelsInColumns } from '@/lib/terminal/workspaceSurfaceReconcile';
import useRightDockController from './terminal/hooks/useRightDockController';
import useWorkspaceWindowsController from './terminal/hooks/useWorkspaceWindowsController';
import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';
import useWorkspaceLifecycle from './terminal/hooks/useWorkspaceLifecycle';
import useWorkspacePanelLifecycle from './terminal/hooks/useWorkspacePanelLifecycle';
import useZedWorkspaceEvents from './terminal/hooks/useZedWorkspaceEvents';
import useOpenFileInWorkspace from './terminal/hooks/useOpenFileInWorkspace';
import useTerminalWorkspaceShortcuts from './terminal/hooks/useTerminalWorkspaceShortcuts';
import useWorkspaceLayoutState from './terminal/hooks/useWorkspaceLayoutState';
import useWorkspaceNativeSync from './terminal/hooks/useWorkspaceNativeSync';
import useWorkspaceRightDockSync from './terminal/hooks/useWorkspaceRightDockSync';
import useWorkspaceSurfaceRegistry from './terminal/hooks/useWorkspaceSurfaceRegistry';
import useWorkspaceEventBridge from './terminal/hooks/useWorkspaceEventBridge';
import useWorkspaceBootstrapEffect from './terminal/hooks/useWorkspaceBootstrapEffect';
import { useOperatorActionsDispatch } from '@/lib/operator/OperatorActionsDispatchContext';
import useResumableSessionCatalog from '@/hooks/useResumableSessionCatalog';
import { applyRightDockTabSelect } from './workspace/rightDockLayout';
import { selectSwarmLaunchCatalog } from '@/lib/operations/swarmControl';

import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import { shouldBumpRelaunchCommand } from '@/lib/terminal/startupRestoreRunner';

import { SWARM_LAUNCH_MATERIALIZED_EVENT } from '@/lib/terminal/swarmLaunchBatch';
import {
  applyActiveWindowColumnSnapshot,
  createSyncActiveWindowSnapshot,
  resolveSwarmPanelStandbyFlag,
} from '@/lib/terminal/swarmLaunchWorkspace';

import {
  LIFECYCLE_BURST_PHASES,
  PANEL_LIFECYCLE_REASONS,
  scheduleSwarmProjectionReadyBurst,
  scheduleTerminalLifecycleSync,
} from '@/lib/terminal/terminalLifecycleSync';

import { clearSwarmLaunchWrapperDispatchForLaunch } from '@/lib/terminal/swarmLaunchWrapperLifecycle';
// pizarra-shared-view-state Phase 2: TWM is the canonical owner
// of sharedDockState. Mounting SharedDockStoreProvider at the
// TWM root gives every workspace + pizarra consumer in the same
// tab the same store instance.
// Phase 4: SharedSurfacesProvider sits ABOVE the dock store.
// It owns the singleton lifecycle of every terminal/browser
// surface mounted in workspace + pizarra. Toggling the
// maximizedView re-targets the active host, never the
// surface.

// Bump alongside TERMINAL_TTY_BUILD_MARKER (TerminalTTY.jsx) to prove the running
// dev server picked up a fresh edit: watch `pnpm tauri dev` stdout for
// `[devhub-log] [BUILD] TerminalWorkspacesManager.jsx ...` on startup, or check
// window.__DEVHUB_BUILD_MARKERS__.workspacesManager in devtools.
const WORKSPACES_MANAGER_BUILD_MARKER = '2026-07-02-layout-churn-recover-v2';
if (typeof window !== 'undefined') {
  window.__DEVHUB_BUILD_MARKERS__ = window.__DEVHUB_BUILD_MARKERS__ || {};
  if (window.__DEVHUB_BUILD_MARKERS__.workspacesManager !== WORKSPACES_MANAGER_BUILD_MARKER) {
    window.__DEVHUB_BUILD_MARKERS__.workspacesManager = WORKSPACES_MANAGER_BUILD_MARKER;
    try {
      fetch('/api/terminal/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: 'BUILD',
          msg: `TerminalWorkspacesManager.jsx loaded — marker=${WORKSPACES_MANAGER_BUILD_MARKER}`,
        }),
      }).catch(() => {});
    } catch {
      // never crash module load — diagnostic only
    }
  }
}

export { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';
export {
  resolveRightDockLayerStyle,
  resolveMeasuredRightDockBounds,
} from './terminal/hooks/useRightDockController';

export default function TerminalWorkspacesManager({
  cwd,
  isVisible,
  projectId,
  navSidebarOpen = false,
  onToggleNavSidebar = null,
}) {
  const managerRootRef = useRef(null);
  const [shortcutHint, setShortcutHint] = useState(null);
  const panelSubtabsBarRef = useRef(null);
  const workspaceGridAreaRef = useRef(null);
  const rightDockPlaceholderRef = useRef(null);
  const rightDockLayerRef = useRef(null);
  const pendingDockSizeRef = useRef(null);
  const isDraggingDockRef = useRef(false);
  const nudgeBrowserNativeLiveRef = useRef(null);
  const syncRightDockMeasuredBoundsRef = useRef(null);
  const applyLiveRightDockBoundsRef = useRef(null);
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const agentRunsByPanel = readAgentRunsByPanel(storage);
  const terminalStateStorageKey = projectId
    ? `devhub_terminal_state:${projectId}`
    : 'devhub_terminal_state';
  const restoreManifestStorageKey = projectId
    ? `devhub_restore_manifest:${projectId}`
    : 'devhub_restore_manifest';
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  // Always start false so Tier3 soft-mount (isVisible=false) cannot spin xterm/WebGL
  // off-route. Production still waits an extra paint frame once visible.
  const deferHeavySurfacesUntilPaint =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  const [heavySurfacesReady, setHeavySurfacesReady] = useState(false);
  const [reopenActionError, setReopenActionError] = useState(null);
  const pendingReopenPanelsRef = useRef(new Map());
  const pendingSwarmLaunchByLaunchIdRef = useRef(new Map());
  const materializedSwarmLaunchIdsRef = useRef(new Set());
  const swarmProjectionBurstCleanupRef = useRef(null);
  const workspaceCloseRecoverCleanupRef = useRef(null);

  const defaultWorkspaceState = createDefaultWorkspaceState();
  const {
    workspaces,
    setWorkspaces,
    activeWsId,
    setActiveWsId,
    activePanelIds,
    setActivePanelIds,
    focusedPanelByWorkspace,
    setFocusedPanelByWorkspace,
  } = useWorkspaceLayoutState({
    initialWorkspaces: defaultWorkspaceState.workspaces,
    initialActiveWsId: defaultWorkspaceState.activeWsId,
    initialActivePanelIds: defaultWorkspaceState.activePanelIds,
  });

  const [draggedWsId, setDraggedWsId] = useState(null);
  const [dragOverWsId, setDragOverWsId] = useState(null);
  const pendingDragRef = useRef(null);
  // Stable cold-mount ordinals: once a panel is assigned an ordinal it must
  // never change. Reordering workspaces reshuffles the `workspaces` array, and
  // if the ordinal were derived from array order it would change for every
  // panel after the moved workspace — and `coldMountOrdinal` is a dependency
  // of the xterm boot effect, so a change disposes + reboots the terminal
  // (the "error cargando terminal" flash). Persist assignments in a ref.
  const coldMountOrdinalsRef = useRef({});
  const [gridCommand, setGridCommand] = useState('opencode');
  const [isGridLauncherOpen, setIsGridLauncherOpen] = useState(false);
  const [workspaceTerminalSetupOpen, setWorkspaceTerminalSetupOpen] = useState(false);
  const [terminalSettingsModal, setTerminalSettingsModal] = useState({
    open: false,
    panelId: null,
    sessionId: null,
    cwd: null,
    sessionType: 'opencode-durable',
    restorePolicy: 'manual',
  });
  const [restoreSettingsModal, setRestoreSettingsModal] = useState({ open: false });

  // Electron WebContentsView: hide under modals + filter by active workspace.
  useNativeBrowserHostEffects({
    workspaceId: activeWsId,
    modalOpen:
      Boolean(terminalSettingsModal?.open) ||
      Boolean(restoreSettingsModal?.open) ||
      Boolean(workspaceTerminalSetupOpen) ||
      Boolean(isGridLauncherOpen),
    commandPaletteOpen: false,
  });

  const [panelRestoreModes, setPanelRestoreModes] = useState({});
  // State-backed (not a ref): render consumers (badges, overlays) must re-render
  // when a panel's connection state changes. The equality guard below already
  // prevents no-op re-renders, so this costs nothing when nothing changed.
  const [panelConnectionStateById, setPanelConnectionStateById] = useState({});
  const getPanelConnectionState = useCallback(
    (panel) =>
      panelConnectionStateById[panel?.id] ??
      resolvePanelStartupConnectionState(panel, panelRestoreModes),
    [panelConnectionStateById, panelRestoreModes]
  );
  const handleTerminalConnectionStateChange = useCallback((panelId, connectionState) => {
    if (!panelId || !connectionState) return;
    setPanelConnectionStateById((prev) => {
      if (prev[panelId] === connectionState) return prev;
      return { ...prev, [panelId]: connectionState };
    });
  }, []);
  const [isDraggingInternalSplit, setIsDraggingInternalSplit] = useState(false);
  const [dockWorkspaceId, setDockWorkspaceId] = useState(
    () => createDefaultWorkspaceState().activeWsId
  );
  const [browserWindowStates, setBrowserWindowStates] = useState(() => ({}));
  const [pizarraPendingViewId, setPizarraPendingViewId] = useState(null);
  const [panelNavPulseId, setPanelNavPulseId] = useState(null);
  const [editingPanelId, setEditingPanelId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const editingValueRef = useRef('');
  const [renameError, setRenameError] = useState(null);

  const startPanelRename = useCallback((panel, currentLabel) => {
    setEditingPanelId(panel.id);
    setEditingValue(currentLabel);
    editingValueRef.current = currentLabel;
    setRenameError(null);
  }, []);

  const commitPanelRename = useCallback((panel, workspaceId, overrideValue) => {
    const value = typeof overrideValue === 'string' ? overrideValue : editingValueRef.current;
    const result = setPanelDisplayNameInStore(panel.id, workspaceId, value);
    if (result && result.ok) {
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== workspaceId) return ws;
          return {
            ...ws,
            columns: ws.columns.map((col) => ({
              ...col,
              panels: col.panels.map((p) => (p.id === panel.id ? { ...p, displayName: value } : p)),
            })),
          };
        })
      );
      setEditingPanelId(null);
      setEditingValue('');
      editingValueRef.current = '';
      setRenameError(null);
    } else {
      const previousName =
        panel.displayName || getPanelDisplayNameFromStore(panel.id, workspaceId) || '';
      setRenameError((result && (result.reason || result.error)) || 'rename-failed');
      setEditingValue(previousName);
      editingValueRef.current = previousName;
    }
  }, []);

  const updateEditingValue = useCallback((val) => {
    setEditingValue(val);
    editingValueRef.current = val;
  }, []);

  const cancelPanelRename = useCallback(() => {
    setEditingPanelId(null);
    setEditingValue('');
    editingValueRef.current = '';
    setRenameError(null);
  }, []);

  // --- Workspace rename state ---
  const [editingWsId, setEditingWsId] = useState(null);
  const [editingWsValue, setEditingWsValue] = useState('');
  const editingWsValueRef = useRef('');
  const [wsRenameError, setWsRenameError] = useState(null);

  const startWorkspaceRename = useCallback((wsId, currentLabel) => {
    setEditingWsId(wsId);
    setEditingWsValue(currentLabel);
    editingWsValueRef.current = currentLabel;
    setWsRenameError(null);
  }, []);

  const updateWsRenameValue = useCallback((val) => {
    setEditingWsValue(val);
    editingWsValueRef.current = val;
  }, []);

  const commitWorkspaceRename = useCallback((wsId, overrideValue) => {
    const value = typeof overrideValue === 'string' ? overrideValue : editingWsValueRef.current;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length === 0) {
      setWsRenameError('empty-name');
      return;
    }
    if (trimmed.length > 40) {
      setWsRenameError('invalid-name');
      return;
    }
    setWorkspaces((prev) => prev.map((ws) => (ws.id === wsId ? { ...ws, name: trimmed } : ws)));
    setEditingWsId(null);
    setEditingWsValue('');
    editingWsValueRef.current = '';
    setWsRenameError(null);
  }, []);

  const cancelWorkspaceRename = useCallback(() => {
    setEditingWsId(null);
    setEditingWsValue('');
    editingWsValueRef.current = '';
    setWsRenameError(null);
  }, []);

  const [terminalRendererPreferences, setTerminalRendererPreferences] = useState(() =>
    createDefaultTerminalRendererPreferences()
  );
  const [showWorkspacePathChip, setShowWorkspacePathChip] = useState(true);
  const {
    status: resumableStatus,
    sessions: resumableSessions,
    error: resumableError,
    isLoading: isLoadingResumableSessions,
    refresh: refreshResumableSessions,
  } = useResumableSessionCatalog({ cwd });
  const swarmLaunchProject = useMemo(
    () => ({ id: projectId, name: 'Terminal Workspace', local_path: cwd }),
    [cwd, projectId]
  );
  const swarmLaunchCatalog = useMemo(() => selectSwarmLaunchCatalog(), []);

  // Maximize state
  const [isMaximized] = useState(() => {
    try {
      return storage?.getItem('devhub_terminal_maximized') === 'true';
    } catch {
      return false;
    }
  });

  const [swarmControlSnapshot, setSwarmControlSnapshot] = useState(() => {
    if (typeof window === 'undefined' || !projectId) return null;
    try {
      return JSON.parse(
        window.localStorage.getItem(getSwarmSnapshotStorageKey(projectId)) || 'null'
      );
    } catch {
      return null;
    }
  });

  // Sync swarmControlSnapshot on projectId changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = projectId
        ? window.localStorage.getItem(getSwarmSnapshotStorageKey(projectId))
        : null;
      setSwarmControlSnapshot(raw ? JSON.parse(raw) : null);
    } catch {
      setSwarmControlSnapshot(null);
    }
  }, [projectId]);

  // Sync swarm health from backend periodically / on mount
  useEffect(() => {
    if (!projectId || !storage) return;

    let isSubscribed = true;
    const fetchHealth = async () => {
      try {
        const base =
          typeof window !== 'undefined' && window.location
            ? window.location.origin
            : 'http://localhost';
        const response = await fetch(
          new URL(`/api/agenthub/operations/health?project_id=${projectId}`, base).toString(),
          {
            cache: 'no-store',
          }
        );
        if (!response.ok) return;
        const payload = await response.json();
        const nextInput =
          payload.control_room_input ||
          payload.control_room_snapshot_input ||
          payload.control_room ||
          null;

        if (nextInput && isSubscribed) {
          storage.setItem(getSwarmSnapshotStorageKey(projectId), JSON.stringify(nextInput));
          setSwarmControlSnapshot(nextInput);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('Failed to sync swarm health:', error);
        }
      }
    };

    fetchHealth();
    return () => {
      isSubscribed = false;
    };
  }, [projectId, storage]);

  const wsCounterRef = useRef(1);
  const panelCounterRef = useRef(1);
  const colCounterRef = useRef(1);
  const counterRandomizedRef = useRef(false);
  const legacyCounterRandomizeEligibleRef = useRef(false);
  const hasRunStartupRestoreRef = useRef(false);
  const startupRestoreCompletedRef = useRef(false);
  const terminalHydrationReadyRef = useRef(false);
  const bootPanelIdsRef = useRef(new Set());
  const relaunchInFlightRef = useRef(new Set());
  const panelsClosingRef = useRef(new Set());
  const workspacesRef = useRef(workspaces);
  const activeWsIdRef = useRef(activeWsId);
  const activePanelIdsRef = useRef(activePanelIds);
  const activeWindowIdsRef = useRef({});
  const workspaceWindowsRef = useRef({});
  const focusedPanelByWorkspaceRef = useRef(focusedPanelByWorkspace);

  const {
    rightDockState,
    setRightDockState,
    rightDockMeasuredBounds,
    hasMountedRightDock,
    isDraggingDock,
    setIsDraggingDock,
    updateRightDockState,
    syncRightDockMeasuredBounds,
  } = useRightDockController({
    projectId,
    isVisible,
    dockWorkspaceId,
    setDockWorkspaceId,
    activeWsId,
    storage,
    isClientLoaded,
    workspaceGridAreaRef,
    rightDockPlaceholderRef,
    rightDockLayerRef,
    isDraggingDockRef,
    applyLiveRightDockBoundsRef,
    heavySurfacesReady,
  });

  const {
    workspaceWindows,
    setWorkspaceWindows,
    activeWindowIds,
    setActiveWindowIds,
    windowCounterRef,
    updateBrowserWindowState,
    closeWorkspaceBrowserWindow,
    addWindowToWorkspace,
    switchWindowInWorkspace,
    removeWindowFromWorkspace,
  } = useWorkspaceWindowsController({
    projectId,
    workspaces,
    activePanelIds,
    isClientLoaded,
    browserWindowStates,
    setBrowserWindowStates,
    workspaceWindowsRef,
    activeWindowIdsRef,
    workspacesRef,
    activePanelIdsRef,
    focusedPanelByWorkspaceRef,
    setFocusedPanelByWorkspace,
    setWorkspaces,
    setActivePanelIds,
    setTerminalRendererPreferences,
    panelCounterRef,
    colCounterRef,
    getAllPanelIds: getPanelIdsFromColumns,
    getPanelIdsFromColumns,
  });

  const applyPanelRelaunchCommand = useCallback(
    (
      panelId,
      command,
      panelCwd,
      { bumpCommand = true, forceBump = false, emitEvent = true } = {}
    ) => {
      if (!panelId || !command) return;
      if (relaunchInFlightRef.current.has(panelId)) return;
      relaunchInFlightRef.current.add(panelId);

      logTerminalSession('panel-relaunch-command', {
        panelId,
        command,
        bumpCommand,
        forceBump,
        emitEvent,
      });

      const normalizedCommand = String(command)
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();
      const panel = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);

      const shouldAppendRecovery =
        forceBump ||
        (bumpCommand && shouldBumpRelaunchCommand(panel?.initialCommand, normalizedCommand));
      const nextCommand = shouldAppendRecovery
        ? `${normalizedCommand} #recovery-${Date.now()}`
        : normalizedCommand;

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId) return p;
              return { ...p, initialCommand: nextCommand, cwd: panelCwd || p.cwd };
            }),
          })),
        }))
      );

      try {
        const savedState = JSON.parse(storage?.getItem(terminalStateStorageKey) || '{}');
        if (savedState.workspaces) {
          savedState.workspaces = savedState.workspaces.map((ws) => ({
            ...ws,
            columns: ws.columns.map((col) => ({
              ...col,
              panels: col.panels.map((p) => {
                if (p.id !== panelId) return p;
                return { ...p, initialCommand: nextCommand, cwd: panelCwd || p.cwd };
              }),
            })),
          }));
          storage?.setItem(terminalStateStorageKey, JSON.stringify(savedState));
        }
      } catch {
        // Ignore persistence failures
      }

      setPanelRestoreModes((prev) => {
        const next = { ...prev };
        delete next[panelId];
        return next;
      });

      if (emitEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('devhub:relaunch-panel', {
            detail: {
              panelId,
              command: nextCommand,
              cwd: panelCwd || null,
              reason: 'panel-relaunch',
            },
          })
        );
      }

      const hostWorkspace = workspacesRef.current.find((ws) =>
        (ws.columns || []).some((col) => (col.panels || []).some((entry) => entry.id === panelId))
      );
      const relaunchPanelIds = getPanelIdsFromColumns(hostWorkspace?.columns || []);
      if (hostWorkspace && relaunchPanelIds.length > 0) {
        scheduleTerminalLifecycleSync({
          reason: PANEL_LIFECYCLE_REASONS.PANEL_RELAUNCH,
          workspaceId: hostWorkspace.id,
          panelIds: relaunchPanelIds,
          phases: LIFECYCLE_BURST_PHASES[PANEL_LIFECYCLE_REASONS.PANEL_RELAUNCH],
        });
      }

      relaunchInFlightRef.current.delete(panelId);
    },
    [storage, terminalStateStorageKey]
  );

  useWorkspaceBootstrapEffect({
    projectId,
    storage,
    isVisible,
    terminalStateStorageKey,
    restoreManifestStorageKey,
    isClientLoaded,
    setIsClientLoaded,
    isMaximized,
    deferHeavySurfacesUntilPaint,
    heavySurfacesReady,
    setHeavySurfacesReady,
    workspaces,
    setWorkspaces,
    activeWsId,
    setActiveWsId,
    activePanelIds,
    setActivePanelIds,
    workspaceWindows,
    setWorkspaceWindows,
    activeWindowIds,
    setActiveWindowIds,
    terminalRendererPreferences,
    setTerminalRendererPreferences,
    setBrowserWindowStates,
    setDockWorkspaceId,
    setRightDockState,
    browserWindowStates,
    agentRunsByPanel,
    applyPanelRelaunchCommand,
    setPanelRestoreModes,
    setReopenActionError,
    refBag: {
      wsCounterRef,
      colCounterRef,
      panelCounterRef,
      windowCounterRef,
      terminalHydrationReadyRef,
      bootPanelIdsRef,
      legacyCounterRandomizeEligibleRef,
      activeWsIdRef,
      activePanelIdsRef,
      workspaceWindowsRef,
      activeWindowIdsRef,
      workspacesRef,
      hasRunStartupRestoreRef,
      startupRestoreCompletedRef,
    },
  });

  useEffect(() => {
    const barElement = panelSubtabsBarRef.current;
    if (!barElement) return;

    const activeViewCount = Math.max(1, (workspaceWindows?.[activeWsId] || []).length);
    const updatePathVisibility = (width) => {
      const minWidthForPathChip = 620 + Math.min(activeViewCount, 4) * 72;
      setShowWorkspacePathChip(width >= minWidthForPathChip);
    };

    updatePathVisibility(barElement.getBoundingClientRect?.().width || window.innerWidth || 0);

    if (typeof ResizeObserver !== 'function') {
      const handleWindowResize = () => {
        updatePathVisibility(barElement.getBoundingClientRect?.().width || window.innerWidth || 0);
      };

      window.addEventListener('resize', handleWindowResize);
      return () => window.removeEventListener('resize', handleWindowResize);
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width || 0;
      updatePathVisibility(width);
    });

    observer.observe(barElement);
    return () => observer.disconnect();
  }, [activeWsId, rightDockState.maximized, rightDockState.visible, workspaceWindows]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWsId) || workspaces[0];
  const {
    activeSwarmLaunchSummary,
    swarmBusSnapshot: _swarmBusSnapshot,
    swarmInboxPendingByRole,
    swarmDelegatedRoleKeys,
    effectiveRightDockState,
    isFullscreenBrowser,
    pizarraOwnsLiveSurfaces,
    hideRightDockPanel,
    dockLayerVisible,
    rightDockAnimProps,
    rightDockLayerStyle: _rightDockLayerStyle,
    rightDockLayerChromeStyle,
  } = useWorkspaceRightDockSync({
    activeWorkspace,
    activeWsIdRef,
    applyLiveRightDockBoundsRef,
    dockWorkspaceId,
    heavySurfacesReady,
    isDraggingDock,
    isDraggingDockRef,
    isDraggingInternalSplit,
    isVisible,
    nudgeBrowserNativeLiveRef,
    projectId,
    rightDockLayerRef,
    rightDockMeasuredBounds,
    rightDockPlaceholderRef,
    rightDockState,
    setIsDraggingDock,
    setIsDraggingInternalSplit,
    storage,
    swarmControlSnapshot,
    syncRightDockMeasuredBounds,
    syncRightDockMeasuredBoundsRef,
    workspaceGridAreaRef,
  });

  const activePanelId = activePanelIds[activeWsId] || activeWorkspace?.columns[0]?.panels[0]?.id;
  const coldMountOrdinalByPanelId = useMemo(() => {
    // Reuse previously assigned ordinals so a panel's ordinal is stable for
    // its whole lifetime regardless of workspace order. Only brand-new panels
    // receive a fresh ordinal (continuing from the highest seen so far).
    const previous = coldMountOrdinalsRef.current;
    const ordinals = {};

    // Collect every current panel id, preserving prior assignments.
    let maxAssigned = -1;
    for (const workspace of workspaces) {
      const windows = workspaceWindows?.[workspace.id] || [];
      const columnSources =
        windows.length > 0 ? windows.flatMap((win) => win.columns || []) : workspace.columns || [];
      for (const column of columnSources) {
        for (const panel of column.panels || []) {
          if (!panel?.id) continue;
          if (previous[panel.id] !== undefined) {
            ordinals[panel.id] = previous[panel.id];
            if (previous[panel.id] > maxAssigned) maxAssigned = previous[panel.id];
          }
        }
      }
    }

    // Assign fresh ordinals to panels we have not seen before.
    let nextOrdinal = maxAssigned + 1;
    for (const workspace of workspaces) {
      const windows = workspaceWindows?.[workspace.id] || [];
      const columnSources =
        windows.length > 0 ? windows.flatMap((win) => win.columns || []) : workspace.columns || [];
      for (const column of columnSources) {
        for (const panel of column.panels || []) {
          if (panel?.id && ordinals[panel.id] === undefined) {
            ordinals[panel.id] = nextOrdinal;
            nextOrdinal += 1;
          }
        }
      }
    }

    coldMountOrdinalsRef.current = ordinals;
    return ordinals;
  }, [workspaces, workspaceWindows]);
  const _requestedRendererMode = resolveRequestedRenderer({
    workspaceId: activeWsId,
    panelId: activePanelId,
    prefs: terminalRendererPreferences,
  });
  const activeBrowserWindowState = browserWindowStates?.[activeWsId] || null;
  // Suspension policy for transient overlays (e.g., restore settings modal).
  // With native VTE removed this only feeds the legacy nativeSurfacePolicy prop
  // that TerminalTTY receives; xterm renderers ignore it.
  const shouldSuspendNativeSurfaces = restoreSettingsModal.open || isGridLauncherOpen;
  const nativeSurfacePolicy = shouldSuspendNativeSurfaces ? 'transient-overlay' : 'live';

  useLayoutEffect(() => {
    if (isDraggingDock || !rightDockMeasuredBounds || !rightDockLayerRef.current) return;
    applyRightDockLayerBounds(rightDockLayerRef.current, rightDockMeasuredBounds);
  }, [isDraggingDock, rightDockMeasuredBounds]);

  workspacesRef.current = workspaces;
  activeWsIdRef.current = activeWsId;
  activePanelIdsRef.current = activePanelIds;
  activeWindowIdsRef.current = activeWindowIds;
  workspaceWindowsRef.current = workspaceWindows;
  focusedPanelByWorkspaceRef.current = focusedPanelByWorkspace;

  // Operator action cards — consumed from OperatorActionsDispatchContext (provider lives in App.js)
  const { cards: operatorCards, confirmCard, cancelCard } = useOperatorActionsDispatch();

  const handleResetPanelRendererToXterm = useCallback((workspaceId, panelId) => {
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, workspaceId, panelId, 'xterm')
    );
  }, []);

  // Set the per-panel renderer preference (driven by the per-panel header
  // switcher in WorkspaceTerminalSurface / renderWorkspacePanel).
  // Mirrors handleResetPanelRendererToXterm but accepts an arbitrary mode
  // (xterm-webgl | xterm | inherit). See
  // openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-selection/spec.md
  // RS-04.
  const handleSetPanelRenderer = useCallback((workspaceId, panelId, mode) => {
    if (!workspaceId || !panelId) return;
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, workspaceId, panelId, mode)
    );
  }, []);

  const getWorkspaceDisplayLabel = (wsId) => {
    const ws = workspaces.find((w) => w.id === wsId);
    const index = workspaces.findIndex((w) => w.id === wsId);
    if (!ws) return `Workspace ${index + 1}`;

    const explicitName = typeof ws.name === 'string' ? ws.name.trim() : '';
    if (explicitName && !/^workspace\s+\d+$/i.test(explicitName)) {
      return explicitName;
    }

    return `Workspace ${index + 1}`;
  };

  const getPanelDisplayLabel = (ws, panelId) => {
    const flatPanels = ws.columns.flatMap((col) => col.panels);
    const index = flatPanels.findIndex((panel) => panel.id === panelId);
    if (index < 0) return `P${flatPanels.length + 1}`;
    const fromMap = getPanelDisplayNameFromStore(panelId, ws.id);
    if (fromMap) return fromMap;
    const fromPanel = flatPanels[index]?.displayName;
    if (fromPanel) return fromPanel;
    return `P${index + 1}`;
  };

  const getAllPanelIds = useCallback((columns) => {
    return columns.flatMap((col) => col.panels.map((p) => p.id));
  }, []);

  const getActiveWorkspaceTerminalPanelCount = useCallback(() => {
    const workspaceId = activeWsIdRef.current || activeWsId;
    const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
    return countPanelsInColumns(workspace?.columns || []);
  }, [activeWsId]);

  const inferProgramFromPanelCommand = useCallback((command) => {
    const normalized = String(command || '').toLowerCase();
    if (normalized.includes('opencode')) return 'opencode';
    if (normalized.includes('codex')) return 'codex';
    if (normalized.includes('hermes')) return 'hermes';
    if (normalized.includes('kimi')) return 'kimi';
    if (normalized.includes('grok')) return 'grok';
    return null;
  }, []);

  const collectSiblingPanelNames = useCallback((workspaceId) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws) return [];
    return ws.columns
      .flatMap((col) => col.panels || [])
      .map(
        (panel) => panel.displayName || getPanelDisplayNameFromStore(panel.id, workspaceId) || null
      )
      .filter((name) => typeof name === 'string' && name.length > 0);
  }, []);

  const getWorkspaceTerminals = useCallback(() => {
    const seen = new Set();
    const results = [];

    for (const workspace of workspacesRef.current) {
      const workspaceId = workspace.id;
      for (const col of workspace.columns || []) {
        for (const panel of col.panels || []) {
          if (!panel?.id || seen.has(panel.id)) continue;
          seen.add(panel.id);
          const displayName =
            panel.displayName ||
            getPanelDisplayNameFromStore(panel.id, workspaceId) ||
            nameFromId(panel.id);
          results.push({
            terminalId: panel.id,
            displayName,
            workspaceId,
            cwd: panel.cwd || null,
            program: inferProgramFromPanelCommand(panel.initialCommand),
            tuiReady: true,
          });
        }
      }
    }

    return results;
  }, [inferProgramFromPanelCommand]);

  const {
    buildNativeWorkspaceSyncDetail: _buildNativeWorkspaceSyncDetail,
    notifyNativeWorkspaceSurfaceSync,
    notifyNativeLayoutSettled,
  } = useWorkspaceNativeSync({
    activeWindowIds,
    activeWsId,
    focusedPanelByWorkspace,
    getAllPanelIds,
    isVisible,
    workspaceWindows,
    workspaces,
  });

  const syncActiveWindowSnapshot = useMemo(
    () =>
      createSyncActiveWindowSnapshot({
        setWorkspaceWindows,
        getActiveWindowIds: () => activeWindowIds,
      }),
    [activeWindowIds]
  );

  const {
    markPanelsClosing,
    syncPanelLifecycleLayout,
    activateWorkspacePanel,
    navigateToPanel: _navigateToPanel,
    switchWorkspace,
    togglePanelFocus,
    clearPanelFocusMode,
    applyTerminalNavigationAction,
    handleSplit,
    handleClosePanel,
    tryClosePanelWithDoubleShortcut,
    handlePanelGroupLayout,
    handleInternalSplitDragging,
    handleDockDragging,
  } = useWorkspacePanelLifecycle({
    workspacesRef,
    activeWsIdRef,
    activePanelIdsRef,
    activeWindowIdsRef,
    workspaceWindowsRef,
    focusedPanelByWorkspaceRef,
    panelsClosingRef,
    colCounterRef,
    panelCounterRef,
    setWorkspaces,
    setActiveWsId,
    setActivePanelIds,
    setFocusedPanelByWorkspace,
    setWorkspaceWindows,
    setActiveWindowIds,
    setTerminalRendererPreferences,
    setPanelNavPulseId,
    setShortcutHint,
    setIsDraggingInternalSplit,
    setIsDraggingDock,
    workspaces,
    activeWsId,
    activeWorkspace,
    activePanelId,
    activeWindowIds,
    workspaceWindows,
    focusedPanelByWorkspace,
    isVisible,
    isClientLoaded,
    isDraggingInternalSplit,
    isDraggingDock,
    pizarraOwnsLiveSurfaces,
    cwd,
    projectId,
    notifyNativeLayoutSettled,
    notifyNativeWorkspaceSurfaceSync,
    syncActiveWindowSnapshot,
    collectSiblingPanelNames,
    isDraggingDockRef,
    pendingDockSizeRef,
    applyLiveRightDockBoundsRef,
    syncRightDockMeasuredBoundsRef,
    updateRightDockState,
  });

  const handleRightDockPanelResize = useCallback(
    (size, { maximized = false } = {}) => {
      if (maximized) return;
      pendingDockSizeRef.current = size;
      if (shouldDeferRightDockSizePersist(isDraggingDockRef.current)) {
        return;
      }
      updateRightDockState({ size });
    },
    [updateRightDockState]
  );

  const _findPanelInWorkspace = (workspace, panelId) => {
    if (!workspace || !panelId) return null;
    for (const column of workspace.columns || []) {
      const panel = (column.panels || []).find((candidate) => candidate.id === panelId);
      if (panel) return panel;
    }
    return null;
  };

  const {
    createWorkspaceWithTerminalCount,
    addWorkspace,
    removeWorkspace,
    handleApplyGrid,
    persistAgentRunMetadata,
  } = useWorkspaceLifecycle({
    wsCounterRef,
    windowCounterRef,
    colCounterRef,
    panelCounterRef,
    counterRandomizedRef,
    legacyCounterRandomizeEligibleRef,
    terminalStateStorageKey,
    workspacesRef,
    panelsClosingRef,
    workspaceCloseRecoverCleanupRef,
    swarmProjectionBurstCleanupRef,
    setWorkspaces,
    setActiveWsId,
    setActivePanelIds,
    setWorkspaceWindows,
    setActiveWindowIds,
    setTerminalRendererPreferences,
    setBrowserWindowStates,
    setSwarmControlSnapshot,
    setWorkspaceTerminalSetupOpen,
    setIsGridLauncherOpen,
    workspaces,
    activeWsId,
    workspaceWindows,
    activeWindowIds,
    storage,
    projectId,
    cwd,
    gridCommand,
    swarmControlSnapshot,
    syncPanelLifecycleLayout,
    syncActiveWindowSnapshot,
    closeWorkspaceBrowserWindow,
    notifyNativeLayoutSettled,
    getAllPanelIds,
    collectSiblingPanelNames,
  });

  const setPanelKind = useCallback(
    (panelId, kind) => {
      const wsId = activeWsIdRef.current || activeWsId;
      if (!wsId || !panelId) return null;
      const nextKind = normalizePanelKind(kind);
      const { workspaces: nextWorkspaces, workspaceWindows: nextWindows } =
        setPanelKindInWorkspaceTree({
          workspaces: workspacesRef.current,
          workspaceWindows: workspaceWindowsRef.current,
          workspaceId: wsId,
          panelId,
          kind: nextKind,
        });
      setWorkspaces(nextWorkspaces);
      setWorkspaceWindows(nextWindows);
      setActivePanelIds((prev) => ({ ...prev, [wsId]: panelId }));
      if (nextKind === 'browser') {
        updateRightDockState((currentState) => ({
          ...currentState,
          visible: false,
          maximized: false,
          browserLayoutEpoch: (Number(currentState.browserLayoutEpoch) || 0) + 1,
        }));
      }
      return { panelId, kind: nextKind };
    },
    [activeWsId, setWorkspaces, setWorkspaceWindows, setActivePanelIds, updateRightDockState]
  );

  const splitWithKind = useCallback(
    (kind, sourcePanelId = null, direction = 'horizontal') => {
      const wsId = activeWsIdRef.current || activeWsId;
      const panelId =
        sourcePanelId ||
        activePanelIdsRef.current?.[wsId] ||
        workspacesRef.current.find((entry) => entry.id === wsId)?.columns?.[0]?.panels?.[0]?.id ||
        null;
      const nextKind = normalizePanelKind(kind);
      // Terminal add must match the split-button path (no kind meta) so layout /
      // renderer budget stay identical; browser/files still pass kind.
      const createdId =
        nextKind === 'terminal'
          ? handleSplit(direction, panelId)
          : handleSplit(direction, panelId, null, null, null, nextKind);
      if (createdId && nextKind === 'browser') {
        updateRightDockState((currentState) => ({
          ...currentState,
          visible: false,
          maximized: false,
          browserLayoutEpoch: (Number(currentState.browserLayoutEpoch) || 0) + 1,
        }));
      }
      return createdId;
    },
    [activeWsId, handleSplit, updateRightDockState]
  );

  const handleRightDockTabSelect = useCallback(
    (tab) => {
      // Browser/files are space components — create via split, never replace from chrome.
      if (tab === 'browser' || tab === 'editor') {
        splitWithKind(tab === 'browser' ? 'browser' : 'files');
        return;
      }

      updateRightDockState((currentState) => {
        if (tab === 'pizarra') {
          const isCurrentlyPizarra =
            currentState.maximized === true && currentState.maximizedView === 'pizarra';
          if (isCurrentlyPizarra) {
            const wsId = activeWsIdRef.current || activeWsId;
            const browserOpen = browserWindowStates?.[wsId]?.open === true;
            if (browserOpen) {
              splitWithKind('browser');
              return {
                ...currentState,
                visible: false,
                maximized: false,
                maximizedView: 'browser',
                browserLayoutEpoch: (Number(currentState.browserLayoutEpoch) || 0) + 1,
              };
            }
          }
        }
        return applyRightDockTabSelect(currentState, tab);
      });
    },
    [updateRightDockState, activeWsId, browserWindowStates, splitWithKind]
  );

  // pizarra-view-switch-complete: consolidate the active window so the workspace
  // state reflects the destination view. Without this the pane keeps receiving
  // the old activeWorkspaceWindowId and the visible view collapses back to the
  // previous window after the animation.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onComplete = (event) => {
      if (event?.detail?.workspaceId === activeWsId) {
        setPizarraPendingViewId(null);
        const viewId = event?.detail?.viewId;
        if (viewId) {
          switchWindowInWorkspace(activeWsId, viewId);
        }
      }
    };
    window.addEventListener('devhub:pizarra-view-switch-complete', onComplete);
    return () => window.removeEventListener('devhub:pizarra-view-switch-complete', onComplete);
  }, [activeWsId, switchWindowInWorkspace]);

  const {
    swarmLaunchWizardOpen,
    setSwarmLaunchWizardOpen,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardStep,
    swarmLaunchDraft: _swarmLaunchDraft,
    swarmLaunchSubmitState,
    setSwarmLaunchSubmitState,
    updateSwarmLaunchDraft,
    openTerminalSwarmLauncher,
    handleTerminalSwarmLaunch,
    enqueueSwarmLaunchRequest,
    createWorkspaceForSwarmLaunchRequests,
    resolvedSwarmLaunchDraft: _resolvedSwarmLaunchDraft,
    swarmLaunchPreview,
  } = useSwarmLaunchController({
    projectId,
    swarmLaunchCatalog,
    swarmLaunchProject,
    storage,
    cwd,
    wsCounterRef,
    colCounterRef,
    panelCounterRef,
    setWorkspaces,
    setActiveWsId,
    setActivePanelIds,
    setTerminalRendererPreferences,
    getAllPanelIds,
    syncActiveWindowSnapshot,
    materializedSwarmLaunchIdsRef,
    pendingSwarmLaunchByLaunchIdRef,
    persistAgentRunMetadata,
    workspacesRef,
    buildPanel: (request, panelId, panelCwd) =>
      createPanel(panelId, request.commandToRun, panelCwd, {
        swarmRole: request.swarmRole,
        swarmContext: {
          isSwarmRole: Boolean(request.isSwarmRole),
          roleKey: request.roleKey || request.swarmRole?.roleKey || null,
          launchId: request.launchId || null,
          needsLaunchWrapper: true,
          startAfterMs: 0,
          standbyAwaitingDelegation: resolveSwarmPanelStandbyFlag(request),
          bootstrapMode: request.bootstrapMode || 'engram_first',
        },
      }),
    onMarkPanelsClosing: markPanelsClosing,
    onClearLaunchWrapperDispatch: (launchId) => {
      clearSwarmLaunchWrapperDispatchForLaunch(launchId, storage);
    },
    onAfterMaterialize: ({ launchId, plan, panelAssignments }) => {
      if (launchId) {
        materializedSwarmLaunchIdsRef.current.add(launchId);
        const pendingBatch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
        if (pendingBatch?.timer) {
          window.clearTimeout(pendingBatch.timer);
        }
        pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
      }

      const panelIds = panelAssignments.map(({ panelId }) => panelId);
      syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.SWARM_LAUNCH, plan.newWsId, panelIds);

      if (swarmProjectionBurstCleanupRef.current) {
        swarmProjectionBurstCleanupRef.current();
        swarmProjectionBurstCleanupRef.current = null;
      }
      swarmProjectionBurstCleanupRef.current = scheduleSwarmProjectionReadyBurst({
        workspaceId: plan.newWsId,
        panelIds,
      });
    },
    setSwarmControlSnapshot,
    applyRendererPreference: (acc, wsId, panelId) =>
      setPanelRendererPreference(acc, wsId, panelId, TERMINAL_RENDERER_INHERIT_MODE),
  });

  const reorderWorkspaceTabs = useCallback((sourceWsId, targetWsId) => {
    if (!sourceWsId || !targetWsId || sourceWsId === targetWsId) return;

    setWorkspaces((prev) => {
      const sourceIndex = prev.findIndex((ws) => ws.id === sourceWsId);
      const targetIndex = prev.findIndex((ws) => ws.id === targetWsId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleWorkspaceTabPointerDown = useCallback(
    (wsId) => (e) => {
      if (e.button !== 0) return;
      // Ignore drags that start on interactive children (close buttons, inputs).
      if (e.target.closest('button, input')) return;
      pendingDragRef.current = { wsId, startX: e.clientX, startY: e.clientY };
      // Register window-level listeners so drag survives DOM reorders.
      const onMove = (ev) => wsTabMoveRef.current(ev);
      const onUp = () => wsTabEndRef.current();
      pendingDragRef.current._onMove = onMove;
      pendingDragRef.current._onUp = onUp;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    []
  );

  const handleWorkspaceTabPointerMove = useCallback(
    (e) => {
      const pending = pendingDragRef.current;
      if (!pending) return;

      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (!draggedWsId && Math.sqrt(dx * dx + dy * dy) < 5) return;

      if (!draggedWsId) {
        setDraggedWsId(pending.wsId);
      }

      const target = document.elementFromPoint(e.clientX, e.clientY);
      const tab = target?.closest('[data-testid="workspace-top-tab-bar"] [data-workspace-id]');
      const targetWsId = tab?.dataset.workspaceId || null;
      const validTarget = targetWsId && targetWsId !== pending.wsId ? targetWsId : null;
      setDragOverWsId(validTarget);

      // Live reorder: shift tabs in real-time so the user sees a preview of the final order.
      if (validTarget) {
        reorderWorkspaceTabs(pending.wsId, validTarget);
      }
    },
    [draggedWsId, reorderWorkspaceTabs]
  );

  const endWorkspaceTabDrag = useCallback(() => {
    const pending = pendingDragRef.current;
    if (pending) {
      window.removeEventListener('pointermove', pending._onMove);
      window.removeEventListener('pointerup', pending._onUp);
    }
    pendingDragRef.current = null;
    setDraggedWsId(null);
    setDragOverWsId(null);
  }, []);

  // Stable refs so window listeners always call the latest handler.
  const wsTabMoveRef = useRef(handleWorkspaceTabPointerMove);
  wsTabMoveRef.current = handleWorkspaceTabPointerMove;
  const wsTabEndRef = useRef(endWorkspaceTabDrag);
  wsTabEndRef.current = endWorkspaceTabDrag;

  const launchPanelWithCommand = useCallback(
    (command, panelCwd = null) => {
      const cmdToRun = enforceDocOpsGateOnLaunchCommand(command);
      const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, panelCwd);
      return createdPanelId;
    },
    [handleSplit, activePanelId]
  );

  const reopenOpenCodeSession = useCallback(
    async (session) => {
      const resumableSessionId = session?.sessionId || session?.id;
      if (!resumableSessionId) {
        setReopenActionError('Session is no longer available to resume.');
        return null;
      }

      setReopenActionError(null);

      const sessionCwd = session.cwd || session.directory || cwd;
      const command = session.resumeCommand || `opencode --session ${resumableSessionId}`;
      const createdPanelId = launchPanelWithCommand(command, sessionCwd);

      if (!createdPanelId) {
        setReopenActionError('Session is no longer available to resume.');
        return null;
      }

      pendingReopenPanelsRef.current.set(createdPanelId, {
        command,
        sessionId: resumableSessionId,
        workspaceId: activeWsId,
      });

      // Register in devhub_agent_runs so Agent Room can track it
      try {
        const taskId = `oc-reopen-${resumableSessionId}`;
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        runs[taskId] = {
          panelId: createdPanelId,
          taskTitle: session.title || `OpenCode: ${resumableSessionId.slice(0, 8)}`,
          promptSummary: session.title || null,
          selectedAgent: 'opencode',
          launchOrigin: 'reopen-session',
          opencodeSessionId: resumableSessionId,
          launchedAt: Date.now(),
        };
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      } catch {
        // Ignore localStorage failures
      }

      return createdPanelId;
    },
    [activeWsId, cwd, launchPanelWithCommand]
  );

  const removeReopenRun = useCallback((panelId, sessionId) => {
    try {
      const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
      let changed = false;

      Object.entries(runs).forEach(([key, value]) => {
        const matchesPanel = panelId && value?.panelId === panelId;
        const matchesSession =
          sessionId &&
          value?.opencodeSessionId === sessionId &&
          value?.launchOrigin === 'reopen-session';

        if (matchesPanel || matchesSession) {
          delete runs[key];
          changed = true;
        }
      });

      if (changed) {
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      }
    } catch {
      // Ignore localStorage failures
    }
  }, []);

  const closeRightDock = useCallback(() => {
    updateRightDockState((currentState) => ({
      ...currentState,
      visible: false,
      maximized: false,
      maximizedView: 'browser',
    }));
  }, [updateRightDockState]);

  const applyTerminalWorkspaceAction = useCallback(
    (action) => {
      if (!action || !isVisible) return false;

      if (action === 'openBrowserDock') {
        handleRightDockTabSelect('browser');
        return true;
      }

      if (action === 'openEditorDock') {
        handleRightDockTabSelect('editor');
        return true;
      }

      if (action === 'closeRightDock') {
        closeRightDock();
        return true;
      }

      if (action === 'newWorkspace') {
        setWorkspaceTerminalSetupOpen(true);
        return true;
      }

      if (action === 'closePanel') {
        const currentWorkspaceId = activeWsIdRef.current;
        const currentWorkspace = workspacesRef.current.find(
          (workspace) => workspace.id === currentWorkspaceId
        );
        const currentPanelId = resolveWorkspacePanelId(
          currentWorkspace,
          activePanelIdsRef.current[currentWorkspaceId]
        );
        return tryClosePanelWithDoubleShortcut(currentPanelId);
      }

      return false;
    },
    [closeRightDock, handleRightDockTabSelect, isVisible, tryClosePanelWithDoubleShortcut]
  );

  useZedWorkspaceEvents({
    projectId,
    activeWsId,
    activePanelId,
    rightDockState,
    workspacesRef,
    activeWsIdRef,
    activePanelIdsRef,
    handleSplit,
    handleClosePanel,
    getAllPanelIds,
    activateWorkspacePanel,
    setFocusedPanelByWorkspace,
    updateRightDockState,
    updateBrowserWindowState,
    setWorkspaces,
    setRestoreSettingsModal,
  });

  useOpenFileInWorkspace({
    activeWsId,
    activeWsIdRef,
    workspacesRef,
    workspaceWindowsRef,
    activeWindowIdsRef,
    splitWithKind,
    activateWorkspacePanel,
    setFocusedPanelByWorkspace,
    setActivePanelIds,
  });

  useTerminalWorkspaceShortcuts({
    isVisible,
    workspaceTerminalSetupOpen,
    managerRootRef,
    activeWsIdRef,
    workspacesRef,
    focusedPanelByWorkspaceRef,
    clearPanelFocusMode,
    applyTerminalNavigationAction,
    applyTerminalWorkspaceAction,
    activateWorkspacePanel,
    handleSplit,
  });

  // ─── Shared Live Surface Registry Hook & Interceptors ───────────────────
  const { registry, registryValue } = useWorkspaceSurfaceRegistry({
    activeWorkspace,
    activeWindowIds,
    browserWindowStates,
    closeWorkspaceBrowserWindow,
    effectiveRightDockState,
    handleClosePanel,
    handleSetPanelRenderer,
    handleSplit,
    projectId,
    terminalRendererPreferences,
    workspaceWindows,
  });

  const failPendingReopen = useCallback(
    (panelId, fallbackMessage = 'Session is no longer available to resume.') => {
      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (!pending) return;

      pendingReopenPanelsRef.current.delete(panelId);
      removeReopenRun(panelId, pending.sessionId);
      setReopenActionError(fallbackMessage);

      let replacementPanelId = null;

      setWorkspaces((prev) =>
        prev.map((workspace) => {
          if (workspace.id !== pending.workspaceId) return workspace;

          const nextColumns = workspace.columns
            .map((column) => ({
              ...column,
              panels: column.panels.filter((panel) => panel.id !== panelId),
            }))
            .filter((column) => column.panels.length > 0);

          replacementPanelId =
            nextColumns.flatMap((column) => column.panels).map((panel) => panel.id)[0] || null;

          return nextColumns.length > 0 ? { ...workspace, columns: nextColumns } : workspace;
        })
      );

      if (replacementPanelId) {
        setActivePanelIds((prev) => ({
          ...prev,
          [pending.workspaceId]:
            prev[pending.workspaceId] === panelId ? replacementPanelId : prev[pending.workspaceId],
        }));
      }

      setWorkspaceWindows((prev) => {
        const wsId = pending.workspaceId;
        const windows = prev[wsId] || [];
        const activeWindowId = activeWindowIdsRef.current?.[wsId];
        if (!activeWindowId || windows.length === 0) return prev;

        const workspace = workspacesRef.current.find((entry) => entry.id === wsId);
        const nextColumns =
          workspace?.columns
            ?.map((column) => ({
              ...column,
              panels: (column.panels || []).filter((panel) => panel.id !== panelId),
            }))
            .filter((column) => (column.panels || []).length > 0) || [];

        return {
          ...prev,
          [wsId]: applyActiveWindowColumnSnapshot(
            windows,
            activeWindowId,
            nextColumns,
            replacementPanelId
          ),
        };
      });
    },
    [removeReopenRun, setWorkspaceWindows]
  );

  useEffect(() => {
    const handleSwarmLaunchMaterialized = (e) => {
      const runtimeRequests = e.detail?.runtimeRequests || [];
      createWorkspaceForSwarmLaunchRequests(runtimeRequests);
    };

    const handleRunAgent = async (e) => {
      const { taskId, command, selectedAgent, launchOrigin, promptSummary, taskTitle } = e.detail;

      if (launchOrigin === 'swarm-control-launch') {
        enqueueSwarmLaunchRequest(e.detail);
        return;
      }

      // Fase 4 (planning-launch-hardening): the planning path uses a dedicated
      // launch command that does NOT go through the DocOps gate. The dispatcher
      // (see `dispatchPlanningAgentRun.js`) is waiting on a matching
      // `devhub:run-agent-accepted` ack — fire it after a successful split so
      // the retry loop can short-circuit.
      const fallback = `opencode --agent ${selectedAgent || DEFAULT_OPENCODE_AGENT}`;
      const cmdToRun =
        launchOrigin === 'planning-launch'
          ? command || fallback
          : enforceDocOpsGateOnLaunchCommand(command || fallback);
      // Use split right by default for agents
      const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, cwd);

      if (taskId && createdPanelId) {
        await persistAgentRunMetadata(
          { taskId, selectedAgent, launchOrigin, promptSummary, taskTitle },
          createdPanelId,
          cmdToRun
        );
        // Ack the dispatcher (design Decision 8). Minimal shape: { taskId }.
        try {
          window.dispatchEvent(
            new window.CustomEvent('devhub:run-agent-accepted', { detail: { taskId } })
          );
        } catch {
          // window/CustomEvent may be undefined in tests — best-effort ack.
        }
      }
    };

    window.addEventListener('devhub:run-agent', handleRunAgent);
    window.addEventListener(SWARM_LAUNCH_MATERIALIZED_EVENT, handleSwarmLaunchMaterialized);

    return () => {
      window.removeEventListener('devhub:run-agent', handleRunAgent);
      window.removeEventListener(SWARM_LAUNCH_MATERIALIZED_EVENT, handleSwarmLaunchMaterialized);
    };
  }, [
    isVisible,
    handleSplit,
    handleClosePanel,
    cwd,
    createWorkspaceForSwarmLaunchRequests,
    enqueueSwarmLaunchRequest,
    persistAgentRunMetadata,
    applyTerminalNavigationAction,
    applyTerminalWorkspaceAction,
    clearPanelFocusMode,
    workspaceTerminalSetupOpen,
  ]);

  useWorkspaceEventBridge({
    activeWsId,
    activeWsIdRef,
    activePanelIdsRef,
    activeWindowIdsRef,
    applyPanelRelaunchCommand,
    failPendingReopen,
    panelsClosingRef,
    pendingReopenPanelsRef,
    projectId,
    relaunchInFlightRef,
    setPanelRestoreModes,
    setReopenActionError,
    setTerminalSettingsModal,
    setWorkspaces,
    storage,
    terminalStateStorageKey,
    workspaceWindowsRef,
    workspacesRef,
  });

  const workspaceRenderAssemblyBag = {
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
    editingWsId,
    editingWsValue,
    wsRenameError,
    startWorkspaceRename,
    updateWsRenameValue,
    commitWorkspaceRename,
    cancelWorkspaceRename,
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
    splitWithKind,
    setPanelKind,
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
    showWorkspacePathChip,
    navSidebarOpen,
    onToggleNavSidebar,
  };

  return (
    <WorkspaceSurfaceRegistryProvider
      projectId={projectId}
      workspaceId={activeWsId}
      registryValue={registryValue}
      registryInstance={registry.registryInstance}
    >
      <SharedSurfacesProvider
        onSurfaceDestroy={(surfaceId) => {
          // Phase 4: when a surface is hard-destroyed, also
          // remove it from the live registry so the dock
          // chrome / pizarra canvas both see the removal.
          try {
            registryValue.removeSurface(surfaceId);
          } catch (_err) {
            // ignore — registry may already be in the right state
          }
        }}
      >
        <SharedDockStoreProvider
          storage={storage}
          projectId={projectId || 'global'}
          workspaceId={activeWsId || 'workspace'}
        >
          <RightDockSharedMirror
            rightDockState={rightDockState}
            projectId={projectId || 'global'}
            workspaceId={activeWsId || 'workspace'}
          />
          <WorkspaceRenderAssembly {...workspaceRenderAssemblyBag} />
        </SharedDockStoreProvider>
      </SharedSurfacesProvider>
    </WorkspaceSurfaceRegistryProvider>
  );
}

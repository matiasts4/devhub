import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getRightDockAnimProps,
  getWorkspaceAnimProps,
  resolveRightDockTakeoverChromeStyle,
  resolveWorkspaceShellVisibilityStyle,
  resolveWorkspaceWindowVisibilityStyle,
} from './terminal/workspaceAnimProps';
import {
  applyRightDockLayerBounds,
  shouldDeferRightDockSizePersist,
} from './terminal/rightDockLayerSync';
import {
  getTerminalFloatingControlStyle,
  getTerminalGridShellStyle,
  getTerminalPanelBodyStyle,
  getTerminalPanelHeaderStyle,
  getWorkspaceShellChromeStyle,
  getWorkspaceTopBarStyle,
  getWorkspaceTabChromeStyle,
} from './terminal/terminalChromeStyles';
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
  ExternalLink,
  Maximize2,
  Minimize2,
  Grip,
  Globe,
  FileCode2,
  Wand2,
  Terminal,
  Settings,
} from 'lucide-react';
import TerminalTTY from './TerminalTTY';
import {
  SharedTerminalSurfacePortal,
  SharedTerminalSurfaceRegistrar,
} from './terminal/SharedTerminalSurface';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { createClient } from '@/lib/db/localClient';
import {
  closeTerminalSessions,
  syncWorkspaceCountersMonotonic,
} from './terminal/workspaceStateHelpers';
import {
  buildWorkspaceColumnsForTerminalCount,
  resolveSplitCreatedPanelProps,
  spawnFirstTerminalPanelColumns,
} from './terminal/utils/panelHelpers';
import {
  NEXT_DEV_OVERLAY_HIDE_STYLE_ID,
  createPanel,
  createPanelWithDisplayNameFactory,
  createWindow,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  normalizeWorkspaceWindows,
  getPanelIdsFromColumns,
  resolveWorkspaceVisibleTerminalPanelCount,
  collectEngineV2PanelIds,
  buildStableWorkspaceShellKey,
  resolveWorkspacePanelId,
} from './terminal/models/workspaceStateModel';
import {
  getSwarmSnapshotStorageKey,
  readAgentRunsByPanel,
  readWorkspaceSwarmLaunchSummary,
  buildSwarmRoleMetadata,
  inferSwarmRoleKey,
  derivePanelSemanticMetadata,
  shortenCommandSummary,
  resolvePanelStartupConnectionState,
  shortPath,
} from './terminal/models/swarmRoleModel';
import {
  getDisplayName as getPanelDisplayNameFromStore,
  setDisplayName as setPanelDisplayNameInStore,
  nextDisplayNameForPanel as nextPoolNameForWorkspace,
  resolvePanelSurfaceLabel,
} from '@/lib/terminal/panelDisplayName';
import { buildPanelHeaderDisplay } from './terminal/utils/panelHeaderDisplay';
import { nameFromId } from '@/lib/asistente/zedTerminalResolver';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';
import NotificationCenter from './NotificationCenter';
import TerminalSettingsModal from './TerminalSettingsModal';
import TerminalRestoreSettingsModal from './TerminalRestoreSettingsModal';
import WorkspaceTerminalSetupModal from './WorkspaceTerminalSetupModal';
import { isValidZedOpenTerminalEvent, resolveZedOpenTerminalPanelId } from './zedOpenTerminalEvent';
import { applyZedOpenTerminalFocus } from './asistente/zedOpenTerminalFocus';
import ZedAmbientOverlay from './asistente/ZedAmbientOverlay';
import {
  buildTerminalSurfacesFromWindows,
  countPanelsInColumns,
} from '@/lib/terminal/workspaceSurfaceReconcile';
import {
  MAX_WORKSPACE_TERMINAL_PANELS,
  MAX_ZED_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';
import { dispatchZedOverlayToggle } from '@/lib/asistente/zedOverlayEvents';
import { subscribeZedWorkspaceAction } from '@/lib/asistente/zedWorkspaceActionEvent';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import WorkspaceRightDock from './workspace/WorkspaceRightDock';
import WorkspaceWindowSwitcher, {
  MAX_WORKSPACE_WINDOWS,
} from './terminal/components/WorkspaceWindowSwitcher';
import WorkspaceWindowTabBar from './terminal/components/WorkspaceWindowTabBar';
import WorkspaceTerminalSurface from './terminal/components/WorkspaceTerminalSurface';
import useRightDockController, {
  resolveMeasuredRightDockBounds,
  resolveRightDockLayerStyle,
} from './terminal/hooks/useRightDockController';
import useWorkspaceWindowsController from './terminal/hooks/useWorkspaceWindowsController';
import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';
import useZedWorkspaceEvents from './terminal/hooks/useZedWorkspaceEvents';
import useTerminalWorkspaceShortcuts from './terminal/hooks/useTerminalWorkspaceShortcuts';
import useWorkspaceLayoutState from './terminal/hooks/useWorkspaceLayoutState';
import useWorkspaceNativeSync from './terminal/hooks/useWorkspaceNativeSync';
import useWorkspaceRightDockSync from './terminal/hooks/useWorkspaceRightDockSync';
import { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';
import PanelStatusBadge from './terminal/components/PanelStatusBadge';
import { useOperatorActionsDispatch } from '@/lib/operator/OperatorActionsDispatchContext';
import FileExplorerEditorPane from './workspace/FileExplorerEditorPane';
import useResumableSessionCatalog from '@/hooks/useResumableSessionCatalog';
import {
  DEFAULT_RIGHT_DOCK_STATE,
  MIN_RIGHT_DOCK_SIZE,
  readRightDockState,
  rightDockStatesEqual,
  sanitizeRightDockState,
  writeRightDockState,
} from './workspace/rightDockState';
import {
  applyRightDockTabSelect,
  applyWorkspaceWindowSelectDockState,
  applyZedOpenUrlDockUpdate,
} from './workspace/rightDockLayout';
import { coerceZedOpenUrlFocus, isValidZedOpenUrlEvent } from './zedOpenUrlEvent';
import {
  buildBrowserWindowLabel,
  readBrowserWindowStates,
  writeBrowserWindowStates,
} from './workspace/browserWindowState';
import {
  getAdjacentPanelId,
  getAdjacentWorkspaceId,
  resolveHorizontalNavigation,
  resolvePanelNavigationDirection,
  resolveVerticalNavigation,
  CLOSE_PANEL_SHORTCUT_ARM_MS,
  isTerminalWorkspaceUiAction,
  resolveTerminalNavigationAction,
  resolveTerminalShortcutAction,
  resolveTerminalWorkspaceAction,
  shouldHandleTerminalFocusExitShortcut,
  shouldHandleTerminalFocusShortcut,
  shouldHandleTerminalNavigationShortcut,
  shouldHandleTerminalShortcut,
  shouldHandleTerminalWorkspaceShortcut,
  TERMINAL_WORKSPACE_SHORTCUTS,
} from './terminal/workspaceShortcuts';
import {
  createDefaultTerminalRendererPreferences,
  readTerminalRendererPreferences,
  resolveRequestedRenderer,
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
  writeTerminalRendererPreferences,
} from './terminal/terminalRendererPreferences';
import PanelRendererSelect from './terminal/components/PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from './terminal/terminalRendererPreferences';
import {
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  selectSwarmLaunchCatalog,
} from '@/lib/operations/swarmControl';
import {
  resolveSwarmDelegatedRoleKeys,
  shouldShowSwarmStandbyOverlay,
} from '@/lib/operations/swarmDelegatedRoles';
import {
  buildRestoreManifestFromWorkspaceState,
  collectWorkspacePanelIds,
} from '@/lib/terminal/startupRestoreCoordinator';
import {
  createWorkspaceRestoreCoordinator,
  seedSuspendedOpenCodePanels,
} from '@/components/workspace/WorkspaceRestoreCoordinator';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import {
  readWorkspaceRestorePreferences,
  normalizeWorkspacesOpenCodeCommands,
  isOpenCodePanel,
  extractOpenCodeSessionId,
  inferPanelSessionKind,
  resolveEffectiveRestorePolicy,
  resolveOpenCodeSessionIdForPanel,
  shouldPersistOpenCodeSessionForPanel,
} from '@/lib/terminal/restorePolicyResolver';
import {
  dispatchStartupRestoreQueue,
  markStartupRestoreCompletedForSession,
  runOpenCodeStartupRestoreMutex,
  shouldBumpRelaunchCommand,
  shouldRunStartupRestoreThisPageLoad,
} from '@/lib/terminal/startupRestoreRunner';
import {
  enrichOpenCodeRestoreContext,
  fetchOpenCodeSessionCatalog,
  mergeDiscoveryIntoAgentRunsRecord,
  patchTerminalStateWithDiscoveredCommands,
  collectOpenCodePanelsNeedingDiscovery,
} from '@/lib/terminal/opencodeSessionDiscovery';
import {
  buildCleanTerminalStatePayload,
  flushTerminalSessionPersistence,
} from '@/lib/terminal/terminalSessionFlush';
import {
  dispatchSwarmLaunchMaterialized,
  SWARM_LAUNCH_MATERIALIZED_EVENT,
} from '@/lib/terminal/swarmLaunchBatch';
import {
  appendSwarmWorkerToWorkspace,
  applyActiveWindowColumnSnapshot,
  createSwarmLaunchQueueHandlers,
  createSyncActiveWindowSnapshot,
  createWorkspaceForSwarmLaunchRequestsFn,
  resolveSwarmPanelStandbyFlag,
  resolveWorkspaceWindowAfterPanelClose,
} from '@/lib/terminal/swarmLaunchWorkspace';
import {
  resolveActiveWorkspaceWindowId,
  resolvePanelVisibleInLayout,
  resolveWorkspaceWindowsForRender,
} from '@/lib/terminal/workspaceWindowRender';
import { buildProvisionedWorkerKey } from '@/lib/operations/swarmLazySpawn';
import {
  dispatchTerminalWorkspaceLayoutSync,
  dispatchTerminalLayoutSettled,
  dispatchTerminalWindowVisible,
} from '@/components/terminal/nativeLayoutSync';
import {
  filterLegacySurvivorPanelIds,
  scheduleSurvivorRecoverAfterClose,
  SWITCH_SURVIVOR_RECOVER_DELAYS_MS,
} from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  LIFECYCLE_BURST_PHASES,
  PANEL_LIFECYCLE_REASONS,
  scheduleSwarmProjectionReadyBurst,
  schedulePostSplitLayoutViewportSync,
  scheduleTerminalLifecycleSync,
} from '@/lib/terminal/terminalLifecycleSync';
import SwarmLaunchWizardModal from './control-room/SwarmLaunchWizardModal';
import { useSwarmBusSnapshot } from '@/lib/hooks/useSwarmBusSnapshot';
import {
  collectSwarmLaunchIdsForWorkspace,
  dispatchTerminatePanelCloseEvents,
  terminateSwarmLaunchesForWorkspace,
} from '@/lib/terminal/swarmWorkspaceLifecycle';
import {
  hydrateSwarmLaunchWrapperFlags,
  clearSwarmLaunchWrapperDispatchForLaunch,
  markSwarmLaunchWrapperDispatched,
} from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import { useWorkspaceSurfaceRegistry } from '@/lib/pizarra/useWorkspaceSurfaceRegistry';
import WorkspaceSurfaceRegistryProvider from '@/components/workspace/WorkspaceSurfaceRegistryProvider';
// pizarra-shared-view-state Phase 2: TWM is the canonical owner
// of sharedDockState. Mounting SharedDockStoreProvider at the
// TWM root gives every workspace + pizarra consumer in the same
// tab the same store instance.
import { SharedDockStoreProvider } from './workspace/hooks/useSharedDockState';
import RightDockSharedMirror from './workspace/RightDockSharedMirror';
// Phase 4: SharedSurfacesProvider sits ABOVE the dock store.
// It owns the singleton lifecycle of every terminal/browser
// surface mounted in workspace + pizarra. Toggling the
// maximizedView re-targets the active host, never the
// surface.
import SharedSurfacesProvider from './workspace/SharedSurfacesProvider';

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

export default function TerminalWorkspacesManager({ cwd, isVisible, projectId }) {
  const managerRootRef = useRef(null);
  const closePanelShortcutArmedRef = useRef(null);
  const closePanelShortcutArmTimerRef = useRef(null);
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
  const deferHeavySurfacesUntilPaint =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  const [heavySurfacesReady, setHeavySurfacesReady] = useState(!deferHeavySurfacesUntilPaint);
  const [reopenActionError, setReopenActionError] = useState(null);
  const pendingReopenPanelsRef = useRef(new Map());
  const swarmLaunchScheduledTimersRef = useRef(new Map());
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
  const [panelRestoreModes, setPanelRestoreModes] = useState({});
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
    retry: retryResumableSessions,
  } = useResumableSessionCatalog({ cwd });
  const swarmLaunchProject = useMemo(
    () => ({ id: projectId, name: 'Terminal Workspace', local_path: cwd }),
    [cwd, projectId]
  );
  const swarmLaunchCatalog = useMemo(() => selectSwarmLaunchCatalog(), []);

  // Maximize state
  const [isMaximized, setIsMaximized] = useState(() => {
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
  const panelNavPulseTimeoutRef = useRef(null);

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

  // TIC-2: Randomize panel/col/ws counters to HIGH range [1000,10000] on first mount
  // when workspaces exist (hydrated from localStorage). This prevents stale devhub_agent_runs
  // entries with low IDs (p1, p2) from colliding with fresh panel IDs.
  useEffect(() => {
    const savedState =
      storage?.getItem(terminalStateStorageKey) || storage?.getItem('devhub_terminal_state');
    if (!savedState) return;

    if (workspaces.length === 0) return;
    // Only randomize once when counters are still in low range (initial state)
    if (panelCounterRef.current <= 100) {
      const RANDOMIZE_TO_HIGH = () => Math.floor(Math.random() * 9001) + 1000;
      panelCounterRef.current = RANDOMIZE_TO_HIGH();
      colCounterRef.current = RANDOMIZE_TO_HIGH();
      wsCounterRef.current = RANDOMIZE_TO_HIGH();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  useEffect(() => {
    if (!deferHeavySurfacesUntilPaint || !isVisible || heavySurfacesReady) return undefined;

    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setHeavySurfacesReady(true);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [deferHeavySurfacesUntilPaint, heavySurfacesReady, isVisible]);

  useEffect(() => {
    if (!isVisible || typeof document === 'undefined') return undefined;

    const style = document.createElement('style');
    style.id = NEXT_DEV_OVERLAY_HIDE_STYLE_ID;
    style.textContent = `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-nextjs-dialog],
      [data-nextjs-errors-dialog-overlay] {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.getElementById(NEXT_DEV_OVERLAY_HIDE_STYLE_ID)?.remove();
    };
  }, [isVisible]);

  // Persist maximize state
  useEffect(() => {
    try {
      storage?.setItem('devhub_terminal_maximized', String(isMaximized));
    } catch {
      /* ignore */
    }
  }, [isMaximized, storage]);

  // Dispatch maximize toggle event for App.js to react
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('devhub:toggle-maximize', { detail: { isMaximized } }));
  }, [isMaximized]);

  // --- LocalStorage Persistence ---
  useEffect(() => {
    try {
      const savedState =
        storage?.getItem(terminalStateStorageKey) || storage?.getItem('devhub_terminal_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.workspaces && parsed.workspaces.length > 0) {
          const normalizedState = normalizeWorkspaceState(
            parsed.workspaces,
            parsed.activeWsId,
            parsed.activePanelIds
          );

          const hydratedAgentRuns = readAgentRunsByPanel(storage);
          const hydratedWorkspaces = hydrateSwarmLaunchWrapperFlags(
            normalizeWorkspacesOpenCodeCommands(normalizedState.workspaces, hydratedAgentRuns),
            storage
          );

          setWorkspaces(hydratedWorkspaces);
          setActiveWsId(normalizedState.activeWsId);
          setActivePanelIds(normalizedState.activePanelIds);

          const normalizedWindows = normalizeWorkspaceWindows(
            parsed.workspaceWindows || {},
            parsed.activeWindowIds || {},
            hydratedWorkspaces,
            normalizedState.activePanelIds
          );

          setWorkspaceWindows(normalizedWindows.workspaceWindows);
          setActiveWindowIds(normalizedWindows.activeWindowIds);
          setTerminalRendererPreferences(
            readTerminalRendererPreferences(storage, projectId, hydratedWorkspaces)
          );
          windowCounterRef.current = Math.max(
            windowCounterRef.current,
            normalizedWindows.windowCounter
          );

          const nextCounters = syncWorkspaceCountersMonotonic(hydratedWorkspaces, {
            workspace: wsCounterRef.current,
            column: colCounterRef.current,
            panel: panelCounterRef.current,
          });

          wsCounterRef.current = nextCounters.workspace;
          colCounterRef.current = nextCounters.column;
          panelCounterRef.current = nextCounters.panel;
          terminalHydrationReadyRef.current = true;
          bootPanelIdsRef.current = new Set(collectWorkspacePanelIds(hydratedWorkspaces));
          logTerminalSession('boot-hydration-complete', {
            panelIds: Array.from(bootPanelIdsRef.current),
            workspaceCount: hydratedWorkspaces.length,
          });
        }
      }
    } catch (e) {
      console.error('Failed to load terminal state:', e);
    }
    if (!terminalHydrationReadyRef.current) {
      terminalHydrationReadyRef.current = true;
      bootPanelIdsRef.current = new Set();
      logTerminalSession('boot-hydration-empty', { panelIds: [] });
    }
    const initialDockWorkspaceId =
      (typeof activeWsIdRef.current === 'string' && activeWsIdRef.current) ||
      createDefaultWorkspaceState().activeWsId;
    setDockWorkspaceId(initialDockWorkspaceId);
    setRightDockState(readRightDockState(storage, projectId, initialDockWorkspaceId));
    setBrowserWindowStates(readBrowserWindowStates(storage, projectId));
    setTerminalRendererPreferences((prev) =>
      readTerminalRendererPreferences(
        storage,
        projectId,
        workspacesRef.current.length
          ? workspacesRef.current
          : createDefaultWorkspaceState().workspaces
      )
    );
    setIsClientLoaded(true);
  }, [projectId, storage, terminalStateStorageKey]);

  // T5 migration: stamp a pool name on any panel that does not have one.
  // Idempotent — re-running on a panel that already has a displayName is a
  // no-op because the per-panel localStorage entry is already written.
  useEffect(() => {
    if (!isClientLoaded) return;
    if (!workspaces || workspaces.length === 0) return;
    let mutated = false;
    const next = workspaces.map((ws) => {
      const columns = (ws.columns || []).map((col) => {
        const panels = (col.panels || []).map((panel) => {
          if (panel.displayName) return panel;
          const stored = getPanelDisplayNameFromStore(panel.id, ws.id);
          if (stored) {
            // Mirror the cached name into localStorage so a stale Map cannot
            // hide the entry from a fresh hydrate. Re-write is cheap.
            setPanelDisplayNameInStore(panel.id, ws.id, stored);
            mutated = true;
            return { ...panel, displayName: stored };
          }
          const assigned = nextPoolNameForWorkspace(ws.id);
          setPanelDisplayNameInStore(panel.id, ws.id, assigned);
          mutated = true;
          return { ...panel, displayName: assigned };
        });
        return { ...col, panels };
      });
      return { ...ws, columns };
    });
    if (mutated) {
      setWorkspaces(next);
    }
  }, [isClientLoaded, workspaces]);

  const flushTerminalPersistenceNow = useCallback(() => {
    if (!storage || !isClientLoaded) return false;

    return flushTerminalSessionPersistence(storage, {
      workspaces: workspacesRef.current,
      activeWsId: activeWsIdRef.current,
      activePanelIds: activePanelIdsRef.current,
      workspaceWindows: workspaceWindowsRef.current,
      activeWindowIds: activeWindowIdsRef.current,
      projectId,
      appSessionId: `shutdown-${Date.now()}`,
      agentRunsByPanel: readAgentRunsByPanel(storage),
    });
  }, [isClientLoaded, projectId, storage]);

  useEffect(() => {
    if (isClientLoaded) {
      const payload = buildCleanTerminalStatePayload({
        workspaces,
        activeWsId,
        activePanelIds,
        workspaceWindows,
        activeWindowIds,
      });
      storage?.setItem(terminalStateStorageKey, JSON.stringify(payload));
    }
  }, [
    workspaces,
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
    isClientLoaded,
    storage,
    terminalStateStorageKey,
  ]);

  useEffect(() => {
    if (!isClientLoaded) return;
    writeTerminalRendererPreferences(storage, projectId, terminalRendererPreferences, workspaces);
  }, [isClientLoaded, projectId, storage, terminalRendererPreferences, workspaces]);

  useEffect(() => {
    if (!isClientLoaded || !storage) return;

    try {
      const manifest = buildRestoreManifestFromWorkspaceState({
        workspaces,
        activeWorkspaceId: activeWsId,
        projectId,
        appSessionId: `live-${Date.now()}`,
        agentRunsByPanel: readAgentRunsByPanel(storage),
        restorePreferences: readWorkspaceRestorePreferences(storage),
      });
      storage.setItem(restoreManifestStorageKey, JSON.stringify(manifest));
    } catch {
      // Restore manifest persistence is best-effort only.
    }
  }, [activeWsId, isClientLoaded, projectId, restoreManifestStorageKey, storage, workspaces]);

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

  // --- Startup restore: global prefs + queued OpenCode resume (reboot-safe via --session) ---
  useEffect(() => {
    if (!isVisible || !isClientLoaded || !storage || hasRunStartupRestoreRef.current) return;

    const sessionStorage = typeof window !== 'undefined' ? window.sessionStorage : null;

    if (!shouldRunStartupRestoreThisPageLoad(sessionStorage)) {
      hasRunStartupRestoreRef.current = true;
      return undefined;
    }

    const snapshotWorkspaces =
      workspacesRef.current.length > 0 ? workspacesRef.current : workspaces;

    let expectsHydratedWorkspaces = false;
    try {
      const savedRaw =
        storage.getItem(terminalStateStorageKey) || storage.getItem('devhub_terminal_state');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        expectsHydratedWorkspaces =
          Array.isArray(parsed?.workspaces) && parsed.workspaces.length > 0;
      }
    } catch {
      expectsHydratedWorkspaces = false;
    }

    const hasHydratedPanels = snapshotWorkspaces.some((ws) =>
      (ws?.columns || []).some((col) => (col?.panels || []).length > 0)
    );

    if (expectsHydratedWorkspaces && !terminalHydrationReadyRef.current) {
      logTerminalSession('startup-restore-deferred', {
        reason: 'awaiting-hydration',
        expectsHydratedWorkspaces,
      });
      return;
    }

    if (expectsHydratedWorkspaces && !hasHydratedPanels) {
      logTerminalSession('startup-restore-deferred', {
        reason: 'awaiting-panels',
        expectsHydratedWorkspaces,
      });
      return;
    }

    hasRunStartupRestoreRef.current = true;
    logTerminalSession('startup-restore-begin', {
      bootPanelIds: Array.from(bootPanelIdsRef.current),
      snapshotPanelIds: collectWorkspacePanelIds(snapshotWorkspaces),
      activeWsId: activeWsIdRef.current || activeWsId,
    });

    const restorePrefs = readWorkspaceRestorePreferences(storage);

    const { suspendedSeed } = seedSuspendedOpenCodePanels({
      snapshotWorkspaces,
      agentRunsByPanel,
      restorePrefs,
    });
    if (Object.keys(suspendedSeed).length > 0) {
      setPanelRestoreModes(suspendedSeed);
    }

    const { runStartupRestore, abortStartupRestore } = createWorkspaceRestoreCoordinator({
      storage,
      terminalStateStorageKey,
      projectId,
      snapshotWorkspaces,
      workspacesRef,
      activeWsIdRef,
      activeWsId,
      bootPanelIdsRef,
      agentRunsByPanel,
      restorePrefs,
      applyPanelRelaunchCommand,
      setWorkspaces,
      setPanelRestoreModes,
      setReopenActionError,
      markStartupRestoreCompleted: () => {
        startupRestoreCompletedRef.current = true;
        markStartupRestoreCompletedForSession(sessionStorage);
      },
    });

    runStartupRestore();

    return () => {
      abortStartupRestore();
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    isClientLoaded,
    isVisible,
    projectId,
    storage,
    terminalStateStorageKey,
  ]);

  // Synchronous flush before app/window close so opencode --session survives reboot.
  useEffect(() => {
    if (!isClientLoaded || typeof window === 'undefined') return undefined;

    const runFlush = () => {
      flushTerminalPersistenceNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        runFlush();
      }
    };

    window.addEventListener('beforeunload', runFlush);
    window.addEventListener('pagehide', runFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('devhub:flush-terminal-persistence', runFlush);

    return () => {
      window.removeEventListener('beforeunload', runFlush);
      window.removeEventListener('pagehide', runFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('devhub:flush-terminal-persistence', runFlush);
    };
  }, [flushTerminalPersistenceNow, isClientLoaded]);

  useEffect(() => {
    if (!isClientLoaded) return;
    writeBrowserWindowStates(storage, projectId, browserWindowStates);
  }, [browserWindowStates, isClientLoaded, projectId, storage]);

  useEffect(() => {
    if (!workspaces.length) return;

    const nextCounters = syncWorkspaceCountersMonotonic(workspaces, {
      workspace: wsCounterRef.current,
      column: colCounterRef.current,
      panel: panelCounterRef.current,
    });

    wsCounterRef.current = nextCounters.workspace;
    colCounterRef.current = nextCounters.column;
    panelCounterRef.current = nextCounters.panel;
  }, [workspaces]);

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
    swarmBusSnapshot,
    swarmInboxPendingByRole,
    swarmDelegatedRoleKeys,
    effectiveRightDockState,
    isFullscreenBrowser,
    pizarraOwnsLiveSurfaces,
    hideRightDockPanel,
    dockLayerVisible,
    rightDockAnimProps,
    rightDockLayerStyle,
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
    const ordinals = {};
    let ordinal = 0;
    for (const workspace of workspaces) {
      for (const column of workspace.columns || []) {
        for (const panel of column.panels || []) {
          if (panel?.id) {
            ordinals[panel.id] = ordinal;
            ordinal += 1;
          }
        }
      }
    }
    return ordinals;
  }, [workspaces]);
  const requestedRendererMode = resolveRequestedRenderer({
    workspaceId: activeWsId,
    panelId: activePanelId,
    prefs: terminalRendererPreferences,
  });
  const activeBrowserWindowState = browserWindowStates?.[activeWsId] || null;
  // Suspension policy for transient overlays (e.g., restore settings modal).
  // With native VTE removed this only feeds the legacy nativeSurfacePolicy prop
  // that TerminalTTY receives; xterm renderers ignore it.
  const shouldSuspendNativeSurfaces = restoreSettingsModal.open;
  const nativeSurfacePolicy = shouldSuspendNativeSurfaces ? 'transient-overlay' : 'live';

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
  const activateWorkspacePanel = useCallback((workspaceId, panelId) => {
    if (!workspaceId || !panelId) return;

    setActiveWsId((prev) => (prev === workspaceId ? prev : workspaceId));
    setActivePanelIds((prev) =>
      prev[workspaceId] === panelId ? prev : { ...prev, [workspaceId]: panelId }
    );

    const focusedPanelId = focusedPanelByWorkspaceRef.current?.[workspaceId];
    if (focusedPanelId) {
      const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
      const windows = workspaceWindowsRef.current?.[workspaceId] || [];
      const activeWindow = windows.find((win) => win.id === activeWindowId);
      const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
      if (!activeWindowPanelIds.includes(panelId)) {
        setFocusedPanelByWorkspace((prev) => {
          if (!prev[workspaceId]) return prev;
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        });
      }
    }

    setWorkspaceWindows((prev) => {
      const windows = prev[workspaceId] || [];
      const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
      if (!activeWindowId || windows.length === 0) return prev;

      let changed = false;
      const nextWindows = windows.map((windowView) => {
        if (windowView.id !== activeWindowId || windowView.activePanelId === panelId) {
          return windowView;
        }

        changed = true;
        return {
          ...windowView,
          activePanelId: panelId,
        };
      });

      return changed ? { ...prev, [workspaceId]: nextWindows } : prev;
    });
  }, []);

  const handleRightDockTabSelect = useCallback(
    (tab) => {
      updateRightDockState((currentState) => {
        if (tab === 'pizarra') {
          const isCurrentlyPizarra =
            currentState.maximized === true && currentState.maximizedView === 'pizarra';
          if (isCurrentlyPizarra) {
            const wsId = activeWsIdRef.current || activeWsId;
            const browserOpen = browserWindowStates?.[wsId]?.open === true;
            if (browserOpen) {
              return {
                ...currentState,
                visible: true,
                activeTab: 'browser',
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
    [updateRightDockState, activeWsId, browserWindowStates]
  );

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
    buildNativeWorkspaceSyncDetail,
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

  const markPanelsClosing = useCallback((panelIds = [], clearAfterMs = 2000) => {
    const ids = Array.isArray(panelIds) ? panelIds.filter(Boolean) : [];
    ids.forEach((id) => panelsClosingRef.current.add(id));
    if (clearAfterMs > 0 && typeof window !== 'undefined') {
      ids.forEach((id) => {
        window.setTimeout(() => panelsClosingRef.current.delete(id), clearAfterMs);
      });
    }
  }, []);

  const syncPanelLifecycleLayout = useCallback(
    (reason, workspaceId, panelIds, { phases, notifyNative = true } = {}) => {
      return scheduleTerminalLifecycleSync({
        reason,
        workspaceId,
        panelIds,
        phases: phases || LIFECYCLE_BURST_PHASES[reason] || undefined,
        notifyNative: notifyNative ? notifyNativeLayoutSettled : undefined,
      });
    },
    [notifyNativeLayoutSettled]
  );

  const resolveActiveWindowPanelIds = useCallback(
    (wsId) => {
      if (!wsId) return [];
      const windowId = resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[wsId] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      if (activeWindow) {
        return getPanelIdsFromColumns(activeWindow.columns || []);
      }
      const ws = workspaces.find((entry) => entry.id === wsId);
      return getPanelIdsFromColumns(ws?.columns || []);
    },
    [activeWindowIds, getPanelIdsFromColumns, workspaceWindows, workspaces]
  );

  const prevActiveWsIdRef = useRef('');
  useEffect(() => {
    if (typeof window === 'undefined' || !isClientLoaded) return undefined;

    const wsId = activeWsId;
    const isInitialMount = prevActiveWsIdRef.current === '';
    const workspaceChanged = prevActiveWsIdRef.current !== wsId;
    prevActiveWsIdRef.current = wsId || '';
    if (isInitialMount || !workspaceChanged || !wsId) return undefined;

    const focusedPanelId = focusedPanelByWorkspaceRef.current?.[wsId];
    if (focusedPanelId) {
      const windowId = resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[wsId] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
      if (!activeWindowPanelIds.includes(focusedPanelId)) {
        setFocusedPanelByWorkspace((prev) => {
          if (!prev[wsId]) return prev;
          const next = { ...prev };
          delete next[wsId];
          return next;
        });
      }
    }

    const panelIds = resolveActiveWindowPanelIds(wsId);
    const cleanupSplitSync =
      panelIds.length > 1
        ? schedulePostSplitLayoutViewportSync({
            workspaceId: wsId,
            panelIds,
          })
        : undefined;

    notifyNativeWorkspaceSurfaceSync('workspace-switch');

    return () => {
      cleanupSplitSync?.();
    };
  }, [
    activeWindowIds,
    activeWsId,
    isClientLoaded,
    notifyNativeWorkspaceSurfaceSync,
    resolveActiveWindowPanelIds,
    workspaceWindows,
  ]);

  const prevActiveWorkspaceWindowIdRef = useRef(undefined);
  const isFirstActiveWindowIdsRunRef = useRef(true);
  useEffect(() => {
    if (!isClientLoaded) return undefined;
    const isInitialMount = isFirstActiveWindowIdsRunRef.current;
    isFirstActiveWindowIdsRunRef.current = false;
    const activeWorkspaceWindowIdChanged =
      !isInitialMount && prevActiveWorkspaceWindowIdRef.current !== activeWindowIds[activeWsId];
    prevActiveWorkspaceWindowIdRef.current = activeWindowIds[activeWsId];
    if (isInitialMount) return undefined;
    // Closing/opening OTHER workspaces also mutates this map (keys get added or
    // removed), which would otherwise re-fire this effect and double up with
    // removeWorkspace's own survivor-recover burst for the same close. Only the
    // currently active workspace's own window selection changing warrants a
    // window-switch recovery here.
    if (!activeWorkspaceWindowIdChanged) return undefined;

    notifyNativeWorkspaceSurfaceSync('workspace-window-switch');

    const wsId = activeWsId;
    const panelIds = wsId ? resolveActiveWindowPanelIds(wsId) : [];
    if (typeof window === 'undefined' || !wsId || panelIds.length === 0) {
      return undefined;
    }

    const activeWindowPanelId = panelIds.includes(activePanelId) ? activePanelId : panelIds[0];

    // Dispatch a single-shot window-visible event so the destination panel runs
    // the same layout-show recovery path used by workspace tab switches. This is
    // the missing piece that made window-switch recovery weaker than workspace
    // switch recovery.
    requestAnimationFrame(() => {
      dispatchTerminalWindowVisible({
        panelIds: [activeWindowPanelId],
        workspaceId: wsId,
        reason: PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH,
      });
    });

    const legacySurvivorPanelIds = filterLegacySurvivorPanelIds(
      panelIds,
      collectEngineV2PanelIds(workspaces, workspaceWindows, activeWindowIds)
    );
    if (legacySurvivorPanelIds.length === 0) {
      syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH, wsId, panelIds);
      return undefined;
    }

    return scheduleSurvivorRecoverAfterClose({
      panelIds: legacySurvivorPanelIds,
      workspaceId: wsId,
      reason: PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH,
      onLifecycleSync: () =>
        syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH, wsId, panelIds),
      immediate: true,
      delays: SWITCH_SURVIVOR_RECOVER_DELAYS_MS,
    });
  }, [
    activePanelId,
    activeWindowIds,
    activeWsId,
    isClientLoaded,
    notifyNativeWorkspaceSurfaceSync,
    resolveActiveWindowPanelIds,
    syncPanelLifecycleLayout,
    workspaceWindows,
    workspaces,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isClientLoaded) return undefined;
    const reason = pizarraOwnsLiveSurfaces ? 'pizarra-mode-enter' : 'pizarra-mode-exit';
    notifyNativeLayoutSettled(reason);
    return undefined;
  }, [isClientLoaded, notifyNativeLayoutSettled, pizarraOwnsLiveSurfaces]);

  const panelLayoutDebounceRef = useRef(null);

  const handlePanelGroupLayout = useCallback(() => {
    if (isDraggingInternalSplit || isDraggingDock) return;

    if (panelLayoutDebounceRef.current) {
      clearTimeout(panelLayoutDebounceRef.current);
    }

    panelLayoutDebounceRef.current = setTimeout(() => {
      panelLayoutDebounceRef.current = null;
      const panelIds = activeWsId ? resolveActiveWindowPanelIds(activeWsId) : [];
      const multiPanelGrid = panelIds.length > 1 && !focusedPanelByWorkspace[activeWsId];

      if (multiPanelGrid) {
        syncPanelLifecycleLayout('panel-group-layout', activeWsId, panelIds);
        return;
      }

      notifyNativeLayoutSettled('panel-group-layout');
    }, 32);
  }, [
    activeWsId,
    focusedPanelByWorkspace,
    isDraggingDock,
    isDraggingInternalSplit,
    notifyNativeLayoutSettled,
    resolveActiveWindowPanelIds,
    syncPanelLifecycleLayout,
  ]);

  useEffect(
    () => () => {
      if (panelLayoutDebounceRef.current) {
        clearTimeout(panelLayoutDebounceRef.current);
        panelLayoutDebounceRef.current = null;
      }
    },
    []
  );

  const handleInternalSplitDragging = useCallback(
    (dragging) => {
      setIsDraggingInternalSplit(dragging);
      if (!dragging) {
        notifyNativeLayoutSettled('internal-split-drag-end');
      }
    },
    [notifyNativeLayoutSettled]
  );

  const handleDockDragging = useCallback(
    (dragging) => {
      isDraggingDockRef.current = dragging;
      setIsDraggingDock(dragging);
      if (dragging) {
        applyLiveRightDockBoundsRef.current?.();
        return;
      }

      const pendingSize = pendingDockSizeRef.current;
      if (pendingSize != null) {
        updateRightDockState({ size: pendingSize });
        pendingDockSizeRef.current = null;
      }
      syncRightDockMeasuredBoundsRef.current?.();
      notifyNativeLayoutSettled('right-dock-drag-end');
    },
    [notifyNativeLayoutSettled, updateRightDockState]
  );

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

  const findPanelInWorkspace = (workspace, panelId) => {
    if (!workspace || !panelId) return null;
    for (const column of workspace.columns || []) {
      const panel = (column.panels || []).find((candidate) => candidate.id === panelId);
      if (panel) return panel;
    }
    return null;
  };

  const schedulePanelFocusLayoutSync = useCallback(
    (workspaceId, panelIds) => {
      syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.PANEL_FOCUS, workspaceId, panelIds);
    },
    [syncPanelLifecycleLayout]
  );

  const pulsePanelNavigation = useCallback((panelId) => {
    if (!panelId) return;
    if (panelNavPulseTimeoutRef.current) {
      window.clearTimeout(panelNavPulseTimeoutRef.current);
    }
    setPanelNavPulseId(panelId);
    panelNavPulseTimeoutRef.current = window.setTimeout(() => {
      setPanelNavPulseId((current) => (current === panelId ? null : current));
    }, 150);
  }, []);

  const clearPanelFocusMode = useCallback(
    (workspaceId) => {
      if (!workspaceId) return;
      setFocusedPanelByWorkspace((prev) => {
        if (!prev[workspaceId]) return prev;
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
      const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
      const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [];
      schedulePanelFocusLayoutSync(workspaceId, panelIds);
    },
    [schedulePanelFocusLayoutSync]
  );

  const navigateToPanel = useCallback(
    (workspaceId, panelId) => {
      if (!workspaceId || !panelId) return;
      const hadFocusMode = Boolean(focusedPanelByWorkspaceRef.current[workspaceId]);
      activateWorkspacePanel(workspaceId, panelId);
      if (hadFocusMode) {
        const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
        const windows = workspaceWindowsRef.current?.[workspaceId] || [];
        const activeWindow = windows.find((win) => win.id === activeWindowId);
        const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
        if (!activeWindowPanelIds.includes(panelId)) {
          setFocusedPanelByWorkspace((prev) => {
            if (!prev[workspaceId]) return prev;
            const next = { ...prev };
            delete next[workspaceId];
            return next;
          });
        } else {
          setFocusedPanelByWorkspace((prev) => ({ ...prev, [workspaceId]: panelId }));
          const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
          const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [panelId];
          schedulePanelFocusLayoutSync(workspaceId, panelIds);
        }
      }
      pulsePanelNavigation(panelId);
    },
    [activateWorkspacePanel, pulsePanelNavigation, schedulePanelFocusLayoutSync]
  );

  const switchWorkspace = useCallback(
    (nextWorkspaceId) => {
      if (!nextWorkspaceId || nextWorkspaceId === activeWsIdRef.current) return;

      const nextWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === nextWorkspaceId
      );
      const nextPanelId = resolveWorkspacePanelId(
        nextWorkspace,
        activePanelIdsRef.current[nextWorkspaceId]
      );

      const focusedPanelId = focusedPanelByWorkspaceRef.current?.[nextWorkspaceId];
      if (focusedPanelId) {
        const windowId = resolveActiveWorkspaceWindowId(
          nextWorkspaceId,
          workspaceWindowsRef.current,
          activeWindowIdsRef.current
        );
        const windows = workspaceWindowsRef.current?.[nextWorkspaceId] || [];
        const activeWindow = windows.find((win) => win.id === windowId);
        const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
        if (!activeWindowPanelIds.includes(focusedPanelId)) {
          setFocusedPanelByWorkspace((prev) => {
            if (!prev[nextWorkspaceId]) return prev;
            const next = { ...prev };
            delete next[nextWorkspaceId];
            return next;
          });
        }
      }

      if (nextPanelId) {
        setActivePanelIds((prev) =>
          prev[nextWorkspaceId] === nextPanelId ? prev : { ...prev, [nextWorkspaceId]: nextPanelId }
        );
        pulsePanelNavigation(nextPanelId);
      }

      setActiveWsId(nextWorkspaceId);
      // Post-commit activeWsId effect emits workspace-switch layout-settled for canvas/webgl.
      // In-workspace V1/V2 switches: panels stay isVisibleInLayout=true; only the window
      // shell toggles opacity (see resolveWorkspaceWindowVisibilityStyle).
    },
    [pulsePanelNavigation]
  );

  const togglePanelFocus = useCallback(
    (workspaceId, panelId) => {
      if (!workspaceId || !panelId) return;
      setFocusedPanelByWorkspace((prev) => {
        if (prev[workspaceId] === panelId) {
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        }
        return { ...prev, [workspaceId]: panelId };
      });
      setActivePanelIds((prev) => ({ ...prev, [workspaceId]: panelId }));

      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [panelId];
      schedulePanelFocusLayoutSync(workspaceId, panelIds);
    },
    [schedulePanelFocusLayoutSync, workspaces]
  );

  const applyTerminalNavigationAction = useCallback(
    (navAction) => {
      if (!navAction || !isVisible) return false;

      const currentWorkspaceId = activeWsIdRef.current;
      const currentWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === currentWorkspaceId
      );
      const currentPanelId = resolveWorkspacePanelId(
        currentWorkspace,
        activePanelIdsRef.current[currentWorkspaceId]
      );

      if (navAction === 'togglePanelFocus') {
        if (!currentPanelId) return false;
        togglePanelFocus(currentWorkspaceId, currentPanelId);
        return true;
      }

      if (navAction === 'previousWorkspace' || navAction === 'nextWorkspace') {
        const nextWorkspaceId = getAdjacentWorkspaceId(
          workspacesRef.current,
          currentWorkspaceId,
          navAction === 'previousWorkspace' ? 'previous' : 'next'
        );
        if (!nextWorkspaceId || nextWorkspaceId === currentWorkspaceId) return false;
        const nextWorkspace = workspacesRef.current.find(
          (workspace) => workspace.id === nextWorkspaceId
        );
        const nextPanelId = resolveWorkspacePanelId(
          nextWorkspace,
          activePanelIdsRef.current[nextWorkspaceId]
        );
        switchWorkspace(nextWorkspaceId);
        return true;
      }

      if (!currentWorkspace || !currentPanelId) return false;

      const panelDirection = resolvePanelNavigationDirection(navAction);
      if (!panelDirection) return false;

      const isHorizontal = panelDirection === 'left' || panelDirection === 'right';
      const navDirection =
        panelDirection === 'left' || panelDirection === 'up' ? 'previous' : 'next';
      const navigationTarget = isHorizontal
        ? resolveHorizontalNavigation(
            workspacesRef.current,
            currentWorkspace,
            currentPanelId,
            navDirection
          )
        : resolveVerticalNavigation(
            workspacesRef.current,
            currentWorkspace,
            currentPanelId,
            navDirection
          );

      if (!navigationTarget) return false;

      if (navigationTarget.type === 'panel') {
        if (!navigationTarget.panelId || navigationTarget.panelId === currentPanelId) return false;
        navigateToPanel(currentWorkspaceId, navigationTarget.panelId);
        return true;
      }

      const nextWorkspaceId = navigationTarget.workspaceId;
      if (!nextWorkspaceId || nextWorkspaceId === currentWorkspaceId) return false;
      const nextWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === nextWorkspaceId
      );
      const nextPanelId = resolveWorkspacePanelId(
        nextWorkspace,
        activePanelIdsRef.current[nextWorkspaceId]
      );
      switchWorkspace(nextWorkspaceId);
      return true;
    },
    [isVisible, navigateToPanel, switchWorkspace, togglePanelFocus]
  );

  const syncActiveWindowSnapshot = useMemo(
    () =>
      createSyncActiveWindowSnapshot({
        setWorkspaceWindows,
        getActiveWindowIds: () => activeWindowIds,
      }),
    [activeWindowIds]
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

  const createWorkspaceWithTerminalCount = useCallback(
    (setup = {}) => {
      const setupObject = typeof setup === 'number' ? { terminalCount: setup } : setup || {};
      const safeCount = Math.max(0, Math.min(6, Number(setupObject.terminalCount) || 0));
      const rawInitialCommand = setupObject.initialCommand;
      const initialCommand =
        typeof rawInitialCommand === 'string' && rawInitialCommand.trim()
          ? rawInitialCommand.trim()
          : null;

      wsCounterRef.current += 1;
      const newWsId = `ws${wsCounterRef.current}`;
      windowCounterRef.current += 1;
      const newWindowId = `v${windowCounterRef.current}`;

      let newColumns = [];
      let firstPanelId = null;

      if (safeCount > 0) {
        const built = buildWorkspaceColumnsForTerminalCount({
          terminalCount: safeCount,
          createPanel: createPanelWithDisplayNameFactory(newWsId, () =>
            collectSiblingPanelNames(newWsId)
          ),
          allocateColumnId: () => {
            colCounterRef.current += 1;
            return `c${colCounterRef.current}`;
          },
          allocatePanelId: () => {
            panelCounterRef.current += 1;
            return `p${panelCounterRef.current}`;
          },
          initialCommand,
          panelCwd: cwd,
        });
        newColumns = built.columns;
        firstPanelId = built.firstPanelId;
      }

      setWorkspaces((prev) => [
        ...prev,
        {
          id: newWsId,
          name: `Workspace ${wsCounterRef.current}`,
          columns: newColumns,
        },
      ]);
      setActiveWsId(newWsId);
      setActivePanelIds((prev) => ({ ...prev, [newWsId]: firstPanelId }));
      setWorkspaceWindows((prev) => ({
        ...prev,
        [newWsId]: [createWindow(newWindowId, 'V1', newColumns, firstPanelId)],
      }));
      setActiveWindowIds((prev) => ({ ...prev, [newWsId]: newWindowId }));

      if (firstPanelId) {
        setTerminalRendererPreferences((prev) =>
          setPanelRendererPreference(prev, newWsId, firstPanelId, TERMINAL_RENDERER_INHERIT_MODE)
        );
      }

      const newPanelIds = newColumns.flatMap((col) => col.panels?.map((p) => p.id) || []);
      if (newPanelIds.length > 0) {
        syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED, newWsId, newPanelIds);
        // Projection burst is for shared-surface portal recovery (pizarra/swarm).
        // Workspace docks mount TerminalTTY directly — the burst only adds redundant
        // layout-settled storms that double PS1 / echo on fresh panels.
        if (isPizarraSharedViewEnabled()) {
          if (swarmProjectionBurstCleanupRef.current) {
            swarmProjectionBurstCleanupRef.current();
            swarmProjectionBurstCleanupRef.current = null;
          }
          swarmProjectionBurstCleanupRef.current = scheduleSwarmProjectionReadyBurst({
            workspaceId: newWsId,
            panelIds: newPanelIds,
          });
        }
      }
    },
    [collectSiblingPanelNames, cwd, syncPanelLifecycleLayout]
  );

  const addWorkspace = () => {
    setWorkspaceTerminalSetupOpen(true);
  };

  const removeWorkspace = async (e, idToRemove) => {
    e.stopPropagation();
    const workspaceToRemove = workspaces.find((workspace) => workspace.id === idToRemove);
    if (!workspaceToRemove || workspaces.length <= 1) return;

    const swarmLaunchIds = collectSwarmLaunchIdsForWorkspace(workspaceToRemove, storage);
    const workspaceSwarmSummary = readWorkspaceSwarmLaunchSummary(
      storage,
      workspaceToRemove,
      projectId,
      swarmControlSnapshot
    );
    if (
      workspaceSwarmSummary?.launchId &&
      !swarmLaunchIds.includes(workspaceSwarmSummary.launchId)
    ) {
      swarmLaunchIds.push(workspaceSwarmSummary.launchId);
    }
    if (swarmLaunchIds.length > 0 && projectId) {
      try {
        const terminateResults = await terminateSwarmLaunchesForWorkspace({
          workspace: workspaceToRemove,
          projectId,
          storage,
          workspaces,
        });
        terminateResults.forEach((result) => {
          if (result.ok) {
            dispatchTerminatePanelCloseEvents(result.payload);
          }
        });
        setSwarmControlSnapshot(null);
      } catch {
        // Best-effort: workspace close still proceeds.
      }
    }

    const remainingWorkspaces = workspaces.filter((workspace) => workspace.id !== idToRemove);
    const nextActiveWsId =
      activeWsId === idToRemove
        ? remainingWorkspaces[remainingWorkspaces.length - 1]?.id
        : activeWsId;
    const survivorPanelIds = remainingWorkspaces.flatMap((ws) => {
      const windowId = resolveActiveWorkspaceWindowId(ws.id, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[ws.id] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      return getPanelIdsFromColumns(activeWindow?.columns || ws.columns || []);
    });

    // TIC-1: Clean devhub_agent_runs BEFORE anything else
    // This prevents stale identity bleed into new workspaces created before React state removal
    const panelIdsToClean = getAllPanelIds(workspaceToRemove.columns);
    const activeWsWillChange = activeWsId === idToRemove;
    panelIdsToClean.forEach((panelId) => panelsClosingRef.current.add(panelId));
    try {
      const runs = JSON.parse(storage?.getItem('devhub_agent_runs') || '{}');
      const cleanedRuns = {};
      Object.entries(runs).forEach(([taskId, run]) => {
        if (!panelIdsToClean.includes(run.panelId)) {
          cleanedRuns[taskId] = run;
        }
      });
      storage?.setItem('devhub_agent_runs', JSON.stringify(cleanedRuns));
    } catch {
      // Ignore localStorage failures — cleanup is best-effort
    }

    await closeTerminalSessions(panelIdsToClean);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await closeWorkspaceBrowserWindow(idToRemove);

    setWorkspaces((prev) => {
      const newWs = prev.filter((w) => w.id !== idToRemove);
      if (newWs.length === 0) return prev;
      if (activeWsId === idToRemove) {
        setActiveWsId(newWs[newWs.length - 1].id);
      }
      return newWs;
    });
    setActivePanelIds((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setWorkspaceWindows((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setActiveWindowIds((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setTerminalRendererPreferences((prev) => {
      const next = {
        ...prev,
        workspaces: { ...prev.workspaces },
      };
      delete next.workspaces[idToRemove];
      return next;
    });
    setBrowserWindowStates((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });

    panelIdsToClean.forEach((panelId) => {
      window.setTimeout(() => panelsClosingRef.current.delete(panelId), 2000);
    });

    const legacySurvivorPanelIds = filterLegacySurvivorPanelIds(
      survivorPanelIds,
      collectEngineV2PanelIds(remainingWorkspaces, workspaceWindows, activeWindowIds)
    );

    if (typeof window !== 'undefined' && legacySurvivorPanelIds.length > 0) {
      // Closing the ACTIVE workspace lands the user on another workspace — that
      // landing IS a workspace switch, so reuse the same WORKSPACE_SWITCH lifecycle
      // burst a normal tab switch uses (handleLayoutSettled isWorkspaceSwitch branch
      // → syncTerminalViewportOnWorkspaceShow + scheduleBoundedForceRepaint retry).
      // Without this dispatch xterm destination panels relied solely on the
      // layout-show useLayoutEffect's false→true repaint, which races the async GPU
      // renderer reattach and leaves the destination black until a manual resize.
      // The burst's raf/delay phases fire after re-render (once isVisibleInLayout is
      // true) and retry the repaint until the renderer is ready. fitTerminalViewport
      // is a no-op on parked (unchanged) containers, so there is no refit/flash/SIGWINCH
      // on survivors. notifyNative=false on close-active because the activeWsId effect
      // already dispatches terminal-layout-settled; a second dispatch would double-sync.
      // terminal-engine-v2 panels skip survivor recovery — they keep the PTY alive
      // and rehydrate from the ring buffer / graveyard instead.
      const lifecycleReason = activeWsWillChange
        ? PANEL_LIFECYCLE_REASONS.WORKSPACE_SWITCH
        : PANEL_LIFECYCLE_REASONS.WORKSPACE_REMOVED;
      const lifecycleOpts = activeWsWillChange ? { notifyNative: false } : undefined;
      workspaceCloseRecoverCleanupRef.current?.();
      workspaceCloseRecoverCleanupRef.current = scheduleSurvivorRecoverAfterClose({
        panelIds: legacySurvivorPanelIds,
        workspaceId: nextActiveWsId,
        reason: lifecycleReason,
        onLifecycleSync: () =>
          syncPanelLifecycleLayout(
            lifecycleReason,
            nextActiveWsId,
            survivorPanelIds,
            lifecycleOpts
          ),
      });
    } else if (!activeWsWillChange && typeof window !== 'undefined') {
      notifyNativeLayoutSettled('workspace-removed');
    }
  };

  const handleApplyGrid = (numCols, numRows) => {
    // Close the launcher immediately. This is critical: while isGridLauncherOpen is true,
    // shouldSuspendNativeSurfaces forces suspend=true for panels (even newly created ones
    // in the just-activated ws). New grid terminals would initialize under suspend (or xterm
    // fallback), and the resume/re-inject paths for initialCommand could be skipped or
    // guards (hasSentInitialCommand) prevent the typed command (e.g. "groc"/"GROC") from
    // actually running in the launched terminals. By closing here, the batched state update
    // that creates the panels will have launcher closed => no suspend => clean native/xterm
    // open + initialCommand paste/send for *all* the selected quantity of terminals.
    setIsGridLauncherOpen(false);

    wsCounterRef.current += 1;
    const newWsId = `ws${wsCounterRef.current}`;

    const newColumns = [];
    let firstPanelId = null;

    for (let c = 0; c < numCols; c++) {
      colCounterRef.current += 1;
      const colId = `c${colCounterRef.current}`;

      const panels = [];
      for (let r = 0; r < numRows; r++) {
        panelCounterRef.current += 1;
        const panelId = `p${panelCounterRef.current}`;
        if (!firstPanelId) firstPanelId = panelId;
        panels.push(createPanel(panelId, gridCommand, cwd));
      }

      newColumns.push({
        id: colId,
        panels: panels,
      });
    }

    setWorkspaces((prev) => [
      ...prev,
      {
        id: newWsId,
        name: `Workspace ${wsCounterRef.current}`,
        columns: newColumns,
      },
    ]);
    setActiveWsId(newWsId);
    setActivePanelIds((prev) => ({ ...prev, [newWsId]: firstPanelId }));
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, newWsId, firstPanelId, TERMINAL_RENDERER_INHERIT_MODE)
    );
    const gridPanelIds = getAllPanelIds(newColumns);
    syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.PANEL_SPLIT, newWsId, gridPanelIds);
  };

  const persistAgentRunMetadata = useCallback(
    async (request, panelId, commandToRun) => {
      const { taskId, selectedAgent, launchOrigin, promptSummary, taskTitle } = request || {};
      if (!taskId || !panelId) return;
      const swarmRole = buildSwarmRoleMetadata(request);
      const restorePrefs = readWorkspaceRestorePreferences(storage);
      const sessionKind = inferPanelSessionKind({
        initialCommand: commandToRun,
        agentRun: { swarmRole: swarmRole?.roleKey, launchOrigin },
      });
      const defaultRestorePolicy = resolveEffectiveRestorePolicy({
        sessionKind,
        perSessionPolicy: null,
        preferences: restorePrefs,
      });
      const opencodeSessionId = extractOpenCodeSessionId(commandToRun);

      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
        runs[taskId] = {
          panelId,
          commandSummary: hints[taskId] || shortenCommandSummary(commandToRun),
          promptSummary: promptSummary || hints[taskId] || shortenCommandSummary(commandToRun),
          selectedAgent: selectedAgent || null,
          launchOrigin: launchOrigin || null,
          roleKey: swarmRole?.roleKey || request?.roleKey || null,
          roleLabel: swarmRole?.label || request?.roleLabel || null,
          roleAbbrev: swarmRole?.abbrev || request?.roleAbbrev || null,
          taskTitle: taskTitle || null,
          workspaceId: request?.workspaceId || null,
          runId: request?.runId || null,
          sessionId: request?.sessionId || null,
          opencodeSessionId: opencodeSessionId || runs[taskId]?.opencodeSessionId || null,
          restorePolicy: runs[taskId]?.restorePolicy || defaultRestorePolicy,
          launchedAt: Date.now(),
        };
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      } catch {
        // Ignore localStorage failures.
      }

      // Keep launch metadata local-only here; registry lifecycle is managed by control-plane flows.
    },
    [storage]
  );

  const {
    swarmLaunchWizardOpen,
    setSwarmLaunchWizardOpen,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardStep,
    swarmLaunchDraft,
    swarmLaunchSubmitState,
    setSwarmLaunchSubmitState,
    updateSwarmLaunchDraft,
    openTerminalSwarmLauncher,
    handleTerminalSwarmLaunch,
    enqueueSwarmLaunchRequest,
    createWorkspaceForSwarmLaunchRequests,
    resolvedSwarmLaunchDraft,
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

  const consumedUiProvisionKeysRef = useRef(new Set());

  const materializeSwarmWorkerInPlace = useCallback(
    async (runtimeRequest) => {
      const launchId = String(runtimeRequest?.launchId || '').trim();
      const roleKey = String(runtimeRequest?.roleKey || '').trim();
      if (!launchId || !roleKey) return false;

      const provisionKey = buildProvisionedWorkerKey(launchId, roleKey);
      if (consumedUiProvisionKeysRef.current.has(provisionKey)) return false;

      const buildPanel = (request, panelId, panelCwd) =>
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
        });

      const result = appendSwarmWorkerToWorkspace({
        workspaces: workspacesRef.current,
        runtimeRequest,
        buildPanel,
        panelCounterRef,
      });

      if (!result.ok) {
        return false;
      }

      consumedUiProvisionKeysRef.current.add(provisionKey);

      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === result.wsId
            ? {
                ...ws,
                columns: result.columns,
                swarmLaunchId: ws.swarmLaunchId || launchId,
              }
            : ws
        )
      );

      setTerminalRendererPreferences((prev) =>
        setPanelRendererPreference(
          prev,
          result.wsId,
          result.panelId,
          TERMINAL_RENDERER_INHERIT_MODE
        )
      );

      syncActiveWindowSnapshot(result.wsId, result.columns);

      await persistAgentRunMetadata(result.request, result.panelId, result.request.commandToRun);

      syncPanelLifecycleLayout(
        PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
        result.wsId,
        getPanelIdsFromColumns(result.columns)
      );

      if (projectId) {
        try {
          await fetch('/api/agenthub/operations/health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'acknowledge_swarm_ui_provision',
              launch_id: launchId,
              role_key: roleKey,
            }),
          });
        } catch {
          // Best-effort ack; duplicate poll is guarded by consumedUiProvisionKeysRef.
        }
      }

      return true;
    },
    [persistAgentRunMetadata, projectId, syncActiveWindowSnapshot, syncPanelLifecycleLayout]
  );

  useEffect(() => {
    // Poll even when TWM is not the focused view — lazy worker provision must not
    // stall until the operator returns to the terminal workspace tab.
    if (!projectId) return undefined;

    let cancelled = false;

    const pollPendingWorkerProvisions = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/agenthub/operations/health?project_id=${encodeURIComponent(projectId)}`
        );
        if (!response.ok) return;
        const payload = await response.json();
        const pending = payload?.control_room_snapshot_input?.pending_ui_provisions || [];
        for (const entry of pending) {
          if (cancelled) break;
          const runtimeRequest = entry?.runtimeRequest;
          if (!runtimeRequest) continue;
          await materializeSwarmWorkerInPlace(runtimeRequest);
        }
      } catch {
        // Polling is best-effort.
      }
    };

    void pollPendingWorkerProvisions();
    const timer = window.setInterval(pollPendingWorkerProvisions, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [materializeSwarmWorkerInPlace, projectId]);

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
      // Ignore drags that start on interactive children (close buttons, browser close).
      if (e.target.closest('button')) return;
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      pendingDragRef.current = { wsId, startX: e.clientX, startY: e.clientY };
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
      setDragOverWsId(targetWsId && targetWsId !== pending.wsId ? targetWsId : null);
    },
    [draggedWsId]
  );

  const endWorkspaceTabDrag = useCallback(() => {
    const pending = pendingDragRef.current;
    pendingDragRef.current = null;
    if (draggedWsId && dragOverWsId) {
      reorderWorkspaceTabs(draggedWsId, dragOverWsId);
    }
    setDraggedWsId(null);
    setDragOverWsId(null);
  }, [draggedWsId, dragOverWsId, reorderWorkspaceTabs]);

  const handleSplit = useCallback(
    (
      direction,
      sourcePanelId = null,
      initialCommand = null,
      panelCwd = null,
      explicitPanelId = null
    ) => {
      const targetWorkspaceId = activeWsIdRef.current || activeWsId;
      if (!targetWorkspaceId) return null;

      const targetWorkspace = workspacesRef.current.find((ws) => ws.id === targetWorkspaceId);
      const currentPanelCount = countPanelsInColumns(targetWorkspace?.columns || []);
      if (isWorkspaceTerminalPanelLimitReached(currentPanelCount)) {
        console.warn(
          `[DevHub] Terminal panel limit reached (${currentPanelCount}/${MAX_WORKSPACE_TERMINAL_PANELS})`
        );
        return null;
      }

      // Empty workspace: spawn the first panel (pizarra "Add Terminal", Zed, etc.).
      if (currentPanelCount === 0) {
        const spawned = spawnFirstTerminalPanelColumns({
          createPanel: createPanelWithDisplayNameFactory(targetWorkspaceId, () =>
            collectSiblingPanelNames(targetWorkspaceId)
          ),
          allocateColumnId: () => {
            colCounterRef.current += 1;
            return `c${colCounterRef.current}`;
          },
          allocatePanelId: () => {
            panelCounterRef.current += 1;
            return `p${panelCounterRef.current}`;
          },
          initialCommand,
          panelCwd,
          explicitPanelId,
        });
        const { columns: newColumns, panelId: newPanelId } = spawned;
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === targetWorkspaceId ? { ...ws, columns: newColumns } : ws))
        );
        setActivePanelIds((prev) => ({ ...prev, [targetWorkspaceId]: newPanelId }));
        setTerminalRendererPreferences((prev) =>
          setPanelRendererPreference(
            prev,
            targetWorkspaceId,
            newPanelId,
            TERMINAL_RENDERER_INHERIT_MODE
          )
        );
        syncActiveWindowSnapshot(targetWorkspaceId, newColumns, newPanelId);
        logPizarraBrowser('spawn-first-panel', {
          workspaceId: targetWorkspaceId,
          panelId: newPanelId,
        });
        syncPanelLifecycleLayout(
          PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
          targetWorkspaceId,
          getPanelIdsFromColumns(newColumns)
        );
        return newPanelId;
      }

      const targetId =
        sourcePanelId || activePanelIdsRef.current[activeWsIdRef.current] || activePanelId;
      if (!targetId) return null;

      // T-029b: if the caller supplies an explicitPanelId (e.g. Zed's
      // open_terminal tool result, which returns the ttyServer session id),
      // reuse it as the new panel id. This makes TerminalTTY's
      // `?sessionId=${id}` query resolve to the same PTY session the model
      // is talking to, so the visual panel shows the same output the model
      // sees. Falls back to the counter when no explicit id is provided
      // (e.g. user-driven splits).
      const newPanelId =
        typeof explicitPanelId === 'string' && explicitPanelId.length > 0
          ? explicitPanelId
          : `p${panelCounterRef.current + 1}`;
      if (newPanelId === `p${panelCounterRef.current + 1}`) {
        panelCounterRef.current += 1;
      } else {
        const explicitNumeric = /^p(\d+)$/.exec(newPanelId);
        if (explicitNumeric) {
          const n = Number(explicitNumeric[1]);
          if (Number.isFinite(n) && n > panelCounterRef.current) {
            panelCounterRef.current = n;
          }
        }
      }
      const makePanel = createPanelWithDisplayNameFactory(targetWorkspaceId, () =>
        collectSiblingPanelNames(targetWorkspaceId)
      );
      let splitSyncPanelIds = [];
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== targetWorkspaceId) return ws;

          const nextColumnsSnapshot = ws.columns.map((col) => ({
            ...col,
            panels: [...(col.panels || [])],
          }));

          const colIndex = nextColumnsSnapshot.findIndex((col) =>
            col.panels.some((p) => p.id === targetId)
          );
          if (colIndex === -1) return ws;

          const sourcePanel =
            nextColumnsSnapshot[colIndex]?.panels?.find((panel) => panel.id === targetId) || null;
          const { initialCommand: splitInitialCommand, panelCwd: splitPanelCwd } =
            resolveSplitCreatedPanelProps({
              sourcePanel,
              workspaceCwd: cwd,
              explicitInitialCommand: initialCommand,
              explicitPanelCwd: panelCwd,
            });

          if (direction === 'horizontal') {
            // Split Right: Agregar una nueva columna a la derecha
            colCounterRef.current += 1;
            const newColId = `c${colCounterRef.current}`;
            nextColumnsSnapshot.splice(colIndex + 1, 0, {
              id: newColId,
              panels: [makePanel(newPanelId, splitInitialCommand, splitPanelCwd)],
            });
          } else {
            // Split Down: Agregar un nuevo panel debajo en la misma columna
            const panelIndex = nextColumnsSnapshot[colIndex].panels.findIndex(
              (p) => p.id === targetId
            );
            const newPanels = [...nextColumnsSnapshot[colIndex].panels];
            newPanels.splice(
              panelIndex + 1,
              0,
              makePanel(newPanelId, splitInitialCommand, splitPanelCwd)
            );
            nextColumnsSnapshot[colIndex] = { ...nextColumnsSnapshot[colIndex], panels: newPanels };
          }

          splitSyncPanelIds = getPanelIdsFromColumns(nextColumnsSnapshot);
          syncActiveWindowSnapshot(targetWorkspaceId, nextColumnsSnapshot, newPanelId);
          return { ...ws, columns: nextColumnsSnapshot };
        })
      );

      setActivePanelIds((prev) => ({ ...prev, [targetWorkspaceId]: newPanelId }));
      setTerminalRendererPreferences((prev) =>
        setPanelRendererPreference(
          prev,
          targetWorkspaceId,
          newPanelId,
          TERMINAL_RENDERER_INHERIT_MODE
        )
      );
      if (splitSyncPanelIds.length > 0) {
        syncPanelLifecycleLayout(
          PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
          targetWorkspaceId,
          splitSyncPanelIds
        );
      }
      return newPanelId;
    },
    [
      activeWsId,
      activePanelId,
      collectSiblingPanelNames,
      syncActiveWindowSnapshot,
      syncPanelLifecycleLayout,
    ]
  );

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
                    updateWsDockState({
                      visible: true,
                      activeTab: 'browser',
                      maximized: true,
                      maximizedView: 'browser',
                    });
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

  const handleClosePanel = useCallback(
    async (panelIdToClose = null) => {
      const targetId = panelIdToClose || activePanelId;
      if (!targetId || !activeWorkspace) return;

      markPanelsClosing([targetId]);

      await closeTerminalSessions([targetId]);

      const nextColumnsSnapshot = activeWorkspace.columns
        .map((col) => ({
          ...col,
          panels: col.panels.filter((p) => p.id !== targetId),
        }))
        .filter((col) => col.panels.length > 0); // Eliminar columnas vacías

      const survivorPanelIds = getPanelIdsFromColumns(nextColumnsSnapshot);
      const windowResolution = resolveWorkspaceWindowAfterPanelClose({
        windows: workspaceWindows[activeWsId] || [],
        activeWindowId: activeWindowIds[activeWsId],
        remainingPanelIds: survivorPanelIds,
      });

      if (windowResolution.action === 'remove') {
        setWorkspaceWindows((prev) => ({
          ...prev,
          [activeWsId]: windowResolution.windows,
        }));
        setActiveWindowIds((prev) => ({
          ...prev,
          [activeWsId]: windowResolution.activeWindowId,
        }));

        const switchedColumns = windowResolution.nextActiveWindow?.columns || [];
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === activeWsId ? { ...ws, columns: switchedColumns } : ws))
        );

        const switchedPanelIds = getPanelIdsFromColumns(switchedColumns);
        if (switchedPanelIds.length > 0) {
          syncPanelLifecycleLayout(
            PANEL_LIFECYCLE_REASONS.PANEL_CLOSED,
            activeWsId,
            switchedPanelIds
          );
        }

        if (activePanelId === targetId) {
          setActivePanelIds((p) => ({
            ...p,
            [activeWsId]: windowResolution.nextPanelId,
          }));
        }
      } else {
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === activeWsId ? { ...ws, columns: nextColumnsSnapshot } : ws))
        );

        if (survivorPanelIds.length > 0) {
          syncPanelLifecycleLayout(
            PANEL_LIFECYCLE_REASONS.PANEL_CLOSED,
            activeWsId,
            survivorPanelIds
          );
        }

        const fallbackPanel = nextColumnsSnapshot.flatMap((col) => col.panels || [])[0]?.id || null;
        if (activePanelId === targetId) {
          setActivePanelIds((p) => ({ ...p, [activeWsId]: fallbackPanel }));
        }
        syncActiveWindowSnapshot(activeWsId, nextColumnsSnapshot, fallbackPanel);
      }
      setFocusedPanelByWorkspace((prev) => {
        if (prev[activeWsId] !== targetId) return prev;
        const next = { ...prev };
        delete next[activeWsId];
        return next;
      });

      setTerminalRendererPreferences((prev) => {
        const workspacePref = prev.workspaces?.[activeWsId];
        if (!workspacePref) return prev;

        const nextPanels = { ...(workspacePref.panels || {}) };
        delete nextPanels[targetId];

        return {
          ...prev,
          workspaces: {
            ...prev.workspaces,
            [activeWsId]: {
              ...workspacePref,
              panels: nextPanels,
            },
          },
        };
      });

      // When a panel closes, mark any associated OC session as terminated
      // so Agent Room Activity updates correctly on next poll (5s)
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const matchingRunKey = Object.keys(runs).find((k) => runs[k]?.panelId === targetId);
        if (matchingRunKey) {
          const run = runs[matchingRunKey];
          // If it was an OpenCode session, write to terminated list
          if (run?.opencodeSessionId) {
            const terminated = JSON.parse(localStorage.getItem('devhub_oc_terminated') || '{}');
            terminated[run.opencodeSessionId] = Date.now();
            localStorage.setItem('devhub_oc_terminated', JSON.stringify(terminated));
          }
          // Also mark in agent_registry if projectId available
          if (projectId) {
            const db = createClient();
            await db
              .from('agent_registry')
              .update({ status: 'idle', updated_at: new Date().toISOString() })
              .eq('agent_id', matchingRunKey);
          }
        }
      } catch {
        // Non-critical
      }
    },
    [
      activeWorkspace,
      activeWsId,
      activePanelId,
      activeWindowIds,
      markPanelsClosing,
      projectId,
      syncActiveWindowSnapshot,
      syncPanelLifecycleLayout,
      workspaceWindows,
    ]
  );

  const clearClosePanelShortcutArm = useCallback(() => {
    if (closePanelShortcutArmTimerRef.current) {
      window.clearTimeout(closePanelShortcutArmTimerRef.current);
      closePanelShortcutArmTimerRef.current = null;
    }
    closePanelShortcutArmedRef.current = null;
    setShortcutHint(null);
  }, []);

  const tryClosePanelWithDoubleShortcut = useCallback(
    (panelId) => {
      if (!panelId) return false;

      const now = Date.now();
      const armed = closePanelShortcutArmedRef.current;
      if (armed && armed.panelId === panelId && armed.expiresAt > now) {
        clearClosePanelShortcutArm();
        handleClosePanel(panelId);
        return true;
      }

      if (closePanelShortcutArmTimerRef.current) {
        window.clearTimeout(closePanelShortcutArmTimerRef.current);
      }

      closePanelShortcutArmedRef.current = {
        panelId,
        expiresAt: now + CLOSE_PANEL_SHORTCUT_ARM_MS,
      };
      setShortcutHint('Pulsa Ctrl+Shift+W de nuevo para cerrar esta terminal');
      closePanelShortcutArmTimerRef.current = window.setTimeout(() => {
        if (closePanelShortcutArmedRef.current?.panelId === panelId) {
          clearClosePanelShortcutArm();
        }
      }, CLOSE_PANEL_SHORTCUT_ARM_MS);

      return true;
    },
    [clearClosePanelShortcutArm, handleClosePanel]
  );

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
  const registry = useWorkspaceSurfaceRegistry(projectId, activeWorkspace?.id);

  // Distinguishes the single dedicated/detached browser window (tied to
  // browserWindowState.open + WebviewWindow) from independent embedded
  // browser *surfaces* that live only inside a pizarra canvas.
  const isDedicatedBrowserSurface = useCallback(
    (s) => {
      if (!activeWorkspace?.id) return false;
      const wid = activeWorkspace.id;
      return s.id === `shape-browser-${wid}` || s.panelId === `browser-${wid}`;
    },
    [activeWorkspace?.id]
  );

  const registryAddSurface = useCallback(
    (surface) => {
      if (!activeWorkspace) return null;

      // Check if we need to split or open a browser
      if (surface.type === 'terminal' && !surface.panelId) {
        // Create new terminal panel (also when workspace has zero panels).
        const newPanelId = handleSplit('horizontal');
        logPizarraBrowser('registry-add-terminal', {
          workspaceId: activeWorkspace.id,
          newPanelId,
          panelCount: countPanelsInColumns(activeWorkspace.columns || []),
        });
        if (newPanelId) {
          const panelLabel = resolvePanelSurfaceLabel(
            {
              id: newPanelId,
              displayName: getPanelDisplayNameFromStore(newPanelId, activeWorkspace.id),
            },
            activeWorkspace.id
          );
          const finalSurface = {
            ...surface,
            id: `shape-term-${newPanelId}`,
            panelId: newPanelId,
            label: panelLabel,
            pizarra: {
              ...surface.pizarra,
              visible: true,
            },
          };
          registry.addSurface(finalSurface);
          if (
            effectiveRightDockState?.maximized &&
            effectiveRightDockState?.maximizedView === 'pizarra' &&
            typeof window !== 'undefined'
          ) {
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
            }, 400);
          }
          return finalSurface;
        }
        logPizarraBrowser('registry-add-terminal:failed', {
          workspaceId: activeWorkspace.id,
        });
        return null;
      } else if (surface.type === 'browser' && !surface.panelId) {
        // Pizarra embedded browser surface (independent card on the canvas).
        // Do NOT touch browserWindowState 'open' — that exclusively drives the
        // detached dedicated "alternativo" WebviewWindow and its auto-injection
        // into pizarra. Setting it caused reconcile to force false (no window)
        // and the filter to prune the surface we just added.
        const unique = `piz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const finalSurface = {
          ...surface,
          id: `shape-browser-${unique}`,
          panelId: `pizarra-browser-${unique}`,
          label: surface.label || 'Browser',
          url: surface.url || 'http://localhost:3000/',
          pizarra: {
            ...surface.pizarra,
            visible: true,
          },
        };
        registry.addSurface(finalSurface);
        return finalSurface;
      } else {
        registry.addSurface(surface);
        return surface;
      }
    },
    [activeWorkspace, handleSplit, registry.addSurface, effectiveRightDockState]
  );

  const registryRemoveSurface = useCallback(
    (id) => {
      if (!activeWorkspace) return;
      const surface = registry.surfaces.find((s) => s.id === id);
      if (!surface) return;

      if (surface.type === 'terminal') {
        handleClosePanel(surface.panelId);
      } else if (surface.type === 'browser') {
        // Only close dedicated for the canonical ws surface (the one that
        // represents the detached alternative browser). Pizarra-only cards
        // must not affect it.
        if (isDedicatedBrowserSurface(surface)) {
          closeWorkspaceBrowserWindow(activeWorkspace.id);
        }
      }
      registry.removeSurface(id);
    },
    [
      activeWorkspace,
      registry.surfaces,
      registry.removeSurface,
      handleClosePanel,
      closeWorkspaceBrowserWindow,
      isDedicatedBrowserSurface,
    ]
  );

  const registryUpdateSurface = useCallback(
    (id, patch) => {
      if (!patch || typeof patch !== 'object') return;

      if (patch.requestedRendererMode && activeWorkspace) {
        const surface = registry.surfaces.find((s) => s.id === id);
        if (surface && surface.type === 'terminal' && surface.panelId) {
          handleSetPanelRenderer(activeWorkspace.id, surface.panelId, patch.requestedRendererMode);
        }
      }

      registry.updateSurface(id, patch);
    },
    [activeWorkspace, registry.surfaces, registry.updateSurface, handleSetPanelRenderer]
  );

  const registryValue = useMemo(
    () => ({
      surfaces: registry.surfaces,
      isLoaded: registry.isLoaded,
      addSurface: registryAddSurface,
      removeSurface: registryRemoveSurface,
      updatePizarraLayout: registry.updatePizarraLayout,
      updateSurface: registryUpdateSurface,
      resetSurfaces: registry.resetSurfaces,
    }),
    [
      registry.surfaces,
      registry.isLoaded,
      registryAddSurface,
      registryRemoveSurface,
      registry.updatePizarraLayout,
      registryUpdateSurface,
      registry.resetSurfaces,
    ]
  );

  // Auto-register terminal panels (all workspace windows) and browser into the registry.
  useEffect(() => {
    if (!registry.isLoaded || !activeWorkspace) return;

    const wsId = activeWorkspace.id;
    const windows = workspaceWindows[wsId] || [];
    const activeWindowId = activeWindowIds[wsId] || windows[0]?.id || null;

    const { terminals: builtTerminals } = buildTerminalSurfacesFromWindows({
      workspaceId: wsId,
      windows,
      activeWindowId,
      liveColumns: activeWorkspace.columns,
      resolveRequestedRenderer: ({ workspaceId, panelId, prefs }) =>
        resolveRequestedRenderer({ workspaceId, panelId, prefs }),
      terminalRendererPreferences,
      resolveLabel: (panel) => resolvePanelSurfaceLabel(panel, wsId),
    });

    const terminals = builtTerminals;

    // 2. Browser surface for the workspace — only include if the ws "browser is open"
    // (controlled by dock/browser state in normal view, or set via pizarra close).
    // This allows: close browser card in pizarra (sets open=false + removes surface) =>
    // when switch back to normal, browser is not open by default (minimized/closed).
    // Carry happens because when open in normal, surface is registered; pizarra picks it
    // via registry for the card (with layout). Pizarra-only extra browsers (from "Add Browser")
    // are separate and not re-added by this reconcile.
    const browserOpen = browserWindowStates?.[activeWorkspace.id]?.open === true;
    const browsers = [];
    if (browserOpen) {
      const browserState = browserWindowStates?.[activeWorkspace.id] || {};
      const layoutPriority = browserState?.pizarraLayoutPriority === true;
      browsers.push({
        id: `shape-browser-${activeWorkspace.id}`,
        type: 'browser',
        panelId: `browser-${activeWorkspace.id}`,
        label: browserState?.label || `Browser ${activeWorkspace.id}`,
        url: browserState?.url || 'http://localhost:3000/',
        pizarra: {
          x: null, // pizarra side will assign initial spread position
          y: null,
          width: 1024,
          height: 700,
          visible: true,
          ...(layoutPriority ? { layoutPriority: true } : {}),
        },
      });
    }

    const activeSurfaces = [...terminals, ...browsers];

    // Reconcile
    let changed = false;
    const nextSurfaces = [...registry.surfaces];

    activeSurfaces.forEach((as) => {
      const existing = nextSurfaces.find(
        (s) => s.id === as.id || (as.panelId && s.panelId === as.panelId)
      );
      if (!existing) {
        nextSurfaces.push(as);
        changed = true;
      } else {
        let itemChanged = false;
        if (existing.label !== as.label) {
          existing.label = as.label;
          itemChanged = true;
        }
        if (as.type === 'browser' && existing.url !== as.url) {
          existing.url = as.url;
          itemChanged = true;
        }
        if (as.type === 'browser' && as.pizarra) {
          const prevPizarra = existing.pizarra || {};
          const nextPizarra = {
            ...prevPizarra,
            ...as.pizarra,
            visible: as.pizarra.visible !== false ? true : prevPizarra.visible,
          };
          const pizarraChanged =
            prevPizarra.visible !== nextPizarra.visible ||
            prevPizarra.layoutPriority !== nextPizarra.layoutPriority;
          if (pizarraChanged) {
            existing.pizarra = nextPizarra;
            itemChanged = true;
          }
        }
        if (
          as.requestedRendererMode &&
          existing.requestedRendererMode !== as.requestedRendererMode
        ) {
          existing.requestedRendererMode = as.requestedRendererMode;
          itemChanged = true;
        }
        const nextViewId = as.pizarra?.viewId;
        if (nextViewId && existing.pizarra?.viewId !== nextViewId) {
          existing.pizarra = { ...(existing.pizarra || {}), viewId: nextViewId };
          itemChanged = true;
        }
        if (itemChanged) {
          changed = true;
        }
      }
    });

    const finalSurfaces = nextSurfaces.filter((s) => {
      const stillExists = activeSurfaces.some(
        (as) => as.id === s.id || (s.panelId && as.panelId === s.panelId)
      );
      if (stillExists) return true;

      // Preserve pizarra-only browser surfaces (the ones added by "Add Browser"
      // in the canvas, with pizarra- ids). They are not backed by workspace
      // panels or the dedicated open flag, so must not be pruned by reconcile.
      // (Terminals without backing panel are always dropped.)
      if (s.type === 'browser' && !isDedicatedBrowserSurface(s)) {
        return true;
      }

      changed = true;
      return false;
    });

    if (changed) {
      try {
        registry.resetSurfaces(finalSurfaces);
      } catch (err) {
        console.error('[TerminalWorkspacesManager] registry reconcile failed:', err);
      }
    }

    const browserSurfaces = finalSurfaces.filter((s) => s.type === 'browser');
    if (browserWindowStates?.[activeWorkspace.id]?.open === true) {
      logPizarraBrowser('registry-reconcile', {
        workspaceId: activeWorkspace.id,
        terminalCount: terminals.length,
        browserCount: browserSurfaces.length,
        browsers: browserSurfaces.map((b) => ({
          id: b.id,
          panelId: b.panelId,
          visible: b.pizarra?.visible,
          layoutPriority: b.pizarra?.layoutPriority,
        })),
      });
    }
  }, [
    activeWorkspace,
    activeWindowIds,
    workspaceWindows,
    browserWindowStates,
    registry.isLoaded,
    registry.surfaces,
    registry.resetSurfaces,
    isDedicatedBrowserSurface,
    terminalRendererPreferences,
  ]);

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
    },
    [removeReopenRun]
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

  useEffect(() => () => clearClosePanelShortcutArm(), [clearClosePanelShortcutArm]);

  // --- Persist OpenCode session ID per panel so it auto-restores after reboot ---
  // When ttyServer detects that a panel is running OpenCode (via input or output), it
  // broadcasts the session ID via WebSocket → TerminalTTY emits a DOM event → here we
  // update the panel's initialCommand so localStorage saves the correct restore command.
  useEffect(() => {
    const handleOpenCodeSessionDetected = (e) => {
      const { panelId, sessionId } = e.detail || {};
      if (!panelId || !sessionId) return;
      if (panelsClosingRef.current.has(panelId)) return;

      const panelEntry = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);

      if (!panelEntry) return;

      const panelAgentRun = readAgentRunsByPanel(storage)[panelId] || null;
      if (!shouldPersistOpenCodeSessionForPanel(panelEntry, panelAgentRun)) return;

      let runMetadata = null;
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const taskEntry = Object.entries(runs || {}).find(
          ([, value]) => value?.panelId === panelId
        );
        runMetadata = taskEntry?.[1] || null;

        // Persist opencodeSessionId to devhub_agent_runs so the restore manifest can
        // identify this panel as opencode-durable without relying on the async
        // useEffect flush of initialCommand to devhub_terminal_state.
        // This fixes a race condition where the app crashes before the flush,
        // causing restore to treat the session as shell-ephemeral (no command).
        if (taskEntry?.[0]) {
          const restorePrefs = readWorkspaceRestorePreferences(storage);
          const sessionKind = inferPanelSessionKind({
            initialCommand: `opencode --session ${sessionId}`,
            agentRun: runs[taskEntry[0]],
          });
          const defaultRestorePolicy = resolveEffectiveRestorePolicy({
            sessionKind,
            perSessionPolicy: null,
            preferences: restorePrefs,
          });
          runs[taskEntry[0]] = {
            ...runs[taskEntry[0]],
            opencodeSessionId: sessionId,
            restorePolicy: runs[taskEntry[0]]?.restorePolicy || defaultRestorePolicy,
          };
          localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
        }

        if (
          runMetadata?.launchOrigin === 'swarm-control-launch' &&
          runMetadata?.sessionId &&
          runMetadata?.workspaceId &&
          runMetadata?.runId
        ) {
          fetch(`/api/agenthub/sessions/${runMetadata.sessionId}/binding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: runMetadata.workspaceId,
              run_id: runMetadata.runId,
              opencode_session_id: sessionId,
            }),
          }).catch(() => {});
        }
      } catch {
        // Ignore best-effort canonical reconciliation failures in UI layer.
      }

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (pending) {
        if (pending.sessionId !== sessionId) {
          failPendingReopen(panelId);
          return;
        }

        pendingReopenPanelsRef.current.delete(panelId);
        setReopenActionError(null);
      }

      const priorPanel = panelEntry;
      const nextWorkspaces = workspacesRef.current.map((ws) => ({
        ...ws,
        columns: ws.columns.map((col) => ({
          ...col,
          panels: col.panels.map((p) => {
            if (p.id !== panelId) return p;
            const newCommand = `opencode --session ${sessionId}`;
            if (p.initialCommand === newCommand) return p;
            if (!shouldPersistOpenCodeSessionForPanel(p, panelAgentRun)) return p;
            return { ...p, initialCommand: newCommand };
          }),
        })),
      }));

      logTerminalSession('opencode-session-detected', {
        panelId,
        sessionId,
        priorCommand: priorPanel?.initialCommand || null,
        nextCommand: `opencode --session ${sessionId}`,
      });

      flushTerminalSessionPersistence(storage, {
        workspaces: nextWorkspaces,
        activeWsId: activeWsIdRef.current,
        activePanelIds: activePanelIdsRef.current,
        workspaceWindows: workspaceWindowsRef.current,
        activeWindowIds: activeWindowIdsRef.current,
        projectId,
        appSessionId: `opencode-detect-${sessionId}`,
        agentRunsByPanel: readAgentRunsByPanel(storage),
      });

      setWorkspaces(nextWorkspaces);
    };

    const handleTerminalExit = (e) => {
      const { id: panelId, initialCommand } = e.detail || {};
      if (!panelId) return;

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (!pending) return;
      if (initialCommand && pending.command && initialCommand !== pending.command) return;

      failPendingReopen(panelId);
    };

    // Opens the terminal settings modal when the gear icon is clicked on a suspended panel.
    const handleTerminalSettingsModalRequested = (e) => {
      const { panelId } = e.detail || {};
      if (!panelId) return;

      let sessionId = null;
      let cwd = null;
      let sessionType = 'opencode-durable';

      for (const ws of workspacesRef.current) {
        for (const col of ws.columns) {
          const panel = col.panels.find((p) => p.id === panelId);
          if (panel) {
            cwd = panel.cwd;
            const sessionMatch = (panel.initialCommand || '').match(
              /opencode\s+--session\s+([\w-]+)/i
            );
            sessionId = sessionMatch ? sessionMatch[1] : null;
            if ((panel.initialCommand || '').includes('opencode')) {
              sessionType = 'opencode-durable';
            } else if ((panel.initialCommand || '').includes('pty')) {
              sessionType = 'pty-durable';
            } else {
              sessionType = 'shell-ephemeral';
            }
            break;
          }
        }
        if (sessionId) break;
      }

      setTerminalSettingsModal({
        open: true,
        panelId,
        sessionId: sessionId || panelId,
        cwd,
        sessionType,
        restorePolicy: 'manual',
      });
    };

    // Handles manual session revival (overlay "Continuar" or settings modal).
    const handleManualReviveRequested = (e) => {
      const { panelId, sessionId: hintSessionId } = e.detail || {};
      if (!panelId) return;

      const panel = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);

      const agentRun = readAgentRunsByPanel(storage)[panelId] || null;
      const sessionKind = inferPanelSessionKind({
        initialCommand: panel?.initialCommand,
        agentRun,
        panel,
      });

      const clearSuspended = () => {
        setReopenActionError(null);
        setPanelRestoreModes((prev) => {
          const next = { ...prev };
          delete next[panelId];
          return next;
        });
      };

      if (sessionKind === 'opencode') {
        const opencodeSessionId = resolveOpenCodeSessionIdForPanel({
          panel,
          agentRun,
          hintSessionId,
        });

        if (!opencodeSessionId) {
          setReopenActionError(
            'No se encontró un id de sesión OpenCode guardado. Abrí una sesión nueva o usá política automática.'
          );
          return;
        }

        clearSuspended();
        applyPanelRelaunchCommand(
          panelId,
          `opencode --session ${opencodeSessionId}`,
          panel?.cwd || null,
          { forceBump: true, emitEvent: false }
        );
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
        );
        return;
      }

      // Swarm: tmux reattach happens in ttyServer on connect — no launch wrapper replay.
      if (sessionKind === 'swarm') {
        clearSuspended();
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
        );
        return;
      }

      // Shell genérico: reconectar en cwd (sin opencode --session).
      clearSuspended();
      const shellCommand = String(panel?.initialCommand || '')
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();

      if (shellCommand) {
        applyPanelRelaunchCommand(panelId, shellCommand, panel?.cwd || null, {
          forceBump: true,
          emitEvent: false,
        });
      }

      window.dispatchEvent(
        new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
      );
    };

    const handleSwarmLaunchWrapperSent = (e) => {
      const { panelId } = e.detail || {};
      if (!panelId) return;

      let panel = null;
      for (const workspace of workspacesRef.current || []) {
        for (const column of workspace?.columns || []) {
          panel = (column.panels || []).find((candidate) => candidate.id === panelId) || null;
          if (panel) break;
        }
        if (panel) break;
      }
      if (panel?.swarmContext?.launchId && panel?.swarmContext?.roleKey) {
        markSwarmLaunchWrapperDispatched(
          {
            launchId: panel.swarmContext.launchId,
            roleKey: panel.swarmContext.roleKey,
            panelId,
          },
          storage
        );
      }

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId || !p.swarmContext?.needsLaunchWrapper) return p;
              return {
                ...p,
                swarmContext: {
                  ...p.swarmContext,
                  needsLaunchWrapper: false,
                },
              };
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
                if (p.id !== panelId || !p.swarmContext?.needsLaunchWrapper) return p;
                return {
                  ...p,
                  swarmContext: {
                    ...p.swarmContext,
                    needsLaunchWrapper: false,
                  },
                };
              }),
            })),
          }));
          storage?.setItem(terminalStateStorageKey, JSON.stringify(savedState));
        }
      } catch {
        // Best-effort persistence only.
      }
    };

    window.addEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
    window.addEventListener('devhub:terminal-exit', handleTerminalExit);
    window.addEventListener('devhub:swarm-launch-wrapper-sent', handleSwarmLaunchWrapperSent);

    // Session recovery: relaunch orphaned opencode sessions
    const handleRelaunchPanel = (e) => {
      const { panelId, command, cwd, reason } = e.detail || {};
      if (!panelId || !command) return;

      if (relaunchInFlightRef.current.has(panelId)) return;

      logTerminalSession('session-recovery-relaunch-event', {
        panelId,
        command,
        cwd,
        reason,
      });

      // Startup restore already persisted the bumped command; avoid double-apply.
      if (reason === 'panel-relaunch') return;

      const panel = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);
      const agentRun = readAgentRunsByPanel(storage)[panelId] || null;
      if (
        inferPanelSessionKind({
          initialCommand: command,
          agentRun,
          panel,
        }) === 'swarm'
      ) {
        return;
      }

      // Update the panel's initialCommand to force TerminalTTY to reconnect
      // We append a timestamp to ensure the command is "new" and triggers reconnection
      const recoveryCommand = `${command} #recovery-${Date.now()}`;

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId) return p;
              return { ...p, initialCommand: recoveryCommand, cwd: cwd || p.cwd };
            }),
          })),
        }))
      );

      // Also update localStorage immediately so the recovery persists
      try {
        const savedState = JSON.parse(storage?.getItem(terminalStateStorageKey) || '{}');
        if (savedState.workspaces) {
          savedState.workspaces = savedState.workspaces.map((ws) => ({
            ...ws,
            columns: ws.columns.map((col) => ({
              ...col,
              panels: col.panels.map((p) => {
                if (p.id !== panelId) return p;
                return { ...p, initialCommand: recoveryCommand, cwd: cwd || p.cwd };
              }),
            })),
          }));
          storage?.setItem(terminalStateStorageKey, JSON.stringify(savedState));
        }
      } catch {
        // Ignore persistence failures
      }
    };

    window.addEventListener('devhub:relaunch-panel', handleRelaunchPanel);
    window.addEventListener(
      'devhub:terminal-settings-modal-requested',
      handleTerminalSettingsModalRequested
    );
    window.addEventListener('devhub:manual-revive-requested', handleManualReviveRequested);

    return () => {
      window.removeEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
      window.removeEventListener('devhub:terminal-exit', handleTerminalExit);
      window.removeEventListener('devhub:swarm-launch-wrapper-sent', handleSwarmLaunchWrapperSent);
      window.removeEventListener('devhub:relaunch-panel', handleRelaunchPanel);
      window.removeEventListener(
        'devhub:terminal-settings-modal-requested',
        handleTerminalSettingsModalRequested
      );
      window.removeEventListener('devhub:manual-revive-requested', handleManualReviveRequested);
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    failPendingReopen,
    handleClosePanel,
    projectId,
    storage,
    terminalStateStorageKey,
  ]);

  // --- Window Controls (for integrated titlebar) ---
  const getTauriWindow = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);

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
    await win?.toggleMaximize().catch(() => {});
  }, [getTauriWindow]);

  const handleWinClose = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.close().catch(() => {});
  }, [getTauriWindow]);

  const activeWorkspacePanelCount = activeWorkspace
    ? getAllPanelIds(activeWorkspace.columns).length
    : 0;
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
          } catch (err) {
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
              className="flex items-center min-h-[42px] bg-[var(--surface-app)] select-none shrink-0 px-2 gap-1.5"
              style={{
                ...getWorkspaceShellChromeStyle(),
                ...getWorkspaceTopBarStyle(),
              }}
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
                    rightDockState.activeTab === 'browser' && rightDockState.visible
                      ? 'true'
                      : 'false'
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
                    rightDockState.activeTab === 'editor' && rightDockState.visible
                      ? 'true'
                      : 'false'
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
                    rightDockState.activeTab === 'swarm' && rightDockState.visible
                      ? 'true'
                      : 'false'
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

                    {!isLoadingResumableSessions &&
                      resumableStatus === 'error' &&
                      resumableError && (
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
                        <div className="px-2 py-3 text-xs text-gray-400">
                          No recent sessions found.
                        </div>
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
                className="flex items-center h-full shrink-0 gap-2.5 ml-2 pl-2 border-l border-[rgba(255,255,255,0.07)]"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <button
                  onClick={handleWinMinimize}
                  className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#2f323e] hover:bg-[#434857] transition-colors"
                  title="Minimize"
                >
                  <Minus
                    className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
                    strokeWidth={3}
                  />
                </button>
                <button
                  onClick={handleWinToggleMaximize}
                  className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#464a57] hover:bg-[#5b6070] transition-colors"
                  title={isWinMaximized ? 'Restore' : 'Maximize'}
                >
                  <Plus
                    className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
                    strokeWidth={3}
                  />
                </button>
                <button
                  onClick={handleWinClose}
                  className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#B80096] hover:bg-[#D600AE] transition-colors"
                  title="Close"
                >
                  <X className="w-2.5 h-2.5 text-black stroke-[3px]" />
                </button>
              </div>
            </div>

            {/* Persistent Grid Area */}
            <div
              key="workspace-grid-shell"
              className="flex-1 flex bg-[#080b12] relative overflow-hidden"
            >
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
                      const workspaceGridKey = buildStableWorkspaceShellKey(
                        'workspace-grid',
                        ws.id
                      );
                      const wsDockState =
                        activeWsId === ws.id
                          ? effectiveRightDockState
                          : { ...DEFAULT_RIGHT_DOCK_STATE };
                      const updateWsDockState = updateRightDockState;
                      const focusedPanelId = focusedPanelByWorkspace[ws.id];
                      const isWorkspaceVisibleInLayout =
                        !isFullscreenBrowser && activeWsId === ws.id && isVisible;
                      const shouldSuspendWorkspaceNativeSurfaces =
                        isWorkspaceVisibleInLayout && shouldSuspendNativeSurfaces;
                      const totalTerminalPanelCount = resolveWorkspaceVisibleTerminalPanelCount(
                        ws.columns
                      );
                      const visibleTerminalPanelCount = focusedPanelId
                        ? 1
                        : totalTerminalPanelCount;
                      const activeWindowIdForLayout = resolveActiveWorkspaceWindowId(
                        ws.id,
                        workspaceWindows,
                        activeWindowIds
                      );
                      const activeWindowForLayout =
                        workspaceWindows?.[ws.id]?.find((w) => w.id === activeWindowIdForLayout) ||
                        null;
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
                            panelRenderOptions.isWorkspaceShellVisible ??
                            isWorkspaceVisibleInLayout,
                          visibleTerminalPanelCount:
                            panelRenderOptions.visibleTerminalPanelCount ??
                            visibleTerminalPanelCount,
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
                          onResetRendererToXterm: () =>
                            handleResetPanelRendererToXterm(ws.id, panel.id),
                          onSetPanelRenderer: (mode) =>
                            handleSetPanelRenderer(ws.id, panel.id, mode),
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
                      willChange: isDraggingDock
                        ? 'left, width, transform, opacity'
                        : 'transform, opacity',
                    }}
                  >
                    <WorkspaceRightDock
                      project={{ id: projectId, local_path: cwd }}
                      workspaceId={activeWorkspace.id}
                      dockState={effectiveRightDockState}
                      onDockStateChange={updateRightDockState}
                      browserWindowState={browserWindowStates?.[activeWorkspace.id] || null}
                      onBrowserWindowStateChange={updateBrowserWindowState}
                      workspaceWindows={workspaceWindows?.[activeWorkspace.id] || []}
                      activeWorkspaceWindowId={activeWindowIds?.[activeWorkspace.id] || null}
                      onWorkspaceWindowSelect={(windowId) => {
                        const pizarraTabActive =
                          pizarraOwnsLiveSurfaces ||
                          effectiveRightDockState.activeTab === 'pizarra';
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
                          updateRightDockState((current) =>
                            applyWorkspaceWindowSelectDockState(current)
                          );
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
            />
          </motion.div>
        </SharedDockStoreProvider>
      </SharedSurfacesProvider>
    </WorkspaceSurfaceRegistryProvider>
  );
}

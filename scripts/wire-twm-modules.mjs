import fs from 'fs';
import path from 'path';

const twmPath = path.resolve('src/components/TerminalWorkspacesManager.jsx');
let src = fs.readFileSync(twmPath, 'utf8');

// 1. Add imports
const importAnchor = `import WorkspaceWindowSwitcher, {
  MAX_WORKSPACE_WINDOWS,
} from './terminal/components/WorkspaceWindowSwitcher';`;
const importBlock = `${importAnchor}
import WorkspaceWindowTabBar from './terminal/components/WorkspaceWindowTabBar';
import WorkspaceTerminalSurface from './terminal/components/WorkspaceTerminalSurface';
import useRightDockController from './terminal/hooks/useRightDockController';
import useWorkspaceWindowsController from './terminal/hooks/useWorkspaceWindowsController';
import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';`;
if (!src.includes('useRightDockController')) {
  src = src.replace(importAnchor, importBlock);
}

// 2. Re-exports for test backward compat
const reexportBlock = `export { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';
export {
  resolveRightDockLayerStyle,
  resolveMeasuredRightDockBounds,
} from './terminal/hooks/useRightDockController';

export default function TerminalWorkspacesManager`;
src = src.replace('export default function TerminalWorkspacesManager', reexportBlock);

// 3. Remove inline renderWorkspacePanel
src = src.replace(
  /export function renderWorkspacePanel\([\s\S]*?\n\}\n\nfunction getWorkspaceTabStyle/,
  'function getWorkspaceTabStyle'
);

// 4. Remove inline resolveRightDock helpers (duplicate of re-export)
src = src.replace(
  /export function resolveRightDockLayerStyle\([\s\S]*?\n\}\n\nexport default function TerminalWorkspacesManager/,
  'export default function TerminalWorkspacesManager'
);

// Fix double export default if re-export created issue
src = src.replace(
  /export \{ renderWorkspacePanel \}[\s\S]*?export default function TerminalWorkspacesManager/,
  (match) => match
);

// 5. Remove swarm wizard state declarations
src = src.replace(
  /  const \[swarmLaunchWizardOpen, setSwarmLaunchWizardOpen\] = useState\(false\);\n\n  const \[terminalSettingsModal/,
  '  const [terminalSettingsModal'
);
src = src.replace(
  /  const \[swarmLaunchWizardStep, setSwarmLaunchWizardStep\] = useState\('team'\);\n  const \[swarmLaunchDraft, setSwarmLaunchDraft\] = useState\(null\);\n  const \[swarmLaunchSubmitState, setSwarmLaunchSubmitState\] = useState\(\{\n    submitting: false,\n    error: null,\n  \}\);\n/,
  ''
);

// 6. Remove right dock + workspace windows state (hook-owned)
src = src.replace(
  /  const \[rightDockState, setRightDockState\] = useState\(\(\) => \(\{ \.\.\.DEFAULT_RIGHT_DOCK_STATE \}\)\);\n  const \[rightDockMeasuredBounds, setRightDockMeasuredBounds\] = useState\(null\);\n  const \[hasMountedRightDock, setHasMountedRightDock\] = useState\(false\);\n  const \[isDraggingDock, setIsDraggingDock\] = useState\(false\);\n/,
  ''
);
src = src.replace(
  /  const \[workspaceWindows, setWorkspaceWindows\] = useState\(\(\) => \(\{\}\)\);\n  const \[activeWindowIds, setActiveWindowIds\] = useState\(\(\) => \(\{\}\)\);\n/,
  ''
);

// 7. Insert hook calls after focusedPanelByWorkspace state
const hookInsertAnchor = `  const [renameError, setRenameError] = useState(null);

  const startPanelRename`;
const hookBlock = `  const [renameError, setRenameError] = useState(null);

  const {
    rightDockState,
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
    getAllPanelIds,
    getPanelIdsFromColumns,
  });

  const startPanelRename`;

if (!src.includes('useRightDockController({')) {
  src = src.replace(hookInsertAnchor, hookBlock);
}

// 8. Remove dock persist/load effects
src = src.replace(
  /  \/\/ Persist dock state for the workspace this state belongs to\.\n  useEffect\(\(\) => \{\n    if \(!isClientLoaded \|\| !dockWorkspaceId\) return;\n    writeRightDockState\(storage, projectId, dockWorkspaceId, rightDockState\);\n  \}, \[dockWorkspaceId, isClientLoaded, projectId, rightDockState, storage\]\);\n\n/,
  ''
);
src = src.replace(
  /  useEffect\(\(\) => \{\n    if \(!isClientLoaded \|\| !activeWsId \|\| activeWsId === dockWorkspaceId\) return;\n    setDockWorkspaceId\(activeWsId\);\n    setRightDockState\(readRightDockState\(storage, projectId, activeWsId\)\);\n  \}, \[activeWsId, dockWorkspaceId, isClientLoaded, projectId, storage\]\);\n\n  useEffect\(\(\) => \{\n    if \(rightDockState\.visible\) \{\n      setHasMountedRightDock\(true\);\n    \}\n  \}, \[rightDockState\.visible\]\);\n\n/,
  ''
);

// 9. Remove workspace windows sync effects
src = src.replace(
  /  useEffect\(\(\) => \{\n    if \(!workspaces\.length\) return;\n\n    setWorkspaceWindows\(\(prev\) => \{[\s\S]*?  \}, \[workspaces, workspaceWindows, activePanelIds\]\);\n\n  useEffect\(\(\) => \{\n    const maxWindowId = Object\.values\(workspaceWindows[\s\S]*?  \}, \[workspaceWindows\]\);\n\n/,
  ''
);

// 10. Remove inline syncRightDockMeasuredBounds + layout/resize/eager effects
src = src.replace(
  /  const syncRightDockMeasuredBounds = useCallback\(\(\) => \{[\s\S]*?  \]\);\n  syncRightDockMeasuredBoundsRef\.current = syncRightDockMeasuredBounds;\n\n  useLayoutEffect\(\(\) => \{\n    syncRightDockMeasuredBounds\(\);\n  \}, \[syncRightDockMeasuredBounds, effectiveRightDockState\.size, activeWsId, isVisible\]\);\n\n  useEffect\(\(\) => \{[\s\S]*?    syncRightDockMeasuredBounds,\n  \]\);\n\n/,
  '  syncRightDockMeasuredBoundsRef.current = syncRightDockMeasuredBounds;\n\n'
);

// 11. Remove duplicate swarm draft effect + handlers
src = src.replace(
  /  useEffect\(\(\) => \{\n    setSwarmLaunchDraft\(\(current\) =>\n      createSwarmLaunchDraft\(\{\n        catalog: swarmLaunchCatalog,\n        project: swarmLaunchProject,\n        draft: current \|\| \{\},\n      \}\)\n    \);\n  \}, \[swarmLaunchCatalog, swarmLaunchProject\]\);\n\n  const updateSwarmLaunchDraft[\s\S]*?  \}, \[swarmLaunchCatalog, swarmLaunchProject\]\);\n\n  const openTerminalSwarmLauncher[\s\S]*?  \}, \[swarmLaunchCatalog, swarmLaunchProject\]\);\n\n  const handleTerminalSwarmLaunch[\s\S]*?  \}, \[projectId, swarmLaunchPreview\?\.draft\]\);\n\n/,
  ''
);

// 12. Remove inline updateRightDockState
src = src.replace(
  /  const updateRightDockState = useCallback\(\(nextValue\) => \{\n    setRightDockState\(\(prev\) => \{[\s\S]*?    \}\);\n  \}, \[\]\);\n\n/,
  ''
);

// 13. Remove closeWorkspaceBrowserWindow + reconcile effect
src = src.replace(
  /  const closeWorkspaceBrowserWindow = useCallback\([\s\S]*?  \}, \[browserWindowStates, projectId, updateBrowserWindowState\]\);\n\n  useEffect\(\(\) => \{\n    if \(!isClientLoaded[\s\S]*?  \}, \[browserWindowStates, isClientLoaded, projectId, updateBrowserWindowState\]\);\n\n/,
  ''
);

// 14. Remove duplicate updateBrowserWindowState if still there after hook - keep one in TWM? Hook provides it.
// TWM may still have updateBrowserWindowState - remove duplicate
src = src.replace(
  /  const updateBrowserWindowState = useCallback\(\(wsId, nextValue\) => \{\n    if \(!wsId\) return;\n    setBrowserWindowStates\(\(prev\) => \{[\s\S]*?    \}\);\n  \}, \[\]\);\n\n/,
  ''
);

// 15. Remove window handlers
src = src.replace(
  /  const addWindowToWorkspace = useCallback\(\(wsId\) => \{[\s\S]*?  \}, \[\]\);\n\n  const switchWindowInWorkspace = useCallback\(\(wsId, windowId\) => \{[\s\S]*?  \}, \[\]\);\n\n/,
  ''
);
src = src.replace(
  /  const removeWindowFromWorkspace = useCallback\([\s\S]*?    \[workspaceWindows, activeWindowIds\]\n  \);\n\n/,
  ''
);

// 16. Remove createWorkspaceForSwarmLaunchRequests + enqueueSwarmLaunchRequest useMemo
src = src.replace(
  /  const createWorkspaceForSwarmLaunchRequests = useMemo\([\s\S]*?  const \{ enqueueSwarmLaunchRequest \} = useMemo\([\s\S]*?    \[createWorkspaceForSwarmLaunchRequests\]\n  \);\n\n/,
  ''
);

// 17. Insert useSwarmLaunchController after syncActiveWindowSnapshot
const swarmAnchor = `  const syncActiveWindowSnapshot = useMemo(
    () =>
      createSyncActiveWindowSnapshot({
        setWorkspaceWindows,
        getActiveWindowIds: () => activeWindowIds,
      }),
    [activeWindowIds]
  );`;

const swarmHook = `${swarmAnchor}

  const {
    swarmLaunchWizardOpen,
    setSwarmLaunchWizardOpen,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardStep,
    swarmLaunchDraft,
    swarmLaunchSubmitState,
    updateSwarmLaunchDraft,
    openTerminalSwarmLauncher,
    handleTerminalSwarmLaunch,
    enqueueSwarmLaunchRequest,
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
  });`;

if (!src.includes('useSwarmLaunchController({')) {
  src = src.replace(swarmAnchor, swarmHook);
}

// 18. Add renderWorkspacePanel import usage - add import at top
if (!src.includes("from './terminal/components/renderWorkspacePanel'")) {
  src = src.replace(
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';",
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';\nimport { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';"
  );
}

// 19. Remove windowCounterRef declaration (from hook now) - but TWM uses windowCounterRef elsewhere
// Keep windowCounterRef from hook - remove duplicate ref at top
src = src.replace(
  /  const windowCounterRef = useRef\(1\);\n/,
  ''
);

// 20. Remove swarm cleanup effect (hook handles)
src = src.replace(
  /  useEffect\(\n    \(\) => \(\) => \{\n      if \(swarmLaunchFlushTimerRef\.current\) \{[\s\S]*?    \},\n    \[\]\n  \);\n\n/,
  ''
);

fs.writeFileSync(twmPath, src);
console.log('TWM wiring script pass 1 complete');
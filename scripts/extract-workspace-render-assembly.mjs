import fs from 'fs';
import path from 'path';

const twmPath = path.resolve('src/components/TerminalWorkspacesManager.jsx');
const outPath = path.resolve('src/components/terminal/components/WorkspaceRenderAssembly.jsx');
let twm = fs.readFileSync(twmPath, 'utf8');

const renderWindowBarStart = '  const renderWorkspaceWindowBar = useCallback(';
const renderWindowBarEnd = '  );\n\n  const launchPanelWithCommand';
const tauriStart = '  // --- Window Controls (for integrated titlebar) ---';
const tauriEnd = '  }, [getTauriWindow]);\n\n  const activeWorkspacePanelCount';
const returnMotionStart = '          <motion.div\n            ref={managerRootRef}';
const returnMotionEnd = '          </motion.div>\n        </SharedDockStoreProvider>';

const renderWindowBarIdx = twm.indexOf(renderWindowBarStart);
const renderWindowBarEndIdx = twm.indexOf(renderWindowBarEnd);
const tauriIdx = twm.indexOf(tauriStart);
const tauriEndIdx = twm.indexOf(tauriEnd);
const motionIdx = twm.indexOf(returnMotionStart);
const motionEndIdx = twm.indexOf(returnMotionEnd);

if (
  renderWindowBarIdx === -1 ||
  renderWindowBarEndIdx === -1 ||
  tauriIdx === -1 ||
  tauriEndIdx === -1 ||
  motionIdx === -1 ||
  motionEndIdx === -1
) {
  console.error('Failed to locate extraction markers', {
    renderWindowBarIdx,
    renderWindowBarEndIdx,
    tauriIdx,
    tauriEndIdx,
    motionIdx,
    motionEndIdx,
  });
  process.exit(1);
}

const renderWindowBarBody = twm
  .slice(renderWindowBarIdx + '  const '.length, renderWindowBarEndIdx + 3)
  .replace(/^renderWorkspaceWindowBar = /, 'const renderWorkspaceWindowBar = ');

const tauriBody = twm
  .slice(tauriIdx + '  '.length, tauriEndIdx)
  .replace(/^\/\/ --- Window Controls.*\n/, '');

const motionBody = twm.slice(motionIdx, motionEndIdx + '          </motion.div>'.length);

const assembly = `// WorkspaceRenderAssembly — main workspace shell JSX extracted from TerminalWorkspacesManager.jsx (Slice 8).

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
import {
  getWorkspaceAnimProps,
  resolveRightDockTakeoverChromeStyle,
} from '../workspaceAnimProps';
import {
  getWorkspaceShellChromeStyle,
  getWorkspaceTopBarStyle,
} from '../terminalChromeStyles';
import {
  buildStableWorkspaceShellKey,
  getPanelIdsFromColumns,
  resolveWorkspaceVisibleTerminalPanelCount,
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
  } = props;

${tauriBody}

${renderWindowBarBody}

  return (
${motionBody.replace(/^          /gm, '    ')}
  );
}
`;

fs.writeFileSync(outPath, assembly);

// Remove extracted blocks from TWM
let nextTwm = twm.slice(0, renderWindowBarIdx) + twm.slice(renderWindowBarEndIdx + '\n\n  const launchPanelWithCommand'.length);
// re-find tauri after first removal shifted indices
const tauriIdx2 = nextTwm.indexOf(tauriStart);
const tauriEndMarker = '  }, [getTauriWindow]);\n\n  const activeWorkspacePanelCount';
const tauriEndIdx2 = nextTwm.indexOf(tauriEndMarker);
nextTwm =
  nextTwm.slice(0, tauriIdx2) +
  nextTwm.slice(tauriEndIdx2 + '\n\n  const activeWorkspacePanelCount = activeWorkspace\n    ? getAllPanelIds(activeWorkspace.columns).length\n    : 0;\n'.length);

const bagStart = '  const workspaceRenderAssemblyBag = {';
const bagEnd = '  };\n\n  return (';
const motionStart2 = '          <WorkspaceRenderAssembly {...workspaceRenderAssemblyBag} />';
const motionBlockStart = '          <motion.div\n            ref={managerRootRef}';
const motionBlockEnd = '          </motion.div>\n        </SharedDockStoreProvider>';

const motionBlockIdx = nextTwm.indexOf(motionBlockStart);
const motionBlockEndIdx = nextTwm.indexOf(motionBlockEnd);
if (motionBlockIdx === -1 || motionBlockEndIdx === -1) {
  console.error('Failed to locate motion block after first pass');
  process.exit(1);
}

const bag = `  const workspaceRenderAssemblyBag = {
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
  };

`;

const returnIdx = nextTwm.lastIndexOf('  return (\n    <WorkspaceSurfaceRegistryProvider');
nextTwm = nextTwm.slice(0, returnIdx) + bag + nextTwm.slice(returnIdx);
nextTwm =
  nextTwm.slice(0, nextTwm.indexOf(motionBlockStart)) +
  motionStart2 +
  '\n' +
  nextTwm.slice(motionBlockEndIdx);

if (!nextTwm.includes("import WorkspaceRenderAssembly from './terminal/components/WorkspaceRenderAssembly'")) {
  nextTwm = nextTwm.replace(
    "import WorkspaceTerminalSurface from './terminal/components/WorkspaceTerminalSurface';",
    "import WorkspaceTerminalSurface from './terminal/components/WorkspaceTerminalSurface';\nimport WorkspaceRenderAssembly from './terminal/components/WorkspaceRenderAssembly';"
  );
}

fs.writeFileSync(twmPath, nextTwm);
console.log('WorkspaceRenderAssembly extracted');
console.log('TWM lines:', nextTwm.split('\n').length);
console.log('Assembly lines:', assembly.split('\n').length);
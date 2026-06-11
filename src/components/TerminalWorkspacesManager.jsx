import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getRightDockAnimProps,
  getWorkspaceAnimProps,
  resolveRightDockTakeoverChromeStyle,
  resolveWorkspaceShellVisibilityStyle,
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
  Settings,
} from 'lucide-react';
import TerminalTTY from './TerminalTTY';
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
  spawnFirstTerminalPanelColumns,
} from './terminal/utils/panelHelpers';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';
import NotificationCenter from './NotificationCenter';
import TerminalSettingsModal from './TerminalSettingsModal';
import TerminalRestoreSettingsModal from './TerminalRestoreSettingsModal';
import WorkspaceTerminalSetupModal from './WorkspaceTerminalSetupModal';
import { isValidZedOpenTerminalEvent, resolveZedOpenTerminalPanelId } from './zedOpenTerminalEvent';
import { applyZedOpenTerminalFocus } from './asistente/zedOpenTerminalFocus';
import ZedAmbientOverlay from './asistente/ZedAmbientOverlay';
import { countPanelsInColumns } from '@/lib/terminal/workspaceSurfaceReconcile';
import {
  MAX_WORKSPACE_TERMINAL_PANELS,
  MAX_ZED_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';
import { dispatchZedOverlayToggle } from '@/lib/asistente/zedOverlayEvents';
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
import { useOperatorActionsDispatch } from '@/lib/operator/OperatorActionsDispatchContext';
import FileExplorerEditorPane from './workspace/FileExplorerEditorPane';
import useResumableSessionCatalog from '@/hooks/useResumableSessionCatalog';
import {
  DEFAULT_RIGHT_DOCK_STATE,
  MIN_RIGHT_DOCK_SIZE,
  readRightDockState,
  sanitizeRightDockState,
  writeRightDockState,
} from './workspace/rightDockState';
import { applyRightDockTabSelect, applyZedOpenUrlDockUpdate } from './workspace/rightDockLayout';
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
import {
  focusNativeVtePanel,
  isNativeVteRuntimeAvailable,
  subscribeNativeVteEvents,
} from '@/lib/terminal/nativeVteBridge';
import PanelRendererSelect from './terminal/components/PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from './terminal/terminalRendererPreferences';
import {
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  isOrchestratorRoleKey,
  selectSwarmLaunchCatalog,
} from '@/lib/operations/swarmControl';
import {
  RESTORE_ACTION,
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
  collectWorkspacePanelIds,
} from '@/lib/terminal/startupRestoreCoordinator';
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
  rescheduleSwarmLaunchBatchFlush,
  SWARM_LAUNCH_MATERIALIZED_EVENT,
} from '@/lib/terminal/swarmLaunchBatch';
import {
  schedulePostLayoutNativeSync,
  dispatchNativeVteWorkspaceSync,
  dispatchTerminalLayoutSettled,
  computeCarvedBounds,
} from '@/components/terminal/nativeLayoutSync';
import SwarmLaunchWizardModal from './control-room/SwarmLaunchWizardModal';
import { useSwarmBusSnapshot } from '@/lib/hooks/useSwarmBusSnapshot';
import {
  collectSwarmLaunchIdsForWorkspace,
  dispatchTerminatePanelCloseEvents,
  getSwarmSnapshotStorageKey as getSwarmSnapshotStorageKeyFromLib,
  terminateSwarmLaunchesForWorkspace,
} from '@/lib/terminal/swarmWorkspaceLifecycle';
import {
  hydrateSwarmLaunchWrapperFlags,
  markSwarmLaunchWrapperDispatched,
} from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  useLiveSurfaceRegistry,
  LiveSurfaceRegistryContext,
} from '@/lib/pizarra/useLiveSurfaceRegistry';
// pizarra-shared-view-state Phase 2: TWM is the canonical owner
// of sharedDockState. Mounting SharedDockStoreProvider at the
// TWM root gives every workspace + pizarra consumer in the same
// tab the same store instance.
import { SharedDockStoreProvider } from './workspace/hooks/useSharedDockState';
// Phase 4: SharedSurfacesProvider sits ABOVE the dock store.
// It owns the singleton lifecycle of every terminal/browser
// surface mounted in workspace + pizarra. Toggling the
// maximizedView re-targets the active host, never the
// surface.
import SharedSurfacesProvider from './workspace/SharedSurfacesProvider';

// --- Helper Functions ---
const createPanel = (id, initialCommand = null, panelCwd = null, metadata = null) => ({
  id,
  initialCommand,
  cwd: panelCwd,
  swarmRole: metadata?.swarmRole || null,
  swarmContext: metadata?.swarmContext || null,
});
const createColumn = (colId, panelId, initialCommand = null, panelCwd = null) => ({
  id: colId,
  panels: [createPanel(panelId, initialCommand, panelCwd)],
});
const createWindow = (id, name, columns, activePanelId = null) => ({
  id,
  name,
  columns,
  activePanelId,
});

const NEXT_DEV_OVERLAY_HIDE_STYLE_ID = 'devhub-hide-next-dev-overlay-on-terminals';
const SWARM_ROLE_ORDER = [
  'coder',
  'auditor',
  'devops',
  'architect',
  'qa',
  'builder',
  'recovery_ops',
  'evidence',
  'scout',
  'analyst',
];
const SWARM_ROLE_META = {
  zed: { label: 'ZED', abbrev: 'ZED', rgb: '245,158,11' },
  director: { label: 'Director', abbrev: 'DIR', rgb: '245,158,11' },
  sdd_worker_1: { label: 'SDD Worker 1', abbrev: 'W1', rgb: '34,197,94' },
  sdd_worker_2: { label: 'SDD Worker 2', abbrev: 'W2', rgb: '52,211,153' },
  sdd_worker_3: { label: 'SDD Worker 3', abbrev: 'W3', rgb: '56,189,248' },
  sdd_worker_4: { label: 'SDD Worker 4', abbrev: 'W4', rgb: '129,140,248' },
  coder: { label: 'Coder', abbrev: 'COD', rgb: '34,197,94' },
  auditor: { label: 'Auditor', abbrev: 'AUD', rgb: '168,85,247' },
  devops: { label: 'DevOps', abbrev: 'DEV', rgb: '20,184,166' },
  architect: { label: 'Architect', abbrev: 'ARC', rgb: '96,165,250' },
  qa: { label: 'QA', abbrev: 'QA', rgb: '250,204,21' },
  builder: { label: 'Builder', abbrev: 'BLD', rgb: '34,197,94' },
  recovery_ops: { label: 'Recovery Ops', abbrev: 'REC', rgb: '251,113,133' },
  evidence: { label: 'Evidence', abbrev: 'EVD', rgb: '45,212,191' },
  scout: { label: 'Scout', abbrev: 'SCT', rgb: '56,189,248' },
  analyst: { label: 'Analyst', abbrev: 'ANL', rgb: '129,140,248' },
};

function getSwarmSnapshotStorageKey(projectId) {
  return getSwarmSnapshotStorageKeyFromLib(projectId);
}

function readAgentRuns(storage) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

function collectSwarmTerminateHints(storage, launchId, workspaces = []) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) {
    return { panel_ids: [], opencode_session_ids: [] };
  }

  const panelIds = new Set();
  const opencodeSessionIds = new Set();

  try {
    const runs = readAgentRuns(storage);
    Object.entries(runs).forEach(([taskId, run]) => {
      const taskLaunchId = String(taskId || '').split(':')[0];
      if ((run?.launchId || taskLaunchId) !== normalizedLaunchId) return;
      if (run?.panelId) panelIds.add(String(run.panelId).trim());
      if (run?.opencodeSessionId) opencodeSessionIds.add(String(run.opencodeSessionId).trim());
    });
  } catch {
    // Ignore localStorage failures.
  }

  workspaces.forEach((workspace) => {
    getPanelsFromColumns(workspace?.columns || []).forEach((panel) => {
      if (panel?.swarmContext?.launchId === normalizedLaunchId && panel?.id) {
        panelIds.add(String(panel.id).trim());
      }
    });
  });

  return {
    panel_ids: [...panelIds],
    opencode_session_ids: [...opencodeSessionIds],
  };
}

function getPanelIdsFromColumns(columns = []) {
  return columns.flatMap((column) => (column?.panels || []).map((panel) => panel.id));
}

function resolveWorkspaceVisibleTerminalPanelCount(columns = []) {
  return getPanelIdsFromColumns(columns).length;
}

/** Keep every terminal mounted in focus mode; only layout visibility changes. */
function resolvePanelVisibleInLayout({ isWorkspaceVisibleInLayout, focusedPanelId, panelId }) {
  if (!isWorkspaceVisibleInLayout) return false;
  if (!focusedPanelId) return true;
  return focusedPanelId === panelId;
}

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

function getPanelsFromColumns(columns = []) {
  return columns.flatMap((column) => column?.panels || []);
}

function readWorkspaceSwarmLaunchSummary(
  storage,
  workspace,
  projectId = null,
  swarmControlSnapshot = null
) {
  const workspacePanelIds = new Set(getPanelIdsFromColumns(workspace?.columns || []));

  // 1. If we have panel IDs, filter devhub_agent_runs within the workspace
  let runs = [];
  if (workspacePanelIds.size > 0) {
    runs = Object.values(readAgentRuns(storage)).filter(
      (run) =>
        run?.launchOrigin === 'swarm-control-launch' &&
        workspacePanelIds.has(String(run?.panelId || ''))
    );
  }

  // 2. If no matching runs in current workspace, search globally in all agent runs
  if (runs.length === 0) {
    runs = Object.values(readAgentRuns(storage)).filter(
      (run) => run?.launchOrigin === 'swarm-control-launch'
    );
  }

  if (runs.length > 0) {
    const groups = new Map();
    runs.forEach((run) => {
      const taskLaunchId = String(run?.taskId || '').split(':')[0];
      const launchId = run?.launchId || taskLaunchId;
      if (!launchId) return;
      const current = groups.get(launchId) || [];
      current.push(run);
      groups.set(launchId, current);
    });

    const sortedGroups = [...groups.entries()].sort(([, leftRuns], [, rightRuns]) => {
      const leftAt = Math.max(...leftRuns.map((run) => Number(run?.launchedAt) || 0));
      const rightAt = Math.max(...rightRuns.map((run) => Number(run?.launchedAt) || 0));
      return rightAt - leftAt;
    });

    const [launchId, launchRuns] = sortedGroups[0] || [null, null];

    if (launchId && launchRuns?.length) {
      const latestRun = launchRuns.reduce((latest, run) => {
        const latestAt = Number(latest?.launchedAt) || 0;
        const nextAt = Number(run?.launchedAt) || 0;
        return nextAt >= latestAt ? run : latest;
      }, launchRuns[0]);

      return {
        launchId,
        title:
          latestRun?.taskTitle?.split(' · ')?.[0] || latestRun?.taskTitle || 'Active swarm launch',
        count: launchRuns.length,
      };
    }
  }

  // 3. Fallback to cached swarm control snapshot (state or local storage)
  const snapshotToUse =
    swarmControlSnapshot ||
    (() => {
      if (projectId && storage) {
        try {
          return JSON.parse(storage.getItem(getSwarmSnapshotStorageKey(projectId)) || 'null');
        } catch {
          return null;
        }
      }
      return null;
    })();

  if (snapshotToUse) {
    const mission = snapshotToUse.mission_control?.mission || snapshotToUse.mission;
    if (mission && mission.status === 'active' && mission.mission_id) {
      return {
        launchId: mission.mission_id,
        title: mission.title || 'Swarm activo',
        count: 1,
        isFallback: true,
      };
    }
  }

  return null;
}

function createDefaultWorkspaceState() {
  return {
    workspaces: [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [createColumn('c1', 'p1')],
      },
    ],
    activeWsId: 'ws1',
    activePanelIds: { ws1: 'p1' },
  };
}

function normalizeWorkspaceState(rawWorkspaces, rawActiveWsId, rawActivePanelIds) {
  const fallbackState = createDefaultWorkspaceState();
  if (!Array.isArray(rawWorkspaces) || rawWorkspaces.length === 0) {
    return fallbackState;
  }

  const usedWorkspaceIds = new Set();
  const usedColumnIds = new Set();
  const usedPanelIds = new Set();
  const workspaceIdMap = new Map();
  const workspaceCounter = 1;
  const columnCounter = 1;
  const panelCounter = 1;

  const nextId = (prefix, preferred, usedIds, counterState) => {
    const rawPreferred = typeof preferred === 'string' ? preferred.trim() : '';
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const preferredMatch = rawPreferred.match(pattern);

    if (preferredMatch && !usedIds.has(rawPreferred)) {
      usedIds.add(rawPreferred);
      const numericPart = Number(preferredMatch[1]);
      if (Number.isFinite(numericPart)) {
        counterState.value = Math.max(counterState.value, numericPart + 1);
      }
      return rawPreferred;
    }

    let generatedId = `${prefix}${counterState.value}`;
    while (usedIds.has(generatedId)) {
      counterState.value += 1;
      generatedId = `${prefix}${counterState.value}`;
    }

    usedIds.add(generatedId);
    counterState.value += 1;
    return generatedId;
  };

  const workspaceCounterState = { value: workspaceCounter };
  const columnCounterState = { value: columnCounter };
  const panelCounterState = { value: panelCounter };
  const nextActivePanelIds = {};

  const normalizedWorkspaces = rawWorkspaces.map((workspace, workspaceIndex) => {
    const originalWorkspaceId = typeof workspace?.id === 'string' ? workspace.id : '';
    const workspaceId = nextId('ws', originalWorkspaceId, usedWorkspaceIds, workspaceCounterState);

    if (originalWorkspaceId) {
      workspaceIdMap.set(originalWorkspaceId, workspaceId);
    }

    const originalColumns =
      Array.isArray(workspace?.columns) && workspace.columns.length > 0 ? workspace.columns : [{}];

    let firstPanelId = null;
    const panelIdMap = new Map();

    const columns = originalColumns.map((column) => {
      const columnId = nextId('c', column?.id, usedColumnIds, columnCounterState);
      const originalPanels =
        Array.isArray(column?.panels) && column.panels.length > 0 ? column.panels : [{}];

      const panels = originalPanels.map((panel) => {
        const originalPanelId = typeof panel?.id === 'string' ? panel.id : '';
        const panelId = nextId('p', originalPanelId, usedPanelIds, panelCounterState);

        if (originalPanelId) {
          panelIdMap.set(originalPanelId, panelId);
        }

        if (!firstPanelId) {
          firstPanelId = panelId;
        }

        return {
          id: panelId,
          cwd: panel?.cwd || null,
          initialCommand: panel?.initialCommand || null,
          swarmRole: panel?.swarmRole || null,
        };
      });

      return { id: columnId, panels };
    });

    const originalActivePanelId =
      originalWorkspaceId && rawActivePanelIds ? rawActivePanelIds[originalWorkspaceId] : null;
    nextActivePanelIds[workspaceId] =
      (originalActivePanelId && panelIdMap.get(originalActivePanelId)) || firstPanelId;

    return {
      id: workspaceId,
      name:
        typeof workspace?.name === 'string' && workspace.name.trim()
          ? workspace.name
          : `Workspace ${workspaceIndex + 1}`,
      columns,
    };
  });

  return {
    workspaces: normalizedWorkspaces,
    activeWsId:
      (typeof rawActiveWsId === 'string' && workspaceIdMap.get(rawActiveWsId)) ||
      normalizedWorkspaces[0]?.id ||
      fallbackState.activeWsId,
    activePanelIds: nextActivePanelIds,
  };
}

function getSessionRenderKey(session, fallbackPrefix, index) {
  const sessionKey = session?.id || session?.sessionId || session?.terminalId || 'session';
  const baseKey = `${fallbackPrefix}-${sessionKey}`;
  return `${baseKey}-${index}`;
}

function getAgentFromCommand(command) {
  if (!command || typeof command !== 'string') return null;
  const opencodeMatch = command.match(/--agent\s+([\w-]+)/i);
  if (opencodeMatch?.[1]) return opencodeMatch[1];
  if (command.toLowerCase().includes('gentleman')) return 'gentleman';
  if (command.toLowerCase().includes('gemini')) return 'gemini';

  // Custom detection for opencode sessions
  const opencodeSessionMatch = command.match(/opencode\s+--session\s+([\w-]+)/i);
  if (opencodeSessionMatch) return `OpenCode (${opencodeSessionMatch[1].substring(0, 6)})`;

  if (command.trim().toLowerCase() === 'opencode') return 'OpenCode';

  return null;
}

function normalizeAgentLabel(agent) {
  const raw = typeof agent === 'string' ? agent.trim() : '';
  if (!raw) return null;
  if (raw.toLowerCase() === 'opencode') return 'OpenCode';
  return raw;
}

function normalizeRoleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferSwarmRoleKey(input = {}) {
  const explicit = normalizeRoleKey(input.roleKey || input.role_key);
  if (explicit) return explicit;

  const taskId = String(input.taskId || '');
  const taskRole = taskId.includes(':') ? normalizeRoleKey(taskId.split(':').pop()) : '';
  if (taskRole) return taskRole;

  const text = `${input.roleLabel || ''} ${input.taskTitle || ''} ${input.promptSummary || ''}`;
  const knownRole = Object.keys(SWARM_ROLE_META).find((roleKey) =>
    new RegExp(`\\b${roleKey.replace(/_/g, '[-_\\s]?')}\\b`, 'i').test(text)
  );
  return knownRole || '';
}

function buildSwarmRoleMetadata(input = {}) {
  const roleKey = inferSwarmRoleKey(input);
  if (!roleKey) return null;

  const fallbackLabel = String(input.roleLabel || roleKey)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const base = SWARM_ROLE_META[roleKey] || {
    label: fallbackLabel,
    abbrev: fallbackLabel.slice(0, 3).toUpperCase(),
    rgb: '148,163,184',
  };

  return {
    roleKey,
    label: input.roleLabel || base.label,
    abbrev: input.roleAbbrev || base.abbrev,
    rgb: base.rgb,
  };
}

function getSwarmRoleOrder(roleKey = '') {
  if (roleKey === 'director') return 999;
  const index = SWARM_ROLE_ORDER.indexOf(roleKey);
  return index === -1 ? 500 : index;
}

function shortenSemanticLabel(value, maxLength = 40) {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolvePanelStartupConnectionState(panel, panelRestoreModes) {
  if (panelRestoreModes?.[panel?.id] === 'suspended') {
    return 'suspended';
  }
  return undefined;
}

function readAgentRunsByPanel(storage) {
  if (!storage) return {};

  try {
    const rawRuns = JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
    const indexedRuns = {};

    Object.values(rawRuns || {}).forEach((run) => {
      const panelId = typeof run?.panelId === 'string' ? run.panelId.trim() : '';
      if (!panelId) return;

      const previous = indexedRuns[panelId];
      const nextTimestamp = Number(run?.launchedAt) || 0;
      const previousTimestamp = Number(previous?.launchedAt) || 0;

      if (!previous || nextTimestamp >= previousTimestamp) {
        indexedRuns[panelId] = run;
      }
    });

    return indexedRuns;
  } catch {
    return {};
  }
}

function derivePanelCommandMetadata(initialCommand) {
  const command = typeof initialCommand === 'string' ? initialCommand.trim() : '';
  const detectedAgent = normalizeAgentLabel(getAgentFromCommand(command));

  if (detectedAgent?.startsWith('OpenCode (')) {
    return {
      source: 'command',
      primary: detectedAgent,
      secondary: null,
      fullText: detectedAgent,
    };
  }

  if (command.toLowerCase().includes('opencode')) {
    const secondary = detectedAgent && detectedAgent !== 'OpenCode' ? detectedAgent : null;
    const fullText = secondary ? `OpenCode · ${secondary}` : 'OpenCode';
    return {
      source: 'command',
      primary: 'OpenCode',
      secondary,
      fullText,
    };
  }

  if (detectedAgent) {
    return {
      source: 'command',
      primary: detectedAgent,
      secondary: null,
      fullText: detectedAgent,
    };
  }

  const quietCommand = shortenSemanticLabel(shortenCommandSummary(command), 34);
  if (quietCommand && quietCommand !== 'Ejecucion iniciada desde terminal') {
    return {
      source: 'fallback',
      primary: 'Terminal',
      secondary: quietCommand,
      fullText: `Terminal · ${quietCommand}`,
    };
  }

  return {
    source: 'fallback',
    primary: 'Terminal',
    secondary: null,
    fullText: 'Terminal',
  };
}

function derivePanelSemanticMetadata(panel, agentRun) {
  const commandMetadata = derivePanelCommandMetadata(panel?.initialCommand);
  const panelSwarmRole = panel?.swarmRole ? buildSwarmRoleMetadata(panel.swarmRole) : null;
  if (!agentRun) {
    if (!panelSwarmRole) return commandMetadata;
    return {
      source: 'panel',
      primary: `${panelSwarmRole.label} 1`,
      secondary: commandMetadata.primary || null,
      fullText: `${panelSwarmRole.label} · ${commandMetadata.fullText || commandMetadata.primary || 'Terminal'}`,
      swarmRole: panelSwarmRole,
    };
  }

  const swarmRole = buildSwarmRoleMetadata(agentRun) || panelSwarmRole;
  const agentLabel =
    normalizeAgentLabel(agentRun?.selectedAgent) || commandMetadata.primary || 'Terminal';
  const sessionId =
    typeof agentRun?.opencodeSessionId === 'string' ? agentRun.opencodeSessionId.trim() : '';
  const taskTitle = shortenSemanticLabel(agentRun?.taskTitle, 32);
  const promptSummary = shortenSemanticLabel(agentRun?.promptSummary, 36);
  const secondary = swarmRole
    ? `${agentLabel}${promptSummary ? ` · ${promptSummary}` : ''}`
    : taskTitle || promptSummary || null;

  if (swarmRole) {
    return {
      source: 'agent-run',
      primary: `${swarmRole.label} 1`,
      secondary,
      fullText: `${swarmRole.label} · ${secondary || agentLabel}`,
      swarmRole,
    };
  }

  if (sessionId && agentLabel === 'OpenCode' && !secondary) {
    const sessionLabel = `OpenCode (${sessionId.slice(0, 6)})`;
    return {
      source: 'agent-run',
      primary: sessionLabel,
      secondary: null,
      fullText: sessionLabel,
    };
  }

  return {
    source: 'agent-run',
    primary: agentLabel,
    secondary,
    fullText: secondary ? `${agentLabel} · ${secondary}` : agentLabel,
  };
}

function shortPath(path) {
  if (!path) return '~';
  const tokens = String(path).split('/').filter(Boolean);
  if (tokens.length <= 2) return `/${tokens.join('/')}`;
  return `.../${tokens.slice(-2).join('/')}`;
}

function shortenCommandSummary(command) {
  const raw = String(command || '').trim();
  if (!raw) return 'Ejecucion iniciada desde terminal';
  if (raw.length <= 140) return raw;
  return `${raw.slice(0, 137)}...`;
}

function buildStableWorkspaceShellKey(scope, workspaceId) {
  return `${scope}-${String(workspaceId || 'unknown')}`;
}

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
    connectionState,
    visibleTerminalPanelCount = 1,
    deferLiveSurfaceToPizarra = false,
    inboxPendingCount = 0,
  }
) {
  const isActive = panel.id === activePanelId && activeWsId === wsId;
  const panelChromeSafeZoneMinTop = 30;
  const semanticMetadata =
    panelSemanticMetadata || derivePanelCommandMetadata(panel?.initialCommand);
  const swarmRole = semanticMetadata?.swarmRole || panel?.swarmRole || null;

  return (
    <div
      key={panel.id}
      data-testid={
        isFocusedPanel ? `workspace-focused-panel-${panel.id}` : `panel-slot-${panel.id}`
      }
      className={`group relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-visible rounded-md border ${
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
          className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-r-full bg-[rgba(var(--swarm-role-rgb),0.9)] shadow-[0_0_12px_rgba(var(--swarm-role-rgb),0.32)]"
        />
      ) : null}
      <div
        data-testid={`panel-safe-zone-${panel.id}`}
        data-native-safe-zone="floating-chrome"
        data-safe-zone-min-top={String(panelChromeSafeZoneMinTop)}
        className="pointer-events-none relative min-h-8 shrink-0 overflow-visible px-1.5 pt-0.5"
        style={{
          minHeight: `${panelChromeSafeZoneMinTop}px`,
          ...getTerminalPanelHeaderStyle(),
        }}
      >
        {/* Agent info bar — kept above the native terminal surface so VTE cannot cover it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center justify-start pl-2 pr-[108px] pt-1">
          <div
            data-testid={`panel-semantic-header-${panel.id}`}
            data-panel-metadata-source={semanticMetadata.source}
            className="flex min-w-0 items-center gap-2 text-[11px] leading-none"
            title={semanticMetadata.fullText}
          >
            {swarmRole ? (
              <span
                data-testid={`panel-role-badge-${panel.id}`}
                className="inline-flex h-[18px] shrink-0 items-center rounded border border-[rgba(var(--swarm-role-rgb),0.42)] bg-[rgba(var(--swarm-role-rgb),0.14)] px-1.5 text-[9px] font-black tracking-[0.06em] text-[rgb(var(--swarm-role-rgb))] shadow-[0_0_10px_rgba(var(--swarm-role-rgb),0.1)]"
              >
                {swarmRole.abbrev}
              </span>
            ) : null}
            {inboxPendingCount > 0 ? (
              <span
                data-testid={`panel-inbox-badge-${panel.id}`}
                title={`${inboxPendingCount} directiva(s) pendiente(s)`}
                className="inline-flex h-[18px] shrink-0 items-center rounded border border-[rgba(251,191,36,0.45)] bg-[rgba(251,191,36,0.14)] px-1.5 text-[9px] font-bold text-[rgb(251,191,36)]"
              >
                {inboxPendingCount}
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
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-[calc(100%-0.0625rem)] rounded-t-[8px] bg-[linear-gradient(180deg,rgba(15,23,36,0.18),rgba(15,23,36,0.01))] transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-70'
          }`}
        />
        {/* Panel controls — top-right, outside the native terminal body. */}
        <div
          className="pointer-events-none absolute right-1 top-0.5 z-10"
          data-testid={`panel-chrome-overlay-${panel.id}`}
          data-floating-placement="inside-top-right"
          aria-label={`Panel ${panelLabel || panel.id} controls`}
        >
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-md border px-0.5 py-0 backdrop-blur-md transition-colors"
            data-testid={`panel-header-actions-${panel.id}`}
            title={`Panel ${panelLabel || panel.id} actions`}
            style={getTerminalFloatingControlStyle({ active: isActive })}
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
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
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
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
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
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
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
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[#ff7b72]"
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
        className="min-h-0 min-w-0 flex-1 bg-[var(--surface-app)] p-0"
        data-testid={`panel-body-${panel.id}`}
        style={getTerminalPanelBodyStyle({ withBackground: false })}
      >
        <div className="h-full w-full overflow-hidden bg-[var(--surface-app)]">
          {deferLiveSurfaceToPizarra ? (
            <div
              data-testid={`panel-body-deferred-pizarra-${panel.id}`}
              className="h-full w-full"
              aria-hidden="true"
            />
          ) : (
            <TerminalTTY
              id={panel.id}
              cwd={panel.cwd || cwd}
              swarmContext={panel.swarmContext || null}
              hideTitleBar={true}
              showQuickCopyButton={false}
              autoFocus={isActive}
              isActivePanel={Boolean(isActivePanel ?? isActive)}
              isVisibleInLayout={Boolean(isVisibleInLayout)}
              visibleTerminalPanelCount={visibleTerminalPanelCount}
              initialCommand={panel.initialCommand}
              connectionState={connectionState}
              requestedRendererMode={requestedRendererMode}
              onResetRendererToXterm={onResetRendererToXterm}
              onActivatePanel={onActivatePanel}
              suspendNativeSurface={Boolean(suspendNativeSurface)}
              nativeSurfacePolicy={nativeSurfacePolicy || 'live'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function getWorkspaceTabStyle(totalWorkspaces) {
  if (totalWorkspaces <= 4) {
    return { flex: '1 1 0%', minWidth: '190px', maxWidth: '260px' };
  }
  if (totalWorkspaces <= 7) {
    return { flex: '1 1 0%', minWidth: '158px', maxWidth: '220px' };
  }
  return { flex: '0 1 138px', minWidth: '138px', maxWidth: '180px' };
}

function resolveWorkspacePanelId(workspace, savedPanelId) {
  const panelIds =
    workspace?.columns?.flatMap((column) => column.panels || []).map((panel) => panel.id) || [];
  if (!panelIds.length) return null;
  return savedPanelId && panelIds.includes(savedPanelId) ? savedPanelId : panelIds[0];
}

function normalizeWorkspaceWindows(
  rawWorkspaceWindows,
  rawActiveWindowIds,
  workspaces,
  activePanelIds
) {
  const usedWindowIds = new Set();
  let windowCounter = 1;

  const nextWindowId = (preferredId) => {
    const normalizedPreferred = typeof preferredId === 'string' ? preferredId.trim() : '';
    const preferredMatch = /^v(\d+)$/i.exec(normalizedPreferred);

    if (preferredMatch && !usedWindowIds.has(normalizedPreferred)) {
      usedWindowIds.add(normalizedPreferred);
      windowCounter = Math.max(windowCounter, Number(preferredMatch[1]) + 1);
      return normalizedPreferred;
    }

    let candidate = `v${windowCounter}`;
    while (usedWindowIds.has(candidate)) {
      windowCounter += 1;
      candidate = `v${windowCounter}`;
    }

    usedWindowIds.add(candidate);
    windowCounter += 1;
    return candidate;
  };

  const nextWorkspaceWindows = {};
  const nextActiveWindowIds = {};

  workspaces.forEach((ws, wsIndex) => {
    const existingWindows =
      Array.isArray(rawWorkspaceWindows?.[ws.id]) && rawWorkspaceWindows[ws.id].length > 0
        ? rawWorkspaceWindows[ws.id]
        : null;

    if (existingWindows) {
      const normalizedWindows = existingWindows.map((win, index) => {
        const columns =
          Array.isArray(win?.columns) && win.columns.length > 0 ? win.columns : ws.columns;
        const panelIds = columns.flatMap((col) => col.panels || []).map((panel) => panel.id);
        const fallbackPanelId = panelIds[0] || activePanelIds[ws.id] || null;
        const activePanelId =
          typeof win?.activePanelId === 'string' && panelIds.includes(win.activePanelId)
            ? win.activePanelId
            : fallbackPanelId;

        return createWindow(
          nextWindowId(win?.id),
          typeof win?.name === 'string' && win.name.trim() ? win.name.trim() : `V${index + 1}`,
          columns,
          activePanelId
        );
      });

      nextWorkspaceWindows[ws.id] = normalizedWindows;

      const requestedActiveWindowId = rawActiveWindowIds?.[ws.id];
      const activeWindow =
        normalizedWindows.find(
          (win, index) => existingWindows[index]?.id === requestedActiveWindowId
        ) || normalizedWindows[0];

      nextActiveWindowIds[ws.id] = activeWindow?.id || normalizedWindows[0]?.id || null;

      if (activeWindow?.columns?.length) {
        ws.columns = activeWindow.columns;
        activePanelIds[ws.id] =
          activeWindow.activePanelId ||
          activeWindow.columns.flatMap((col) => col.panels || [])[0]?.id ||
          activePanelIds[ws.id];
      }

      return;
    }

    const windowId = nextWindowId();
    const activePanelId = activePanelIds[ws.id] || ws.columns[0]?.panels?.[0]?.id || null;
    nextWorkspaceWindows[ws.id] = [
      createWindow(windowId, `V${wsIndex + 1}`, ws.columns, activePanelId),
    ];
    nextActiveWindowIds[ws.id] = windowId;
  });

  return {
    workspaceWindows: nextWorkspaceWindows,
    activeWindowIds: nextActiveWindowIds,
    windowCounter,
  };
}

export function resolveRightDockLayerStyle({ isFullscreenBrowser, size, measuredBounds }) {
  if (isFullscreenBrowser) {
    return { top: 0, right: 'auto', bottom: 0, left: 0, width: '100%' };
  }

  if (measuredBounds) {
    return {
      top: 0,
      right: 'auto',
      bottom: 0,
      left: measuredBounds.left,
      width: measuredBounds.width,
    };
  }

  return { top: 0, right: 'auto', bottom: 0, left: `${100 - size}%`, width: `${size}%` };
}

export function resolveMeasuredRightDockBounds(containerRect, placeholderRect) {
  if (!containerRect || !placeholderRect) return null;

  const containerWidth = Number(containerRect.width || 0);
  const placeholderWidth = Number(placeholderRect.width || 0);
  if (containerWidth <= 0 || placeholderWidth <= 0) return null;

  return {
    left: Math.max(0, placeholderRect.left - containerRect.left),
    right: Math.max(0, containerRect.right - placeholderRect.right),
    width: placeholderWidth,
  };
}

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
  const [reopenActionError, setReopenActionError] = useState(null);
  const [workspaces, setWorkspaces] = useState(() => createDefaultWorkspaceState().workspaces);
  const pendingReopenPanelsRef = useRef(new Map());
  const pendingSwarmLaunchRequestsRef = useRef([]);
  const swarmLaunchFlushTimerRef = useRef(null);
  const swarmLaunchScheduledTimersRef = useRef(new Map());
  const pendingSwarmLaunchByLaunchIdRef = useRef(new Map());
  const materializedSwarmLaunchIdsRef = useRef(new Set());

  const [activeWsId, setActiveWsId] = useState(() => createDefaultWorkspaceState().activeWsId);
  const [activePanelIds, setActivePanelIds] = useState(
    () => createDefaultWorkspaceState().activePanelIds
  );
  const [draggedWsId, setDraggedWsId] = useState(null);
  const [dragOverWsId, setDragOverWsId] = useState(null);
  const [gridCommand, setGridCommand] = useState('opencode');
  const [isGridLauncherOpen, setIsGridLauncherOpen] = useState(false);
  const [workspaceTerminalSetupOpen, setWorkspaceTerminalSetupOpen] = useState(false);
  const [swarmLaunchWizardOpen, setSwarmLaunchWizardOpen] = useState(false);

  // overlayAvoidRects: list of {x,y,width,height, source} for transient popups/modals
  // (Grillas Predefinidas, swarm wizard, etc). When present we compute *carved* bounds
  // for affected terminal panels and pass reduced rects to native VTE (instead of
  // full suspend/hide). This lets web UI paint "sobre la terminal" while keeping
  // the VTE widget live (full pty size, no winch to child TUIs, visible in non-covered
  // areas). Core fix for bad UX of "no se logra mostrar cosas sobre la terminal sin suspenderla".
  const [overlayAvoidRects, setOverlayAvoidRects] = useState([]);

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
  const getPanelConnectionState = useCallback(
    (panel) => resolvePanelStartupConnectionState(panel, panelRestoreModes),
    [panelRestoreModes]
  );
  const [swarmLaunchWizardStep, setSwarmLaunchWizardStep] = useState('team');
  const [swarmLaunchDraft, setSwarmLaunchDraft] = useState(null);
  const [swarmLaunchSubmitState, setSwarmLaunchSubmitState] = useState({
    submitting: false,
    error: null,
  });
  const [rightDockState, setRightDockState] = useState(() => ({ ...DEFAULT_RIGHT_DOCK_STATE }));
  const [rightDockMeasuredBounds, setRightDockMeasuredBounds] = useState(null);
  const [hasMountedRightDock, setHasMountedRightDock] = useState(false);
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const [isDraggingInternalSplit, setIsDraggingInternalSplit] = useState(false);
  const [dockWorkspaceId, setDockWorkspaceId] = useState(
    () => createDefaultWorkspaceState().activeWsId
  );
  const [browserWindowStates, setBrowserWindowStates] = useState(() => ({}));
  const [workspaceWindows, setWorkspaceWindows] = useState(() => ({}));
  const [activeWindowIds, setActiveWindowIds] = useState(() => ({}));
  const [focusedPanelByWorkspace, setFocusedPanelByWorkspace] = useState(() => ({}));
  const [panelNavPulseId, setPanelNavPulseId] = useState(null);
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
  const resolvedSwarmLaunchDraft = useMemo(
    () =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        draft: swarmLaunchDraft || {},
      }),
    [swarmLaunchCatalog, swarmLaunchDraft, swarmLaunchProject]
  );
  const swarmLaunchPreview = useMemo(
    () =>
      deriveSwarmLaunchPreview({
        catalog: swarmLaunchCatalog,
        draft: resolvedSwarmLaunchDraft,
      }),
    [swarmLaunchCatalog, resolvedSwarmLaunchDraft]
  );

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
  const windowCounterRef = useRef(1);
  const hasRunStartupRestoreRef = useRef(false);
  const startupRestoreCompletedRef = useRef(false);
  const terminalHydrationReadyRef = useRef(false);
  const bootPanelIdsRef = useRef(new Set());
  const relaunchInFlightRef = useRef(new Set());
  const panelsClosingRef = useRef(new Set());
  const workspacesRef = useRef(workspaces);
  const activeWsIdRef = useRef(activeWsId);
  const activePanelIdsRef = useRef(activePanelIds);
  const activeWindowIdsRef = useRef(activeWindowIds);
  const workspaceWindowsRef = useRef(workspaceWindows);
  const focusedPanelByWorkspaceRef = useRef(focusedPanelByWorkspace);
  const panelNavPulseTimeoutRef = useRef(null);

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

  useEffect(
    () => () => {
      if (swarmLaunchFlushTimerRef.current) {
        window.clearTimeout(swarmLaunchFlushTimerRef.current);
        swarmLaunchFlushTimerRef.current = null;
      }
      swarmLaunchScheduledTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      swarmLaunchScheduledTimersRef.current.clear();
      pendingSwarmLaunchRequestsRef.current = [];
      pendingSwarmLaunchByLaunchIdRef.current.forEach((batch) => {
        if (batch.timer) window.clearTimeout(batch.timer);
      });
      pendingSwarmLaunchByLaunchIdRef.current.clear();
    },
    []
  );

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

      relaunchInFlightRef.current.delete(panelId);
    },
    [storage, terminalStateStorageKey]
  );

  // --- Startup restore: global prefs + queued OpenCode resume (reboot-safe via --session) ---
  useEffect(() => {
    if (!isClientLoaded || !storage || hasRunStartupRestoreRef.current) return;

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

    let cancelled = false;
    const restorePrefs = readWorkspaceRestorePreferences(storage);

    const hasOpenCodePanels = snapshotWorkspaces.some((ws) =>
      (ws.columns || []).some((col) =>
        (col.panels || []).some((panel) => isOpenCodePanel(panel, agentRunsByPanel[panel.id]))
      )
    );

    if (hasOpenCodePanels) {
      const suspendedSeed = {};
      snapshotWorkspaces.forEach((ws) => {
        ws.columns?.forEach((col) => {
          col.panels?.forEach((panel) => {
            const agentRun = agentRunsByPanel[panel.id];
            if (!isOpenCodePanel(panel, agentRun)) return;

            const policy = resolveEffectiveRestorePolicy({
              sessionKind: 'opencode',
              perSessionPolicy: agentRun?.restorePolicy || null,
              preferences: restorePrefs,
            });

            // Manual/off stay suspended until the user continues; auto relaunches via queue.
            if (policy === 'manual' || policy === 'off') {
              suspendedSeed[panel.id] = 'suspended';
            }
          });
        });
      });
      if (Object.keys(suspendedSeed).length > 0) {
        setPanelRestoreModes(suspendedSeed);
      }
    }

    const runStartupRestore = async () => {
      try {
        await runOpenCodeStartupRestoreMutex(storage, async () => {
          const runtimeResponse = await fetch('/api/swarm/runtime-diagnostics', {
            cache: 'no-store',
          });
          const runtimeSnapshot = runtimeResponse.ok ? await runtimeResponse.json() : null;

          if (cancelled) return;

          const latestAgentRuns = readAgentRunsByPanel(storage);
          let restoreWorkspaces = snapshotWorkspaces;
          let restoreAgentRuns = latestAgentRuns;

          const needsDiscovery = collectOpenCodePanelsNeedingDiscovery(
            snapshotWorkspaces,
            latestAgentRuns
          );

          if (needsDiscovery.length > 0) {
            const catalog = await fetchOpenCodeSessionCatalog({ fetchImpl: fetch });
            if (!cancelled && catalog.sessions.length > 0) {
              const enriched = enrichOpenCodeRestoreContext({
                workspaces: snapshotWorkspaces,
                agentRunsByPanel: latestAgentRuns,
                catalogSessions: catalog.sessions,
              });

              if (enriched.hasDiscoveries) {
                restoreWorkspaces = enriched.workspaces;
                restoreAgentRuns = enriched.agentRunsByPanel;

                try {
                  const fullRuns = readAgentRuns(storage);
                  const mergedRuns = mergeDiscoveryIntoAgentRunsRecord(
                    fullRuns,
                    enriched.discoveries
                  );
                  storage?.setItem('devhub_agent_runs', JSON.stringify(mergedRuns));
                  patchTerminalStateWithDiscoveredCommands(
                    storage,
                    terminalStateStorageKey,
                    restoreWorkspaces
                  );
                  setWorkspaces((prev) => {
                    if (!Array.isArray(prev) || prev.length === 0) return restoreWorkspaces;
                    return restoreWorkspaces;
                  });
                } catch {
                  // Discovery persistence must not block restore.
                }
              }
            }
          }

          const manifest = buildRestoreManifestFromWorkspaceState({
            workspaces: restoreWorkspaces,
            activeWorkspaceId: activeWsIdRef.current || activeWsId,
            projectId,
            appSessionId: `startup-${Date.now()}`,
            agentRunsByPanel: restoreAgentRuns,
            restorePreferences: restorePrefs,
          });

          const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

          logTerminalSession('startup-restore-plan', {
            actionCount: plan.actions.length,
            actions: plan.actions.map((action) => ({
              action: action.action,
              terminalId: action.terminalId,
              reason: action.reason,
              sessionKind: action.sessionKind,
            })),
          });

          if (plan.actions.some((action) => action.action === RESTORE_ACTION.QUOTA_BLOCKED)) {
            setReopenActionError(
              'OpenCode appears quota-blocked (429). Review runtime diagnostics before relaunching sessions.'
            );
          }

          const panelMap = new Map(
            restoreWorkspaces.flatMap((workspace) =>
              (workspace?.columns || []).flatMap((column) =>
                (column?.panels || []).map((panel) => [panel.id, panel])
              )
            )
          );

          const queueResult = await dispatchStartupRestoreQueue({
            actions: plan.actions,
            getPanel: (panelId) => panelMap.get(panelId),
            shouldSkipAction: (action) => {
              const panelId = action?.terminalId;
              if (!panelId) return false;
              const bootIds = bootPanelIdsRef.current;
              if (bootIds.size > 0 && !bootIds.has(panelId)) {
                logTerminalSession('startup-restore-skip', {
                  panelId,
                  reason: 'panel-not-in-boot-baseline',
                  action: action.action,
                });
                return true;
              }
              return false;
            },
            onRelaunch: async (action, panel, command) => {
              if (cancelled) return;
              logTerminalSession('startup-restore-relaunch', {
                panelId: action.terminalId,
                command,
                reason: action.reason,
                action: action.action,
              });
              applyPanelRelaunchCommand(action.terminalId, command, panel?.cwd || null, {
                emitEvent: true,
              });
            },
            onPanelLive: (panelId) => {
              if (cancelled) return;
              setPanelRestoreModes((prev) => {
                const next = { ...prev };
                delete next[panelId];
                return next;
              });
            },
          });

          if (cancelled) return;

          setPanelRestoreModes((prev) => {
            const next = { ...prev };
            queueResult.manualPanelIds.forEach((panelId) => {
              next[panelId] = 'suspended';
            });
            manifest.terminalSessions.forEach((session) => {
              if (session.restorePolicy === 'off' && session.sessionKind === 'opencode') {
                next[session.terminalId] = 'suspended';
              }
            });
            queueResult.livePanelIds.forEach((panelId) => {
              delete next[panelId];
            });
            Object.keys(next).forEach((panelId) => {
              if (
                !queueResult.manualPanelIds.includes(panelId) &&
                !manifest.terminalSessions.some(
                  (session) =>
                    session.terminalId === panelId &&
                    session.restorePolicy === 'off' &&
                    session.sessionKind === 'opencode'
                )
              ) {
                delete next[panelId];
              }
            });
            return next;
          });
        });
      } catch {
        // Startup restore must not block workspace boot.
      } finally {
        if (!cancelled) {
          startupRestoreCompletedRef.current = true;
          markStartupRestoreCompletedForSession(sessionStorage);
        }
      }
    };

    runStartupRestore();

    return () => {
      cancelled = true;
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    isClientLoaded,
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

  // Persist dock state for the workspace this state belongs to.
  useEffect(() => {
    if (!isClientLoaded || !dockWorkspaceId) return;
    writeRightDockState(storage, projectId, dockWorkspaceId, rightDockState);
  }, [dockWorkspaceId, isClientLoaded, projectId, rightDockState, storage]);

  useEffect(() => {
    if (!isClientLoaded) return;
    writeBrowserWindowStates(storage, projectId, browserWindowStates);
  }, [browserWindowStates, isClientLoaded, projectId, storage]);

  useEffect(() => {
    if (!isClientLoaded || !activeWsId || activeWsId === dockWorkspaceId) return;
    setDockWorkspaceId(activeWsId);
    setRightDockState(readRightDockState(storage, projectId, activeWsId));
  }, [activeWsId, dockWorkspaceId, isClientLoaded, projectId, storage]);

  useEffect(() => {
    if (rightDockState.visible) {
      setHasMountedRightDock(true);
    }
  }, [rightDockState.visible]);

  useEffect(() => {
    if (!isDraggingDock) return undefined;

    const stopDockDrag = () => setIsDraggingDock(false);

    window.addEventListener('mouseup', stopDockDrag);
    window.addEventListener('pointerup', stopDockDrag);
    window.addEventListener('dragend', stopDockDrag);
    window.addEventListener('blur', stopDockDrag);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopDockDrag();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Continuous rAF sync while dragging: read placeholder geometry and write
    // left/width directly on the dock layer so resize tracks at display refresh
    // without waiting for React commits or localStorage persistence.
    let raf = null;
    const tick = () => {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        applyLiveRightDockBoundsRef.current?.();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mouseup', stopDockDrag);
      window.removeEventListener('pointerup', stopDockDrag);
      window.removeEventListener('dragend', stopDockDrag);
      window.removeEventListener('blur', stopDockDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [isDraggingDock]);

  useEffect(() => {
    if (!isDraggingInternalSplit) return undefined;

    const stopSplitDrag = () => setIsDraggingInternalSplit(false);

    window.addEventListener('mouseup', stopSplitDrag);
    window.addEventListener('pointerup', stopSplitDrag);
    window.addEventListener('dragend', stopSplitDrag);
    window.addEventListener('blur', stopSplitDrag);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopSplitDrag();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('mouseup', stopSplitDrag);
      window.removeEventListener('pointerup', stopSplitDrag);
      window.removeEventListener('dragend', stopSplitDrag);
      window.removeEventListener('blur', stopSplitDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDraggingInternalSplit]);

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
    if (!workspaces.length) return;

    setWorkspaceWindows((prev) => {
      let changed = false;
      const next = { ...prev };

      workspaces.forEach((ws) => {
        const existing = Array.isArray(next[ws.id]) ? next[ws.id] : [];
        if (existing.length === 0) {
          windowCounterRef.current += 1;
          const windowId = `v${windowCounterRef.current}`;
          const panelId = activePanelIds[ws.id] || ws.columns?.[0]?.panels?.[0]?.id || null;
          next[ws.id] = [createWindow(windowId, 'V1', ws.columns, panelId)];
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setActiveWindowIds((prev) => {
      let changed = false;
      const next = { ...prev };

      workspaces.forEach((ws) => {
        const windows = workspaceWindows[ws.id] || [];
        const candidate = prev[ws.id];
        if (!candidate || !windows.some((w) => w.id === candidate)) {
          const firstId = windows[0]?.id;
          if (firstId) {
            next[ws.id] = firstId;
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [workspaces, workspaceWindows, activePanelIds]);

  useEffect(() => {
    const maxWindowId = Object.values(workspaceWindows || {})
      .flat()
      .reduce((maxValue, windowView) => {
        const match = /^v(\d+)$/i.exec(String(windowView?.id || ''));
        if (!match) return maxValue;
        return Math.max(maxValue, Number(match[1]));
      }, 1);

    windowCounterRef.current = Math.max(windowCounterRef.current, maxWindowId);
  }, [workspaceWindows]);

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
  const activeSwarmLaunchSummary = readWorkspaceSwarmLaunchSummary(
    storage,
    activeWorkspace,
    projectId,
    swarmControlSnapshot
  );
  const { pendingCountByRole: swarmInboxPendingByRole } = useSwarmBusSnapshot(
    activeSwarmLaunchSummary?.launchId || null,
    { enabled: Boolean(activeSwarmLaunchSummary?.launchId) }
  );
  const activeWorkspaceOwnsDockState = activeWorkspace?.id === dockWorkspaceId;
  const effectiveRightDockState = activeWorkspaceOwnsDockState
    ? rightDockState
    : { ...DEFAULT_RIGHT_DOCK_STATE };

  // pizarra-sidebar-toggle-sync: notify App.js when Pizarra canvas mode is active
  // so the main workspace sidebar can be autohidden or collapsed.
  useEffect(() => {
    const isPizarraActive = !!(
      effectiveRightDockState?.visible &&
      effectiveRightDockState?.maximized &&
      effectiveRightDockState?.maximizedView === 'pizarra'
    );
    window.dispatchEvent(
      new CustomEvent('devhub:pizarra-active', {
        detail: { active: isPizarraActive },
      })
    );
  }, [
    effectiveRightDockState?.visible,
    effectiveRightDockState?.maximized,
    effectiveRightDockState?.maximizedView,
  ]);

  // Live direct nudge for the (native gtk) browser surface during dock drag.
  // Mirrors the strong-sync pattern in PizarraBrowserSurface (direct DOM + direct
  // resizeNativeBrowser in mousemove tick + force reflow + query shell rect).
  // This makes the embedded browser content follow the dock resize handle with
  // minimal latency instead of waiting for React state + motion + RO roundtrip.
  // Only active while isDraggingDock to avoid unnecessary work.
  const nudgeBrowserNativeLive = useCallback(() => {
    if (!isDraggingDock) return;
    if (typeof document === 'undefined') return;
    // Only worth it if the right dock is showing browser content.
    const showingBrowser =
      effectiveRightDockState.visible &&
      !effectiveRightDockState.maximized &&
      (effectiveRightDockState.activeTab === 'browser' || !effectiveRightDockState.activeTab);
    if (!showingBrowser) return;

    try {
      // Query the actual viewport shell that the browser pane uses for native bounds.
      // Scoped to the current dock layer if possible.
      const dockLayer = document.querySelector('[data-testid="workspace-right-dock-layer"]');
      const shell =
        (dockLayer && dockLayer.querySelector('[data-testid="browser-viewport-shell"]')) ||
        document.querySelector('[data-testid="browser-viewport-shell"]');
      if (!shell) return;

      const r = shell.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;

      const wsId = activeWsIdRef.current;
      if (!projectId || !wsId) return;

      const panelId = `browser-${projectId}-${wsId}`;

      // Dynamic so we don't pull the bridge into the main bundle unconditionally.
      import('@/lib/browser/nativeBrowserBridge')
        .then(({ resizeNativeBrowser }) => {
          resizeNativeBrowser({
            panelId,
            bounds: {
              x: Math.round(r.left),
              y: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
            },
          }).catch(() => {});
        })
        .catch(() => {});
    } catch {
      /* best effort during gesture */
    }
  }, [
    isDraggingDock,
    effectiveRightDockState.visible,
    effectiveRightDockState.maximized,
    effectiveRightDockState.activeTab,
    projectId,
  ]);

  nudgeBrowserNativeLiveRef.current = nudgeBrowserNativeLive;

  const applyLiveRightDockBounds = useCallback(() => {
    if (!isDraggingDockRef.current) return false;

    const containerElement = workspaceGridAreaRef.current;
    const placeholderElement = rightDockPlaceholderRef.current;
    const dockLayer = rightDockLayerRef.current;
    if (!containerElement || !placeholderElement || !dockLayer) return false;

    const nextBounds = resolveMeasuredRightDockBounds(
      containerElement.getBoundingClientRect?.(),
      placeholderElement.getBoundingClientRect?.()
    );
    if (!nextBounds) return false;

    const changed = applyRightDockLayerBounds(dockLayer, nextBounds);
    if (changed) {
      nudgeBrowserNativeLiveRef.current?.();
    }
    return changed;
  }, []);
  applyLiveRightDockBoundsRef.current = applyLiveRightDockBounds;

  const activePanelId = activePanelIds[activeWsId] || activeWorkspace?.columns[0]?.panels[0]?.id;
  const requestedRendererMode = resolveRequestedRenderer({
    workspaceId: activeWsId,
    panelId: activePanelId,
    prefs: terminalRendererPreferences,
  });
  const activeBrowserWindowState = browserWindowStates?.[activeWsId] || null;
  const isFullscreenBrowser =
    effectiveRightDockState.visible &&
    effectiveRightDockState.maximized &&
    (effectiveRightDockState.maximizedView === 'browser' ||
      effectiveRightDockState.maximizedView === 'swarm' ||
      effectiveRightDockState.maximizedView === 'pizarra');
  const pizarraOwnsLiveSurfaces =
    effectiveRightDockState.visible &&
    effectiveRightDockState.maximized &&
    effectiveRightDockState.maximizedView === 'pizarra';
  const hideRightDockPanel =
    effectiveRightDockState.maximized && effectiveRightDockState.maximizedView === 'window';
  const dockLayerVisible = effectiveRightDockState.visible && !hideRightDockPanel;
  const rightDockAnimProps = getRightDockAnimProps({
    isVisible: dockLayerVisible,
    isDragging: isDraggingDock,
  });
  // With carve/avoid rects we can show web popups (Grillas, swarm wizard, etc)
  // over *live* (carved) terminals without full suspend for most cases.
  // We still compute shouldSuspend for legacy/restore paths, but carve takes
  // precedence for "mostrar cosas sobre la terminal" in active panels.
  // See overlayAvoidRects + computeCarvedBounds + registration below.
  const shouldSuspendNativeSurfaces =
    /* isGridLauncherOpen || swarmLaunchWizardOpen || */ restoreSettingsModal.open;
  const nativeSurfacePolicy = shouldSuspendNativeSurfaces ? 'transient-overlay' : 'live';

  // --- Carve / avoid rects registration for popups over live terminals ---
  // When a popup (grillas dropdown, wizard, etc) opens that must sit above terminal
  // areas, we measure its rect and add to overlayAvoidRects. The native sync then
  // sends avoids to TTYs; TTYs compute carved bounds and pass reduced rects to
  // setNativeVtePanelVisibility (visible=true + small bounds). VTE widget shrinks
  // temporarily to the visible parts; web paints in the "hole". On close, full
  // bounds restored. Terminal pty size stays full (child TUIs unaffected).
  // This is the main path to fix "no se logra mostrar cosas sobre la terminal sin
  // tener que suspenderla".
  useEffect(() => {
    if (!isGridLauncherOpen) {
      setOverlayAvoidRects((prev) => prev.filter((r) => r.source !== 'grillas-launcher'));
      return;
    }
    let rafId = 0;
    const measure = () => {
      const el = document.querySelector('[data-testid="workspace-grid-launcher-content"]');
      if (el) {
        const r = el.getBoundingClientRect();
        const rect = {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          source: 'grillas-launcher',
        };
        setOverlayAvoidRects((prev) => {
          const others = prev.filter((r) => r.source !== 'grillas-launcher');
          return [...others, rect];
        });
      }
    };
    measure();
    rafId = requestAnimationFrame(measure);
    const t = setTimeout(measure, 60);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t);
    };
  }, [isGridLauncherOpen]);

  // Measurement for swarm wizard (large modal) - carve instead of suspend while open
  // so terminals under it stay live (partial view).
  useEffect(() => {
    if (!swarmLaunchWizardOpen) {
      setOverlayAvoidRects((prev) => prev.filter((r) => r.source !== 'swarm-wizard'));
      return;
    }
    const measure = () => {
      // inner content card of the wizard
      const el = document.querySelector('.max-w-6xl.flex-col.overflow-hidden.rounded-none.border');
      if (el) {
        const r = el.getBoundingClientRect();
        setOverlayAvoidRects((prev) => {
          const others = prev.filter((r) => r.source !== 'swarm-wizard');
          return [
            ...others,
            { x: r.x, y: r.y, width: r.width, height: r.height, source: 'swarm-wizard' },
          ];
        });
      }
    };
    measure();
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [swarmLaunchWizardOpen]);

  // Measurement for restore settings modal.
  useEffect(() => {
    if (!restoreSettingsModal.open) {
      setOverlayAvoidRects((prev) => prev.filter((r) => r.source !== 'restore-settings'));
      return;
    }
    const measure = () => {
      const el = document.querySelector('[role="dialog"] .fixed.inset-0');
      if (el) {
        const r = el.getBoundingClientRect();
        setOverlayAvoidRects((prev) => {
          const others = prev.filter((r) => r.source !== 'restore-settings');
          return [
            ...others,
            { x: r.x, y: r.y, width: r.width, height: r.height, source: 'restore-settings' },
          ];
        });
      }
    };
    measure();
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [restoreSettingsModal.open]);

  // TODO for pizarra palette / overlapping canvas elements: register their rects
  // when they overlap terminal surfaces (can use the register event below or direct).

  // General registration for any component to carve terminals under it without
  // full suspend. Components dispatch CustomEvent with {rect, source, action?}
  // on open/mount and remove on close/unmount. Decoupled, works from pizarra etc.
  useEffect(() => {
    const handler = (ev) => {
      const { rect, source, action = 'add' } = ev?.detail || {};
      if (!source || !rect) return;
      setOverlayAvoidRects((prev) => {
        if (action === 'remove' || action === 'clear') {
          return prev.filter((r) => r.source !== source);
        }
        const others = prev.filter((r) => r.source !== source);
        return [
          ...others,
          { x: rect.x, y: rect.y, width: rect.width, height: rect.height, source },
        ];
      });
    };
    window.addEventListener('devhub:register-avoid-rect', handler);
    return () => window.removeEventListener('devhub:register-avoid-rect', handler);
  }, []);

  const rightDockLayerStyle = resolveRightDockLayerStyle({
    isFullscreenBrowser,
    size: effectiveRightDockState.size,
    measuredBounds: rightDockMeasuredBounds,
  });
  const rightDockLayerChromeStyle = isDraggingDock
    ? { top: 0, right: 'auto', bottom: 0 }
    : rightDockLayerStyle;

  const syncRightDockMeasuredBounds = useCallback(() => {
    if (
      isFullscreenBrowser ||
      !effectiveRightDockState.visible ||
      effectiveRightDockState.maximized ||
      hideRightDockPanel
    ) {
      setRightDockMeasuredBounds(null);
      return;
    }

    const containerElement = workspaceGridAreaRef.current;
    const placeholderElement = rightDockPlaceholderRef.current;
    if (!containerElement || !placeholderElement) {
      setRightDockMeasuredBounds(null);
      return;
    }

    const containerRect = containerElement.getBoundingClientRect?.();
    const placeholderRect = placeholderElement.getBoundingClientRect?.();

    const nextBounds = resolveMeasuredRightDockBounds(containerRect, placeholderRect);
    if (!nextBounds) {
      setRightDockMeasuredBounds(null);
      return;
    }

    if (isDraggingDockRef.current) {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        applyLiveRightDockBoundsRef.current?.();
      }
      return;
    }

    setRightDockMeasuredBounds((prev) => {
      if (
        prev &&
        prev.left === nextBounds.left &&
        prev.right === nextBounds.right &&
        prev.width === nextBounds.width
      ) {
        return prev;
      }
      return nextBounds;
    });
  }, [
    effectiveRightDockState.maximized,
    effectiveRightDockState.visible,
    hideRightDockPanel,
    isFullscreenBrowser,
  ]);
  syncRightDockMeasuredBoundsRef.current = syncRightDockMeasuredBounds;

  useLayoutEffect(() => {
    syncRightDockMeasuredBounds();
  }, [syncRightDockMeasuredBounds, effectiveRightDockState.size, activeWsId, isVisible]);

  useEffect(() => {
    if (
      isFullscreenBrowser ||
      !effectiveRightDockState.visible ||
      effectiveRightDockState.maximized ||
      hideRightDockPanel
    ) {
      return undefined;
    }

    const containerElement = workspaceGridAreaRef.current;
    const placeholderElement = rightDockPlaceholderRef.current;
    if (!containerElement || !placeholderElement) {
      return undefined;
    }

    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', syncRightDockMeasuredBounds);
      return () => window.removeEventListener('resize', syncRightDockMeasuredBounds);
    }

    const observer = new ResizeObserver(() => {
      syncRightDockMeasuredBounds();
    });

    observer.observe(containerElement);
    observer.observe(placeholderElement);
    return () => observer.disconnect();
  }, [
    effectiveRightDockState.maximized,
    effectiveRightDockState.visible,
    hideRightDockPanel,
    isFullscreenBrowser,
    syncRightDockMeasuredBounds,
  ]);

  // Initial / visibility-change eager measurement for the right dock layer.
  // On default open of the browser (or dock), the first measuredBounds (pixel-accurate
  // from placeholder) may arrive after the motion layer has already rendered with the
  // % fallback. That causes the initial "dimensiones bastante alejados".
  // We force a few syncs (layout + microtasks + rAFs) so the first style passed to the
  // motion is already the correct rect, and the inner browser shell + native get good
  // bounds immediately. Also helps when switching tabs to browser.
  useEffect(() => {
    if (
      isFullscreenBrowser ||
      !effectiveRightDockState.visible ||
      effectiveRightDockState.maximized ||
      hideRightDockPanel
    ) {
      return undefined;
    }

    // Run immediately (useLayout already does one), then a few more beats to let
    // inner content (toolbar heights etc) and any pending panel lib measurements settle.
    // In tests we only do the immediate one to avoid async setState after flushEffects
    // that would make subsequent queries/clicks see a different tree (elements become null).
    syncRightDockMeasuredBounds();
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return undefined;
    }
    const t0 = setTimeout(() => syncRightDockMeasuredBounds(), 0);
    const t1 = setTimeout(() => syncRightDockMeasuredBounds(), 16);
    const r1 = requestAnimationFrame(() => syncRightDockMeasuredBounds());
    const r2 = requestAnimationFrame(() =>
      requestAnimationFrame(() => syncRightDockMeasuredBounds())
    );

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [
    effectiveRightDockState.visible,
    effectiveRightDockState.maximized,
    effectiveRightDockState.activeTab, // when user or code switches to browser tab
    hideRightDockPanel,
    isFullscreenBrowser,
    syncRightDockMeasuredBounds,
  ]);

  workspacesRef.current = workspaces;
  activeWsIdRef.current = activeWsId;
  activePanelIdsRef.current = activePanelIds;
  activeWindowIdsRef.current = activeWindowIds;
  workspaceWindowsRef.current = workspaceWindows;
  focusedPanelByWorkspaceRef.current = focusedPanelByWorkspace;

  useEffect(() => {
    setSwarmLaunchDraft((current) =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        draft: current || {},
      })
    );
  }, [swarmLaunchCatalog, swarmLaunchProject]);

  const updateSwarmLaunchDraft = useCallback(
    (patch = {}) => {
      setSwarmLaunchDraft((current) =>
        createSwarmLaunchDraft({
          catalog: swarmLaunchCatalog,
          project: swarmLaunchProject,
          draft: { ...(current || {}), ...patch },
        })
      );
    },
    [swarmLaunchCatalog, swarmLaunchProject]
  );

  const openTerminalSwarmLauncher = useCallback(() => {
    setSwarmLaunchDraft((current) =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        preferredTemplateId: swarmLaunchCatalog?.recommended_template_id,
        draft: current || {},
      })
    );
    setSwarmLaunchSubmitState({ submitting: false, error: null });
    setSwarmLaunchWizardStep('team');
    setSwarmLaunchWizardOpen(true);
  }, [swarmLaunchCatalog, swarmLaunchProject]);

  const handleTerminalSwarmLaunch = useCallback(async () => {
    if (!projectId) {
      setSwarmLaunchSubmitState({
        submitting: false,
        error: 'No hay project_id para lanzar el swarm desde terminales.',
      });
      return;
    }

    setSwarmLaunchSubmitState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch_swarm_local',
          project_id: projectId,
          draft: swarmLaunchPreview?.draft,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo lanzar el swarm desde terminales.');
      }

      const runtimeRequests = payload?.launch_result?.runtime_requests || [];
      if (runtimeRequests.length === 0) {
        const failedRoles = payload?.launch_result?.failed_roles || [];
        const failedDetail = failedRoles
          .map(
            (role) => `${role?.roleLabel || role?.roleKey}: ${role?.error || 'error desconocido'}`
          )
          .join(' | ');
        throw new Error(
          failedDetail
            ? `El swarm no se lanzó: no se pudo inicializar ningún agente. ${failedDetail}`
            : 'El swarm no se lanzó: no se pudo inicializar ningún agente.'
        );
      }

      if (payload.control_room_snapshot_input) {
        try {
          localStorage.setItem(
            getSwarmSnapshotStorageKey(projectId),
            JSON.stringify(payload.control_room_snapshot_input)
          );
        } catch {
          // Ignore localStorage failures.
        }
        setSwarmControlSnapshot(payload.control_room_snapshot_input);
      }

      dispatchSwarmLaunchMaterialized(runtimeRequests);

      setSwarmLaunchWizardOpen(false);
      setSwarmLaunchSubmitState({ submitting: false, error: null });
    } catch (error) {
      setSwarmLaunchSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo lanzar el swarm desde terminales.',
      });
    }
  }, [projectId, swarmLaunchPreview?.draft]);

  const updateRightDockState = useCallback((nextValue) => {
    setRightDockState((prev) => {
      const currentState = prev ?? { ...DEFAULT_RIGHT_DOCK_STATE };
      const resolvedState =
        typeof nextValue === 'function'
          ? nextValue(currentState)
          : { ...currentState, ...nextValue };
      return sanitizeRightDockState(resolvedState);
    });
  }, []);

  const lastZedOpenUrlRef = useRef({ url: null, label: null });

  // Operator action cards — consumed from OperatorActionsDispatchContext (provider lives in App.js)
  const { cards: operatorCards, confirmCard, cancelCard } = useOperatorActionsDispatch();

  const updateBrowserWindowState = useCallback((wsId, nextValue) => {
    if (!wsId) return;
    setBrowserWindowStates((prev) => {
      const currentState = prev?.[wsId] || {};
      const resolvedState =
        typeof nextValue === 'function'
          ? nextValue(currentState)
          : { ...currentState, ...nextValue };
      return {
        ...prev,
        [wsId]: resolvedState,
      };
    });
  }, []);

  const handleResetPanelRendererToXterm = useCallback((workspaceId, panelId) => {
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, workspaceId, panelId, 'xterm')
    );
  }, []);

  // Set the per-panel renderer preference (driven by the per-panel header
  // switcher in WorkspaceTerminalSurface / renderWorkspacePanel).
  // Mirrors handleResetPanelRendererToXterm but accepts an arbitrary mode
  // (xterm-webgl | vte-experimental | inherit). See
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

  const closeWorkspaceBrowserWindow = useCallback(
    async (wsId) => {
      if (!wsId) return;

      const browserState = browserWindowStates?.[wsId];
      const label = browserState?.label || buildBrowserWindowLabel(projectId, wsId);

      try {
        if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const existingWindow = await WebviewWindow.getByLabel(label);
          await existingWindow?.close().catch(() => {});
        }
      } catch {
        // Ignore Tauri close failures so state can still be cleaned up locally.
      } finally {
        updateBrowserWindowState(wsId, {
          open: false,
          label,
          url: '',
          updatedAt: Date.now(),
        });
      }
    },
    [browserWindowStates, projectId, updateBrowserWindowState]
  );

  useEffect(() => {
    if (!isClientLoaded || typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;

    let cancelled = false;

    async function reconcileBrowserWindows() {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const entries = await Promise.all(
          Object.entries(browserWindowStates || {}).map(async ([wsId, state]) => {
            const label = state?.label || buildBrowserWindowLabel(projectId, wsId);
            const existingWindow = await WebviewWindow.getByLabel(label);

            if (existingWindow) {
              existingWindow.once('tauri://destroyed', () => {
                updateBrowserWindowState(wsId, {
                  open: false,
                  label,
                  url: '',
                  updatedAt: Date.now(),
                });
              });
            }

            return [
              wsId,
              {
                ...state,
                label,
                open: Boolean(existingWindow),
                url: existingWindow ? state?.url || '' : '',
                updatedAt: Date.now(),
              },
            ];
          })
        );

        if (cancelled || entries.length === 0) return;

        setBrowserWindowStates((prev) => {
          let changed = false;
          const next = { ...prev };

          entries.forEach(([wsId, state]) => {
            const previous = prev?.[wsId] || {};
            if (
              previous.open !== state.open ||
              previous.label !== state.label ||
              previous.url !== state.url
            ) {
              changed = true;
            }
            next[wsId] = state;
          });

          return changed ? next : prev;
        });
      } catch {
        // Ignore reconciliation errors outside desktop contexts.
      }
    }

    reconcileBrowserWindows();

    return () => {
      cancelled = true;
    };
  }, [browserWindowStates, isClientLoaded, projectId, updateBrowserWindowState]);

  const handleRightDockTabSelect = useCallback(
    (tab) => {
      updateRightDockState((currentState) => applyRightDockTabSelect(currentState, tab));
    },
    [updateRightDockState]
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

  const buildNativeWorkspaceSyncDetail = useCallback(
    (reason = 'workspace-switch') => {
      const activePanelIdsForNativeSurface = [];
      const hiddenPanelIdsForNativeSurface = [];

      workspaces.forEach((workspace) => {
        const panelIds = getAllPanelIds(workspace.columns || []);
        const focusedPanelId = focusedPanelByWorkspace[workspace.id];

        if (workspace.id === activeWsId) {
          if (focusedPanelId) {
            activePanelIdsForNativeSurface.push(focusedPanelId);
            panelIds.forEach((id) => {
              if (id !== focusedPanelId) {
                hiddenPanelIdsForNativeSurface.push(id);
              }
            });
          } else {
            activePanelIdsForNativeSurface.push(...panelIds);
          }
        } else {
          hiddenPanelIdsForNativeSurface.push(...panelIds);
        }
      });

      return {
        activeWorkspaceId: activeWsId,
        workspaceId: activeWsId,
        activePanelIds: isVisible ? activePanelIdsForNativeSurface : [],
        hiddenPanelIds: isVisible
          ? hiddenPanelIdsForNativeSurface
          : [...activePanelIdsForNativeSurface, ...hiddenPanelIdsForNativeSurface],
        reason: isVisible ? reason : 'terminal-manager-hidden',
        // Sent to TTYs so they can carve bounds for panels under popups (see
        // computeCarvedBounds). Enables showing web UI over live terminals.
        avoidRects: overlayAvoidRects,
      };
    },
    [activeWsId, focusedPanelByWorkspace, getAllPanelIds, isVisible, workspaces, overlayAvoidRects]
  );

  const layoutSettleCleanupRef = useRef(null);

  const notifyNativeLayoutSettled = useCallback(
    (reason) => {
      if (typeof window === 'undefined') return;

      layoutSettleCleanupRef.current?.();
      const isSinglePanelWorkspaceSwitch =
        reason === 'workspace-switch' && getActiveWorkspaceTerminalPanelCount() <= 1;
      layoutSettleCleanupRef.current = schedulePostLayoutNativeSync({
        layoutReason: reason,
        workspaceDetail: buildNativeWorkspaceSyncDetail(reason),
        includeFollowUpPasses: !isSinglePanelWorkspaceSwitch,
      });
    },
    [buildNativeWorkspaceSyncDetail, getActiveWorkspaceTerminalPanelCount]
  );

  useEffect(
    () => () => {
      layoutSettleCleanupRef.current?.();
      layoutSettleCleanupRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !isClientLoaded) return undefined;
    notifyNativeLayoutSettled('workspace-switch');
    return undefined;
  }, [activeWsId, isClientLoaded, notifyNativeLayoutSettled]);

  // When avoid rects change (popup opened/closed/resized), immediately tell active
  // terminals so they carve (or restore full) without waiting for a layout event.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const detail = buildNativeWorkspaceSyncDetail('popup-avoid-rects');
    dispatchNativeVteWorkspaceSync(detail);
  }, [overlayAvoidRects, buildNativeWorkspaceSyncDetail]);

  const panelLayoutDebounceRef = useRef(null);

  const handlePanelGroupLayout = useCallback(() => {
    if (isDraggingInternalSplit || isDraggingDock) return;

    if (panelLayoutDebounceRef.current) {
      clearTimeout(panelLayoutDebounceRef.current);
    }

    panelLayoutDebounceRef.current = setTimeout(() => {
      panelLayoutDebounceRef.current = null;
      notifyNativeLayoutSettled('panel-group-layout');
    }, 32);
  }, [isDraggingDock, isDraggingInternalSplit, notifyNativeLayoutSettled]);

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
      const scheduleFocusLayoutSync = (phase) => {
        dispatchTerminalLayoutSettled({
          reason: 'panel-focus-toggle',
          workspaceId,
          panelIds,
          phase,
        });
      };
      scheduleFocusLayoutSync('immediate');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scheduleFocusLayoutSync('raf'));
      });
      window.setTimeout(() => scheduleFocusLayoutSync('delay-120'), 120);
      window.setTimeout(() => scheduleFocusLayoutSync('delay-340'), 340);
      notifyNativeLayoutSettled('panel-focus-toggle');
    },
    [notifyNativeLayoutSettled]
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
        setFocusedPanelByWorkspace((prev) => ({ ...prev, [workspaceId]: panelId }));
        const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
        const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [panelId];
        schedulePanelFocusLayoutSync(workspaceId, panelIds);
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

      if (nextPanelId) {
        setActivePanelIds((prev) =>
          prev[nextWorkspaceId] === nextPanelId ? prev : { ...prev, [nextWorkspaceId]: nextPanelId }
        );
        pulsePanelNavigation(nextPanelId);
      }

      setActiveWsId(nextWorkspaceId);
      notifyNativeLayoutSettled('workspace-switch');
    },
    [notifyNativeLayoutSettled, pulsePanelNavigation]
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

  const scheduleNativePanelFocus = useCallback((panelId) => {
    if (!panelId || !isNativeVteRuntimeAvailable()) return;
    Promise.resolve(focusNativeVtePanel({ panelId })).catch(() => {});
  }, []);

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
        if (nextPanelId) {
          scheduleNativePanelFocus(nextPanelId);
        }
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
        scheduleNativePanelFocus(navigationTarget.panelId);
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
      if (nextPanelId) {
        scheduleNativePanelFocus(nextPanelId);
      }
      return true;
    },
    [isVisible, navigateToPanel, scheduleNativePanelFocus, switchWorkspace, togglePanelFocus]
  );

  useEffect(() => {
    if (!isNativeVteRuntimeAvailable()) return undefined;

    let unsubscribe = () => {};
    let cancelled = false;

    Promise.resolve(subscribeNativeVteEvents())
      .then((unsub) => {
        if (cancelled) {
          unsub?.();
          return;
        }
        unsubscribe = typeof unsub === 'function' ? unsub : () => {};
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const syncActiveWindowSnapshot = useCallback(
    (wsId, columns, nextActivePanelId = null) => {
      setWorkspaceWindows((prev) => {
        const windows = prev[wsId] || [];
        const activeWindowId = activeWindowIds[wsId];
        if (!activeWindowId || windows.length === 0) return prev;

        return {
          ...prev,
          [wsId]: windows.map((win) => {
            if (win.id !== activeWindowId) return win;
            return {
              ...win,
              columns,
              activePanelId:
                nextActivePanelId ||
                win.activePanelId ||
                columns.flatMap((col) => col.panels || [])[0]?.id ||
                null,
            };
          }),
        };
      });
    },
    [activeWindowIds]
  );

  const addWindowToWorkspace = useCallback((wsId) => {
    panelCounterRef.current += 1;
    colCounterRef.current += 1;
    windowCounterRef.current += 1;

    const newPanelId = `p${panelCounterRef.current}`;
    const newColId = `c${colCounterRef.current}`;
    const newWindowId = `v${windowCounterRef.current}`;
    const newColumns = [createColumn(newColId, newPanelId)];

    setWorkspaceWindows((prev) => {
      const existing = prev[wsId] || [];
      return {
        ...prev,
        [wsId]: [
          ...existing,
          createWindow(newWindowId, `V${existing.length + 1}`, newColumns, newPanelId),
        ],
      };
    });

    setActiveWindowIds((prev) => ({ ...prev, [wsId]: newWindowId }));
    setActivePanelIds((prev) => ({ ...prev, [wsId]: newPanelId }));
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, wsId, newPanelId, TERMINAL_RENDERER_INHERIT_MODE)
    );

    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === wsId ? { ...ws, columns: newColumns } : ws))
    );
  }, []);

  const switchWindowInWorkspace = useCallback(
    (wsId, windowId) => {
      const windows = workspaceWindows[wsId] || [];
      const nextWindow = windows.find((win) => win.id === windowId);
      if (!nextWindow) return;

      const nextPanelId =
        nextWindow.activePanelId ||
        nextWindow.columns?.flatMap((col) => col.panels || [])[0]?.id ||
        null;

      setActiveWindowIds((prev) => ({ ...prev, [wsId]: windowId }));
      if (nextPanelId) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: nextPanelId }));
      }

      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === wsId ? { ...ws, columns: nextWindow.columns || ws.columns } : ws
        )
      );
    },
    [workspaceWindows]
  );

  const removeWindowFromWorkspace = useCallback(
    async (wsId, windowId) => {
      const windows = workspaceWindows[wsId] || [];
      if (windows.length <= 1) return;

      const targetWindow = windows.find((win) => win.id === windowId);
      if (targetWindow?.columns?.length) {
        const panelIds = getAllPanelIds(targetWindow.columns);
        await closeTerminalSessions(panelIds);
        // Also close any native VTE visuals for the panels in the removed window
        // to avoid ghosts when closing sub-windows/tabs of terminals.
        try {
          const { closeNativeVtePanel } = await import('@/lib/terminal/nativeVteBridge');
          for (const pid of panelIds) {
            await closeNativeVtePanel({ panelId: pid, reason: 'workspace-window-removed' }).catch(
              () => {}
            );
          }
        } catch {
          /* ignore close error for native panel */
        }
      }

      const nextWindows = windows.filter((win) => win.id !== windowId);
      const nextActiveWindowId =
        activeWindowIds[wsId] === windowId ? nextWindows[0]?.id : activeWindowIds[wsId];
      const nextActiveWindow =
        nextWindows.find((win) => win.id === nextActiveWindowId) || nextWindows[0];
      const nextPanelId =
        nextActiveWindow?.activePanelId ||
        nextActiveWindow?.columns?.flatMap((col) => col.panels || [])[0]?.id ||
        null;

      setWorkspaceWindows((prev) => ({ ...prev, [wsId]: nextWindows }));
      setActiveWindowIds((prev) => ({ ...prev, [wsId]: nextActiveWindowId }));

      if (nextPanelId) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: nextPanelId }));
      }

      if (nextActiveWindow?.columns) {
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === wsId ? { ...ws, columns: nextActiveWindow.columns } : ws))
        );
      }
    },
    [workspaceWindows, activeWindowIds]
  );

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
          createPanel,
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
    },
    [cwd]
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
    const targetWorkspace = remainingWorkspaces.find(
      (workspace) => workspace.id === nextActiveWsId
    );
    const targetPanelIds = targetWorkspace ? getAllPanelIds(targetWorkspace.columns) : [];

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
    // Close native VTEs for all panels of the removed workspace so no
    // "terminal fantasma" can remain and paint over browser or other workspaces.
    try {
      const { closeNativeVtePanel } = await import('@/lib/terminal/nativeVteBridge');
      for (const pid of panelIdsToClean) {
        await closeNativeVtePanel({ panelId: pid, reason: 'workspace-removed' }).catch(() => {});
      }
    } catch {
      /* ignore native close during ws remove */
    }
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

    // When the active workspace changes, activeWsId effect already emits workspace-switch.
    // Avoid duplicate layout bursts that flash/refit survivor terminals on close.
    if (!activeWsWillChange && typeof window !== 'undefined') {
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

  const createWorkspaceForSwarmLaunchRequests = useCallback(
    (requests = []) => {
      const launchId = String(requests[0]?.launchId || '').trim();
      if (launchId && materializedSwarmLaunchIdsRef.current.has(launchId)) {
        return;
      }

      const launchRequests = requests
        .map((request) => {
          const commandToRun = enforceDocOpsGateOnLaunchCommand(
            request.command || `opencode --agent ${request.selectedAgent || DEFAULT_OPENCODE_AGENT}`
          );
          const swarmRole = buildSwarmRoleMetadata(request);
          return { ...request, commandToRun, swarmRole };
        })
        .filter((request) => request.taskId && request.commandToRun);

      if (launchRequests.length === 0) return;

      const directorRequest =
        launchRequests.find((request) => isOrchestratorRoleKey(request.swarmRole?.roleKey)) || null;
      const workerRequests = launchRequests
        .filter((request) => request !== directorRequest)
        .sort(
          (a, b) =>
            getSwarmRoleOrder(a.swarmRole?.roleKey) - getSwarmRoleOrder(b.swarmRole?.roleKey)
        );

      const groupedRequests =
        directorRequest && launchRequests.length >= 3
          ? [
              workerRequests.filter((_, index) => index % 2 === 0),
              workerRequests.filter((_, index) => index % 2 === 1),
              [directorRequest],
            ].filter((columnRequests) => columnRequests.length > 0)
          : [launchRequests];

      wsCounterRef.current += 1;
      const newWsId = `ws${wsCounterRef.current}`;

      let firstPanelId = null;
      let directorPanelId = null;
      const panelAssignments = [];
      const newColumns = groupedRequests
        .filter((columnRequests) => columnRequests.length > 0)
        .map((columnRequests) => {
          colCounterRef.current += 1;
          const colId = `c${colCounterRef.current}`;
          const panels = columnRequests.map((request) => {
            panelCounterRef.current += 1;
            const panelId = `p${panelCounterRef.current}`;
            if (!firstPanelId) firstPanelId = panelId;
            if (isOrchestratorRoleKey(request.swarmRole?.roleKey)) directorPanelId = panelId;
            panelAssignments.push({ request, panelId });
            return createPanel(panelId, request.commandToRun, request.workspacePath || cwd, {
              swarmRole: request.swarmRole,
              swarmContext: {
                isSwarmRole: Boolean(request.isSwarmRole),
                roleKey: request.roleKey || request.swarmRole?.roleKey || null,
                launchId: request.launchId || null,
                needsLaunchWrapper: true,
                startAfterMs: Number.isFinite(request.startAfterMs) ? request.startAfterMs : 0,
              },
            });
          });
          return { id: colId, panels };
        });

      const launchLabel = launchRequests[0]?.taskTitle?.split(' · ')?.[0] || 'Swarm launch';
      const activePanelForLaunch = directorPanelId || firstPanelId;
      const nextWorkspace = {
        id: newWsId,
        name: launchLabel,
        columns: newColumns,
      };

      let previousSwarmPanelIds = [];
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        previousSwarmPanelIds = Object.values(runs || {})
          .filter((run) => run?.launchOrigin === 'swarm-control-launch' && run?.panelId)
          .map((run) => run.panelId);
      } catch {
        previousSwarmPanelIds = [];
      }
      if (previousSwarmPanelIds.length > 0) {
        closeTerminalSessions(previousSwarmPanelIds);
      }

      setWorkspaces((prev) => {
        const oldSwarmPanelIds = new Set(previousSwarmPanelIds);
        const retained = prev.filter((workspace) => {
          const panelIds = getAllPanelIds(workspace.columns || []);
          return !panelIds.some((panelId) => oldSwarmPanelIds.has(panelId));
        });
        return [...retained, nextWorkspace];
      });
      setActiveWsId(newWsId);
      setActivePanelIds((prev) => ({ ...prev, [newWsId]: activePanelForLaunch }));
      setTerminalRendererPreferences((prev) =>
        panelAssignments.reduce(
          (acc, assignment) =>
            setPanelRendererPreference(
              acc,
              newWsId,
              assignment.panelId,
              TERMINAL_RENDERER_INHERIT_MODE
            ),
          prev
        )
      );
      syncActiveWindowSnapshot(newWsId, newColumns, activePanelForLaunch);

      panelAssignments.forEach(({ request, panelId }) => {
        persistAgentRunMetadata(request, panelId, request.commandToRun);
      });

      if (launchId) {
        materializedSwarmLaunchIdsRef.current.add(launchId);
        const pendingBatch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
        if (pendingBatch?.timer) {
          window.clearTimeout(pendingBatch.timer);
        }
        pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
      }

      if (typeof window !== 'undefined') {
        const swarmPanelIds = panelAssignments.map(({ panelId }) => panelId);
        const scheduleSwarmViewportSync = (phase) => {
          dispatchTerminalLayoutSettled({
            reason: 'swarm-launch',
            workspaceId: newWsId,
            panelIds: swarmPanelIds,
            phase,
          });
        };
        scheduleSwarmViewportSync('immediate');
        notifyNativeLayoutSettled('swarm-launch');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scheduleSwarmViewportSync('raf'));
        });
        window.setTimeout(() => scheduleSwarmViewportSync('delay-120'), 120);
        window.setTimeout(() => scheduleSwarmViewportSync('delay-340'), 340);
        window.setTimeout(() => scheduleSwarmViewportSync('delay-500'), 500);
        window.setTimeout(() => scheduleSwarmViewportSync('delay-1000'), 1000);
      }
    },
    [cwd, notifyNativeLayoutSettled, persistAgentRunMetadata, syncActiveWindowSnapshot]
  );

  const flushSwarmLaunchBatch = useCallback(
    (launchId) => {
      const batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
      if (!batch) return;

      if (batch.timer) {
        window.clearTimeout(batch.timer);
        batch.timer = null;
      }

      pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
      createWorkspaceForSwarmLaunchRequests(batch.requests);
    },
    [createWorkspaceForSwarmLaunchRequests]
  );

  const flushPendingSwarmLaunchRequests = useCallback(() => {
    // Legacy: flush flat array if still used
    const requests = pendingSwarmLaunchRequestsRef.current;
    pendingSwarmLaunchRequestsRef.current = [];
    swarmLaunchFlushTimerRef.current = null;
    if (requests.length > 0) {
      createWorkspaceForSwarmLaunchRequests(requests);
    }
  }, [createWorkspaceForSwarmLaunchRequests]);

  const enqueueSwarmLaunchRequest = useCallback(
    (request) => {
      const launchId = request.launchId || 'unknown';
      if (launchId !== 'unknown' && materializedSwarmLaunchIdsRef.current.has(launchId)) {
        return;
      }
      let batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);

      if (!batch) {
        batch = { requests: [], timer: null };
        pendingSwarmLaunchByLaunchIdRef.current.set(launchId, batch);
      }

      batch.requests.push(request);

      // Sliding deadline: reset the idle window on every staggered runtime request
      // so we build one workspace with all roles instead of flushing early.
      batch.timer = rescheduleSwarmLaunchBatchFlush({
        existingTimerId: batch.timer,
        onFlush: () => flushSwarmLaunchBatch(launchId),
        clearTimeoutFn: window.clearTimeout.bind(window),
        setTimeoutFn: window.setTimeout.bind(window),
      });
    },
    [flushSwarmLaunchBatch]
  );

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
      }
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

          if (direction === 'horizontal') {
            // Split Right: Agregar una nueva columna a la derecha
            colCounterRef.current += 1;
            const newColId = `c${colCounterRef.current}`;
            nextColumnsSnapshot.splice(
              colIndex + 1,
              0,
              createColumn(newColId, newPanelId, initialCommand, panelCwd)
            );
          } else {
            // Split Down: Agregar un nuevo panel debajo en la misma columna
            const panelIndex = nextColumnsSnapshot[colIndex].panels.findIndex(
              (p) => p.id === targetId
            );
            const newPanels = [...nextColumnsSnapshot[colIndex].panels];
            newPanels.splice(panelIndex + 1, 0, createPanel(newPanelId, initialCommand, panelCwd));
            nextColumnsSnapshot[colIndex] = { ...nextColumnsSnapshot[colIndex], panels: newPanels };
          }

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
      return newPanelId;
    },
    [activeWsId, activePanelId, syncActiveWindowSnapshot]
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
                      updateWsDockState({
                        visible: true,
                        maximized: true,
                        maximizedView: 'window',
                      });
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

      await closeTerminalSessions([targetId]);

      // Force-close the native VTE (the actual terminal "window") for this panel.
      // The React unmount of TerminalTTY will also try via its cleanup, but
      // explicit here guarantees we don't leave "terminal fantasma" that can
      // paint on top of the browser dock, other terminals, or make the visual
      // divider (resize handle) between terminals disappear because a stale
      // native rect is still covering the handle's screen area.
      try {
        const { closeNativeVtePanel } = await import('@/lib/terminal/nativeVteBridge');
        await closeNativeVtePanel({ panelId: targetId, reason: 'workspace-panel-closed' }).catch(
          () => {}
        );
      } catch {
        // Non-fatal; the per-TTY unmount cleanup will still attempt it.
      }

      const nextColumnsSnapshot = activeWorkspace.columns
        .map((col) => ({
          ...col,
          panels: col.panels.filter((p) => p.id !== targetId),
        }))
        .filter((col) => col.panels.length > 0); // Eliminar columnas vacías

      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === activeWsId ? { ...ws, columns: nextColumnsSnapshot } : ws))
      );

      const fallbackPanel = nextColumnsSnapshot.flatMap((col) => col.panels || [])[0]?.id || null;
      if (activePanelId === targetId) {
        setActivePanelIds((p) => ({ ...p, [activeWsId]: fallbackPanel }));
      }
      syncActiveWindowSnapshot(activeWsId, nextColumnsSnapshot, fallbackPanel);
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
    [activeWorkspace, activeWsId, activePanelId, projectId, syncActiveWindowSnapshot]
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

  useEffect(() => {
    const handleNativeVteRuntimeEvent = (event) => {
      const detail = event.detail || {};

      if (detail.type === 'navigation-shortcut') {
        const action = typeof detail.action === 'string' ? detail.action.trim() : '';
        if (!action) return;
        if (isTerminalWorkspaceUiAction(action)) {
          applyTerminalWorkspaceAction(action);
        } else {
          applyTerminalNavigationAction(action);
        }
        return;
      }

      if (detail.type !== 'panel-activated') return;

      const panelId = typeof detail.panelId === 'string' ? detail.panelId.trim() : '';
      if (!panelId) return;

      const workspaceId =
        workspacesRef.current.find((workspace) =>
          workspace?.columns?.some((column) =>
            (column.panels || []).some((panel) => panel.id === panelId)
          )
        )?.id || null;

      if (!workspaceId) return;
      activateWorkspacePanel(workspaceId, panelId);
    };

    window.addEventListener('devhub:terminal-native-vte-event', handleNativeVteRuntimeEvent);
    return () => {
      window.removeEventListener('devhub:terminal-native-vte-event', handleNativeVteRuntimeEvent);
    };
  }, [activateWorkspacePanel, applyTerminalNavigationAction, applyTerminalWorkspaceAction]);

  // ─── Shared Live Surface Registry Hook & Interceptors ───────────────────
  const registry = useLiveSurfaceRegistry(projectId, activeWorkspace?.id);

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
          const finalSurface = {
            ...surface,
            id: `shape-term-${newPanelId}`,
            panelId: newPanelId,
            label: `Terminal ${newPanelId}`,
            pizarra: {
              ...surface.pizarra,
              visible: true,
            },
          };
          registry.addSurface(finalSurface);
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
    [activeWorkspace, handleSplit, registry.addSurface]
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

  // Auto-register terminal panels and browser window into the shared registry.
  useEffect(() => {
    if (!registry.isLoaded || !activeWorkspace) return;

    // 1. Gather all current terminal panel IDs and details
    const terminals = [];
    activeWorkspace.columns.forEach((col) => {
      if (col.panels) {
        col.panels.forEach((p) => {
          terminals.push({
            id: `shape-term-${p.id}`,
            type: 'terminal',
            panelId: p.id,
            label: p.initialCommand || `Terminal ${p.id}`,
            cwd: p.cwd || null,
            initialCommand: p.initialCommand || null,
            requestedRendererMode: resolveRequestedRenderer({
              workspaceId: activeWorkspace.id,
              panelId: p.id,
              prefs: terminalRendererPreferences,
            }),
            pizarra: {
              x: null, // Let PizarraPane place it if not already placed
              y: null,
              width: 640,
              height: 400,
              visible: true,
            },
          });
        });
      }
    });

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
      registry.resetSurfaces(finalSurfaces);
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
    const handleKeyDown = (e) => {
      if (workspaceTerminalSetupOpen) {
        return;
      }

      const rootElement = managerRootRef.current;
      const activeElement = document?.activeElement || null;
      const currentWorkspaceId = activeWsIdRef.current;
      const focusModeActive = Boolean(focusedPanelByWorkspaceRef.current[currentWorkspaceId]);

      if (
        shouldHandleTerminalFocusExitShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
          focusModeActive,
        })
      ) {
        e.preventDefault();
        clearPanelFocusMode(currentWorkspaceId);
        return;
      }

      if (
        shouldHandleTerminalFocusShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        if (applyTerminalNavigationAction('togglePanelFocus')) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (
        shouldHandleTerminalNavigationShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        const navAction = resolveTerminalNavigationAction(e);
        if (!navAction) return;
        if (applyTerminalNavigationAction(navAction)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (
        shouldHandleTerminalWorkspaceShortcut(e, {
          isVisible,
          rootElement,
          activeElement,
        })
      ) {
        const workspaceAction = resolveTerminalWorkspaceAction(e);
        if (!workspaceAction) return;
        if (applyTerminalWorkspaceAction(workspaceAction)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!shouldHandleTerminalShortcut(e, { isVisible, rootElement, activeElement })) return;

      const action = resolveTerminalShortcutAction(e);
      if (!action) return;

      e.preventDefault();

      if (action === 'splitDown') {
        handleSplit('vertical');
        return;
      }

      if (action === 'splitRight') {
        handleSplit('horizontal');
      }
    };

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

      const cmdToRun = enforceDocOpsGateOnLaunchCommand(
        command || `opencode --agent ${selectedAgent || DEFAULT_OPENCODE_AGENT}`
      );
      // Use split right by default for agents
      const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, cwd);

      if (taskId && createdPanelId) {
        await persistAgentRunMetadata(
          { taskId, selectedAgent, launchOrigin, promptSummary, taskTitle },
          createdPanelId,
          cmdToRun
        );
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('devhub:run-agent', handleRunAgent);
    window.addEventListener(SWARM_LAUNCH_MATERIALIZED_EVENT, handleSwarmLaunchMaterialized);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
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

    // Handle Zed AI assistant terminal opening requests
    // T-025: producer (useZedChat) already filters to `session_id`-only
    // events, so the only defensive check we need is that the event
    // carried a payload at all. `command` may be null (open empty shell)
    // or a string (open + run). See `zedOpenTerminalEvent.js`.
    const handleZedOpenTerminal = (e) => {
      if (!isValidZedOpenTerminalEvent(e.detail)) return;
      const { command, cwd, session_id, focus = false } = e.detail;
      const explicitPanelId = resolveZedOpenTerminalPanelId(e.detail, null);

      const targetWsId = activeWsIdRef.current || activeWsId;
      if (!targetWsId) return;

      const targetWorkspace = workspacesRef.current.find((ws) => ws.id === targetWsId);
      const currentPanelCount = countPanelsInColumns(targetWorkspace?.columns || []);
      const resolvedSourcePanelId =
        activePanelIdsRef.current[targetWsId] ||
        activePanelId ||
        getAllPanelIds(targetWorkspace?.columns || [])[0] ||
        null;

      if (currentPanelCount > 0 && !resolvedSourcePanelId) return;

      if (isWorkspaceTerminalPanelLimitReached(currentPanelCount, MAX_ZED_TERMINAL_PANELS)) {
        console.warn(
          `[Zed] Terminal open blocked: limit ${MAX_ZED_TERMINAL_PANELS} panels (current ${currentPanelCount})`
        );
        return;
      }

      // T-029b: pass session_id as the explicitPanelId so the new panel
      // connects to the same PTY session the model opened. Falls back to
      // auto-mint when session_id is null (e.g. legacy events).
      // T-WSR-zed-001 (ASST-UI-002/003/004): capture the new panel id
      // returned by handleSplit and pipe it through the post-handleSplit
      // focus chain (activate + opt-in focused + opt-in pizarra de-max).
      console.log(
        `[Zed] Opening terminal command=${command} cwd=${cwd} session_id=${session_id} focus=${focus}`
      );
      const newPanelId = handleSplit(
        'horizontal',
        resolvedSourcePanelId,
        command,
        cwd || null,
        explicitPanelId
      );
      if (!newPanelId) return;

      const maximizedView = rightDockState?.maximizedView ?? null;
      applyZedOpenTerminalFocus(
        targetWsId,
        newPanelId,
        { focus },
        {
          activateWorkspacePanel,
          setFocusedPanelByWorkspace,
          updateRightDockState,
          maximizedView,
        }
      );

      if (maximizedView === 'pizarra' && typeof window !== 'undefined') {
        logPizarraBrowser('zed-open-terminal:in-pizarra', { panelId: newPanelId, focus });
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
        }, 400);
      }
    };

    window.addEventListener('devhub:relaunch-panel', handleRelaunchPanel);
    window.addEventListener(
      'devhub:terminal-settings-modal-requested',
      handleTerminalSettingsModalRequested
    );
    window.addEventListener('devhub:manual-revive-requested', handleManualReviveRequested);
    window.addEventListener('devhub:zed-open-terminal', handleZedOpenTerminal);

    const handleZedOpenUrl = (e) => {
      logPizarraBrowser('zed-open-url:received', { detail: e?.detail ?? null });
      if (!isValidZedOpenUrlEvent(e.detail)) {
        logPizarraBrowser('zed-open-url:rejected-invalid', { detail: e?.detail ?? null });
        return;
      }
      const { url, label } = e.detail;
      const focus = coerceZedOpenUrlFocus(e.detail?.focus, true);
      const last = lastZedOpenUrlRef.current;
      if (focus !== true && last.url === url && (last.label ?? null) === (label ?? null)) {
        logPizarraBrowser('zed-open-url:skipped-idempotent', { url, label, focus });
        return;
      }
      lastZedOpenUrlRef.current = { url, label: label ?? null };

      const wsId = activeWsIdRef.current || activeWsId;
      if (wsId) {
        updateBrowserWindowState(wsId, {
          open: true,
          url,
          label: label || buildBrowserWindowLabel(projectId, wsId),
          // Keeps auto-layout from hiding the carried browser when 2+ terminals exist.
          pizarraLayoutPriority: focus === true,
          updatedAt: Date.now(),
        });
        logPizarraBrowser('zed-open-url:browser-state', { wsId, url, focus });
      }

      updateRightDockState((currentState) => {
        const next = applyZedOpenUrlDockUpdate(currentState, { url, focus });
        logPizarraBrowser('zed-open-url:dock-state', {
          activeTab: next.activeTab,
          maximizedView: next.maximizedView,
          visible: next.visible,
          browserUrl: next.browserUrl,
        });
        return next;
      });

      if (focus === true && typeof window !== 'undefined') {
        // After mode transition (~330ms) + registry reconcile; refit twice for late surfaces.
        const dispatchArrangeFit = () => {
          logPizarraBrowser('zed-open-url:arrange-fit-dispatch');
          window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
        };
        window.setTimeout(dispatchArrangeFit, 400);
        window.setTimeout(dispatchArrangeFit, 720);
      }
    };

    window.addEventListener('devhub:zed-open-url', handleZedOpenUrl);

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
      window.removeEventListener('devhub:zed-open-terminal', handleZedOpenTerminal);
      window.removeEventListener('devhub:zed-open-url', handleZedOpenUrl);
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    failPendingReopen,
    projectId,
    storage,
    terminalStateStorageKey,
    updateBrowserWindowState,
    updateRightDockState,
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
    <LiveSurfaceRegistryContext.Provider value={registryValue}>
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
            {/* Top Workspace Tab Bar */}
            <div
              key="workspace-top-tab-bar"
              data-testid="workspace-top-tab-bar"
              className="flex items-center min-h-[42px] bg-[var(--surface-app)] select-none shrink-0 px-2 gap-1.5"
              style={{
                ...getWorkspaceShellChromeStyle(),
                ...getWorkspaceTopBarStyle(),
              }}
            >
              <div className="flex-1 flex gap-2 h-full items-center overflow-x-auto no-scrollbar py-1">
                {workspaces.map((ws, wsIndex) => {
                  const totalPanels = getAllPanelIds(ws.columns).length;
                  const workspaceTabKey = buildStableWorkspaceShellKey('workspace-tab', ws.id);
                  const workspaceTabLabel = getWorkspaceDisplayLabel(ws.id);
                  const hasOpenBrowserWindow = browserWindowStates?.[ws.id]?.open === true;
                  return (
                    <div
                      key={workspaceTabKey}
                      onClick={() => setActiveWsId(ws.id)}
                      draggable
                      onDragStart={(e) => {
                        setDraggedWsId(ws.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedWsId(null);
                        setDragOverWsId(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedWsId && draggedWsId !== ws.id) setDragOverWsId(ws.id);
                      }}
                      onDragLeave={() => setDragOverWsId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        reorderWorkspaceTabs(draggedWsId, ws.id);
                        setDraggedWsId(null);
                        setDragOverWsId(null);
                      }}
                      className={`group relative flex h-[34px] min-h-[34px] items-center justify-between px-3.5 rounded-xl transition-colors duration-150 cursor-grab active:cursor-grabbing select-none border ${
                        draggedWsId === ws.id ? 'opacity-40 scale-95' : ''
                      } ${
                        activeWsId === ws.id
                          ? 'text-[var(--text-primary)] border-transparent'
                          : 'text-[var(--text-muted)] border-transparent hover:bg-white/[0.04] hover:text-[var(--text-secondary)]'
                      }`}
                      title={workspaceTabLabel}
                      style={{
                        ...getWorkspaceTabStyle(workspaces.length),
                        ...getWorkspaceTabChromeStyle({
                          active: activeWsId === ws.id,
                          dragOver: dragOverWsId === ws.id && draggedWsId !== ws.id,
                        }),
                      }}
                    >
                      {activeWsId === ws.id && (
                        <motion.span
                          layoutId="workspace-active-tab-indicator"
                          className="absolute inset-0 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(var(--accent-rgb,88,166,255),0.07)]"
                          transition={{ type: 'spring', stiffness: 500, damping: 42, mass: 0.7 }}
                          style={{ zIndex: 0, willChange: 'transform' }}
                        />
                      )}
                      <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-2">
                        <LayoutGrid
                          className="w-3.5 h-3.5 shrink-0"
                          style={{
                            color:
                              activeWsId === ws.id
                                ? `rgba(var(--accent-rgb,88,166,255),0.9)`
                                : 'currentColor',
                          }}
                        />
                        <span className="min-w-0 truncate text-[12px] font-semibold">
                          {workspaceTabLabel}
                        </span>
                        {hasOpenBrowserWindow ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5">
                            <span
                              className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]"
                              data-testid={`workspace-browser-indicator-${ws.id}`}
                              title="Dedicated browser window open"
                            />
                            <button
                              type="button"
                              data-testid={`workspace-browser-close-${ws.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                closeWorkspaceBrowserWindow(ws.id);
                              }}
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-emerald-100/80 transition-colors hover:bg-emerald-400/15 hover:text-white"
                              title="Cerrar browser dedicado de este workspace"
                              aria-label="Cerrar browser dedicado de este workspace"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        ) : null}
                        <span
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-mono leading-none"
                          style={{
                            background: 'rgba(255,255,255,0.07)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {totalPanels}
                        </span>
                      </div>
                      {workspaces.length > 1 && (
                        <button
                          type="button"
                          data-testid={`workspace-close-${ws.id}`}
                          onClick={(e) => removeWorkspace(e, ws.id)}
                          aria-label={`Cerrar ${workspaceTabLabel}`}
                          title={`Cerrar ${workspaceTabLabel}`}
                          className={`relative z-[1] ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-150 active:scale-95 ${
                            activeWsId === ws.id
                              ? 'border-white/10 bg-white/[0.05] text-[var(--text-secondary)] opacity-90 hover:border-red-400/35 hover:bg-red-500/14 hover:text-red-300'
                              : 'border-transparent text-[var(--text-muted)] opacity-0 hover:border-white/12 hover:bg-white/10 hover:text-[var(--text-primary)] group-hover:opacity-85'
                          }`}
                        >
                          <X className="h-3 w-3" strokeWidth={2.25} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addWorkspace}
                  className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] rounded-sm transition-all ml-0.5 shrink-0"
                  title="Nuevo workspace"
                  aria-label="Nuevo workspace"
                  data-testid="workspace-add-button"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

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
                {workspaces.map((ws, wsIndex) => {
                  const workspaceGridKey = buildStableWorkspaceShellKey('workspace-grid', ws.id);
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
                  const visibleTerminalPanelCount = focusedPanelId ? 1 : totalTerminalPanelCount;
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
                        }),
                      visibleTerminalPanelCount:
                        panelRenderOptions.visibleTerminalPanelCount ?? visibleTerminalPanelCount,
                      panelLabel: getPanelDisplayLabel(ws, panel.id),
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
                      onSetPanelRenderer: (mode) => handleSetPanelRenderer(ws.id, panel.id, mode),
                      connectionState: getPanelConnectionState(panel),
                      deferLiveSurfaceToPizarra: pizarraOwnsLiveSurfaces,
                    });
                  return (
                    <div
                      key={workspaceGridKey}
                      data-testid={`workspace-shell-${ws.id}`}
                      data-ws-active={
                        !isFullscreenBrowser && activeWsId === ws.id && isVisible ? 'true' : 'false'
                      }
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
                          {renderWorkspaceWindowBar(ws, wsDockState, updateWsDockState)}

                          {/* Terminal bodies — PanelGroup stays mounted in focus mode (CSS only). */}
                          <div
                            className="relative min-h-0 flex-1 overflow-hidden"
                            data-focus-mode={focusedPanelId ? 'true' : undefined}
                          >
                            <PanelGroup
                              direction="horizontal"
                              className="h-full w-full"
                              data-testid={`workspace-columns-${ws.id}`}
                              data-layout-direction="horizontal"
                              onLayout={handlePanelGroupLayout}
                            >
                              {ws.columns.map((column, columnIndex) => {
                                const columnHiddenInFocus =
                                  Boolean(focusedPanelId) &&
                                  !columnContainsFocusedPanel(column, focusedPanelId);
                                return (
                                  <React.Fragment key={column.id}>
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
                                          onLayout={handlePanelGroupLayout}
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
                                                  data-testid={
                                                    focusedPanelId === panel.id
                                                      ? `workspace-focused-panel-${panel.id}`
                                                      : `panel-slot-${panel.id}`
                                                  }
                                                >
                                                  {renderWorkspacePanelSlot(panel, {
                                                    visibleTerminalPanelCount: focusedPanelId
                                                      ? 1
                                                      : totalTerminalPanelCount,
                                                  })}
                                                </div>
                                              </Panel>
                                              {!focusedPanelId &&
                                              panelIndex < column.panels.length - 1 ? (
                                                <PanelResizeHandle
                                                  className="relative z-30 h-px shrink-0 flex items-center justify-center bg-transparent hover:bg-[rgba(var(--accent-rgb,88,166,255),0.08)] transition-colors"
                                                  data-testid={`workspace-row-resize-handle-${column.id}-${panel.id}`}
                                                  onDragging={handleInternalSplitDragging}
                                                >
                                                  <div className="h-px w-full bg-[rgba(var(--accent-rgb,88,166,255),0.78)] shadow-[0_0_10px_rgba(var(--accent-rgb,88,166,255),0.45)]" />
                                                </PanelResizeHandle>
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
                                            data-testid={
                                              focusedPanelId === column.panels[0].id
                                                ? `workspace-focused-panel-${column.panels[0].id}`
                                                : `panel-slot-${column.panels[0].id}`
                                            }
                                          >
                                            {renderWorkspacePanelSlot(column.panels[0], {
                                              visibleTerminalPanelCount: focusedPanelId
                                                ? 1
                                                : totalTerminalPanelCount,
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </Panel>
                                    {!focusedPanelId && columnIndex < ws.columns.length - 1 ? (
                                      <PanelResizeHandle
                                        className="relative z-30 w-px shrink-0 flex items-center justify-center bg-transparent hover:bg-[rgba(var(--accent-rgb,88,166,255),0.08)] transition-colors"
                                        data-testid={`split-column-resize-handle-${ws.id}-${column.id}`}
                                        onDragging={handleInternalSplitDragging}
                                      >
                                        <div className="h-full w-px bg-[rgba(var(--accent-rgb,88,166,255),0.78)] shadow-[0_0_10px_rgba(var(--accent-rgb,88,166,255),0.45)]" />
                                      </PanelResizeHandle>
                                    ) : null}
                                  </React.Fragment>
                                );
                              })}
                            </PanelGroup>
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
                              handleRightDockPanelResize(size, {
                                maximized: wsDockState.maximized,
                              });
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
                })}
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
                        switchWindowInWorkspace(activeWorkspace.id, windowId);
                        if (effectiveRightDockState.maximized) {
                          updateRightDockState({
                            visible: true,
                            maximized: true,
                            maximizedView: 'window',
                          });
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
            />
          </motion.div>
        </SharedDockStoreProvider>
      </SharedSurfacesProvider>
    </LiveSurfaceRegistryContext.Provider>
  );
}

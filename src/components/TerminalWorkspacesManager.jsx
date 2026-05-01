import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getWorkspaceAnimProps } from './terminal/workspaceAnimProps';
import {
  Plus,
  X,
  Minus,
  LayoutGrid,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Folder,
  Bot,
  ChevronDown,
  History,
  RefreshCw,
  Clock3,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelLeft,
  Grip,
  Globe,
  FileCode2,
  Wand2,
} from 'lucide-react';
import TerminalTTY from './TerminalTTY';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { createClient } from '@/lib/db/localClient';
import { closeTerminalSessions, syncWorkspaceCountersMonotonic } from './terminal/workspaceStateHelpers';
import NotificationCenter from './NotificationCenter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import AgentRoomSidebar from './AgentRoomSidebar';
import { findAgentWorkspaceAndPanel } from '@/lib/agentRegistryLive';
import WorkspaceRightDock from './workspace/WorkspaceRightDock';
import useResumableSessionCatalog from '@/hooks/useResumableSessionCatalog';
import {
  DEFAULT_RIGHT_DOCK_STATE,
  readRightDockState,
  sanitizeRightDockState,
  writeRightDockState,
} from './workspace/rightDockState';
import {
  getAdjacentWorkspaceId,
  resolveTerminalShortcutAction,
  shouldHandleTerminalShortcut,
  TERMINAL_WORKSPACE_SHORTCUTS,
} from './terminal/workspaceShortcuts';

// --- Helper Functions ---
const createPanel = (id, initialCommand = null, panelCwd = null) => ({
  id,
  initialCommand,
  cwd: panelCwd,
});
const createColumn = (colId, panelId, initialCommand = null, panelCwd = null) => ({
  id: colId,
  panels: [createPanel(panelId, initialCommand, panelCwd)],
});

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
  let workspaceCounter = 1;
  let columnCounter = 1;
  let panelCounter = 1;

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
    const workspaceId = nextId(
      'ws',
      originalWorkspaceId,
      usedWorkspaceIds,
      workspaceCounterState
    );

    if (originalWorkspaceId) {
      workspaceIdMap.set(originalWorkspaceId, workspaceId);
    }

    const originalColumns = Array.isArray(workspace?.columns) && workspace.columns.length > 0
      ? workspace.columns
      : [{}];

    let firstPanelId = null;
    const panelIdMap = new Map();

    const columns = originalColumns.map((column) => {
      const columnId = nextId('c', column?.id, usedColumnIds, columnCounterState);
      const originalPanels = Array.isArray(column?.panels) && column.panels.length > 0
        ? column.panels
        : [{}];

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

function buildUniqueRenderKey(scope, id, index, countsMap) {
  const normalizedId = String(id || 'unknown');
  const base = `${scope}-${normalizedId}`;
  const used = countsMap.get(base) || 0;
  countsMap.set(base, used + 1);
  if (used === 0) return `${base}-${index}`;
  return `${base}-${index}-${used}`;
}

function renderWorkspacePanel(panel, { activePanelId, activeWsId, cwd, wsId, setActivePanelIds }) {
  const isActive = panel.id === activePanelId && activeWsId === wsId;

  return (
    <div
      key={panel.id}
      data-testid={`panel-slot-${panel.id}`}
      className={`h-full w-full min-h-0 min-w-0 overflow-hidden rounded-lg border ${
        isActive
          ? 'border-[rgba(var(--accent-rgb,88,166,255),0.45)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb,88,166,255),0.18)]'
          : 'border-transparent'
      }`}
      onMouseDown={() => setActivePanelIds((prev) => ({ ...prev, [wsId]: panel.id }))}
    >
      <TerminalTTY
        id={panel.id}
        cwd={panel.cwd || cwd}
        hideTitleBar={true}
        autoFocus={isActive}
        initialCommand={panel.initialCommand}
      />
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
  const panelIds = workspace?.columns?.flatMap((column) => column.panels || []).map((panel) => panel.id) || [];
  if (!panelIds.length) return null;
  return savedPanelId && panelIds.includes(savedPanelId) ? savedPanelId : panelIds[0];
}

export default function TerminalWorkspacesManager({ cwd, isVisible, projectId }) {
  const managerRootRef = useRef(null);
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [reopenActionError, setReopenActionError] = useState(null);
  const [workspaces, setWorkspaces] = useState(() => createDefaultWorkspaceState().workspaces);
  const pendingReopenPanelsRef = useRef(new Map());

  const [activeWsId, setActiveWsId] = useState(() => createDefaultWorkspaceState().activeWsId);
  const [activePanelIds, setActivePanelIds] = useState(
    () => createDefaultWorkspaceState().activePanelIds
  );
  const [draggedWsId, setDraggedWsId] = useState(null);
  const [dragOverWsId, setDragOverWsId] = useState(null);
  const [gridCommand, setGridCommand] = useState('opencode');
  const [rightDockStates, setRightDockStates] = useState(() => ({}));
  const {
    status: resumableStatus,
    sessions: resumableSessions,
    error: resumableError,
    isLoading: isLoadingResumableSessions,
    refresh: refreshResumableSessions,
    retry: retryResumableSessions,
  } = useResumableSessionCatalog({ cwd });

  // Agent Room Sidebar state
  const [isAgentSidebarVisible, setIsAgentSidebarVisible] = useState(() => {
    try {
      return storage?.getItem('devhub_agent_room_sidebar_visibility') === 'true';
    } catch {
      return false;
    }
  });

  // Maximize state
  const [isMaximized, setIsMaximized] = useState(() => {
    try {
      return storage?.getItem('devhub_terminal_maximized') === 'true';
    } catch {
      return false;
    }
  });

  const wsCounterRef = useRef(1);
  const panelCounterRef = useRef(1);
  const colCounterRef = useRef(1);
  const workspacesRef = useRef(workspaces);
  const activeWsIdRef = useRef(activeWsId);
  const activePanelIdsRef = useRef(activePanelIds);

  // Persist agent sidebar visibility
  useEffect(() => {
    try {
      storage?.setItem('devhub_agent_room_sidebar_visibility', String(isAgentSidebarVisible));
    } catch {
      /* ignore */
    }
  }, [isAgentSidebarVisible, storage]);

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
      const savedState = storage?.getItem('devhub_terminal_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.workspaces && parsed.workspaces.length > 0) {
          const normalizedState = normalizeWorkspaceState(
            parsed.workspaces,
            parsed.activeWsId,
            parsed.activePanelIds
          );

          setWorkspaces(normalizedState.workspaces);
          setActiveWsId(normalizedState.activeWsId);
          setActivePanelIds(normalizedState.activePanelIds);

          const nextCounters = syncWorkspaceCountersMonotonic(normalizedState.workspaces, {
            workspace: wsCounterRef.current,
            column: colCounterRef.current,
            panel: panelCounterRef.current,
          });

          wsCounterRef.current = nextCounters.workspace;
          colCounterRef.current = nextCounters.column;
          panelCounterRef.current = nextCounters.panel;
        }
      }
    } catch (e) {
      console.error('Failed to load terminal state:', e);
    }
    // Load the initial workspace's dock state from storage
    setRightDockStates((prev) => ({
      ...prev,
      [activeWsId]: readRightDockState(storage, projectId, activeWsId),
    }));
    setIsClientLoaded(true);
  }, [projectId, storage]);

  useEffect(() => {
    if (isClientLoaded) {
      const cleanWorkspaces = workspaces.map((ws) => ({
        ...ws,
        columns: ws.columns.map((col) => ({
          ...col,
          panels: col.panels.map((p) => ({
            id: p.id,
            cwd: p.cwd || null,
            initialCommand: p.initialCommand || null,
          })),
        })),
      }));
      storage?.setItem(
        'devhub_terminal_state',
        JSON.stringify({
          workspaces: cleanWorkspaces,
          activeWsId,
          activePanelIds,
        })
      );
    }
  }, [workspaces, activeWsId, activePanelIds, isClientLoaded, storage]);

  // Load dock state lazily when switching to a workspace for the first time
  useEffect(() => {
    if (!isClientLoaded || !activeWsId) return;
    setRightDockStates((prev) => {
      if (prev[activeWsId]) return prev; // already loaded
      return { ...prev, [activeWsId]: readRightDockState(storage, projectId, activeWsId) };
    });
  }, [isClientLoaded, activeWsId, projectId, storage]);

  // Persist each workspace's dock state when it changes
  useEffect(() => {
    if (!isClientLoaded || !activeWsId) return;
    const state = rightDockStates[activeWsId];
    if (state) writeRightDockState(storage, projectId, activeWsId, state);
  }, [isClientLoaded, projectId, activeWsId, rightDockStates, storage]);

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

  const activeWorkspace = workspaces.find((w) => w.id === activeWsId) || workspaces[0];
  const activePanelId = activePanelIds[activeWsId] || activeWorkspace?.columns[0]?.panels[0]?.id;

  workspacesRef.current = workspaces;
  activeWsIdRef.current = activeWsId;
  activePanelIdsRef.current = activePanelIds;

  // Derive the active workspace's dock state (falls back to default for new workspaces)
  const rightDockState = rightDockStates[activeWsId] ?? { ...DEFAULT_RIGHT_DOCK_STATE };

  const updateRightDockState = useCallback((nextValue) => {
    setRightDockStates((prev) => {
      const currentState = prev[activeWsId] ?? { ...DEFAULT_RIGHT_DOCK_STATE };
      const resolvedState =
        typeof nextValue === 'function' ? nextValue(currentState) : { ...currentState, ...nextValue };
      return { ...prev, [activeWsId]: sanitizeRightDockState(resolvedState) };
    });
  }, [activeWsId]);

  const handleRightDockVisibilityToggle = useCallback(() => {
    updateRightDockState((currentState) => ({
      ...currentState,
      visible: !currentState.visible,
    }));
  }, [updateRightDockState]);

  const handleRightDockTabSelect = useCallback(
    (tab) => {
      updateRightDockState((currentState) => ({
        ...currentState,
        visible: true,
        activeTab: tab,
      }));
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

  const getAllPanelIds = (columns) => {
    return columns.flatMap((col) => col.panels.map((p) => p.id));
  };

  const addWorkspace = () => {
    wsCounterRef.current += 1;
    panelCounterRef.current += 1;
    colCounterRef.current += 1;

    const newWsId = `ws${wsCounterRef.current}`;
    const newPanelId = `p${panelCounterRef.current}`;
    const newColId = `c${colCounterRef.current}`;

    setWorkspaces((prev) => [
      ...prev,
      {
        id: newWsId,
        name: `Workspace ${wsCounterRef.current}`,
        columns: [createColumn(newColId, newPanelId)],
      },
    ]);
    setActiveWsId(newWsId);
    setActivePanelIds((prev) => ({ ...prev, [newWsId]: newPanelId }));
  };

  const removeWorkspace = async (e, idToRemove) => {
    e.stopPropagation();
    const workspaceToRemove = workspaces.find((workspace) => workspace.id === idToRemove);
    if (!workspaceToRemove || workspaces.length <= 1) return;

    await closeTerminalSessions(getAllPanelIds(workspaceToRemove.columns));

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
  };

  const handleApplyGrid = (numCols, numRows) => {
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
  };

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
    (direction, sourcePanelId = null, initialCommand = null, panelCwd = null) => {
      const targetId = sourcePanelId || activePanelId;
      if (!activeWorkspace || !targetId) return;

      panelCounterRef.current += 1;
      const newPanelId = `p${panelCounterRef.current}`;

      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== activeWsId) return ws;

          const newColumns = [...ws.columns];

          // Encontrar en qué columna está el panel a dividir
          const colIndex = newColumns.findIndex((col) => col.panels.some((p) => p.id === targetId));
          if (colIndex === -1) return ws;

          if (direction === 'horizontal') {
            // Split Right: Agregar una nueva columna a la derecha
            colCounterRef.current += 1;
            const newColId = `c${colCounterRef.current}`;
            newColumns.splice(
              colIndex + 1,
              0,
              createColumn(newColId, newPanelId, initialCommand, panelCwd)
            );
          } else {
            // Split Down: Agregar un nuevo panel debajo en la misma columna
            const panelIndex = newColumns[colIndex].panels.findIndex((p) => p.id === targetId);
            const newPanels = [...newColumns[colIndex].panels];
            newPanels.splice(panelIndex + 1, 0, createPanel(newPanelId, initialCommand, panelCwd));
            newColumns[colIndex] = { ...newColumns[colIndex], panels: newPanels };
          }

          return { ...ws, columns: newColumns };
        })
      );

      setActivePanelIds((prev) => ({ ...prev, [activeWsId]: newPanelId }));
      return newPanelId;
    },
    [activeWorkspace, activeWsId, activePanelId]
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

      // Register in agent_registry so Activity tab shows this session
      if (projectId) {
        try {
          const db = createClient();
          await db.from('agent_registry').insert({
            agent_id: `oc-reopen-${resumableSessionId}`,
            project_id: projectId,
            nombre: 'opencode',
            modelo_llm: 'N/A',
            status: 'running',
            current_task_id: resumableSessionId,
            last_heartbeat: new Date().toISOString(),
          });
        } catch {
          // Ignore DB failures — the localStorage entry is enough for display
        }
      }

      return createdPanelId;
    },
    [activeWsId, cwd, launchPanelWithCommand, projectId]
  );

  const removeReopenRun = useCallback((panelId, sessionId) => {
    try {
      const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
      let changed = false;

      Object.entries(runs).forEach(([key, value]) => {
        const matchesPanel = panelId && value?.panelId === panelId;
        const matchesSession =
          sessionId && value?.opencodeSessionId === sessionId && value?.launchOrigin === 'reopen-session';

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

      const allIds = getAllPanelIds(activeWorkspace.columns);
      if (allIds.length <= 1) return; // No cerrar si es el último

      await closeTerminalSessions([targetId]);

      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== activeWsId) return ws;

          const newColumns = ws.columns
            .map((col) => ({
              ...col,
              panels: col.panels.filter((p) => p.id !== targetId),
            }))
            .filter((col) => col.panels.length > 0); // Eliminar columnas vacías

          return { ...ws, columns: newColumns };
        })
      );

      if (activePanelId === targetId) {
        setWorkspaces((prev) => {
          const ws = prev.find((w) => w.id === activeWsId);
          if (ws) {
            const newIds = getAllPanelIds(ws.columns);
            setActivePanelIds((p) => ({ ...p, [activeWsId]: newIds[0] }));
          }
          return prev;
        });
      }

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
    [activeWorkspace, activeWsId, activePanelId, projectId]
  );

  const failPendingReopen = useCallback((panelId, fallbackMessage = 'Session is no longer available to resume.') => {
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

        replacementPanelId = nextColumns
          .flatMap((column) => column.panels)
          .map((panel) => panel.id)[0] || null;

        return nextColumns.length > 0 ? { ...workspace, columns: nextColumns } : workspace;
      })
    );

    if (replacementPanelId) {
      setActivePanelIds((prev) => ({
        ...prev,
        [pending.workspaceId]: prev[pending.workspaceId] === panelId ? replacementPanelId : prev[pending.workspaceId],
      }));
    }
  }, [removeReopenRun]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const rootElement = managerRootRef.current;
      const activeElement = document?.activeElement || null;
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
        return;
      }

      if (action === 'closePanel') {
        const currentWorkspace = workspacesRef.current.find((workspace) => workspace.id === activeWsIdRef.current);
        const currentPanelId = resolveWorkspacePanelId(
          currentWorkspace,
          activePanelIdsRef.current[activeWsIdRef.current]
        );
        handleClosePanel(currentPanelId);
        return;
      }

      if (action === 'previousWorkspace' || action === 'nextWorkspace') {
        const currentWorkspaceId = activeWsIdRef.current;
        const nextWorkspaceId = getAdjacentWorkspaceId(
          workspacesRef.current,
          currentWorkspaceId,
          action === 'previousWorkspace' ? 'previous' : 'next'
        );

        if (!nextWorkspaceId || nextWorkspaceId === currentWorkspaceId) return;

        const nextWorkspace = workspacesRef.current.find((workspace) => workspace.id === nextWorkspaceId);
        const nextPanelId = resolveWorkspacePanelId(
          nextWorkspace,
          activePanelIdsRef.current[nextWorkspaceId]
        );

        if (nextPanelId) {
          setActivePanelIds((prev) =>
            prev[nextWorkspaceId] === nextPanelId ? prev : { ...prev, [nextWorkspaceId]: nextPanelId }
          );
        }

        setActiveWsId(nextWorkspaceId);
      }
    };

    const handleRunAgent = async (e) => {
      const { taskId, command, selectedAgent, launchOrigin, promptSummary, taskTitle } = e.detail;
      const cmdToRun = enforceDocOpsGateOnLaunchCommand(
        command || `opencode --agent ${selectedAgent || 'sdd-orchestrator'}`
      );
      // Use split right by default for agents
      const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, cwd);

      if (taskId && createdPanelId) {
        try {
          const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
          const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
          runs[taskId] = {
            panelId: createdPanelId,
            commandSummary: hints[taskId] || shortenCommandSummary(cmdToRun),
            promptSummary: promptSummary || hints[taskId] || shortenCommandSummary(cmdToRun),
            selectedAgent: selectedAgent || null,
            launchOrigin: launchOrigin || null,
            taskTitle: taskTitle || null,
            launchedAt: Date.now(),
          };
          localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
        } catch {
          // Ignore localStorage failures.
        }

        // Also create a record in agent_registry so the sidebar can display it
        if (projectId) {
          try {
            const db = createClient();
            await db.from('agent_registry').insert({
              agent_id: taskId,
              project_id: projectId,
              nombre: selectedAgent || 'sdd-orchestrator',
              modelo_llm: 'N/A',
              status: 'running',
              current_task_id: taskId,
              last_heartbeat: new Date().toISOString(),
            });
          } catch (dbErr) {
            console.warn('Failed to write agent_registry entry:', dbErr);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('devhub:run-agent', handleRunAgent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('devhub:run-agent', handleRunAgent);
    };
  }, [isVisible, handleSplit, handleClosePanel, cwd]);

  // --- Persist OpenCode session ID per panel so it auto-restores after reboot ---
  // When ttyServer detects that a panel is running OpenCode (via input or output), it
  // broadcasts the session ID via WebSocket → TerminalTTY emits a DOM event → here we
  // update the panel's initialCommand so localStorage saves the correct restore command.
  useEffect(() => {
    const handleOpenCodeSessionDetected = (e) => {
      const { panelId, sessionId } = e.detail || {};
      if (!panelId || !sessionId) return;

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (pending) {
        if (pending.sessionId !== sessionId) {
          failPendingReopen(panelId);
          return;
        }

        pendingReopenPanelsRef.current.delete(panelId);
        setReopenActionError(null);
      }

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId) return p;
              const newCommand = `opencode --session ${sessionId}`;
              // Only update if the command actually changed to avoid unnecessary re-renders
              if (p.initialCommand === newCommand) return p;
              return { ...p, initialCommand: newCommand };
            }),
          })),
        }))
      );
    };

    const handleTerminalExit = (e) => {
      const { id: panelId, initialCommand } = e.detail || {};
      if (!panelId) return;

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (!pending) return;
      if (initialCommand && pending.command && initialCommand !== pending.command) return;

      failPendingReopen(panelId);
    };

    window.addEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
    window.addEventListener('devhub:terminal-exit', handleTerminalExit);
    return () => {
      window.removeEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
      window.removeEventListener('devhub:terminal-exit', handleTerminalExit);
    };
  }, [failPendingReopen]);

  // --- Agent Card Click → Focus Panel ---
  const handleAgentCardClick = useCallback(
    (agent) => {
      const agentRuns = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
      const { wsId, panelId } = findAgentWorkspaceAndPanel(agent, agentRuns, workspaces);

      if (!panelId) return; // No terminal panel for this agent

      // If panel is in a different workspace, switch workspace first
      if (wsId && wsId !== activeWsId) {
        setActiveWsId(wsId);
      }

      // Focus the panel
      setActivePanelIds((prev) => ({ ...prev, [wsId || activeWsId]: panelId }));
    },
    [workspaces, activeWsId]
  );

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

  const workspaceTabKeyCounts = new Map();
  const workspaceGridKeyCounts = new Map();

  return (
    <motion.div
      ref={managerRootRef}
      className="flex flex-col h-full w-full bg-[var(--surface-app)] overflow-hidden"
      {...getWorkspaceAnimProps(isMaximized)}
      key={isMaximized ? 'maximized' : 'normal'}
    >
      {/* Top Workspace Tab Bar */}
      <div
        key="workspace-top-tab-bar"
        className="flex items-center min-h-[52px] bg-[var(--surface-app)] select-none shrink-0 border-b border-[var(--border-subtle)] px-3 gap-2"
      >
        <div className="flex-1 flex gap-2 h-full items-center overflow-x-auto no-scrollbar py-1.5">
          {workspaces.map((ws, wsIndex) => {
            const totalPanels = getAllPanelIds(ws.columns).length;
            const workspaceTabKey = buildUniqueRenderKey('workspace-tab', ws.id, wsIndex, workspaceTabKeyCounts);
            const workspaceTabLabel = getWorkspaceDisplayLabel(ws.id);
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
                className={`group flex items-center justify-between h-full px-4 rounded-xl transition-all cursor-grab active:cursor-grabbing select-none border ${
                  draggedWsId === ws.id ? 'opacity-40 scale-95' : ''
                } ${
                  activeWsId === ws.id
                    ? 'text-[var(--text-primary)] border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] border-transparent hover:bg-white/[0.04] hover:text-[var(--text-secondary)]'
                }`}
                title={workspaceTabLabel}
                style={
                  {
                    ...getWorkspaceTabStyle(workspaces.length),
                    ...(activeWsId === ws.id
                      ? {
                          background: `rgba(var(--accent-rgb,88,166,255),0.08)`,
                          borderColor: `rgba(var(--accent-rgb,88,166,255),0.22)`,
                          boxShadow: `inset 0 -2px 0 rgba(var(--accent-rgb,88,166,255),0.55)`,
                        }
                      : dragOverWsId === ws.id && draggedWsId !== ws.id
                        ? {
                            background: 'rgba(var(--accent-rgb,88,166,255),0.07)',
                            borderColor: 'rgba(var(--accent-rgb,88,166,255),0.35)',
                          }
                        : {}),
                  }
                }
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: activeWsId === ws.id ? `rgba(var(--accent-rgb,88,166,255),0.9)` : 'currentColor' }}
                  />
                  <span className="text-[12px] font-semibold truncate">
                    {workspaceTabLabel}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md font-mono leading-none"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' }}
                  >
                    {totalPanels}
                  </span>
                </div>
                {workspaces.length > 1 && (
                  <button
                    onClick={(e) => removeWorkspace(e, ws.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded ml-1.5 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={addWorkspace}
            className="inline-flex items-center justify-center w-10 h-10 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] rounded-xl border border-transparent hover:border-[var(--border-subtle)] transition-all ml-0.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Global Toolbar + Window Controls */}
        <div
          className="flex items-center h-[40px] gap-1 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {/* Agent Room Sidebar Toggle */}
          <button
            onClick={() => setIsAgentSidebarVisible((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium transition-all cursor-pointer select-none ${
              isAgentSidebarVisible
                ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/25'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)]'
            }`}
            title={isAgentSidebarVisible ? 'Hide Agent Room' : 'Show Agent Room'}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span>Agents</span>
          </button>

          {/* Grid Launcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)] transition-all cursor-pointer select-none"
                title="Lanzar Cuadrícula"
              >
                <Grip className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] bg-[#0d1320] border-[#273146] text-gray-100 p-2 z-50">
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

          {/* Notificaciones, estado y switch del dock */}
          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-[var(--border-subtle)]">
            <NotificationCenter projectId={projectId} variant="topbar" />
            <div
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium border select-none"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-muted)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/80 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              Terminals
            </div>
            <button
              type="button"
              data-testid="right-dock-toggle"
              onClick={handleRightDockVisibilityToggle}
              className={`inline-flex items-center justify-center h-7 w-7 rounded-lg border transition-all ${
                rightDockState.visible
                  ? 'text-[var(--accent-primary)] border-[rgba(var(--accent-rgb,88,166,255),0.28)] bg-[rgba(var(--accent-rgb,88,166,255),0.10)]'
                  : 'text-[var(--text-muted)] border-transparent hover:border-[var(--border-subtle)] hover:bg-white/[0.05]'
              }`}
              title={rightDockState.visible ? 'Hide right dock' : 'Show right dock'}
              aria-label={rightDockState.visible ? 'Hide right dock' : 'Show right dock'}
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
            <div
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
              data-testid="right-dock-toolbar-switch"
            >
              <button
                type="button"
                data-testid="right-dock-tab-browser"
                onClick={() => handleRightDockTabSelect('browser')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  rightDockState.activeTab === 'browser' && rightDockState.visible
                    ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb,88,166,255),0.24)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.05]'
                }`}
                title="Show browser dock"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Browser</span>
              </button>
              <button
                type="button"
                data-testid="right-dock-tab-editor"
                onClick={() => handleRightDockTabSelect('editor')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  rightDockState.activeTab === 'editor' && rightDockState.visible
                    ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb,88,166,255),0.24)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.05]'
                }`}
                title="Show editor dock"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>
            </div>
            {rightDockState.visible ? (
              <button
                type="button"
                data-testid="workspace-right-dock-maximize"
                onClick={() => updateRightDockState({ maximized: !rightDockState.maximized, visible: true })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[var(--text-muted)] transition-all hover:border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
                title={rightDockState.maximized ? 'Restaurar dock' : 'Maximizar dock'}
                aria-label={rightDockState.maximized ? 'Restaurar dock' : 'Maximizar dock'}
              >
                {rightDockState.maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)] transition-all cursor-pointer select-none"
              >
                <History className="w-3.5 h-3.5" />
                Reopen
                <ChevronDown className="w-3 h-3 opacity-60" />
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
                        retryResumableSessions();
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300/30 px-2 py-1 text-[11px] font-semibold text-red-200 hover:text-white"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              )}

              {!isLoadingResumableSessions && reopenActionError && (
                <div className="px-2 py-3 text-xs text-red-300">{reopenActionError}</div>
              )}

              {resumableSessions.length > 0 && (
                <DropdownMenuLabel key="opencode-sessions-label" className="text-[10px] text-gray-500 px-2 pt-2 pb-1 uppercase tracking-wide">
                  OpenCode
                </DropdownMenuLabel>
              )}

              {!isLoadingResumableSessions &&
                resumableStatus === 'empty' &&
                resumableSessions.length === 0 &&
                !reopenActionError && (
                  <div className="px-2 py-3 text-xs text-gray-400">
                    No recent sessions found.
                  </div>
                )}

              {!isLoadingResumableSessions &&
                resumableSessions.map((session, index) => (
                  <DropdownMenuItem
                    key={getSessionRenderKey(session, 'opencode-session', index)}
                    className="flex flex-col items-start gap-1 rounded-md px-2 py-2 cursor-pointer focus:bg-[#162038]"
                    onSelect={(e) => {
                      e.preventDefault();
                      reopenOpenCodeSession(session);
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 shrink-0">
                          OC
                        </span>
                        <span className="truncate text-sm font-medium text-white">
                          {session.title || session.sessionId}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400 shrink-0">
                        <ExternalLink className="w-3 h-3" />
                        Resume
                      </span>
                    </div>
                    <div className="w-full text-[11px] text-gray-400 flex items-center gap-2">
                      <span>
                        Updated{' '}
                        {session.updatedAt
                          ? formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
                          : 'recently'}
                      </span>
                      <span className="text-gray-600">•</span>
                      <span className="truncate font-mono" title={session.cwd || cwd}>
                        {shortPath(session.cwd || cwd)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Window Controls - Circular macOS style */}
          <div className="flex items-center gap-2.5 ml-3 pl-3 border-l border-[#2a2a2a]">
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
      </div>

      {/* Persistent Grid Area */}
      <div key="workspace-grid-shell" className="flex-1 flex bg-[#080b12] relative overflow-hidden">
        {/* Agent Room Sidebar — always rendered, width animates */}
        <div
          className="shrink-0 border-r border-[#2a2a2a] bg-[#0d1018] flex flex-col h-full relative"
          style={{
            width: isAgentSidebarVisible && !isMaximized ? '280px' : '0px',
            transition: 'width 200ms ease-in-out',
          }}
        >
          <AgentRoomSidebar
            projectId={projectId}
            onAgentClick={handleAgentCardClick}
            onReopenSession={reopenOpenCodeSession}
            onTerminateAgent={(agent) => {
              // If the agent has an active panel still open, close it too
              if (agent._activePanelId) {
                handleClosePanel(agent._activePanelId);
              }
            }}
            onMaximizeToggle={() => setIsMaximized((prev) => !prev)}
            isMaximized={isMaximized}
            workspaces={workspaces}
            activePanelIds={activePanelIds}
            isVisible={isAgentSidebarVisible}
            onToggleVisibility={() => setIsAgentSidebarVisible((prev) => !prev)}
            resumableSessions={resumableSessions}
            resumableStatus={resumableStatus}
            resumableError={resumableError}
          />
        </div>

        {/* Toggle button when sidebar is collapsed — overlay on grid */}
        {!isAgentSidebarVisible && !isMaximized && (
          <button
            onClick={() => setIsAgentSidebarVisible(true)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-6 h-14 rounded-r-md transition-colors cursor-pointer"
            style={{
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderLeft: 'none',
            }}
            title="Show Agent Room Sidebar"
          >
            <PanelLeft className="w-4 h-4 text-gray-400" />
          </button>
        )}

        {/* Terminal Grid */}
        <div className="flex-1 relative min-w-0">
          {workspaces.map((ws, wsIndex) => {
            const workspaceGridKey = buildUniqueRenderKey('workspace-grid', ws.id, wsIndex, workspaceGridKeyCounts);
            // Per-workspace dock state — each workspace remembers its own browser/editor state
            const wsDockState = rightDockStates[ws.id] ?? { ...DEFAULT_RIGHT_DOCK_STATE };
            const updateWsDockState = (nextValue) => {
              setRightDockStates((prev) => {
                const currentState = prev[ws.id] ?? { ...DEFAULT_RIGHT_DOCK_STATE };
                const resolvedState =
                  typeof nextValue === 'function' ? nextValue(currentState) : { ...currentState, ...nextValue };
                return { ...prev, [ws.id]: sanitizeRightDockState(resolvedState) };
              });
            };
            return (
            <div
              key={workspaceGridKey}
              data-testid={`workspace-shell-${ws.id}`}
              className={`absolute inset-0 p-2 ${activeWsId === ws.id && isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{
                zIndex: activeWsId === ws.id ? 10 : 0,
              }}
            >
              {wsDockState.visible && wsDockState.maximized ? (
                <div className="h-full w-full rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                  <WorkspaceRightDock
                    project={{ id: projectId, local_path: cwd }}
                    dockState={wsDockState}
                    onDockStateChange={updateWsDockState}
                  />
                </div>
              ) : (
              <PanelGroup direction="horizontal" className="w-full h-full">
                <Panel key={`${ws.id}-terminal-grid`} minSize={18} className="flex flex-col bg-[#0c1018] rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                  {/* Panel tab bar — P1/P2/P3 tabs + path of active terminal */}
                  {(() => {
                    const allPanels = ws.columns.flatMap((col) => col.panels);
                    const activePanel = allPanels.find((p) => p.id === activePanelId) || allPanels[0];
                    const canAdd = allPanels.length < 3;
                    const splitLimitReason = 'Máximo 3 terminales alcanzado';
                    const splitRightLabel = `Split Right (${TERMINAL_WORKSPACE_SHORTCUTS.splitRight})`;
                    const splitDownLabel = `Split Down (${TERMINAL_WORKSPACE_SHORTCUTS.splitDown})`;
                    return (
                      <div
                        data-testid="panel-subtabs-bar"
                        className="h-[52px] flex items-center justify-between px-4 shrink-0 border-b border-[rgba(var(--accent-rgb,88,166,255),0.22)] bg-[var(--surface-card)] select-none"
                      >
                        {/* Left: P1/P2/P3 tabs + add button */}
                        <div className="flex items-center gap-2 min-w-0">
                          {allPanels.slice(0, 3).map((panel, idx) => {
                            const isActive = panel.id === activePanelId && activeWsId === ws.id;
                            return (
                              <button
                                key={panel.id}
                                data-testid={`panel-tab-p${idx + 1}`}
                                onClick={() =>
                                  setActivePanelIds((prev) => ({ ...prev, [ws.id]: panel.id }))
                                }
                                className={`group h-9 px-4 rounded-xl text-[13px] font-mono font-semibold border flex items-center gap-2 transition-all ${
                                  isActive
                                    ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] border-[rgba(var(--accent-rgb,88,166,255),0.35)]'
                                    : 'text-[var(--text-muted)] bg-transparent border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]'
                                }`}
                                title={`Terminal P${idx + 1}`}
                              >
                                P{idx + 1}
                                {allPanels.length > 1 && (
                                  <span
                                    role="button"
                                    aria-label={`Cerrar P${idx + 1}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClosePanel(panel.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-4 h-4 rounded-md hover:bg-white/15 transition-opacity"
                                  >
                                    <X className="w-3 h-3" />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            data-testid="panel-subtabs-add"
                            onClick={() => canAdd && handleSplit('horizontal', activePanelId)}
                            disabled={!canAdd}
                            className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all ${
                              canAdd
                                ? 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)]'
                                : 'text-[var(--text-muted)] opacity-25 cursor-not-allowed border border-transparent'
                            }`}
                            title={canAdd ? 'Nueva terminal' : 'Máx 3'}
                            aria-label={canAdd ? 'Agregar terminal' : 'Máximo 3 terminales alcanzado'}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            data-testid="panel-subtabs-split-right"
                            onClick={() => canAdd && handleSplit('horizontal', activePanelId)}
                            disabled={!canAdd}
                            className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl transition-all border ${
                              canAdd
                                ? 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06]'
                                : 'text-[var(--text-muted)] opacity-25 cursor-not-allowed border-[var(--border-subtle)]'
                            }`}
                            title={canAdd ? splitRightLabel : `${splitLimitReason} — ${splitRightLabel}`}
                            aria-label={canAdd ? splitRightLabel : `${splitLimitReason} — Split Right`}
                          >
                            <SplitSquareVertical className="w-3.5 h-3.5" />
                            <span>Split Right</span>
                          </button>
                          <button
                            type="button"
                            data-testid="panel-subtabs-split-down"
                            onClick={() => canAdd && handleSplit('vertical', activePanelId)}
                            disabled={!canAdd}
                            className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl transition-all border ${
                              canAdd
                                ? 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06]'
                                : 'text-[var(--text-muted)] opacity-25 cursor-not-allowed border-[var(--border-subtle)]'
                            }`}
                            title={canAdd ? splitDownLabel : `${splitLimitReason} — ${splitDownLabel}`}
                            aria-label={canAdd ? splitDownLabel : `${splitLimitReason} — Split Down`}
                          >
                            <SplitSquareHorizontal className="w-3.5 h-3.5" />
                            <span>Split Down</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            data-testid="panel-subtabs-shortcuts-hint"
                            className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-medium border"
                            style={{
                              color: 'var(--text-muted)',
                              borderColor: 'var(--border-subtle)',
                              background: 'rgba(255,255,255,0.03)',
                            }}
                            title={`Workspace ${TERMINAL_WORKSPACE_SHORTCUTS.previousWorkspace} / ${TERMINAL_WORKSPACE_SHORTCUTS.nextWorkspace}`}
                          >
                            <span>{TERMINAL_WORKSPACE_SHORTCUTS.previousWorkspace}</span>
                            <span>/</span>
                            <span>{TERMINAL_WORKSPACE_SHORTCUTS.nextWorkspace}</span>
                          </span>
                          {/* Right: project root path (initial cwd) */}
                          {activePanel && cwd && (
                            <span
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[13px] font-mono border"
                              style={{
                                color: 'var(--accent-primary)',
                                borderColor: 'rgba(var(--accent-rgb,88,166,255),0.35)',
                                background: 'rgba(var(--accent-rgb,88,166,255),0.08)',
                              }}
                              title={cwd}
                            >
                              <Folder className="w-3 h-3" />
                              {shortPath(cwd)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Terminal bodies — preserve real split geometry */}
                  <div className="flex-1 relative overflow-hidden min-h-0">
                    <PanelGroup
                      direction="horizontal"
                      className="h-full w-full"
                      data-testid={`workspace-columns-${ws.id}`}
                      data-layout-direction="horizontal"
                    >
                      {ws.columns.map((column, columnIndex) => (
                        <React.Fragment key={column.id}>
                          <Panel minSize={18} className="min-w-0 min-h-0">
                            {column.panels.length > 1 ? (
                              <PanelGroup
                                direction="vertical"
                                className="h-full w-full"
                                data-testid={`workspace-column-panels-${column.id}`}
                                data-layout-direction="vertical"
                              >
                                {column.panels.map((panel, panelIndex) => (
                                  <React.Fragment key={panel.id}>
                                    <Panel minSize={20} className="min-h-0 min-w-0" data-testid={`workspace-column-${column.id}`}>
                                      {renderWorkspacePanel(panel, {
                                        activePanelId,
                                        activeWsId,
                                        cwd,
                                        wsId: ws.id,
                                        setActivePanelIds,
                                      })}
                                    </Panel>
                                    {panelIndex < column.panels.length - 1 ? (
                                      <PanelResizeHandle className="h-2 flex items-center justify-center">
                                        <div className="h-px w-full bg-[rgba(var(--accent-rgb,88,166,255),0.18)]" />
                                      </PanelResizeHandle>
                                    ) : null}
                                  </React.Fragment>
                                ))}
                              </PanelGroup>
                            ) : (
                              <div className="h-full w-full" data-testid={`workspace-column-${column.id}`}>
                                {renderWorkspacePanel(column.panels[0], {
                                  activePanelId,
                                  activeWsId,
                                  cwd,
                                  wsId: ws.id,
                                  setActivePanelIds,
                                })}
                              </div>
                            )}
                          </Panel>
                          {columnIndex < ws.columns.length - 1 ? (
                            <PanelResizeHandle className="w-2 flex items-center justify-center">
                              <div className="h-full w-px bg-[rgba(var(--accent-rgb,88,166,255),0.18)]" />
                            </PanelResizeHandle>
                          ) : null}
                        </React.Fragment>
                      ))}
                    </PanelGroup>
                  </div>
                </Panel>

                {wsDockState.visible && !wsDockState.maximized ? (
                  <PanelResizeHandle
                    key={`${ws.id}-right-dock-resize`}
                    className="relative w-3 flex items-center justify-center z-20 cursor-col-resize"
                  >
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#2a344a]" />
                    <div className="w-1 h-12 rounded-full bg-[#3a4e70] hover:bg-[var(--accent-primary)] transition-colors cursor-pointer" />
                  </PanelResizeHandle>
                ) : null}
                {wsDockState.visible ? (
                  <Panel
                    key={`${ws.id}-right-dock-panel`}
                    minSize={wsDockState.maximized ? 100 : 30}
                    maxSize={100}
                    defaultSize={wsDockState.maximized ? 100 : wsDockState.size}
                    onResize={(size) => {
                      if (!wsDockState.maximized) updateWsDockState({ size });
                    }}
                    className="flex flex-col"
                    data-testid="workspace-right-dock-panel"
                  >
                    <WorkspaceRightDock
                      project={{ id: projectId, local_path: cwd }}
                      dockState={wsDockState}
                      onDockStateChange={updateWsDockState}
                    />
                  </Panel>
                ) : null}
              </PanelGroup>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

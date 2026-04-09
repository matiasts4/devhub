import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import TerminalTTY from './TerminalTTY';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { createClient } from '@/lib/db/localClient';
import NotificationCenter from './NotificationCenter';
import { Button } from '@/components/ui/button';
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

const WORKSPACE_COLORS = ['#5b8cff', '#8c6cff', '#d46b8c', '#c97c40', '#2ea043', '#0ea5e9'];

function getWorkspaceColor(id) {
  const num = Number(String(id).replace(/[^0-9]/g, '')) || 1;
  return WORKSPACE_COLORS[(num - 1) % WORKSPACE_COLORS.length];
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

export default function TerminalWorkspacesManager({ cwd, isVisible, projectId }) {
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [isOpenCodeMenuOpen, setIsOpenCodeMenuOpen] = useState(false);
  const [isLoadingOpenCodeSessions, setIsLoadingOpenCodeSessions] = useState(false);
  const [openCodeSessions, setOpenCodeSessions] = useState([]);
  const [openCodeSessionsError, setOpenCodeSessionsError] = useState(null);
  const [workspaces, setWorkspaces] = useState([
    {
      id: 'ws1',
      name: 'Workspace 1',
      columns: [createColumn('c1', 'p1')],
    },
  ]);

  const [activeWsId, setActiveWsId] = useState('ws1');
  const [activePanelIds, setActivePanelIds] = useState({ ws1: 'p1' });
  const [draggedWsId, setDraggedWsId] = useState(null);
  const [gridCommand, setGridCommand] = useState('opencode');

  // Agent Room Sidebar state
  const [isAgentSidebarVisible, setIsAgentSidebarVisible] = useState(() => {
    try {
      return localStorage.getItem('devhub_agent_room_sidebar_visibility') === 'true';
    } catch {
      return false;
    }
  });

  // Maximize state
  const [isMaximized, setIsMaximized] = useState(() => {
    try {
      return localStorage.getItem('devhub_terminal_maximized') === 'true';
    } catch {
      return false;
    }
  });

  const wsCounterRef = useRef(1);
  const panelCounterRef = useRef(1);
  const colCounterRef = useRef(1);

  // Persist agent sidebar visibility
  useEffect(() => {
    try {
      localStorage.setItem('devhub_agent_room_sidebar_visibility', String(isAgentSidebarVisible));
    } catch {
      /* ignore */
    }
  }, [isAgentSidebarVisible]);

  // Persist maximize state
  useEffect(() => {
    try {
      localStorage.setItem('devhub_terminal_maximized', String(isMaximized));
    } catch {
      /* ignore */
    }
  }, [isMaximized]);

  // Dispatch maximize toggle event for App.js to react
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('devhub:toggle-maximize', { detail: { isMaximized } }));
  }, [isMaximized]);

  // --- LocalStorage Persistence ---
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('devhub_terminal_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.workspaces && parsed.workspaces.length > 0) {
          setWorkspaces(parsed.workspaces);
          setActiveWsId(parsed.activeWsId || parsed.workspaces[0].id);
          setActivePanelIds(parsed.activePanelIds || {});

          // Re-hydrate counters to avoid ID collisions
          let maxWs = 1,
            maxCol = 1,
            maxPanel = 1;

          const extractNum = (prefix, str) => {
            const match = str.match(new RegExp(`^${prefix}(\\d+)$`));
            return match ? parseInt(match[1]) : 0;
          };

          parsed.workspaces.forEach((ws) => {
            maxWs = Math.max(maxWs, extractNum('ws', ws.id));
            ws.columns.forEach((col) => {
              maxCol = Math.max(maxCol, extractNum('c', col.id));
              col.panels.forEach((p) => {
                maxPanel = Math.max(maxPanel, extractNum('p', p.id));
              });
            });
          });

          wsCounterRef.current = maxWs;
          colCounterRef.current = maxCol;
          panelCounterRef.current = maxPanel;
        }
      }
    } catch (e) {
      console.error('Failed to load terminal state:', e);
    }
    setIsClientLoaded(true);
  }, []);

  useEffect(() => {
    if (isClientLoaded) {
      const cleanWorkspaces = workspaces.map((ws) => ({
        ...ws,
        columns: ws.columns.map((col) => ({
          ...col,
          panels: col.panels.map((p) => ({ id: p.id, cwd: p.cwd || null })),
        })),
      }));
      localStorage.setItem(
        'devhub_terminal_state',
        JSON.stringify({
          workspaces: cleanWorkspaces,
          activeWsId,
          activePanelIds,
        })
      );
    }
  }, [workspaces, activeWsId, activePanelIds, isClientLoaded]);

  useEffect(() => {
    if (!workspaces.length) return;

    const extractNum = (prefix, str) => {
      const match = String(str).match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    };

    const wsMax = Math.max(...workspaces.map((ws) => extractNum('ws', ws.id)), 1);
    const colIds = workspaces.flatMap((ws) => ws.columns.map((col) => col.id));
    const panelIds = workspaces.flatMap((ws) =>
      ws.columns.flatMap((col) => col.panels.map((p) => p.id))
    );
    const colMax = Math.max(...colIds.map((id) => extractNum('c', id)), 1);
    const panelMax = Math.max(...panelIds.map((id) => extractNum('p', id)), 1);

    wsCounterRef.current = wsMax;
    colCounterRef.current = colMax;
    panelCounterRef.current = panelMax;
  }, [workspaces]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWsId) || workspaces[0];
  const activePanelId = activePanelIds[activeWsId] || activeWorkspace?.columns[0]?.panels[0]?.id;

  const getWorkspaceDisplayLabel = (wsId) => {
    const index = workspaces.findIndex((w) => w.id === wsId);
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

  const removeWorkspace = (e, idToRemove) => {
    e.stopPropagation();
    setWorkspaces((prev) => {
      const newWs = prev.filter((w) => w.id !== idToRemove);
      if (newWs.length === 0) return prev;
      if (activeWsId === idToRemove) {
        setActiveWsId(newWs[newWs.length - 1].id);
      }
      return newWs;
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

  const fetchOpenCodeSessions = useCallback(async () => {
    setIsLoadingOpenCodeSessions(true);
    setOpenCodeSessionsError(null);

    try {
      const response = await fetch('/api/opencode/sessions', { cache: 'no-store' });
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron cargar las sesiones');
      }

      setOpenCodeSessions(Array.isArray(data) ? data : data?.sessions || []);
    } catch (error) {
      setOpenCodeSessions([]);
      setOpenCodeSessionsError(error?.message || 'Error cargando sesiones');
    } finally {
      setIsLoadingOpenCodeSessions(false);
    }
  }, []);

  const reopenOpenCodeSession = useCallback(
    async (session) => {
      if (!session?.id) return;

      const sessionCwd = session.directory || cwd;
      const command = `opencode --session ${session.id}`;
      const createdPanelId = launchPanelWithCommand(command, sessionCwd);

      // Register in devhub_agent_runs so Agent Room can track it
      try {
        const taskId = `oc-reopen-${session.id}`;
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        runs[taskId] = {
          panelId: createdPanelId,
          taskTitle: session.title || `OpenCode: ${session.id.slice(0, 8)}`,
          promptSummary: session.title || null,
          selectedAgent: 'opencode',
          launchOrigin: 'reopen-session',
          opencodeSessionId: session.id,
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
            agent_id: `oc-reopen-${session.id}`,
            project_id: projectId,
            nombre: 'opencode',
            modelo_llm: 'N/A',
            status: 'running',
            current_task_id: session.id,
            last_heartbeat: new Date().toISOString(),
          });
        } catch {
          // Ignore DB failures — the localStorage entry is enough for display
        }
      }

      return createdPanelId;
    },
    [cwd, launchPanelWithCommand, projectId]
  );

  const handleClosePanel = useCallback(
    async (panelIdToClose = null) => {
      const targetId = panelIdToClose || activePanelId;
      if (!targetId || !activeWorkspace) return;

      const allIds = getAllPanelIds(activeWorkspace.columns);
      if (allIds.length <= 1) return; // No cerrar si es el último

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isVisible) return; // Only process shortcuts if terminal is visible
      if (e.ctrlKey && e.shiftKey) {
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleSplit('vertical'); // Split Down
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          handleSplit('horizontal'); // Split Right
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          handleClosePanel(activePanelId); // Close current
        }
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
  }, [isVisible, handleSplit, handleClosePanel, activePanelId, cwd]);

  useEffect(() => {
    if (isOpenCodeMenuOpen && openCodeSessions.length === 0 && !isLoadingOpenCodeSessions) {
      fetchOpenCodeSessions();
    }
  }, [
    isOpenCodeMenuOpen,
    openCodeSessions.length,
    isLoadingOpenCodeSessions,
    fetchOpenCodeSessions,
  ]);

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

  return (
    <div className="flex flex-col h-full w-full bg-[#090c13] overflow-hidden">
      {/* Top Workspace Tab Bar */}
      <div
        className="flex items-end h-[40px] bg-[#1a1a1a] select-none shrink-0 border-b border-[#2a2a2a] px-3 pt-1"
      >
        <div className="flex-1 flex gap-1 h-full items-end overflow-x-auto no-scrollbar">
          {workspaces.map((ws) => {
            const totalPanels = getAllPanelIds(ws.columns).length;
            return (
              <div
                key={ws.id}
                onClick={() => setActiveWsId(ws.id)}
                draggable
                onDragStart={() => setDraggedWsId(ws.id)}
                onDragEnd={() => setDraggedWsId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  reorderWorkspaceTabs(draggedWsId, ws.id);
                  setDraggedWsId(null);
                }}
                className={`group flex items-center justify-between h-[36px] px-4 rounded-t-xl transition-colors cursor-pointer min-w-[160px] max-w-[220px] border-x border-t ${
                  activeWsId === ws.id
                    ? 'text-gray-100 border-[#2a2a2a]'
                    : 'bg-transparent text-gray-500 border-transparent hover:bg-[#222]'
                }`}
                style={
                  activeWsId === ws.id
                    ? {
                        background: `linear-gradient(180deg, ${getWorkspaceColor(ws.id)}33, #0d1018 55%)`,
                        boxShadow: `inset 0 1px 0 ${getWorkspaceColor(ws.id)}66`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid
                    className="w-3.5 h-3.5"
                    style={{ color: activeWsId === ws.id ? getWorkspaceColor(ws.id) : '#6b7280' }}
                  />
                  <span className="text-xs font-semibold tracking-tight truncate">
                    {getWorkspaceDisplayLabel(ws.id)}
                  </span>
                  <span className="text-[11px] bg-white/10 px-1.5 py-0.5 rounded-full ml-1 font-mono">
                    {totalPanels}
                  </span>
                </div>
                {workspaces.length > 1 && (
                  <button
                    onClick={(e) => removeWorkspace(e, ws.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded ml-2"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={addWorkspace}
            className="w-8 h-[36px] flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-t-xl ml-1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Global Toolbar + Window Controls */}
        <div
          className="flex items-center h-[36px] gap-1 pb-1 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            onClick={() => handleSplit('horizontal')}
            className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-accent-primary hover:bg-accent-primary/10 px-2 py-1.5 rounded-md transition-colors border border-accent-primary/20 cursor-pointer"
            title="Split Right (Ctrl+Shift+R)"
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            <span>Split Right</span>
          </button>
          <button
            onClick={() => handleSplit('vertical')}
            className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-accent-primary hover:bg-accent-primary/10 px-2 py-1.5 rounded-md transition-colors border border-accent-primary/20 cursor-pointer"
            title="Split Down (Ctrl+Shift+D)"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>Split Down</span>
          </button>

          {/* Agent Room Sidebar Toggle */}
          <button
            onClick={() => setIsAgentSidebarVisible((prev) => !prev)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
              isAgentSidebarVisible
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20'
                : 'text-gray-400 hover:bg-white/5 border border-transparent'
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
                className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2 py-1.5 rounded-md transition-colors border border-transparent hover:bg-white/5 text-gray-300 cursor-pointer"
                title="Lanzar Cuadrícula"
              >
                <Grip className="w-3.5 h-3.5" />
                <span>Grilla</span>
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
                  className="w-full bg-[#111826] border border-[#273146] rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notificaciones e Indicador de Página */}
          <div className="flex items-center gap-3 ml-2 pl-2 border-l border-[#2a2a2a]">
            <NotificationCenter projectId={projectId} variant="topbar" />
            <div
              className="text-[11px] px-3 py-1 rounded-full border shadow-sm flex items-center gap-2"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-muted)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              terminales
            </div>
          </div>

          <DropdownMenu onOpenChange={(open) => setIsOpenCodeMenuOpen(open)}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-[#2f3b52] bg-[#101726] text-gray-200 hover:bg-[#162033] hover:text-white"
              >
                <History className="w-3.5 h-3.5" />
                Reopen Session
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[380px] max-h-[420px] overflow-y-auto bg-[#0d1320] border-[#273146] text-gray-100">
              <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-gray-400">
                <span>OpenCode Sessions</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fetchOpenCodeSessions();
                  }}
                  className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-white"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isLoadingOpenCodeSessions ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />

              {isLoadingOpenCodeSessions && (
                <div className="px-2 py-3 text-xs text-gray-400 flex items-center gap-2">
                  <Clock3 className="w-3.5 h-3.5 animate-pulse" />
                  Loading recent sessions...
                </div>
              )}

              {!isLoadingOpenCodeSessions && openCodeSessionsError && (
                <div className="px-2 py-3 text-xs text-red-300">{openCodeSessionsError}</div>
              )}

              {!isLoadingOpenCodeSessions &&
                !openCodeSessionsError &&
                openCodeSessions.length === 0 && (
                  <div className="px-2 py-3 text-xs text-gray-400">
                    No recent OpenCode sessions found.
                  </div>
                )}

              {!isLoadingOpenCodeSessions &&
                openCodeSessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    className="flex flex-col items-start gap-1 rounded-md px-2 py-2 cursor-pointer focus:bg-[#162038]"
                    onSelect={(e) => {
                      e.preventDefault();
                      reopenOpenCodeSession(session);
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-white">
                        {session.title || session.id}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">
                        <ExternalLink className="w-3 h-3" />
                        Resume
                      </span>
                    </div>
                    <div className="w-full text-[11px] text-gray-400 flex items-center gap-2">
                      <span>
                        Updated{' '}
                        {session.updated
                          ? formatDistanceToNow(new Date(session.updated), { addSuffix: true })
                          : 'recently'}
                      </span>
                      <span className="text-gray-600">•</span>
                      <span className="truncate">{shortPath(session.directory || cwd)}</span>
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
              <Minus className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
            </button>
            <button
              onClick={handleWinToggleMaximize}
              className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#464a57] hover:bg-[#5b6070] transition-colors"
              title={isWinMaximized ? 'Restore' : 'Maximize'}
            >
              <Plus className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
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
      <div className="flex-1 flex bg-[#080b12] relative overflow-hidden">
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
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={`absolute inset-0 p-[6px] ${activeWsId === ws.id && isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{
                zIndex: activeWsId === ws.id ? 10 : 0,
              }}
            >
              <PanelGroup direction="horizontal" className="w-full h-full">
                {ws.columns.map((col, colIdx) => (
                  <React.Fragment key={col.id}>
                    <Panel minSize={10} className="flex flex-col">
                      <PanelGroup direction="vertical" className="w-full h-full">
                        {col.panels.map((panel, pIdx) => {
                          const isActive = panel.id === activePanelId && activeWsId === ws.id;

                          return (
                            <React.Fragment key={panel.id}>
                              <Panel
                                minSize={10}
                                className={`flex flex-col bg-[#0c1018] rounded-md overflow-hidden border transition-shadow ${
                                  isActive
                                    ? 'border-[#5b8cff99] shadow-[0_0_0_1px_rgba(91,140,255,0.5),0_10px_24px_rgba(6,10,18,0.55)] z-10 relative'
                                    : 'border-[#273041] z-0'
                                }`}
                              >
                                {/* Header del Panel */}
                                <div
                                  onClick={() =>
                                    setActivePanelIds((prev) => ({ ...prev, [ws.id]: panel.id }))
                                  }
                                  className={`h-[34px] flex items-center justify-between px-2.5 shrink-0 border-b transition-colors cursor-pointer group select-none ${
                                    isActive
                                      ? 'bg-[#0f1626] border-[#5b8cff66]'
                                      : 'bg-[#111826] border-[#263146]'
                                  }`}
                                >
                                  <div
                                    className={`flex items-center gap-1.5 min-w-0 ${isActive ? 'opacity-100' : 'opacity-85'}`}
                                  >
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono border"
                                      style={{
                                        color: isActive ? '#9ec1ff' : '#9aa6bd',
                                        borderColor: isActive ? '#44639a' : '#30405c',
                                        background: isActive ? '#16233a' : '#111a2b',
                                      }}
                                    >
                                      <Folder className="w-3 h-3" />
                                      {shortPath(panel.cwd || cwd)}
                                    </span>

                                    {getAgentFromCommand(panel.initialCommand) && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold border border-[#355787] bg-[#10233d] text-[#6da9ff] max-w-[150px] truncate">
                                        <Bot className="w-3 h-3 shrink-0" />
                                        <span className="truncate">
                                          {getAgentFromCommand(panel.initialCommand)}
                                        </span>
                                      </span>
                                    )}

                                    <span className="text-xs font-mono uppercase text-gray-400 truncate">
                                      {getPanelDisplayLabel(ws, panel.id)}
                                    </span>
                                  </div>

                                  {/* Acciones (Hover) */}
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSplit('horizontal', panel.id);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                    >
                                      <SplitSquareHorizontal className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSplit('vertical', panel.id);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                    >
                                      <SplitSquareVertical className="w-3 h-3" />
                                    </button>
                                    {getAllPanelIds(ws.columns).length > 1 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleClosePanel(panel.id);
                                        }}
                                        className="w-5 h-5 flex items-center justify-center hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 ml-1"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Terminal */}
                                <div
                                  className="flex-1 relative min-h-0"
                                  onClick={() =>
                                    setActivePanelIds((prev) => ({ ...prev, [ws.id]: panel.id }))
                                  }
                                >
                                  <TerminalTTY
                                    id={panel.id}
                                    cwd={panel.cwd || cwd}
                                    hideTitleBar={true}
                                    autoFocus={isActive}
                                    initialCommand={panel.initialCommand}
                                  />
                                </div>
                              </Panel>

                              {/* Separador Vertical (Split Down) */}
                              {pIdx < col.panels.length - 1 && (
                                <PanelResizeHandle className="relative h-3 flex items-center justify-center z-20 cursor-row-resize">
                                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-[#2a344a]" />
                                  <div className="h-1 w-10 rounded-full bg-[#3a4e70] hover:bg-[#5b8cff] transition-colors cursor-pointer" />
                                </PanelResizeHandle>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </PanelGroup>
                    </Panel>

                    {/* Separador Horizontal (Split Right) */}
                    {colIdx < ws.columns.length - 1 && (
                      <PanelResizeHandle className="relative w-3 flex items-center justify-center z-20 cursor-col-resize">
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#2a344a]" />
                        <div className="w-1 h-12 rounded-full bg-[#3a4e70] hover:bg-[#5b8cff] transition-colors cursor-pointer" />
                      </PanelResizeHandle>
                    )}
                  </React.Fragment>
                ))}
              </PanelGroup>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

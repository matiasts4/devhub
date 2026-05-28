// WorkspaceWindowTabBar — tab strip UI per workspace: drag handles, tab labels, add/close buttons.
// Extracted from TerminalWorkspacesManager.jsx top tab bar section.

import React from 'react';
import { LayoutGrid, Plus, X, Folder, Minus, Globe } from 'lucide-react';
import { getWorkspaceTabStyle, shortPath } from '../utils/panelHelpers';

function WorkspaceWindowTabBar({
  workspaces,
  activeWsId,
  draggedWsId,
  dragOverWsId,
  browserWindowStates,
  cwd,
  showWorkspacePathChip,
  onWorkspaceClick,
  onAddWorkspace,
  onRemoveWorkspace,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onCloseWorkspaceBrowser,
  // Window controls
  isWinMaximized,
  onWinMinimize,
  onWinToggleMaximize,
  onWinClose,
}) {
  return (
    <div
      key="workspace-top-tab-bar"
      data-testid="workspace-top-tab-bar"
      className="flex items-center min-h-[44px] bg-[var(--surface-app)] select-none shrink-0 border-b border-[var(--border-subtle)] px-3 gap-2"
    >
      <div className="flex-1 flex gap-2 h-full items-center overflow-x-auto no-scrollbar py-1">
        {workspaces.map((ws, wsIndex) => {
          const totalPanels = ws.columns?.flatMap((col) => col.panels || []).length || 0;
          const workspaceTabLabel = getWorkspaceDisplayLabel(ws, workspaces);
          const hasOpenBrowserWindow = browserWindowStates?.[ws.id]?.open === true;
          return (
            <div
              key={ws.id}
              onClick={() => onWorkspaceClick(ws.id)}
              draggable
              onDragStart={(e) => onDragStart(ws.id, e)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onDragOver(ws.id, e)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(ws.id, e)}
              className={`group flex items-center justify-between h-full px-4 rounded-xl transition-all cursor-grab active:cursor-grabbing select-none border ${
                draggedWsId === ws.id ? 'opacity-40 scale-95' : ''
              } ${
                activeWsId === ws.id
                  ? 'text-[var(--text-primary)] border-[var(--border-subtle)]'
                  : 'text-[var(--text-muted)] border-transparent hover:bg-white/[0.04] hover:text-[var(--text-secondary)]'
              }`}
              title={workspaceTabLabel}
              style={{
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
              }}
            >
              <div className="flex items-center gap-2">
                <LayoutGrid
                  className="w-3.5 h-3.5 shrink-0"
                  style={{
                    color:
                      activeWsId === ws.id
                        ? `rgba(var(--accent-rgb,88,166,255),0.9)`
                        : 'currentColor',
                  }}
                />
                <span className="text-[12px] font-semibold truncate">{workspaceTabLabel}</span>
                {hasOpenBrowserWindow ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5">
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
                        onCloseWorkspaceBrowser(ws.id);
                      }}
                      className="inline-flex items-center justify-center rounded text-emerald-100/80 transition-colors hover:text-white"
                      title="Cerrar browser dedicado de este workspace"
                      aria-label="Cerrar browser dedicado de este workspace"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : null}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-md font-mono leading-none"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' }}
                >
                  {totalPanels}
                </span>
              </div>
              {workspaces.length > 1 && (
                <button
                  onClick={(e) => onRemoveWorkspace(e, ws.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded ml-1.5 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAddWorkspace}
          className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] rounded-sm transition-all ml-0.5 shrink-0"
          title="Nuevo workspace"
          aria-label="Nuevo workspace"
          data-testid="workspace-add-button"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center h-full shrink-0 gap-2.5"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <button
          onClick={onWinMinimize}
          className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#2f323e] hover:bg-[#434857] transition-colors"
          title="Minimize"
        >
          <Minus
            className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
            strokeWidth={3}
          />
        </button>
        <button
          onClick={onWinToggleMaximize}
          className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#464a57] hover:bg-[#5b6070] transition-colors"
          title={isWinMaximized ? 'Restore' : 'Maximize'}
        >
          <Plus
            className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
            strokeWidth={3}
          />
        </button>
        <button
          onClick={onWinClose}
          className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#B80096] hover:bg-[#D600AE] transition-colors"
          title="Close"
        >
          <X className="w-2.5 h-2.5 text-black stroke-[3px]" />
        </button>
      </div>
    </div>
  );
}

function getWorkspaceDisplayLabel(ws, workspaces) {
  const index = workspaces.findIndex((w) => w.id === ws.id);
  const explicitName = typeof ws.name === 'string' ? ws.name.trim() : '';
  if (explicitName && !/^workspace\s+\d+$/i.test(explicitName)) {
    return explicitName;
  }
  return `Workspace ${index + 1}`;
}

export default WorkspaceWindowTabBar;

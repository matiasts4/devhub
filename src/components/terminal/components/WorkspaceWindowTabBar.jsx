// WorkspaceWindowTabBar — workspace tab strip UI (drag handles, tab labels, add/close).
// Extracted from TerminalWorkspacesManager.jsx top tab bar section.

import React from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Plus, X, Grip } from 'lucide-react';
import { getWorkspaceTabChromeStyle } from '../terminalChromeStyles';

function getWorkspaceTabStyle(totalWorkspaces) {
  if (totalWorkspaces <= 4) {
    return { flex: '1 1 0%', minWidth: '190px', maxWidth: '260px' };
  }
  if (totalWorkspaces <= 7) {
    return { flex: '1 1 0%', minWidth: '158px', maxWidth: '220px' };
  }
  return { flex: '0 1 138px', minWidth: '138px', maxWidth: '180px' };
}

function buildStableWorkspaceShellKey(scope, workspaceId) {
  return `${scope}-${String(workspaceId || 'unknown')}`;
}

function WorkspaceWindowTabBar({
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
}) {
  return (
    <div className="flex w-auto max-w-full gap-2 h-full items-center overflow-x-auto no-scrollbar py-1 shrink-0">
      {workspaces.map((ws) => {
        const totalPanels = getAllPanelIds(ws.columns).length;
        const workspaceTabKey = buildStableWorkspaceShellKey('workspace-tab', ws.id);
        const workspaceTabLabel = getWorkspaceDisplayLabel(ws.id);
        const hasOpenBrowserWindow = browserWindowStates?.[ws.id]?.open === true;
        return (
          <motion.div
            key={workspaceTabKey}
            data-workspace-id={ws.id}
            data-testid={`workspace-tab-${ws.id}`}
            onClick={() => switchWorkspace(ws.id)}
            onPointerDown={handleWorkspaceTabPointerDown(ws.id)}
            onPointerMove={handleWorkspaceTabPointerMove}
            onPointerUp={endWorkspaceTabDrag}
            onPointerLeave={endWorkspaceTabDrag}
            onPointerCancel={endWorkspaceTabDrag}
            className={`group relative flex h-[34px] min-h-[34px] items-center justify-between px-3.5 rounded-xl transition-colors duration-150 cursor-grab active:cursor-grabbing select-none touch-none border ${
              draggedWsId === ws.id ? 'opacity-40 scale-95' : ''
            } ${
              activeWsId === ws.id
                ? 'text-[var(--text-primary)] border-transparent'
                : 'text-[var(--text-muted)] border-transparent hover:bg-white/[0.04] hover:text-[var(--text-secondary)]'
            }`}
            title={workspaceTabLabel}
            style={{
              touchAction: 'none',
              ...getWorkspaceTabStyle(workspaces.length),
              ...getWorkspaceTabChromeStyle({
                active: activeWsId === ws.id,
                dragOver: dragOverWsId === ws.id && draggedWsId !== ws.id,
              }),
            }}
          >
            <motion.span
              initial={false}
              animate={{
                opacity: activeWsId === ws.id ? 1 : 0,
                scale: activeWsId === ws.id ? 1 : 0.96,
              }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.35)] bg-[rgba(var(--accent-rgb,88,166,255),0.07)]"
              style={{ zIndex: 0, willChange: 'transform', transformOrigin: 'center' }}
            />
            <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-2">
              <Grip
                className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${
                  activeWsId === ws.id ? 'opacity-50' : 'opacity-30 group-hover:opacity-50'
                }`}
                style={{
                  color:
                    activeWsId === ws.id
                      ? `rgba(var(--accent-rgb,88,166,255),0.9)`
                      : 'currentColor',
                }}
                aria-hidden="true"
              />
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
              {/* Dedicated browser window: no visible emerald badge on workspace tabs
                  (that cluttered the strip). Keep a screen-reader control + test hook. */}
              {hasOpenBrowserWindow ? (
                <span className="sr-only">
                  <span data-testid={`workspace-browser-indicator-${ws.id}`}>
                    Browser dedicado abierto
                  </span>
                  <button
                    type="button"
                    data-testid={`workspace-browser-close-${ws.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeWorkspaceBrowserWindow(ws.id);
                    }}
                  >
                    Cerrar browser dedicado de este workspace
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
          </motion.div>
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
  );
}

export default WorkspaceWindowTabBar;

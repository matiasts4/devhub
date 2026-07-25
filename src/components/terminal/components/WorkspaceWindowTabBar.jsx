// WorkspaceWindowTabBar — workspace tab strip UI (drag handles, tab labels, add/close).
// Extracted from TerminalWorkspacesManager.jsx top tab bar section.
//
// Density: when more than COMPACT_THRESHOLD workspaces exist the strip
// switches to compact mode (smaller padding, no panel counter) so tab
// names remain readable. Each workspace gets a stable identity color
// (workspaceColors.js) shown as a dot; the active workspace additionally
// gets a colored underline + tinted background.

import { motion } from 'framer-motion';
import { Plus, X, Grip, Pencil } from 'lucide-react';
import { getWorkspaceColor } from '../workspaceColors';

const COMPACT_THRESHOLD = 4;

function getWorkspaceTabStyle(compact) {
  return compact
    ? { flex: '0 1 auto', minWidth: '56px', maxWidth: '180px' }
    : { flex: '0 1 auto', minWidth: '90px', maxWidth: '220px' };
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
  activityByWorkspace,
  switchWorkspace,
  handleWorkspaceTabPointerDown,
  addWorkspace,
  removeWorkspace,
  closeWorkspaceBrowserWindow,
  getWorkspaceDisplayLabel,
  getAllPanelIds,
  editingWsId,
  editingWsValue,
  wsRenameError,
  onStartWorkspaceRename,
  onWorkspaceRenameChange,
  onCommitWorkspaceRename,
  onCancelWorkspaceRename,
}) {
  const compact = workspaces.length > COMPACT_THRESHOLD;

  return (
    <div
      className="flex-1 flex gap-1 h-full items-center overflow-x-auto no-scrollbar py-1"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {workspaces.map((ws) => {
        const totalPanels = getAllPanelIds(ws.columns).length;
        const workspaceTabKey = buildStableWorkspaceShellKey('workspace-tab', ws.id);
        const workspaceTabLabel = getWorkspaceDisplayLabel(ws.id);
        const hasOpenBrowserWindow = browserWindowStates?.[ws.id]?.open === true;
        const isActive = activeWsId === ws.id;
        const wsColor = (alpha) => getWorkspaceColor(ws.id, alpha);
        // Aggregate agent activity for this workspace: 'running' | 'blocked' | null.
        const activity = activityByWorkspace?.[ws.id] || null;

        return (
          <motion.div
            key={workspaceTabKey}
            layout
            transition={{ layout: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } }}
            data-workspace-id={ws.id}
            data-testid={`workspace-tab-${ws.id}`}
            onClick={() => switchWorkspace(ws.id)}
            onPointerDown={handleWorkspaceTabPointerDown(ws.id)}
            className={`group relative flex h-[34px] min-h-[34px] items-center justify-between rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing select-none touch-none border ${
              compact ? 'px-2' : 'px-3'
            } ${
              draggedWsId === ws.id
                ? 'opacity-60 scale-[1.03] shadow-lg shadow-black/30 z-50 ring-1 ring-white/25'
                : ''
            } ${dragOverWsId === ws.id && draggedWsId !== ws.id ? 'border-l-2' : ''} ${
              isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
            title={workspaceTabLabel}
            style={{
              touchAction: 'none',
              ...getWorkspaceTabStyle(compact),
              background: isActive ? wsColor(0.09) : 'transparent',
              borderColor: isActive
                ? wsColor(0.32)
                : dragOverWsId === ws.id && draggedWsId !== ws.id
                  ? wsColor(0.5)
                  : 'transparent',
              borderWidth: 1,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = wsColor(0.05);
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            {/* Active underline indicator */}
            <motion.span
              initial={false}
              animate={{
                scaleX: isActive ? 1 : 0,
                opacity: isActive ? 1 : 0,
              }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] w-[62%] rounded-full"
              style={{ background: wsColor(0.85), zIndex: 2 }}
            />
            <div
              className={`relative z-[1] flex min-w-0 flex-1 items-center ${compact ? 'gap-1.5' : 'gap-2'}`}
            >
              <Grip
                className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${
                  isActive ? 'opacity-45' : 'opacity-25 group-hover:opacity-45'
                }`}
                style={{ color: 'currentColor' }}
                aria-hidden="true"
              />
              {/* Workspace identity dot + agent activity halo */}
              <span
                className="relative inline-flex shrink-0 items-center justify-center"
                style={{ width: 12, height: 12 }}
                data-activity={activity || 'none'}
                aria-hidden="true"
              >
                {activity === 'running' ? (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'rgba(52,211,153,0.5)' }}
                    animate={{ scale: [1, 2.1], opacity: [0.75, 0] }}
                    transition={{ repeat: Infinity, duration: 1.3, ease: 'easeOut' }}
                  />
                ) : null}
                {activity === 'blocked' ? (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'rgba(251,113,133,0.45)' }}
                    animate={{ scale: [1, 1.7], opacity: [0.65, 0.1] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                  />
                ) : null}
                <span
                  className="relative rounded-full transition-all duration-150"
                  style={{
                    width: isActive ? 7 : 6,
                    height: isActive ? 7 : 6,
                    background:
                      activity === 'running'
                        ? 'rgb(52,211,153)'
                        : activity === 'blocked'
                          ? 'rgb(251,113,133)'
                          : wsColor(isActive ? 1 : 0.55),
                    boxShadow:
                      activity === 'running'
                        ? '0 0 8px rgba(52,211,153,0.8)'
                        : activity === 'blocked'
                          ? '0 0 8px rgba(251,113,133,0.7)'
                          : isActive
                            ? `0 0 7px ${wsColor(0.6)}`
                            : 'none',
                  }}
                />
              </span>
              {editingWsId === ws.id ? (
                <span className="relative inline-flex min-w-0 flex-1 items-center">
                  <input
                    autoFocus
                    type="text"
                    data-testid={`workspace-rename-input-${ws.id}`}
                    value={editingWsValue}
                    onChange={(e) => onWorkspaceRenameChange?.(e.target.value || '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onWorkspaceRenameChange?.(e.currentTarget.value || '');
                        onCommitWorkspaceRename?.(ws.id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onCancelWorkspaceRename?.();
                      }
                    }}
                    onBlur={(e) => {
                      onWorkspaceRenameChange?.(e.currentTarget.value || '');
                      onCommitWorkspaceRename?.(ws.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="w-full min-w-[80px] rounded border border-[rgba(var(--accent-rgb,88,166,255),0.45)] bg-[var(--surface-card,#0f1724)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--text-primary)] outline-none"
                    aria-label={`Rename workspace ${ws.id}`}
                  />
                  {wsRenameError ? (
                    <span
                      data-testid={`workspace-rename-error-${ws.id}`}
                      className="absolute left-0 top-full mt-0.5 whitespace-nowrap text-[9px] font-semibold text-[rgb(251,113,133)]"
                    >
                      {wsRenameError === 'empty-name' ? 'Name required' : 'Max 40 characters'}
                    </span>
                  ) : null}
                </span>
              ) : (
                <>
                  <span
                    className="min-w-0 truncate text-[12px] font-semibold"
                    style={isActive ? { color: wsColor(0.95) } : undefined}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onStartWorkspaceRename?.(ws.id, workspaceTabLabel);
                    }}
                  >
                    {workspaceTabLabel}
                  </span>
                  <button
                    type="button"
                    data-testid={`workspace-rename-btn-${ws.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartWorkspaceRename?.(ws.id, workspaceTabLabel);
                    }}
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-80"
                    title="Renombrar workspace"
                    aria-label={`Renombrar ${workspaceTabLabel}`}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </>
              )}
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
              {!compact && (
                <span
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-mono leading-none"
                  style={{
                    background: isActive ? wsColor(0.12) : 'rgba(255,255,255,0.07)',
                    color: isActive ? wsColor(0.9) : 'var(--text-muted)',
                  }}
                >
                  {totalPanels}
                </span>
              )}
            </div>
            {workspaces.length > 1 && (
              <button
                type="button"
                data-testid={`workspace-close-${ws.id}`}
                onClick={(e) => removeWorkspace(e, ws.id)}
                aria-label={`Cerrar ${workspaceTabLabel}`}
                title={`Cerrar ${workspaceTabLabel}`}
                className={`relative z-[1] ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-150 active:scale-95 ${
                  isActive
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
        className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] rounded-sm transition-all shrink-0"
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

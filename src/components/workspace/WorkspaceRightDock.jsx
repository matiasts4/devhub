'use client';

import FileExplorerEditorPane from './FileExplorerEditorPane';
import WorkspaceBrowserPane from './WorkspaceBrowserPane';

export default function WorkspaceRightDock({
  project,
  workspaceId,
  dockState,
  onDockStateChange,
  browserWindowState,
  onBrowserWindowStateChange,
  workspaceWindows,
  activeWorkspaceWindowId,
  onWorkspaceWindowSelect,
  onWorkspaceWindowAdd,
  onWorkspaceWindowRemove,
}) {
  const isBrowserActive = dockState.activeTab !== 'editor';

  return (
    <section
      className="h-full min-h-0 flex flex-col border-l border-[color-mix(in_srgb,var(--accent-primary)_14%,var(--border-subtle))] bg-[linear-gradient(180deg,#0b121d_0%,#08101a_100%)] text-[var(--text-primary)]"
      data-testid="workspace-right-dock"
    >
      <div className="flex-1 min-h-0" data-testid="workspace-right-dock-shell">
        <div className={isBrowserActive ? 'h-full min-h-0' : 'hidden'} aria-hidden={!isBrowserActive}>
          <WorkspaceBrowserPane
            projectId={project?.id}
            workspaceId={workspaceId}
            dockState={dockState}
            onDockStateChange={onDockStateChange}
            browserWindowState={browserWindowState}
            onBrowserWindowStateChange={onBrowserWindowStateChange}
            workspaceWindows={workspaceWindows}
            activeWorkspaceWindowId={activeWorkspaceWindowId}
            onWorkspaceWindowSelect={onWorkspaceWindowSelect}
            onWorkspaceWindowAdd={onWorkspaceWindowAdd}
            onWorkspaceWindowRemove={onWorkspaceWindowRemove}
          />
        </div>

        <div className={isBrowserActive ? 'hidden' : 'h-full min-h-0'} aria-hidden={isBrowserActive}>
          <FileExplorerEditorPane project={project} workspaceId={workspaceId} embedded={true} />
        </div>
      </div>
    </section>
  );
}

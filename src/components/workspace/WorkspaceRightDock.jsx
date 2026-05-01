'use client';

import FileExplorerEditorPane from './FileExplorerEditorPane';
import WorkspaceBrowserPane from './WorkspaceBrowserPane';

export default function WorkspaceRightDock({ project, dockState, onDockStateChange }) {
  let content = <WorkspaceBrowserPane dockState={dockState} onDockStateChange={onDockStateChange} />;

  if (dockState.activeTab === 'editor') {
    content = <FileExplorerEditorPane project={project} embedded={true} />;
  }

  return (
    <section
      className="h-full min-h-0 flex flex-col border-l border-[color-mix(in_srgb,var(--accent-primary)_14%,var(--border-subtle))] bg-[linear-gradient(180deg,#0b121d_0%,#08101a_100%)] text-[var(--text-primary)]"
      data-testid="workspace-right-dock"
    >
      <div className="flex-1 min-h-0" data-testid="workspace-right-dock-shell">
        {content}
      </div>
    </section>
  );
}

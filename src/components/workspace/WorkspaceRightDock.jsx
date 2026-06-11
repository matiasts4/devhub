'use client';

import PropTypes from 'prop-types';
import FileExplorerEditorPane from './FileExplorerEditorPane';
import OperatorActionCard from '@/components/workspace/OperatorActionCard';
import WorkspaceBrowserPane from './WorkspaceBrowserPane';
import WorkspaceSwarmPane from './WorkspaceSwarmPane';
import WorkspaceOperatorObserverPane from './WorkspaceOperatorObserverPane';
import PizarraPane from '@/components/pizarra/PizarraPane';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';

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
  executionCards,
  onCardConfirm,
  onCardCancel,
}) {
  WorkspaceRightDock.propTypes = {
    executionCards: PropTypes.array,
    onCardConfirm: PropTypes.func,
    onCardCancel: PropTypes.func,
  };
  const isBrowserActive = dockState.activeTab === 'browser';
  const isEditorActive = dockState.activeTab === 'editor';
  const isSwarmActive = dockState.activeTab === 'swarm';
  const isPizarraActive = dockState.activeTab === 'pizarra';

  // pizarra-motion-polish (P-MP-3): the OUTER <ModeTransitionShell> wrap
  // was removed. The inner shell in PizarraPane is the SINGLE owner
  // (NFR-P03). Previously both WorkspaceRightDock AND PizarraPane
  // wrapped their content, producing two sibling shells that ran
  // parallel phase machines. The shell stays inside PizarraPane;
  // this file returns dockBody directly.

  const dockBody = (
    <section
      className={`h-full min-h-0 flex flex-col ${isPizarraActive ? '' : 'border-l border-[color-mix(in_srgb,var(--accent-primary)_14%,var(--border-subtle))]'} bg-[linear-gradient(180deg,#0b121d_0%,#08101a_100%)] text-[var(--text-primary)]`}
      data-testid="workspace-right-dock"
    >
      <div className="flex-1 min-h-0" data-testid="workspace-right-dock-shell">
        <div
          className={isBrowserActive ? 'h-full min-h-0' : 'hidden'}
          aria-hidden={!isBrowserActive}
        >
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

        <div className={isEditorActive ? 'h-full min-h-0' : 'hidden'} aria-hidden={!isEditorActive}>
          <FileExplorerEditorPane project={project} workspaceId={workspaceId} embedded={true} />
        </div>

        <div className={isSwarmActive ? 'h-full min-h-0' : 'hidden'} aria-hidden={!isSwarmActive}>
          <WorkspaceSwarmPane
            project={project}
            dockState={dockState}
            onDockStateChange={onDockStateChange}
          />
        </div>

        {isPizarraActive && (
          <div className="h-full min-h-0 relative" data-testid="pizarra-host">
            <PizarraPane
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
        )}
      </div>

      {/* Operator action cards — hide in pizarra fullscreen takeover to avoid overlapping the canvas/palette */}
      {(executionCards?.length ?? 0) > 0 && !isPizarraActive && (
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
            Operator Actions
          </div>
          {executionCards.map((card) => (
            <OperatorActionCard
              key={card.id}
              card={card}
              onConfirm={onCardConfirm}
              onCancel={onCardCancel}
            />
          ))}
        </div>
      )}
    </section>
  );

  return dockBody;
}

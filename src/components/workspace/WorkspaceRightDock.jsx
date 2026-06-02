'use client';

import PropTypes from 'prop-types';
import FileExplorerEditorPane from './FileExplorerEditorPane';
import OperatorActionCard from '@/components/workspace/OperatorActionCard';
import WorkspaceBrowserPane from './WorkspaceBrowserPane';
import WorkspaceSwarmPane from './WorkspaceSwarmPane';
import WorkspaceOperatorObserverPane from './WorkspaceOperatorObserverPane';
import ChatPanel from '@/components/asistente/ChatPanel';
import PizarraPane from '@/components/pizarra/PizarraPane';
import { ModeTransitionShell } from '@/lib/pizarra/ModeTransitionShell';
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
  const isZedActive = dockState.activeTab === 'zed';
  const isPizarraActive = dockState.activeTab === 'pizarra';

  // ── ModeTransitionShell wiring (pizarra-shared-view-state §7) ──────────────
  // When the pizarra-shared-view-state feature flag is ON, wrap the
  // right-dock chrome in <ModeTransitionShell> so the workspace↔
  // pizarra mode toggle plays a cross-fade + slide + scale animation
  // in lockstep with PizarraPane. The shell's `maximizedView` is
  // derived from `dockState.maximizedView` — when the user flips
  // from 'browser' to 'pizarra' (or any other transition) the shell
  // runs the choreography. Flag OFF preserves the legacy hard-cut
  // behavior; the shell is a no-op.
  const transitionEnabled = isPizarraSharedViewEnabled();
  const view = dockState?.maximizedView;
  const shellMaximizedView = view === 'pizarra' ? 'pizarra' : 'workspace';
  const reducedMotion = detectReducedMotionPref();

  const dockBody = (
    <section
      className="h-full min-h-0 flex flex-col border-l border-[color-mix(in_srgb,var(--accent-primary)_14%,var(--border-subtle))] bg-[linear-gradient(180deg,#0b121d_0%,#08101a_100%)] text-[var(--text-primary)]"
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

        {isZedActive && (
          <div className="h-full min-h-0">
            <ChatPanel />
          </div>
        )}

        {isPizarraActive && (
          <div className="h-full min-h-0">
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

      {/* Operator action cards — always visible, below tab content */}
      {(executionCards?.length ?? 0) > 0 && (
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

  if (!transitionEnabled) {
    return dockBody;
  }

  return (
    <ModeTransitionShell
      maximizedView={shellMaximizedView}
      reducedMotion={reducedMotion}
      testId="mode-transition-shell"
      style={{ width: '100%', height: '100%' }}
    >
      {dockBody}
    </ModeTransitionShell>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * detectReducedMotionPref — SSR-safe read of the OS reduced-motion
 * preference. Mirrors the detection used in useModeTransition so
 * the wiring point can pass the same value down to the shell.
 * Returns false in non-DOM environments.
 */
function detectReducedMotionPref() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

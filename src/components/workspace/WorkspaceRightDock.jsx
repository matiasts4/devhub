'use client';

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import FileExplorerEditorPane from './FileExplorerEditorPane';
import OperatorActionCard from '@/components/workspace/OperatorActionCard';
import WorkspaceBrowserPane from './WorkspaceBrowserPane';
import WorkspaceSwarmPane from './WorkspaceSwarmPane';
import WorkspaceOperatorObserverPane from './WorkspaceOperatorObserverPane';
import PizarraPane from '@/components/pizarra/PizarraPane';
import { ModeTransitionShell } from '@/lib/pizarra/ModeTransitionShell';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { dispatchTerminalLayoutSettled } from '@/components/terminal/nativeLayoutSync';

/**
 * After entering pizarra, if the host never measures a usable rect (or the
 * transition layer is still fully transparent), force a soft recovery:
 * re-dispatch layout-settled so portals/WebGL re-attach. Intermittent
 * blank black content area — no user-visible chrome — is the failure mode.
 */
const PIZARRA_BLANK_RECOVERY_MS = 420;

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
  layoutSyncKey = 0,
  layoutReady = true,
  executionCards,
  onCardConfirm,
  onCardCancel,
}) {
  WorkspaceRightDock.propTypes = {
    executionCards: PropTypes.array,
    onCardConfirm: PropTypes.func,
    onCardCancel: PropTypes.func,
    layoutReady: PropTypes.bool,
    layoutSyncKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  };
  const isBrowserActive = dockState.activeTab === 'browser';
  const isEditorActive = dockState.activeTab === 'editor';
  const isSwarmActive = dockState.activeTab === 'swarm';
  const isPizarraActive = dockState.activeTab === 'pizarra';

  // Keep-alive after first open in this workspace (same idea as browser/editor).
  // Conditional mount on every toggle remounted Konva + surface portals and
  // produced intermittent "submarino blank" frames until full app restart.
  const [pizarraEverOpened, setPizarraEverOpened] = useState(isPizarraActive);
  useEffect(() => {
    // Scope keep-alive to the current workspace tab.
    setPizarraEverOpened(isPizarraActive);
  }, [workspaceId]);
  useEffect(() => {
    if (isPizarraActive) setPizarraEverOpened(true);
  }, [isPizarraActive]);

  // Soft recovery when pizarra is active but host has no usable layout.
  useEffect(() => {
    if (!isPizarraActive || typeof window === 'undefined') return undefined;
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return undefined;

    const timer = window.setTimeout(() => {
      const host = document.querySelector('[data-testid="pizarra-host"]');
      const canvas = document.querySelector('[data-testid="pizarra-canvas"]');
      const shell = document.querySelector('[data-testid="mode-transition-shell"]');
      const hostRect = host?.getBoundingClientRect?.();
      const hostOk =
        host &&
        hostRect &&
        hostRect.width > 8 &&
        hostRect.height > 8 &&
        // hidden keep-alive is fine; only recover while active
        host.offsetParent !== null;
      const shellOpacity =
        shell && typeof window.getComputedStyle === 'function'
          ? Number.parseFloat(window.getComputedStyle(shell).opacity || '1')
          : 1;
      const layer = shell?.querySelector?.('[data-mode-transition-layer="true"]');
      const layerOpacity =
        layer && typeof window.getComputedStyle === 'function'
          ? Number.parseFloat(window.getComputedStyle(layer).opacity || '1')
          : 1;

      const looksBlank =
        !hostOk ||
        !canvas ||
        (Number.isFinite(shellOpacity) && shellOpacity < 0.05) ||
        (Number.isFinite(layerOpacity) && layerOpacity < 0.05);

      if (!looksBlank) return;

      try {
        console.warn('[pizarra-blank-recovery]', {
          workspaceId,
          hostOk: Boolean(hostOk),
          hasCanvas: Boolean(canvas),
          shellOpacity,
          layerOpacity,
          hostW: hostRect?.width ?? 0,
          hostH: hostRect?.height ?? 0,
        });
      } catch {
        // ignore
      }

      // Nudge layout + shared surface hosts without unmounting the pane.
      window.dispatchEvent(
        new CustomEvent('devhub:pizarra-blank-recovery', {
          detail: { workspaceId, at: Date.now() },
        })
      );
      dispatchTerminalLayoutSettled({
        reason: 'pizarra-blank-recovery',
        panelIds: [],
      });
      // Force a reflow on the host so ResizeObservers re-fire.
      if (host) {
        void host.offsetHeight;
        host.style.minHeight = host.style.minHeight === '1px' ? '0px' : '1px';
        requestAnimationFrame(() => {
          if (host) host.style.minHeight = '';
        });
      }
    }, PIZARRA_BLANK_RECOVERY_MS);

    return () => window.clearTimeout(timer);
  }, [isPizarraActive, workspaceId, dockState?.browserLayoutEpoch]);

  // Pizarra transition owner: the shell must live at the dock host
  // because this component exists before/after the pizarra pane itself.
  // PizarraPane renders pure content; this outer shell is the single
  // transition owner for normal ↔ pizarra chrome.
  const transitionEnabled = isPizarraSharedViewEnabled();
  const shellMaximizedView =
    dockState?.maximized && dockState?.maximizedView === 'pizarra' ? 'pizarra' : 'workspace';

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
            layoutSyncKey={layoutSyncKey ?? dockState.browserLayoutEpoch ?? 0}
            layoutReady={layoutReady}
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

        {(isPizarraActive || pizarraEverOpened) && (
          <div
            className={isPizarraActive ? 'h-full min-h-0 relative' : 'hidden'}
            aria-hidden={!isPizarraActive}
            data-testid="pizarra-host"
            data-pizarra-active={isPizarraActive ? 'true' : 'false'}
          >
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

  if (!transitionEnabled) {
    return dockBody;
  }

  return (
    <ModeTransitionShell
      maximizedView={shellMaximizedView}
      testId="mode-transition-shell"
      className="h-full min-h-0"
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(180deg,#0b121d 0%,#08101a 100%)',
      }}
    >
      {dockBody}
    </ModeTransitionShell>
  );
}

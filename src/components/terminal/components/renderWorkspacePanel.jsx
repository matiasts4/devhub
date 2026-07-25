// renderWorkspacePanel — standalone JSX function for rendering a single space panel.
// Extracted from TerminalWorkspacesManager.jsx.

import TerminalTTY from '../../TerminalTTY';
import WorkspaceBrowserPane from '@/components/workspace/WorkspaceBrowserPane';
import PanelRendererSelect from './PanelRendererSelect';
import PanelStatusBadge from './PanelStatusBadge';
import {
  SharedTerminalSurfacePortal,
  SharedTerminalSurfaceRegistrar,
} from '../SharedTerminalSurface';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  SplitSquareVertical,
  SplitSquareHorizontal,
  Maximize2,
  Minimize2,
  X,
  Plus,
  Terminal,
  Globe,
  FileCode2,
  Pencil,
} from 'lucide-react';
import { normalizePanelKind } from '../models/workspaceStateModel';
import { derivePanelCommandMetadata } from '../utils/semanticMetadata';
import { buildPanelHeaderDisplay } from '../utils/panelHeaderDisplay';
import { SHOW_RENDERER_SWITCH } from '../terminalRendererPreferences';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import {
  isTerminalKeepaliveEnabled,
  shouldMountWorkspaceTerminal,
} from '@/lib/terminal/terminalKeepalivePolicy';
import { shouldShowSwarmStandbyOverlay } from '@/lib/operations/swarmDelegatedRoles';
import {
  getTerminalFloatingControlStyle,
  getTerminalPanelBodyStyle,
  getTerminalPanelHeaderStyle,
} from '../terminalChromeStyles';

// ponytail: lazy keeps Monaco off TWM cold graph in production; tests use sync mock.
const FileExplorerEditorPaneLazy = lazy(
  () => import('@/components/workspace/FileExplorerEditorPane')
);

function FilesSpacePane(props) {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    /* eslint-disable no-undef -- sync mock path for Jest only */
    const FileExplorerEditorPane = require('@/components/workspace/FileExplorerEditorPane').default;
    /* eslint-enable no-undef */
    return <FileExplorerEditorPane {...props} />;
  }
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full min-h-0 items-center justify-center"
          data-testid="files-space-loading"
        >
          Loading files…
        </div>
      }
    >
      {/* props includes chromeTrailing for embedded panel actions */}
      <FileExplorerEditorPaneLazy {...props} />
    </Suspense>
  );
}

const SPACE_KIND_OPTIONS = [
  { kind: 'terminal', label: 'Terminal', Icon: Terminal },
  { kind: 'browser', label: 'Browser', Icon: Globe },
  { kind: 'files', label: 'Files', Icon: FileCode2 },
];

function PanelAddSpaceMenu({ panelId, panelKind, onAddSpaceKind, onSetPanelKind }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        data-testid={`panel-add-space-${panelId}`}
        data-size="comfortable"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
        title="Añadir espacio"
        aria-label="Añadir espacio"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          data-devhub-modal="soft"
          data-devhub-soft-overlay="true"
          data-testid={`panel-add-space-menu-${panelId}`}
          className="absolute right-0 top-full z-[9999] mt-1 min-w-[9.5rem] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card,#0f1724)] p-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Añadir
          </div>
          {SPACE_KIND_OPTIONS.map(({ kind, label, Icon: _Icon }) => (
            <button
              key={`add-${kind}`}
              type="button"
              role="menuitem"
              data-testid={`panel-add-space-${kind}-${panelId}`}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onAddSpaceKind?.(kind);
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
          {typeof onSetPanelKind === 'function' ? (
            <>
              <div
                className="my-1 border-t border-white/10"
                role="separator"
                data-testid={`panel-convert-space-sep-${panelId}`}
              />
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Convertir
              </div>
              {SPACE_KIND_OPTIONS.map(({ kind, label, Icon: _Icon }) => (
                <button
                  key={`convert-${kind}`}
                  type="button"
                  role="menuitem"
                  data-testid={`panel-convert-space-${kind}-${panelId}`}
                  disabled={kind === panelKind}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (kind === panelKind) return;
                    setOpen(false);
                    onSetPanelKind(kind);
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function renderSpaceComponentBody(panel, kind, options = {}) {
  if (kind === 'browser') {
    // Single owner for the Electron webview pool key: when Pizarra owns live
    // surfaces, the canvas card mounts WorkspaceBrowserPane. A second instance
    // in the hidden workspace grid parks/reparents the same guest and kills it.
    if (options.pizarraOwnsLiveSurfaces) {
      return (
        <div
          className="flex h-full w-full min-h-0 flex-col items-center justify-center gap-2 bg-[var(--surface-app)] px-4 text-center"
          data-testid={`panel-browser-deferred-pizarra-${panel.id}`}
          aria-hidden="true"
        >
          <Globe className="h-5 w-5 text-[var(--text-muted)] opacity-50" />
          <p className="text-xs text-[var(--text-muted)]">Browser en Pizarra</p>
        </div>
      );
    }
    return (
      <WorkspaceBrowserPane
        projectId={options.projectId}
        workspaceId={options.wsId}
        dockState={options.dockState}
        onDockStateChange={options.onDockStateChange}
        browserWindowState={options.browserWindowState}
        onBrowserWindowStateChange={options.onBrowserWindowStateChange}
        workspaceWindows={options.workspaceWindows}
        activeWorkspaceWindowId={options.activeWorkspaceWindowId}
        layoutSyncKey={options.layoutSyncKey}
        suspendNativeSurface={Boolean(options.suspendNativeSurface)}
        // inactive tabs stay warm off-screen — park webview when shell not shown.
        surfaceActive={Boolean(options.surfaceActive)}
        // Clearance for floating panel chrome (~5×20px actions + gaps + border).
        toolbarEndPadClassName="pr-36"
      />
    );
  }
  if (kind === 'files') {
    return <FilesSpacePane project={options.project} workspaceId={options.wsId} embedded={true} />;
  }
  return null;
}

/**
 * Shared panel chrome actions (add space / split / focus / close).
 * Always rendered as floating top-right chrome (same position for terminal/browser/files).
 */
function PanelChromeActions({
  panel,
  panelKind,
  isSpaceComponent,
  isFocusedPanel,
  isActive,
  requestedRendererMode,
  onSetPanelRenderer,
  onAddSpaceKind,
  onSetPanelKind,
  onSplitRight,
  onSplitDown,
  onToggleFocus,
  onClosePanel,
}) {
  return (
    <div
      className="pointer-events-auto flex items-center gap-0.5 rounded-md border px-0.5 py-0 backdrop-blur-md transition-colors"
      data-testid={`panel-header-actions-${panel.id}`}
      title={`Panel ${panel.id} actions`}
      style={getTerminalFloatingControlStyle({ active: isActive })}
    >
      {SHOW_RENDERER_SWITCH && !isSpaceComponent ? (
        <PanelRendererSelect
          panelId={panel.id}
          currentMode={requestedRendererMode}
          availableModes={['xterm-webgl', 'xterm']}
          onChange={(mode) => onSetPanelRenderer?.(mode)}
        />
      ) : null}
      {onAddSpaceKind ? (
        <PanelAddSpaceMenu
          panelId={panel.id}
          panelKind={panelKind}
          onAddSpaceKind={(kind) => onAddSpaceKind(kind)}
          onSetPanelKind={onSetPanelKind}
        />
      ) : null}
      <button
        type="button"
        data-testid={`panel-split-right-${panel.id}`}
        data-size="comfortable"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
        title="Dividir a la derecha"
        aria-label="Dividir a la derecha"
        onClick={(e) => {
          e.stopPropagation();
          onSplitRight?.();
        }}
      >
        <SplitSquareVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid={`panel-split-down-${panel.id}`}
        data-size="comfortable"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
        title="Dividir hacia abajo"
        aria-label="Dividir hacia abajo"
        onClick={(e) => {
          e.stopPropagation();
          onSplitDown?.();
        }}
      >
        <SplitSquareHorizontal className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid={`panel-focus-${panel.id}`}
        data-size="comfortable"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-secondary)]"
        title={isFocusedPanel ? 'Salir de focus' : 'Focus panel'}
        aria-label={isFocusedPanel ? 'Salir de focus' : 'Focus panel'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFocus?.();
        }}
      >
        {isFocusedPanel ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        data-testid={`panel-close-${panel.id}`}
        data-size="comfortable"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white/10 hover:text-[#ff7b72]"
        title={isSpaceComponent ? 'Cerrar espacio' : 'Cerrar terminal'}
        aria-label={isSpaceComponent ? 'Cerrar espacio' : 'Cerrar terminal'}
        onClick={(e) => {
          e.stopPropagation();
          onClosePanel?.();
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function renderWorkspacePanel(
  panel,
  {
    activePanelId,
    activeWsId,
    isActivePanel,
    isVisibleInLayout,
    isWorkspaceShellVisible = true,
    cwd,
    wsId,
    setActivePanelIds,
    onClosePanel,
    onSplitRight,
    onSplitDown,
    onAddSpaceKind = null,
    onSetPanelKind = null,
    onToggleFocus,
    isFocusedPanel,
    requestedRendererMode,
    onResetRendererToXterm,
    onSetPanelRenderer,
    onActivatePanel,
    panelLabel,
    panelSemanticMetadata,
    suspendNativeSurface,
    nativeSurfacePolicy,
    connectionState,
    visibleTerminalPanelCount = 1,
    coldMountOrdinal = 0,
    deferLiveSurfaceToPizarra = false,
    pizarraOwnsLiveSurfaces = false,
    swarmDelegatedRoleKeys = null,
    inboxPendingCount = 0,
    renameEditing = false,
    renameValue = '',
    renameError = null,
    onStartRename = null,
    onRenameValueChange = null,
    onCommitRename = null,
    onCancelRename = null,
    agentRun = null,
    onConnectionStateChange = null,
    projectId = null,
    project = null,
    dockState = null,
    onDockStateChange = null,
    browserWindowState = null,
    onBrowserWindowStateChange = null,
    workspaceWindows = null,
    activeWorkspaceWindowId = null,
    layoutSyncKey = null,
  }
) {
  const isActive = panel.id === activePanelId && activeWsId === wsId;
  const panelKind = normalizePanelKind(panel?.kind);
  const isSpaceComponent = panelKind === 'browser' || panelKind === 'files';
  // Shared-surface singleton only when pizarra owns projection — workspace docks mount
  // TerminalTTY directly to avoid hidden→portal remount (double xterm / double echo).
  // PR5: the direct↔singleton remount on pizarra enter/exit stays (making the singleton
  // permanent was the rejected deep refactor), but it is symptom-free — the remount seeds
  // hasConnectedOnce from terminalConnectedOnceRegistry, so no "Conectando…" overlay and
  // no first-boot connect deferral; the server reattaches the live tmux session.
  const sharedViewEnabled = isPizarraSharedViewEnabled() && pizarraOwnsLiveSurfaces;
  const panelChromeSafeZoneMinTop =
    typeof document !== 'undefined' &&
    document.documentElement?.dataset?.morphology === 'brutalist-stage'
      ? 34
      : 30;
  const semanticMetadata = isSpaceComponent
    ? {
        // ponytail: kind is visible in the body; keep the agent/panel name alone in chrome.
        source: 'panel-kind',
        primary: panelLabel || (panelKind === 'browser' ? 'Browser' : 'Files'),
        secondary: null,
        fullText: panelLabel || (panelKind === 'browser' ? 'Browser' : 'Files'),
        swarmRole: null,
      }
    : buildPanelHeaderDisplay(
        panelLabel,
        panelSemanticMetadata || derivePanelCommandMetadata(panel?.initialCommand)
      );
  const swarmRole = isSpaceComponent
    ? null
    : semanticMetadata?.swarmRole || panel?.swarmRole || null;
  const sharedTerminalProps = {
    id: panel.id,
    cwd: panel.cwd || cwd,
    swarmContext: panel.swarmContext || null,
    hideTitleBar: true,
    showQuickCopyButton: false,
    autoFocus: isActive,
    isActivePanel: Boolean(isActivePanel ?? isActive),
    isVisibleInLayout: Boolean(isVisibleInLayout),
    isWorkspaceShellVisible: Boolean(isWorkspaceShellVisible),
    visibleTerminalPanelCount,
    coldMountOrdinal,
    initialCommand: panel.initialCommand,
    connectionState,
    requestedRendererMode,
    onResetRendererToXterm,
    onActivatePanel,
    suspendNativeSurface: Boolean(suspendNativeSurface),
    nativeSurfacePolicy: nativeSurfacePolicy || 'live',
    surfaceHost: pizarraOwnsLiveSurfaces ? 'pizarra' : 'workspace',
    pizarraOwnsLiveSurfaces: Boolean(pizarraOwnsLiveSurfaces),
    onConnectionStateChange,
    isEngineV2: Boolean(panel?.terminalEngineV2),
  };

  const panelIsEngineV2 = Boolean(panel?.terminalEngineV2);
  // Window/workspace parity: keep TTY mounted whenever the workspace shell is
  // visible (parked V1/V2/V3 use isVisibleInLayout=false only). With keep-alive
  // ON (default) v2 panels also stay mounted when the workspace tab is hidden —
  // v1 parity, no graveyard stash / WS reconnect on tab switch. With the
  // kill-switch OFF, v2 unmounts on workspace switch away (graveyard path).
  const shouldMountTerminal = shouldMountWorkspaceTerminal({
    isEngineV2: panelIsEngineV2,
    isWorkspaceShellVisible,
    isVisibleInLayout,
    keepaliveEnabled: panelIsEngineV2 && isTerminalKeepaliveEnabled(),
  });

  const chromeActions = (
    <PanelChromeActions
      panel={panel}
      panelKind={panelKind}
      isSpaceComponent={isSpaceComponent}
      isFocusedPanel={isFocusedPanel}
      isActive={isActive}
      requestedRendererMode={requestedRendererMode}
      onSetPanelRenderer={onSetPanelRenderer}
      onAddSpaceKind={onAddSpaceKind}
      onSetPanelKind={onSetPanelKind}
      onSplitRight={onSplitRight}
      onSplitDown={onSplitDown}
      onToggleFocus={onToggleFocus}
      onClosePanel={onClosePanel}
    />
  );

  return (
    <div
      key={panel.id}
      data-testid={
        isFocusedPanel ? `workspace-focused-panel-${panel.id}` : `panel-slot-${panel.id}`
      }
      className={`group relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-visible rounded-md border ${
        isActive
          ? 'border-[rgba(var(--accent-rgb,88,166,255),0.45)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb,88,166,255),0.18)]'
          : 'border-transparent'
      }`}
      style={swarmRole ? { '--swarm-role-rgb': swarmRole.rgb } : undefined}
      onMouseDown={() => {
        if (onActivatePanel) {
          onActivatePanel(panel.id);
          return;
        }
        setActivePanelIds((prev) => ({ ...prev, [wsId]: panel.id }));
      }}
    >
      {swarmRole ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-r-full bg-[rgba(var(--swarm-role-rgb),0.9)] shadow-[0_0_12px_rgba(var(--swarm-role-rgb),0.32)]"
        />
      ) : null}
      {/* Floating top-right chrome for all kinds. Terminals also get agent name strip. */}
      {!isSpaceComponent ? (
        <div
          data-testid={`panel-safe-zone-${panel.id}`}
          data-native-safe-zone="floating-chrome"
          data-safe-zone-min-top={String(panelChromeSafeZoneMinTop)}
          className="pointer-events-none relative min-h-8 shrink-0 overflow-visible px-1.5 pt-0.5"
          style={{
            minHeight: `${panelChromeSafeZoneMinTop}px`,
            ...getTerminalPanelHeaderStyle(),
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center justify-start pl-2 pr-[108px] pt-1">
            <div
              data-testid={`panel-semantic-header-${panel.id}`}
              data-panel-metadata-source={semanticMetadata.source}
              className="flex min-w-0 items-center gap-2 text-[11px] leading-none"
              title={semanticMetadata.fullText}
            >
              {swarmRole ? (
                <span
                  data-testid={`panel-role-badge-${panel.id}`}
                  className="inline-flex h-[18px] shrink-0 items-center rounded border border-[rgba(var(--swarm-role-rgb),0.42)] bg-[rgba(var(--swarm-role-rgb),0.14)] px-1.5 text-[9px] font-black tracking-[0.06em] text-[rgb(var(--swarm-role-rgb))] shadow-[0_0_10px_rgba(var(--swarm-role-rgb),0.1)]"
                >
                  {swarmRole.abbrev}
                </span>
              ) : null}
              {inboxPendingCount > 0 ? (
                <span
                  data-testid={`panel-inbox-badge-${panel.id}`}
                  title={`${inboxPendingCount} directiva(s) pendiente(s)`}
                  className="inline-flex h-[18px] shrink-0 items-center rounded border border-[rgba(251,191,36,0.45)] bg-[rgba(251,191,36,0.14)] px-1.5 text-[9px] font-bold text-[rgb(251,191,36)]"
                >
                  {inboxPendingCount}
                </span>
              ) : null}
              <PanelStatusBadge
                panelId={panel.id}
                terminalId={panel.id}
                agentRun={agentRun}
                initialCommand={panel.initialCommand}
                connectionState={connectionState}
              />
              {!isSpaceComponent && renameEditing ? (
                <span className="pointer-events-auto relative inline-flex min-w-0 items-center">
                  <input
                    autoFocus
                    type="text"
                    data-testid={`panel-rename-input-${panel.id}`}
                    value={renameValue}
                    onChange={(e) => onRenameValueChange?.(e.target.value || '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onRenameValueChange?.(e.currentTarget.value || '');
                        onCommitRename?.(panel);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onCancelRename?.();
                      }
                    }}
                    onBlur={(e) => {
                      onRenameValueChange?.(e.currentTarget.value || '');
                      onCommitRename?.(panel);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="w-[120px] rounded border border-[rgba(var(--accent-rgb,88,166,255),0.45)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--text-primary)] outline-none"
                    aria-label={`Rename panel ${panel.id}`}
                  />
                  {renameError ? (
                    <span
                      data-testid={`panel-rename-error-${panel.id}`}
                      className="absolute left-0 top-full mt-1 whitespace-nowrap rounded-md border border-[rgba(251,113,133,0.45)] bg-[rgba(251,113,133,0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(251,113,133)]"
                    >
                      {renameError === 'name-in-use'
                        ? 'Name already in use in this workspace'
                        : renameError === 'invalid-name' || renameError === 'empty-name'
                          ? 'Invalid name'
                          : renameError === 'collision'
                            ? 'Name already in use in this workspace'
                            : renameError}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span
                  data-testid={`panel-semantic-primary-${panel.id}`}
                  className="truncate align-middle font-bold text-[rgba(241,245,249,0.95)]"
                >
                  {semanticMetadata.primary}
                </span>
              )}
              {!isSpaceComponent && !renameEditing && onStartRename ? (
                <button
                  type="button"
                  data-testid={`panel-rename-trigger-${panel.id}`}
                  className="pointer-events-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[rgba(148,163,184,0.6)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-80"
                  title="Renombrar terminal"
                  aria-label={`Renombrar ${panelLabel || panel.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRename(panel, panelLabel);
                  }}
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              ) : null}
              {semanticMetadata.secondary ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mx-0.5 shrink-0 text-[rgba(148,163,184,0.55)]"
                  >
                    {' · '}
                  </span>
                  <span
                    data-testid={`panel-semantic-secondary-${panel.id}`}
                    className="max-w-[200px] truncate align-middle text-[rgba(148,163,184,0.85)]"
                  >
                    {semanticMetadata.secondary}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 h-[calc(100%-0.0625rem)] rounded-t-[8px] bg-[linear-gradient(180deg,rgba(15,23,36,0.18),rgba(15,23,36,0.01))] transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-70'
            }`}
          />
        </div>
      ) : null}

      {/* Same overlay position for terminal / browser / files */}
      <div
        className="pointer-events-none absolute right-1 top-0.5 z-30"
        data-testid={`panel-chrome-overlay-${panel.id}`}
        data-floating-placement="inside-top-right"
        data-space-kind={isSpaceComponent ? panelKind : 'terminal'}
        aria-label={
          renameEditing
            ? `Rename panel ${panelLabel || panel.id}`
            : `Panel ${panelLabel || panel.id} controls`
        }
        title={
          renameEditing
            ? `Rename panel ${panelLabel || panel.id}`
            : `Panel ${panelLabel || panel.id} actions`
        }
        onDoubleClick={(e) => {
          if (isSpaceComponent || renameEditing) return;
          e.stopPropagation();
          onStartRename?.(panel, panelLabel);
        }}
      >
        {chromeActions}
      </div>

      <div
        className="relative min-h-0 min-w-0 flex-1 bg-[var(--surface-app)] p-0"
        data-testid={`panel-body-${panel.id}`}
        data-panel-kind={panelKind}
        style={getTerminalPanelBodyStyle({ withBackground: false })}
      >
        {isSpaceComponent ? (
          <div
            className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-[var(--surface-app)]"
            data-testid={`panel-space-${panelKind}-${panel.id}`}
          >
            {renderSpaceComponentBody(panel, panelKind, {
              projectId,
              project: project || { id: projectId, local_path: cwd },
              wsId,
              dockState,
              onDockStateChange,
              browserWindowState,
              onBrowserWindowStateChange,
              workspaceWindows,
              activeWorkspaceWindowId,
              layoutSyncKey,
              suspendNativeSurface,
              surfaceActive: Boolean(isVisibleInLayout && isWorkspaceShellVisible),
              pizarraOwnsLiveSurfaces: Boolean(pizarraOwnsLiveSurfaces),
            })}
          </div>
        ) : (
          <>
            {sharedViewEnabled ? (
              <SharedTerminalSurfaceRegistrar
                surfaceId={panel.id}
                terminalProps={sharedTerminalProps}
              />
            ) : null}
            <div className="h-full w-full overflow-hidden bg-[var(--surface-app)]">
              {sharedViewEnabled ? (
                pizarraOwnsLiveSurfaces ? null : (
                  <SharedTerminalSurfacePortal
                    surfaceId={panel.id}
                    hostId="workspace-dock"
                    isActiveHost={true}
                    className="h-full w-full"
                  />
                )
              ) : deferLiveSurfaceToPizarra && sharedViewEnabled ? (
                <div
                  data-testid={`panel-body-deferred-pizarra-${panel.id}`}
                  className="h-full w-full"
                  aria-hidden="true"
                  style={{ background: 'var(--surface-app, #050814)' }}
                />
              ) : shouldMountTerminal ? (
                <TerminalTTY
                  id={panel.id}
                  isEngineV2={panelIsEngineV2}
                  cwd={panel.cwd || cwd}
                  swarmContext={panel.swarmContext || null}
                  hideTitleBar={true}
                  showQuickCopyButton={false}
                  autoFocus={isActive}
                  isActivePanel={Boolean(isActivePanel ?? isActive)}
                  isVisibleInLayout={Boolean(isVisibleInLayout)}
                  isWorkspaceShellVisible={Boolean(isWorkspaceShellVisible)}
                  visibleTerminalPanelCount={visibleTerminalPanelCount}
                  coldMountOrdinal={coldMountOrdinal}
                  initialCommand={panel.initialCommand}
                  connectionState={connectionState}
                  requestedRendererMode={requestedRendererMode}
                  onResetRendererToXterm={onResetRendererToXterm}
                  onActivatePanel={onActivatePanel}
                  suspendNativeSurface={Boolean(suspendNativeSurface)}
                  nativeSurfacePolicy={nativeSurfacePolicy || 'live'}
                />
              ) : (
                <div
                  data-testid={`panel-body-v2-stash-${panel.id}`}
                  className="h-full w-full"
                  aria-hidden="true"
                />
              )}
            </div>
            {shouldShowSwarmStandbyOverlay(panel, swarmDelegatedRoleKeys) ? (
              <div
                data-testid={`panel-standby-hint-${panel.id}`}
                className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-[rgba(5,8,20,0.42)]"
                aria-hidden="true"
              >
                <div className="rounded-md border border-white/10 bg-[rgba(8,12,24,0.88)] px-3 py-2 text-center text-[11px] text-[var(--text-muted)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  <span className="block font-medium text-[var(--text-secondary)]">Standby</span>
                  <span className="mt-0.5 block">Esperando delegación desde ZED</span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

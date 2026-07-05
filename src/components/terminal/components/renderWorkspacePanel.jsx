// renderWorkspacePanel — standalone JSX function for rendering a single terminal panel.
// Extracted from TerminalWorkspacesManager.jsx.

import React from 'react';
import { SplitSquareVertical, SplitSquareHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import TerminalTTY from '../../TerminalTTY';
import { derivePanelCommandMetadata } from '../utils/semanticMetadata';
import { buildPanelHeaderDisplay } from '../utils/panelHeaderDisplay';
import PanelRendererSelect from './PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from '../terminalRendererPreferences';
import PanelStatusBadge from './PanelStatusBadge';
import {
  SharedTerminalSurfacePortal,
  SharedTerminalSurfaceRegistrar,
} from '../SharedTerminalSurface';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { shouldShowSwarmStandbyOverlay } from '@/lib/operations/swarmDelegatedRoles';
import {
  getTerminalFloatingControlStyle,
  getTerminalPanelBodyStyle,
  getTerminalPanelHeaderStyle,
} from '../terminalChromeStyles';

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
  }
) {
  const isActive = panel.id === activePanelId && activeWsId === wsId;
  // Shared-surface singleton only when pizarra owns projection — workspace docks mount
  // TerminalTTY directly to avoid hidden→portal remount (double xterm / double echo).
  const sharedViewEnabled = isPizarraSharedViewEnabled() && pizarraOwnsLiveSurfaces;
  const panelChromeSafeZoneMinTop =
    typeof document !== 'undefined' &&
    document.documentElement?.dataset?.morphology === 'brutalist-stage'
      ? 34
      : 30;
  const semanticMetadata = buildPanelHeaderDisplay(
    panelLabel,
    panelSemanticMetadata || derivePanelCommandMetadata(panel?.initialCommand)
  );
  const swarmRole = semanticMetadata?.swarmRole || panel?.swarmRole || null;
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
  // visible (parked V1/V2/V3 use isVisibleInLayout=false only). Unmount v2 only
  // when the whole workspace tab is hidden (graveyard on workspace switch away).
  const shouldMountTerminal =
    !panelIsEngineV2 || Boolean(isWorkspaceShellVisible) || Boolean(isVisibleInLayout);

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
        {/* Agent info bar — kept above the native terminal surface so VTE cannot cover it. */}
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
            <span
              data-testid={`panel-semantic-primary-${panel.id}`}
              className="truncate align-middle font-bold text-[rgba(241,245,249,0.95)]"
            >
              {semanticMetadata.primary}
            </span>
            {semanticMetadata.secondary ? (
              <>
                <span aria-hidden="true" className="mx-0.5 shrink-0 text-[rgba(148,163,184,0.55)]">
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
        {/* Panel controls — top-right, outside the native terminal body. */}
        <div
          className="pointer-events-none absolute right-1 top-0.5 z-10"
          data-testid={`panel-chrome-overlay-${panel.id}`}
          data-floating-placement="inside-top-right"
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
            if (renameEditing) return;
            e.stopPropagation();
            onStartRename?.(panel, panelLabel);
          }}
        >
          {renameEditing ? (
            <span className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.45)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-primary)]">
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
                className="w-[120px] bg-transparent outline-none"
                aria-label={`Rename panel ${panel.id}`}
              />
            </span>
          ) : null}
          {renameError && renameEditing ? (
            <span
              data-testid={`panel-rename-error-${panel.id}`}
              className="pointer-events-auto absolute right-0 top-full mt-1 inline-flex items-center rounded-md border border-[rgba(251,113,133,0.45)] bg-[rgba(251,113,133,0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(251,113,133)]"
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
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-md border px-0.5 py-0 backdrop-blur-md transition-colors"
            data-testid={`panel-header-actions-${panel.id}`}
            title={`Panel ${panelLabel || panel.id} actions`}
            style={getTerminalFloatingControlStyle({ active: isActive })}
          >
            {SHOW_RENDERER_SWITCH ? (
              <PanelRendererSelect
                panelId={panel.id}
                currentMode={requestedRendererMode}
                availableModes={['xterm-webgl', 'xterm']}
                onChange={(mode) => onSetPanelRenderer?.(mode)}
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
              title={isFocusedPanel ? 'Salir de focus' : 'Focus terminal'}
              aria-label={isFocusedPanel ? 'Salir de focus' : 'Focus terminal'}
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
              title="Cerrar terminal"
              aria-label="Cerrar terminal"
              onClick={(e) => {
                e.stopPropagation();
                onClosePanel?.();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div
        className="relative min-h-0 min-w-0 flex-1 bg-[var(--surface-app)] p-0"
        data-testid={`panel-body-${panel.id}`}
        style={getTerminalPanelBodyStyle({ withBackground: false })}
      >
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
      </div>
    </div>
  );
}

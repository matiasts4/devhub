'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  MonitorUp,
  MousePointer2,
  Pencil,
  Plus,
  GripVertical,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
} from 'lucide-react';
import { moveBrowserHistory } from './browserHistory';
import { buildBrowserWindowLabel } from './browserWindowState';
import { BRIDGE_AGENT_OPTIONS } from './bridgeAgentRequest';
import useBrowserPreviewController, { SELECTOR_STATE } from './useBrowserPreviewController';
import {
  BROWSER_RUNTIME,
  PREVIEW_SUPPORT_MODE,
  SUPPORT_REASON,
  getBrowserRuntimeFallbackCopy,
  getBrowserRuntimeLabel,
  getHostnameLabel,
  hasNativeSelectorInspectCapability,
  parseUrlMeta,
  resolveBrowserRuntimeSelection,
  shouldWarnAboutFraming,
} from './browserPreviewSupport';
import { closeNativeBrowser, focusNativeBrowser } from '@/lib/browser/nativeBrowserBridge';
import { useNativeBrowserCapability, useNativeBrowserSurface } from './useNativeBrowserSurface';
import { reloadBrowserRuntime } from './browserRuntimeReload';
// pizarra-shared-view-state Phase 3: opt-in tab strip shared with
// the pizarra browser surface. When `tabsMode === 'multi'` we read
// from useBrowserTabs (which delegates to the TWM-owned
// useSharedDockState) and render the BrowserTabStrip above the
// existing toolbar chrome. Default 'single' preserves the
// pre-Phase-3 UX exactly.
import { useBrowserTabs } from './hooks/useBrowserTabs';
import BrowserTabStrip from './BrowserTabStrip';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';

export { PREVIEW_SUPPORT_MODE, SUPPORT_REASON, SELECTOR_STATE };

const VIEWPORT_SHELL_STYLE = {
  contain: 'layout paint size',
  isolation: 'isolate',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

const IFRAME_GPU_STYLE = {
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

function WorkspaceBrowserPane({
  dockState,
  onDockStateChange,
  forceEditMode = false,
  projectId = 'global',
  workspaceId = 'workspace',
  browserWindowState = null,
  onBrowserWindowStateChange = null,
  workspaceWindows = [],
  activeWorkspaceWindowId = null,
  onWorkspaceWindowSelect = null,
  onWorkspaceWindowAdd = null,
  onWorkspaceWindowRemove = null,
  layoutSyncKey = null,
  suspendNativeSurface = false,
  tabsMode = 'single',
  isPizarraContext = false,
  nativePanelId: nativePanelIdProp = null,
  pizarraDragHandleMouseDown = null,
  onPizarraCloseCard = null,
}) {
  const viewportShellRef = useRef(null);
  const measureNativeBounds = useCallback(() => {
    const rect = viewportShellRef.current?.getBoundingClientRect?.();
    return {
      x: Number(rect?.x) || 0,
      y: Number(rect?.y) || 0,
      width: Math.max(Number(rect?.width) || 0, 1),
      height: Math.max(Number(rect?.height) || 0, 1),
    };
  }, []);
  const previewEditMode = Boolean(dockState.editMode || forceEditMode);
  const requestedBrowserRuntime = dockState.browserRuntime || BROWSER_RUNTIME.NATIVE_GTK;

  const nativePanelId = useMemo(
    () => nativePanelIdProp || `browser-${projectId}-${workspaceId}`,
    [nativePanelIdProp, projectId, workspaceId]
  );
  const nativeCapability = useNativeBrowserCapability({
    panelId: nativePanelId,
    requested: requestedBrowserRuntime === BROWSER_RUNTIME.NATIVE_GTK,
  });
  const nativeSelectorReady = hasNativeSelectorInspectCapability(nativeCapability);
  const browserRuntimeSelection = useMemo(
    () =>
      resolveBrowserRuntimeSelection({
        requestedRuntime: requestedBrowserRuntime,
        editMode: previewEditMode,
        nativeCapability,
      }),
    [nativeCapability, previewEditMode, requestedBrowserRuntime]
  );
  const nativeRuntimeActive =
    browserRuntimeSelection.effectiveRuntime === BROWSER_RUNTIME.NATIVE_GTK;
  const nativeRuntimeVisibleInLayout = useMemo(() => {
    if (isPizarraContext) {
      return nativeRuntimeActive && !suspendNativeSurface;
    }

    const activeTab = dockState.activeTab || 'browser';
    const dockVisible = dockState.visible !== false;
    const maximizedView = dockState.maximizedView || 'browser';
    const takeoverBlocksWorkspaceBrowser =
      dockState.maximized === true && maximizedView !== 'browser' && maximizedView !== 'window';
    const browserOwnsLayout = !dockState.maximized || maximizedView === 'browser';

    return (
      nativeRuntimeActive &&
      dockVisible &&
      activeTab === 'browser' &&
      browserOwnsLayout &&
      !takeoverBlocksWorkspaceBrowser &&
      !suspendNativeSurface
    );
  }, [
    dockState.activeTab,
    dockState.maximized,
    dockState.maximizedView,
    dockState.visible,
    isPizarraContext,
    nativeRuntimeActive,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (!isPizarraContext) return;
    logPizarraBrowser('pane-native-visibility', {
      nativePanelId,
      nativeRuntimeActive,
      nativeRuntimeVisibleInLayout,
      suspendNativeSurface,
      browserUrl: dockState.browserUrl,
      activeTab: dockState.activeTab,
    });
  }, [
    isPizarraContext,
    nativePanelId,
    nativeRuntimeActive,
    nativeRuntimeVisibleInLayout,
    suspendNativeSurface,
    dockState.browserUrl,
    dockState.activeTab,
  ]);

  const canUseNativeEditMode = nativeRuntimeActive && nativeSelectorReady;
  const {
    browserError,
    canSubmit,
    changeRequest,
    dimensions,
    effectiveEditMode,
    handleEditModeToggle,
    handleIframeError,
    handleIframeLoad,
    handleInspectToggle,
    handleLaunch,
    handleReload,
    handleSubmit,
    iframeRef,
    iframeSrc,
    isInspecting,
    isLoading,
    lastLaunchMeta,
    reloadKey,
    selectedAgent,
    selectedElement,
    selectedSummary,
    selectorState,
    setChangeRequest,
    setSelectedAgent,
    sourceHint,
    statusLabel,
    supportState,
    unsupportedCopy,
    urlInputRef,
  } = useBrowserPreviewController({
    dockState,
    onDockStateChange,
    forceEditMode,
    nativeRuntimeActive,
    nativePanelId,
    nativeSelectorReady,
  });

  const canGoBack = dockState.browserHistoryIndex > 0;
  const canGoForward = dockState.browserHistoryIndex < (dockState.browserHistory?.length || 0) - 1;
  const iframeTitle = useMemo(
    () => `Workspace preview ${dockState.browserUrl || ''}`.trim(),
    [dockState.browserUrl]
  );
  const hostLabel = useMemo(() => getHostnameLabel(dockState.browserUrl), [dockState.browserUrl]);
  const nativeInspectStatusCopy = useMemo(() => {
    if (!nativeRuntimeActive) return null;
    if (!nativeSelectorReady) return 'Native inspect unavailable · fallback required';
    if (selectorState === SELECTOR_STATE.SELECTED)
      return 'Native inspect active · element selected';
    if (isInspecting) return 'Native inspect active · selecting';
    return 'Native inspect ready';
  }, [isInspecting, nativeRuntimeActive, nativeSelectorReady, selectorState]);
  const nativeInspectOnlyMode = nativeRuntimeActive && effectiveEditMode;
  const embeddedEngineLabel = useMemo(() => getBrowserRuntimeLabel(BROWSER_RUNTIME.NATIVE_GTK), []);

  const runtimeStatusCopy = useMemo(() => {
    if (nativeRuntimeActive) {
      return `Activo: ${embeddedEngineLabel}`;
    }
    if (browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK) {
      const fallbackCopy = getBrowserRuntimeFallbackCopy(browserRuntimeSelection.fallbackReason);
      const fallbackReason = fallbackCopy.startsWith('iframe fallback · ')
        ? fallbackCopy.slice('iframe fallback · '.length)
        : fallbackCopy === 'iframe fallback'
          ? ''
          : fallbackCopy;

      return fallbackReason
        ? `Fallback activo: iframe · ${fallbackReason}`
        : 'Fallback activo: iframe';
    }

    return `Activo: ${getBrowserRuntimeLabel(BROWSER_RUNTIME.IFRAME)}`;
  }, [
    browserRuntimeSelection.fallbackReason,
    browserRuntimeSelection.requestedRuntime,
    embeddedEngineLabel,
    nativeRuntimeActive,
  ]);
  const handleBrowserRuntimeChange = (nextRuntime) => {
    const normalizedRuntime =
      nextRuntime === BROWSER_RUNTIME.NATIVE_GTK
        ? BROWSER_RUNTIME.NATIVE_GTK
        : BROWSER_RUNTIME.IFRAME;

    onDockStateChange((currentState) => {
      if ((currentState.browserRuntime || BROWSER_RUNTIME.NATIVE_GTK) === normalizedRuntime) {
        return currentState;
      }

      return {
        ...currentState,
        browserRuntime: normalizedRuntime,
      };
    });
  };
  const shouldShowFrameWarning = useMemo(
    () => !nativeRuntimeActive && shouldWarnAboutFraming(dockState.browserUrl),
    [dockState.browserUrl, nativeRuntimeActive]
  );
  const dedicatedBrowserWindowLabel = useMemo(
    () => buildBrowserWindowLabel(projectId, workspaceId),
    [projectId, workspaceId]
  );
  const dedicatedBrowserOpen = browserWindowState?.open === true;
  const visibleWorkspaceWindows = Array.isArray(workspaceWindows) ? workspaceWindows : [];
  const showFullscreenWorkspaceTabs = dockState.maximized && dockState.maximizedView === 'browser';

  // pizarra-shared-view-state Phase 3: opt-in tab strip. Reads
  // the TWM-owned store via useBrowserTabs; the strip is only
  // rendered when tabsMode === 'multi' so the existing single-tab
  // UX is preserved by default.
  const tabStripApi = useBrowserTabs({ projectId, workspaceId });
  const showTabStrip = tabsMode === 'multi';
  const { nativeRuntimeReady, nativeError, retryNative } = useNativeBrowserSurface({
    panelId: nativePanelId,
    url: dockState.browserUrl,
    active: nativeRuntimeActive && !browserError,
    visibleInLayout: nativeRuntimeVisibleInLayout,
    measureBounds: measureNativeBounds,
    observeNode: viewportShellRef,
    layoutSyncKey,
  });

  // pizarra-browser-fix: clear any persisted browserLoadFallback:true that
  // previous sessions may have written to localStorage, so native-gtk is
  // retried on every fresh mount instead of staying permanently on iframe.
  useEffect(() => {
    if (!dockState.browserLoadFallback) return;
    onDockStateChange?.((current) => {
      if (!current.browserLoadFallback) return current;
      return { ...current, browserLoadFallback: false };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  // `devhub:zed-open-url` is handled in TerminalWorkspacesManager so the dock
  // opens even when only Zed is visible (WorkspaceBrowserPane is unmounted).

  const handleRuntimeReload = () => {
    void reloadBrowserRuntime({
      nativeRuntimeActive,
      nativePanelId,
      handleReload,
    });
  };

  const handleOpenDedicatedBrowser = async () => {
    const targetUrl = String(dockState.browserUrl || '').trim();
    if (!targetUrl) return;

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existingWindow = await WebviewWindow.getByLabel(dedicatedBrowserWindowLabel);

      if (existingWindow) {
        if ((browserWindowState?.url || '') !== targetUrl) {
          await existingWindow.close().catch(() => {});
        } else {
          await existingWindow.show().catch(() => {});
          await existingWindow.unminimize?.().catch(() => {});
          await existingWindow.setFocus().catch(() => {});
          onBrowserWindowStateChange?.(workspaceId, {
            open: true,
            label: dedicatedBrowserWindowLabel,
            url: targetUrl,
            updatedAt: Date.now(),
          });
          return;
        }
      }

      const browserWindow = new WebviewWindow(dedicatedBrowserWindowLabel, {
        url: targetUrl,
        title: `DevHub Browser — ${hostLabel}`,
        center: true,
        focus: true,
        resizable: true,
        width: Math.max(window.innerWidth - 80, 1180),
        height: Math.max(window.innerHeight - 80, 760),
        minWidth: 960,
        minHeight: 640,
        maximized: true,
      });

      onBrowserWindowStateChange?.(workspaceId, {
        open: true,
        label: dedicatedBrowserWindowLabel,
        url: targetUrl,
        updatedAt: Date.now(),
      });

      browserWindow.once('tauri://destroyed', () => {
        onBrowserWindowStateChange?.(workspaceId, {
          open: false,
          label: dedicatedBrowserWindowLabel,
          url: '',
          updatedAt: Date.now(),
        });
      });
      browserWindow.once('tauri://error', () => {
        onBrowserWindowStateChange?.(workspaceId, {
          open: false,
          label: dedicatedBrowserWindowLabel,
          url: '',
          updatedAt: Date.now(),
        });
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      });
    } catch {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCloseDedicatedBrowser = async () => {
    if (!dedicatedBrowserOpen) return;

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existingWindow = await WebviewWindow.getByLabel(dedicatedBrowserWindowLabel);
      await existingWindow?.close().catch(() => {});
    } catch {
      // Ignore Tauri close failures in non-desktop contexts.
    } finally {
      onBrowserWindowStateChange?.(workspaceId, {
        open: false,
        label: dedicatedBrowserWindowLabel,
        url: '',
        updatedAt: Date.now(),
      });
    }
  };

  const handleWorkspaceMaximizeToggle = () => {
    onDockStateChange((currentState) => ({
      ...currentState,
      visible: true,
      activeTab: 'browser',
      maximized: !currentState.maximized,
      maximizedView: 'browser',
    }));
  };

  const pizarraInlineTabs = isPizarraContext && showTabStrip;

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-[linear-gradient(180deg,#09111b_0%,#060b12_100%)]"
      data-testid="workspace-browser-pane"
      data-tabs-mode={tabsMode}
    >
      {showTabStrip && !pizarraInlineTabs ? (
        <BrowserTabStrip
          tabs={tabStripApi.tabs}
          activeTabId={tabStripApi.activeTabId}
          onSelectTab={tabStripApi.selectTab}
          onCloseTab={tabStripApi.closeTab}
          onAddTab={tabStripApi.addTab}
          currentUrl={dockState.browserUrl}
        />
      ) : null}
      <form
        className={`flex ${isPizarraContext ? 'h-8 min-h-8' : 'h-11'} items-center gap-1 border-b border-[var(--border-subtle)] bg-[#07111c] ${isPizarraContext ? 'px-1.5' : 'px-3'}`}
        onSubmit={handleSubmit}
        data-testid="workspace-browser-toolbar"
        data-pizarra-browser-surface-header={isPizarraContext ? 'true' : undefined}
      >
        {isPizarraContext && typeof pizarraDragHandleMouseDown === 'function' ? (
          <button
            type="button"
            data-testid="pizarra-drag-handle"
            data-pizarra-surface-drag-handle="true"
            aria-label="Mover ventana del navegador en la pizarra"
            title="Arrastrar para mover"
            onMouseDown={pizarraDragHandleMouseDown}
            className="inline-flex h-6 w-5 shrink-0 cursor-move items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--border-subtle)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {pizarraInlineTabs ? (
          <div
            className="flex min-w-0 max-w-[min(38%,12rem)] shrink items-center overflow-x-auto border-r border-[var(--border-subtle)] pr-1.5 mr-0.5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <BrowserTabStrip
              layout="inline"
              tabs={tabStripApi.tabs}
              activeTabId={tabStripApi.activeTabId}
              onSelectTab={tabStripApi.selectTab}
              onCloseTab={tabStripApi.closeTab}
              onAddTab={tabStripApi.addTab}
              currentUrl={dockState.browserUrl}
            />
          </div>
        ) : null}
        {showFullscreenWorkspaceTabs ? (
          <div
            className="order-1 flex min-w-0 max-w-[min(40vw,34rem)] shrink items-center gap-2 overflow-x-auto pr-1"
            data-testid="browser-workspace-window-selector"
          >
            {visibleWorkspaceWindows.map((windowView, index) => {
              const tabLabel = windowView?.name || `V${index + 1}`;
              return (
                <button
                  key={windowView?.id || `browser-window-${index}`}
                  type="button"
                  data-testid={`browser-workspace-window-tab-${index + 1}`}
                  onClick={() => onWorkspaceWindowSelect?.(windowView?.id)}
                  className="group inline-flex h-7 shrink-0 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-transparent px-3.5 text-[13px] font-mono font-semibold text-[var(--text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
                  title={`Mostrar ${tabLabel} en fullscreen`}
                >
                  {tabLabel}
                  {visibleWorkspaceWindows.length > 1 ? (
                    <span
                      role="button"
                      aria-label={`Cerrar ${tabLabel}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onWorkspaceWindowRemove?.(windowView?.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-4 h-4 rounded-md hover:bg-white/15 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              data-testid="browser-workspace-window-browser"
              className="inline-flex h-7 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-mono font-semibold text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] border-[rgba(var(--accent-rgb,88,166,255),0.35)]"
              title="Browser fullscreen"
            >
              <Globe className="w-3.5 h-3.5" />
              Browser
            </button>
            <button
              type="button"
              data-testid="browser-workspace-window-add"
              onClick={() => onWorkspaceWindowAdd?.()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
              title="Agregar una nueva vista al workspace"
              aria-label="Agregar una nueva vista al workspace"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="inline-flex items-center gap-1 shrink-0 order-2">
          <button
            type="button"
            data-testid="browser-back"
            onClick={() =>
              onDockStateChange((currentState) => moveBrowserHistory(currentState, -1))
            }
            disabled={!canGoBack}
            className={`inline-flex items-center justify-center ${isPizarraContext ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent`}
            aria-label="Back"
          >
            <ArrowLeft className={isPizarraContext ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
          <button
            type="button"
            data-testid="browser-forward"
            onClick={() => onDockStateChange((currentState) => moveBrowserHistory(currentState, 1))}
            disabled={!canGoForward}
            className={`inline-flex items-center justify-center ${isPizarraContext ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent`}
            aria-label="Forward"
          >
            <ArrowRight className={isPizarraContext ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
          <button
            type="button"
            data-testid="browser-reload"
            onClick={handleRuntimeReload}
            className={`inline-flex items-center justify-center ${isPizarraContext ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.05]`}
            aria-label="Reload"
          >
            <RefreshCw className={isPizarraContext ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        </div>

        <label className="flex-1 min-w-0 relative order-3">
          <Globe
            className={`${isPizarraContext ? 'w-3 h-3 left-2' : 'w-4 h-4 left-3'} absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]`}
          />
          <input
            data-testid="browser-url-input"
            ref={urlInputRef}
            type="text"
            defaultValue={dockState.browserUrl || ''}
            placeholder={
              isPizarraContext ? 'URL' : 'Escribí una URL, localhost:3200 o una búsqueda'
            }
            className={`w-full ${isPizarraContext ? 'h-6 pl-7 pr-16 text-[10px]' : 'h-8 pl-9 pr-36 text-[13px]'} rounded-xl border border-[var(--border-subtle)] bg-[#08101d] text-[var(--text-primary)] outline-none transition-colors focus:border-[rgba(var(--accent-rgb,88,166,255),0.35)] focus:bg-[#091325]`}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-1">
            <button
              type="button"
              data-testid="browser-edit-toggle"
              onClick={handleEditModeToggle}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                effectiveEditMode
                  ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'
              }`}
              aria-label={effectiveEditMode ? 'Close edit mode' : 'Open edit mode'}
              title={effectiveEditMode ? 'Close edit mode' : 'Open edit mode'}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {dockState.browserUrl && !isPizarraContext ? (
              <button
                type="button"
                data-testid="browser-toggle-workspace-maximize"
                onClick={handleWorkspaceMaximizeToggle}
                className="inline-flex h-6 items-center justify-center gap-1 rounded-md px-2 text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                aria-label={
                  dockState.maximized
                    ? 'Restore browser with terminals'
                    : 'Expand browser in workspace'
                }
                title={
                  dockState.maximized
                    ? 'Restore browser with terminals'
                    : 'Expand browser in workspace'
                }
              >
                {dockState.maximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
                <span className="text-[10px] font-semibold">
                  {dockState.maximized ? 'Terminales' : 'Expandir'}
                </span>
              </button>
            ) : null}
            <div
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-0.5"
              style={{ display: 'none' }}
              data-testid="browser-runtime-toggle"
            >
              <button
                type="button"
                data-testid="browser-runtime-option-iframe"
                aria-pressed={browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.IFRAME}
                onClick={() => handleBrowserRuntimeChange(BROWSER_RUNTIME.IFRAME)}
                className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold transition-colors ${
                  browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.IFRAME
                    ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'
                }`}
                title="Use iframe runtime"
              >
                iframe
              </button>
              <button
                type="button"
                data-testid="browser-runtime-option-native-gtk"
                aria-pressed={
                  browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK
                }
                onClick={() => handleBrowserRuntimeChange(BROWSER_RUNTIME.NATIVE_GTK)}
                className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold transition-colors ${
                  browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK
                    ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'
                }`}
                title="Use native GTK runtime"
              >
                native gtk
              </button>
            </div>
            {!isPizarraContext ? (
              <div
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold ${
                  nativeRuntimeActive
                    ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
                    : browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK
                      ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
                      : 'border-white/10 bg-white/[0.04] text-[var(--text-muted)]'
                }`}
                data-testid="browser-native-runtime-chip"
                title={
                  nativeRuntimeActive
                    ? `${embeddedEngineLabel} embebido en el dock (estilo Wave)`
                    : browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK
                      ? 'Motor embebido pedido, pero el browser cayó a iframe'
                      : 'Iframe runtime active'
                }
              >
                <span
                  className={`inline-flex h-1.5 w-1.5 rounded-full ${
                    nativeRuntimeActive
                      ? 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.65)]'
                      : browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK
                        ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.45)]'
                        : 'bg-white/35'
                  }`}
                />
                <span data-testid="browser-runtime-status">{runtimeStatusCopy}</span>
              </div>
            ) : null}

            {dedicatedBrowserOpen ? (
              <button
                type="button"
                data-testid="browser-close-dedicated"
                onClick={handleCloseDedicatedBrowser}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
                aria-label="Close dedicated DevHub browser window"
                title="Close dedicated DevHub browser window"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {dockState.browserUrl ? (
              <a
                href={dockState.browserUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="browser-open-external"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                aria-label={`Open ${hostLabel} externally`}
                title={`Open ${hostLabel} externally`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </label>
        {typeof onPizarraCloseCard === 'function' ? (
          <button
            type="button"
            data-testid="pizarra-browser-close"
            data-pizarra-close-button="true"
            title="Cerrar ventana del navegador (en pizarra)"
            aria-label="Cerrar ventana del navegador"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPizarraCloseCard();
            }}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--border-subtle)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </form>

      <div
        className={`flex min-h-0 flex-1 flex-col ${
          nativeRuntimeActive && nativeRuntimeReady ? 'bg-transparent' : 'bg-[#050814]'
        } ${nativeRuntimeActive ? '' : 'p-3'}`}
        data-testid="browser-pane-body"
        style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          className={`relative min-h-0 flex-1 overflow-hidden border ${
            nativeRuntimeActive && nativeRuntimeReady ? 'border-0 bg-transparent' : 'bg-[#0a111d]'
          } ${
            nativeRuntimeActive
              ? 'border-0'
              : 'rounded-[16px] border border-white/10 shadow-[0_18px_48px_rgba(3,7,18,0.28)]'
          }`}
          data-testid="browser-viewport-shell"
          style={{
            ...VIEWPORT_SHELL_STYLE,
            flex: '1 1 auto',
            minHeight: 0,
          }}
          ref={viewportShellRef}
        >
          {shouldShowFrameWarning ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center bg-[radial-gradient(circle_at_top,rgba(88,166,255,0.08),transparent_45%),#0a111d]"
              data-testid="browser-frame-warning"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Esta vista no se puede embeber
                </h3>
                <p
                  className="text-sm leading-6 text-[var(--text-secondary)]"
                  data-testid="browser-frame-warning-copy"
                >
                  {hostLabel} bloquea o limita el render embebido, así que acá puede verse en
                  blanco. Abrilo en una ventana dedicada o afuera para seguir navegando.
                </p>
              </div>
              <a
                href={dockState.browserUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] px-4 py-2 text-sm font-medium text-[var(--accent-primary)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.2)]"
              >
                Abrir {hostLabel} afuera
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={handleOpenDedicatedBrowser}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.08]"
              >
                Abrir en ventana completa
                <MonitorUp className="h-4 w-4" />
              </button>
            </div>
          ) : browserError ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.08),transparent_45%),#0a111d]"
              data-testid="browser-error-state"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-200">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  data-testid="browser-error-title"
                >
                  {browserError.title}
                </h3>
                <p
                  className="text-sm leading-6 text-[var(--text-secondary)]"
                  data-testid="browser-error-copy"
                >
                  {browserError.message}
                </p>
              </div>

              {/* Common localhost URLs for quick navigation */}
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
                {[
                  'localhost:3000',
                  'localhost:5173',
                  'localhost:8080',
                  'localhost:4200',
                  'localhost:3001',
                  'localhost:8000',
                ].map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      onDockStateChange((currentState) => ({
                        ...currentState,
                        browserUrl: `http://${url}/`,
                        browserHistory: [...(currentState.browserHistory || []), `http://${url}/`],
                        browserHistoryIndex: currentState.browserHistory?.length || 0,
                      }));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-mono text-[var(--text-secondary)] transition-colors hover:border-[rgba(var(--accent-rgb,88,166,255),0.24)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.08)] hover:text-[var(--accent-primary)]"
                    title={`Navegar a ${url}`}
                  >
                    <Globe className="h-3 w-3" />
                    {url}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReload}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.08]"
                >
                  Reintentar
                  <RefreshCw className="h-4 w-4" />
                </button>
                {dockState.browserUrl ? (
                  <a
                    href={dockState.browserUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] px-4 py-2 text-sm font-medium text-[var(--accent-primary)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.2)]"
                  >
                    Abrir {hostLabel} afuera
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : nativeRuntimeActive ? (
            <>
              {/*
                El motor embebido (WebView2/WKWebView/WebKit) se pinta como webview
                hijo de Tauri en los bounds del dock (`embedded_browser.rs`). No
                NOT paint any opaque React layer on top of it or the user only
                sees this shell. The wrapper below stays in the DOM so the
                `browser-native-runtime-shell` testid remains queryable, but
                it is transparent and click-through so the WebView is visible
                and receives input.
              */}
              <div
                data-testid="browser-native-runtime-shell"
                className="absolute inset-0 pointer-events-none"
                aria-hidden="true"
              />

              {(!nativeRuntimeReady || nativeError) && !isPizarraContext ? (
                nativeError ? (
                  <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#050814]/90 px-6 text-center"
                    data-testid="browser-native-error"
                  >
                    <TriangleAlert className="h-6 w-6 text-rose-400" />
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      No se pudo inicializar el navegador nativo
                    </div>
                    <div className="max-w-xs text-xs text-[var(--text-secondary)]">
                      Razón: {nativeError}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          retryNative?.();
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                      >
                        Reintentar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Force iframe fallback for this pane
                          onDockStateChange?.((s) => ({ ...s, browserRuntime: 'iframe' }));
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                      >
                        Usar iframe (fallback)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#050814]/80"
                    data-testid="browser-loading-overlay"
                  >
                    <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                  </div>
                )
              ) : null}
            </>
          ) : (
            <>
              <iframe
                key={reloadKey}
                data-testid="browser-iframe"
                title={iframeTitle}
                src={iframeSrc}
                ref={iframeRef}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                loading="eager"
                referrerPolicy="no-referrer"
                className={`block w-full h-full border-0 ${
                  isPizarraContext ? 'bg-[#050814]' : 'bg-white'
                }`}
                style={{
                  ...IFRAME_GPU_STYLE,
                  backgroundColor: isPizarraContext ? '#050814' : '#ffffff',
                  pointerEvents: suspendNativeSurface ? 'none' : 'auto',
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />

              {isLoading && !isPizarraContext ? (
                <div
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#050814]/80"
                  data-testid="browser-loading-overlay"
                >
                  <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : null}
            </>
          )}

          {!nativeInspectOnlyMode && effectiveEditMode ? (
            <>
              <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between">
                <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-secondary)] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                  <span data-testid="bridge-status-badge">{statusLabel}</span>
                </div>
                <div className="pointer-events-auto rounded-full border border-white/10 bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-muted)] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                  {nativeInspectOnlyMode ? 'native inspect mode' : 'visual edit mode'}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-y-3 right-3 flex items-start">
                <div className="pointer-events-auto mt-12 w-[320px] rounded-[20px] border border-white/10 bg-[#07111d]/96 p-4 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Edit
                      </div>
                      <div
                        className="text-sm font-semibold leading-5"
                        data-testid="bridge-selection-summary"
                      >
                        {selectedSummary || 'Seleccioná un nodo en la preview'}
                      </div>
                      <div
                        className="text-[11px] leading-5 text-[var(--text-secondary)]"
                        data-testid="bridge-source-hint"
                      >
                        {sourceHint || 'Esperando metadata del overlay o del DOM'}
                      </div>
                    </div>
                    {selectedElement ? (
                      <div className="rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-primary)]">
                        {dimensions || 'Ready'}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="bridge-inspect-toggle"
                      onClick={() => handleInspectToggle(shouldShowFrameWarning)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 h-8 text-[11px] font-semibold transition-colors ${
                        isInspecting
                          ? 'border-[rgba(var(--accent-rgb,88,166,255),0.3)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] text-[var(--accent-primary)]'
                          : 'border-white/10 bg-white/[0.04] text-[var(--text-primary)] hover:bg-white/[0.07]'
                      }`}
                    >
                      <MousePointer2 className="h-3.5 w-3.5" />
                      {isInspecting ? 'Selecting' : 'Inspect'}
                    </button>
                  </div>

                  {nativeInspectOnlyMode ? (
                    <div
                      className="mt-4 space-y-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.06] p-3"
                      data-testid="bridge-native-inspect-panel"
                    >
                      <p
                        className="text-[11px] leading-5 text-sky-100"
                        data-testid="bridge-native-unsupported-copy"
                      >
                        Native mode is inspect/select only right now. Switch to iframe for the
                        trustworthy visual edit/apply workflow.
                      </p>
                      <button
                        type="button"
                        data-testid="bridge-native-switch-to-iframe"
                        onClick={() => handleBrowserRuntimeChange(BROWSER_RUNTIME.IFRAME)}
                        className="inline-flex h-8 items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] px-3 text-[12px] font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-rgb,88,166,255),0.22)]"
                      >
                        <MonitorUp className="h-4 w-4" />
                        Switch to iframe edit mode
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                        <label className="mb-2 block text-[11px] font-medium text-[var(--text-muted)]">
                          Describe the change…
                        </label>
                        <textarea
                          data-testid="bridge-change-input"
                          value={changeRequest}
                          onChange={(event) => setChangeRequest(event.target.value)}
                          onInput={(event) => setChangeRequest(event.currentTarget.value)}
                          placeholder="Ej: subí el contraste del precio, compactá el padding y agregá una insignia de recomendado."
                          className="min-h-[110px] w-full resize-none rounded-xl border border-white/8 bg-[#030811] px-3 py-2 text-[13px] leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[rgba(var(--accent-rgb,88,166,255),0.35)]"
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            Agent
                          </span>
                          <div className="flex items-center gap-2">
                            {BRIDGE_AGENT_OPTIONS.map((agent) => (
                              <button
                                key={agent.id}
                                type="button"
                                data-testid={`bridge-agent-${agent.id}`}
                                disabled={!agent.enabled}
                                onClick={() => agent.enabled && setSelectedAgent(agent.id)}
                                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                                  agent.id === selectedAgent && agent.enabled
                                    ? 'border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] text-[var(--accent-primary)]'
                                    : agent.enabled
                                      ? 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.07]'
                                      : 'border-white/5 bg-white/[0.03] text-[var(--text-muted)] opacity-60 cursor-not-allowed'
                                }`}
                                title={agent.availabilityLabel}
                              >
                                {agent.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid="bridge-submit"
                          disabled={!canSubmit}
                          onClick={handleLaunch}
                          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-rgb,88,166,255),0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Wand2 className="h-4 w-4" />
                          Launch
                        </button>
                      </div>
                    </>
                  )}

                  {unsupportedCopy && !nativeRuntimeActive ? (
                    <p
                      className="mt-4 text-[11px] leading-5 text-amber-200"
                      data-testid="bridge-unsupported-copy"
                    >
                      {unsupportedCopy}
                    </p>
                  ) : null}

                  {nativeRuntimeActive ? (
                    <p
                      className="mt-4 text-[11px] leading-5 text-sky-100"
                      data-testid="bridge-native-inspect-status"
                    >
                      {nativeInspectStatusCopy}
                    </p>
                  ) : null}

                  <div className="sr-only" aria-hidden="true">
                    <span data-testid="bridge-support-mode">{supportState.mode}</span>
                    <span data-testid="bridge-support-reason">{supportState.reason}</span>
                    <span data-testid="bridge-selector-state">{selectorState}</span>
                  </div>

                  {lastLaunchMeta ? (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
                      <CheckCircle2 className="h-4 w-4" />
                      Request enviado a {lastLaunchMeta.selectedAgent}.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {nativeInspectOnlyMode ? (
          <div className="mt-3 shrink-0" data-testid="bridge-native-inspect-dock">
            <div
              className="rounded-[20px] border border-white/10 bg-[#07111d]/96 p-4 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-sm"
              data-testid="bridge-native-inspect-panel"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-secondary)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                  <span data-testid="bridge-status-badge">{statusLabel}</span>
                </div>
                <div className="rounded-full border border-white/10 bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-muted)]">
                  native inspect mode
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Edit
                  </div>
                  <div
                    className="text-sm font-semibold leading-5"
                    data-testid="bridge-selection-summary"
                  >
                    {selectedSummary || 'Seleccioná un nodo en la preview'}
                  </div>
                  <div
                    className="text-[11px] leading-5 text-[var(--text-secondary)]"
                    data-testid="bridge-source-hint"
                  >
                    {sourceHint || 'Esperando metadata del overlay o del DOM'}
                  </div>
                </div>
                {selectedElement ? (
                  <div className="rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-primary)]">
                    {dimensions || 'Ready'}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="bridge-inspect-toggle"
                  onClick={() => handleInspectToggle(shouldShowFrameWarning)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 h-8 text-[11px] font-semibold transition-colors ${
                    isInspecting
                      ? 'border-[rgba(var(--accent-rgb,88,166,255),0.3)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] text-[var(--accent-primary)]'
                      : 'border-white/10 bg-white/[0.04] text-[var(--text-primary)] hover:bg-white/[0.07]'
                  }`}
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                  {isInspecting ? 'Selecting' : 'Inspect'}
                </button>

                <p
                  className="text-[11px] leading-5 text-sky-100"
                  data-testid="bridge-native-inspect-status"
                >
                  {nativeInspectStatusCopy}
                </p>
              </div>

              <div className="mt-4 space-y-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.06] p-3">
                <p
                  className="text-[11px] leading-5 text-sky-100"
                  data-testid="bridge-native-unsupported-copy"
                >
                  Native mode is inspect/select only right now. Switch to iframe for the trustworthy
                  visual edit/apply workflow.
                </p>
                <button
                  type="button"
                  data-testid="bridge-native-switch-to-iframe"
                  onClick={() => handleBrowserRuntimeChange(BROWSER_RUNTIME.IFRAME)}
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] px-3 text-[12px] font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-rgb,88,166,255),0.22)]"
                >
                  <MonitorUp className="h-4 w-4" />
                  Switch to iframe edit mode
                </button>
              </div>

              <div className="sr-only" aria-hidden="true">
                <span data-testid="bridge-support-mode">{supportState.mode}</span>
                <span data-testid="bridge-support-reason">{supportState.reason}</span>
                <span data-testid="bridge-selector-state">{selectorState}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(WorkspaceBrowserPane);

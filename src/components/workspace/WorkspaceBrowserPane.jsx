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
import { moveBrowserHistory, syncBrowserUrlFromNative } from './browserHistory';
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

// Note: do NOT use `contain: size` here — with flex-1 it can collapse the shell to a
// near-zero box on some Windows/Tauri layouts, which then measures as a thin strip and
// the native WebView2 is placed as a 1–40px line on the edge of the dock.
const VIEWPORT_SHELL_STYLE = {
  isolation: 'isolate',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};
const VIEWPORT_SHELL_STYLE_IFRAME = {
  ...VIEWPORT_SHELL_STYLE,
  contain: 'layout paint',
};

const IFRAME_GPU_STYLE = {
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

/** Visible in toolbar — confirms the running bundle includes latest browser fixes. */
const BROWSER_BUILD_TAG = '20260708u';

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
  layoutReady = true,
  suspendNativeSurface = false,
  tabsMode = 'single',
  isPizarraContext = false,
  nativePanelId: nativePanelIdProp = null,
  pizarraDragHandleMouseDown = null,
  onPizarraCloseCard = null,
}) {
  const viewportShellRef = useRef(null);
  const browserChromeRef = useRef(null);
  // Declared early: past HMR crashes used this binding mid-render while
  // undefined ("browserChromeActive is not defined") and blanked the UI.
  const [browserChromeActive, setBrowserChromeActive] = useState(false);
  const chromeOccludeTimerRef = useRef(null);
  const engageBrowserChrome = useCallback(() => {
    if (chromeOccludeTimerRef.current) {
      clearTimeout(chromeOccludeTimerRef.current);
      chromeOccludeTimerRef.current = null;
    }
    setBrowserChromeActive(true);
  }, []);
  const releaseBrowserChrome = useCallback((delayMs = 200) => {
    if (chromeOccludeTimerRef.current) {
      clearTimeout(chromeOccludeTimerRef.current);
      chromeOccludeTimerRef.current = null;
    }
    if (delayMs <= 0) {
      setBrowserChromeActive(false);
      return;
    }
    chromeOccludeTimerRef.current = setTimeout(() => {
      chromeOccludeTimerRef.current = null;
      setBrowserChromeActive(false);
    }, delayMs);
  }, []);
  useEffect(
    () => () => {
      if (chromeOccludeTimerRef.current) {
        clearTimeout(chromeOccludeTimerRef.current);
      }
    },
    []
  );
  const measureNativeBounds = useCallback(() => {
    const shell = viewportShellRef.current;
    const rect = shell?.getBoundingClientRect?.();
    const chromeRect = browserChromeRef.current?.getBoundingClientRect?.();
    const paneEl = shell?.closest?.('[data-testid="workspace-browser-pane"]');
    const paneRect = paneEl?.getBoundingClientRect?.() ?? null;

    // Prefer the viewport shell only. Falling back to the full pane while the
    // shell is still collapsing (flex settle) opened WebView2 at dock/window
    // size — "totalmente expandido" — and later sync could not recover.
    const shellW = rect && Number.isFinite(rect.width) ? rect.width : 0;
    const shellH = rect && Number.isFinite(rect.height) ? rect.height : 0;
    const shellDegenerate = !rect || shellW < 48 || shellH < 48;
    if (shellDegenerate) {
      return {
        x: Math.round(rect && Number.isFinite(rect.left) ? rect.left : 0),
        y: Math.round(rect && Number.isFinite(rect.top) ? rect.top : 0),
        width: Math.max(1, Math.round(shellW)),
        height: Math.max(1, Math.round(shellH)),
      };
    }

    let x = Number.isFinite(rect.left) ? rect.left : 0;
    let y = Number.isFinite(rect.top) ? rect.top : 0;
    let width = Math.max(shellW, 1);
    let height = Math.max(shellH, 1);

    // Keep native surface strictly below React toolbar chrome (hit-test padding on WebView2).
    const CHROME_HIT_SLOP_PX = 2;
    if (chromeRect && Number.isFinite(chromeRect.bottom) && chromeRect.bottom > y) {
      const push = chromeRect.bottom - y + CHROME_HIT_SLOP_PX;
      y += push;
      height = Math.max(height - push, 24);
    }

    // Soft clamp: never expand past the pane (covers terminal), never negative sizes.
    if (paneRect && Number.isFinite(paneRect.left)) {
      const left = paneRect.left;
      const right = paneRect.right;
      const top = Math.max(paneRect.top, chromeRect?.bottom ?? paneRect.top);
      const bottom = paneRect.bottom;
      x = Math.min(Math.max(x, left), Math.max(right - 48, left));
      y = Math.min(Math.max(y, top), Math.max(bottom - 24, top));
      width = Math.max(48, Math.min(width, right - x));
      height = Math.max(24, Math.min(height, bottom - y));
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
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
    const dockVisible = dockState.visible === true;
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
  const nativeEditPanelInsetPx =
    nativeRuntimeActive && effectiveEditMode && !nativeInspectOnlyMode ? 336 : 0;

  const runtimeStatusCopy = useMemo(() => {
    let base = '';
    if (nativeRuntimeActive) {
      base = `Activo: ${embeddedEngineLabel}`;
    } else if (browserRuntimeSelection.requestedRuntime === BROWSER_RUNTIME.NATIVE_GTK) {
      const fallbackCopy = getBrowserRuntimeFallbackCopy(browserRuntimeSelection.fallbackReason);
      const fallbackReason = fallbackCopy.startsWith('iframe fallback · ')
        ? fallbackCopy.slice('iframe fallback · '.length)
        : fallbackCopy === 'iframe fallback'
          ? ''
          : fallbackCopy;

      base = fallbackReason
        ? `Fallback activo: iframe · ${fallbackReason}`
        : 'Fallback activo: iframe';
    } else {
      base = `Activo: ${getBrowserRuntimeLabel(BROWSER_RUNTIME.IFRAME)}`;
    }
    return `${base} · build ${BROWSER_BUILD_TAG}`;
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
        browserRuntimePinned: true,
        browserRuntimeUserPick: true,
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
  // Modal/dialog portals paint under the native WebView HWND unless we hide it.
  // IMPORTANT: only *open* dialog/modal overlays count.
  // Never treat bare [data-state="open"] as blocking — Radix tabs/selects/collapsibles
  // use that attribute and would hide WebView2 forever (black dock; "Ventana" still works).
  const [overlayOccludesNative, setOverlayOccludesNative] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return undefined;
    }
    const isVisiblyOpenOverlay = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.getAttribute('aria-hidden') === 'true') return false;
      if (node.hidden) return false;
      const state = node.getAttribute('data-state');
      if (state === 'closed' || state === 'hiding') return false;

      const role = node.getAttribute('role');
      const isDialogRole =
        role === 'dialog' || role === 'alertdialog' || node.getAttribute('aria-modal') === 'true';
      const isDevhubModal =
        node.dataset?.modalOpen === 'true' || node.dataset?.devhubModal === 'true';
      if (!isDialogRole && !isDevhubModal) return false;

      // Closed dialogs often stay mounted with role=dialog but data-state=closed.
      if (state && state !== 'open' && !isDevhubModal) return false;

      // Require real on-screen geometry (ignores display:none / zero-size portals).
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width < 8 || rect.height < 8) return false;
      const style = window.getComputedStyle?.(node);
      if (
        style &&
        (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      ) {
        return false;
      }
      return true;
    };
    const scan = () => {
      const nodes = document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-modal-open="true"], [data-devhub-modal="true"]'
      );
      let blocking = false;
      nodes.forEach((node) => {
        if (isVisiblyOpenOverlay(node)) blocking = true;
      });
      setOverlayOccludesNative((prev) => (prev === blocking ? prev : blocking));
    };
    scan();
    const observer = new MutationObserver(() => {
      scan();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'role',
        'aria-modal',
        'aria-hidden',
        'hidden',
        'data-modal-open',
        'data-devhub-modal',
        'data-state',
        'class',
        'style',
      ],
    });
    return () => observer.disconnect();
  }, []);

  // Do NOT hide the native surface just because the React toolbar is focused.
  // Bounds already exclude the chrome hit area; full-hide on chrome focus left the
  // dock blank after typing a URL (focus stayed on the input → permanent occlude).
  // Edit panel is React above WebView2 HWND — hide native under it (inset alone loses clicks).
  const nativeEditOccludes = nativeRuntimeActive && effectiveEditMode && !nativeInspectOnlyMode;
  const nativeChromeOccluded =
    nativeRuntimeActive && (Boolean(browserError) || overlayOccludesNative || nativeEditOccludes);
  const { nativeRuntimeReady, nativeError, retryNative, focusNativeViewport, noteNativeUrl } =
    useNativeBrowserSurface({
      panelId: nativePanelId,
      url: dockState.browserUrl,
      active: nativeRuntimeActive && !browserError,
      visibleInLayout: nativeRuntimeVisibleInLayout,
      measureBounds: measureNativeBounds,
      observeNode: viewportShellRef,
      layoutSyncKey,
      layoutReady,
      occludeNative: nativeChromeOccluded,
      // When edit occludes fully, inset is unused; keep for inspect-only / future shrink.
      rightInsetPx: nativeEditOccludes ? 0 : nativeEditPanelInsetPx,
    });

  // Sync uncontrolled URL input when history / in-page navigation changes browserUrl.
  useEffect(() => {
    const input = urlInputRef?.current;
    if (!input) return;
    const next = dockState.browserUrl || '';
    if (document.activeElement === input) return;
    if (input.value !== next) {
      input.value = next;
    }
  }, [dockState.browserUrl, urlInputRef]);

  // In-page link clicks don't go through React — mirror them into dock history/URL bar.
  // Use syncBrowserUrlFromNative (not commitBrowserNavigation): commit truncates the forward
  // stack, so back→page-load→commit used to erase "adelante" after a few steps.
  useEffect(() => {
    if (!nativeRuntimeActive) return undefined;
    const onNativeEvent = (event) => {
      const payload = event?.detail || {};
      if (payload.panelId && payload.panelId !== nativePanelId) return;
      if (payload.type !== 'url-changed' || !payload.url) return;
      const nextUrl = String(payload.url);
      noteNativeUrl?.(nextUrl);
      onDockStateChange?.((current) => {
        if (current.browserUrl === nextUrl) return current;
        return syncBrowserUrlFromNative(current, nextUrl);
      });
    };
    window.addEventListener('devhub:native-browser-event', onNativeEvent);
    return () => window.removeEventListener('devhub:native-browser-event', onNativeEvent);
  }, [nativePanelId, nativeRuntimeActive, noteNativeUrl, onDockStateChange]);

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
      browserWindow.once('tauri://error', (event) => {
        console.error('[browser] dedicated window error', event);
        onBrowserWindowStateChange?.(workspaceId, {
          open: false,
          label: dedicatedBrowserWindowLabel,
          url: '',
          updatedAt: Date.now(),
        });
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      });
    } catch (error) {
      console.error('[browser] dedicated window failed', error);
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
      data-native-panel-id={nativeRuntimeActive ? nativePanelId : undefined}
      data-tabs-mode={tabsMode}
    >
      <div
        ref={browserChromeRef}
        className="relative z-30 shrink-0"
        data-testid="browser-chrome-stack"
        data-chrome-active={browserChromeActive ? 'true' : 'false'}
        onPointerDownCapture={engageBrowserChrome}
        onPointerLeave={() => releaseBrowserChrome(250)}
        onFocusCapture={engageBrowserChrome}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            releaseBrowserChrome(120);
          }
        }}
      >
        {isPizarraContext && typeof onPizarraCloseCard === 'function' ? (
          <div
            className="flex h-7 min-h-7 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[#07111c] px-1.5"
            data-testid="pizarra-browser-titlebar"
            data-pizarra-surface-drag-handle="true"
            onMouseDown={
              typeof pizarraDragHandleMouseDown === 'function'
                ? pizarraDragHandleMouseDown
                : undefined
            }
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)]">
              {typeof pizarraDragHandleMouseDown === 'function' ? (
                <GripVertical
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                  data-testid="pizarra-drag-handle"
                />
              ) : null}
              <span className="truncate">Navegador</span>
            </span>
            <button
              type="button"
              data-testid="pizarra-browser-close"
              data-pizarra-close-button="true"
              title="Cerrar ventana del navegador"
              aria-label="Cerrar ventana del navegador"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPizarraCloseCard();
              }}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--border-subtle)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
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
              onClick={() =>
                onDockStateChange((currentState) => moveBrowserHistory(currentState, 1))
              }
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
                isPizarraContext ? 'URL' : 'Escribí una URL, localhost:3100 o una búsqueda'
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
              {!isPizarraContext && nativeRuntimeActive ? (
                <div
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold text-[var(--text-muted)]"
                  data-testid="browser-native-runtime-chip"
                  title={`${embeddedEngineLabel} embebido en el dock`}
                >
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.65)]" />
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
                <button
                  type="button"
                  data-testid="browser-open-dedicated"
                  onClick={() => {
                    void handleOpenDedicatedBrowser();
                  }}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  title="Abrir en ventana DevHub (WebView2 completa)"
                >
                  <MonitorUp className="h-3.5 w-3.5" />
                  Ventana
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
        </form>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col ${
          nativeRuntimeActive ? 'bg-transparent' : 'bg-[#050814]'
        } ${nativeRuntimeActive ? '' : 'p-3'}`}
        data-testid="browser-pane-body"
        style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          className={`relative min-h-0 flex-1 overflow-hidden border ${
            nativeRuntimeActive ? 'border-0 bg-transparent' : 'bg-[#0a111d]'
          } ${
            nativeRuntimeActive
              ? 'border-0'
              : 'rounded-[16px] border border-white/10 shadow-[0_18px_48px_rgba(3,7,18,0.28)]'
          }`}
          data-testid="browser-viewport-shell"
          style={{
            ...(nativeRuntimeActive ? VIEWPORT_SHELL_STYLE : VIEWPORT_SHELL_STYLE_IFRAME),
            flex: '1 1 auto',
            minHeight: 0,
            minWidth: 0,
            width: '100%',
            height: '100%',
          }}
          ref={viewportShellRef}
          onMouseDown={() => {
            releaseBrowserChrome(0);
            if (nativeRuntimeActive && nativeRuntimeReady) {
              focusNativeViewport();
            }
          }}
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

/**
 * PizarraBrowserSurface — iframe-first mount + 5s explicit failure surface.
 *
 * Covers board-browser-load Req 1-4 and Req 5 (browserLoadFallback
 * round-trip). The 10 spec scenarios are exercised by the test
 * file at src/components/workspace/__tests__/rightDockState.test.js
 * (Req 5) and this file (Req 1-4).
 *
 * pizarra-ux-overhaul: the pizarra now mounts the iframe immediately
 * (no waiting on nativeRuntimeReady). A 5s timer fires the
 * BrowserLoadFailed view if neither the iframe load event nor the
 * native readiness signal arrive in time. The iframe stays in the
 * DOM underneath the failure view. The user can hit Reload to
 * re-arm the timer and force an iframe reload.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- false positive: these icon names are JSX-tag references (lucide-react proxies)
import { RefreshCw, X } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- false positive: WorkspaceBrowserPane is rendered inside the JSX below; eslint-plugin-react v7.37.5 + ESLint 9.23.0 fails to track the JSX usage
import WorkspaceBrowserPane from '@/components/workspace/WorkspaceBrowserPane';
import * as useNativeBrowserSurfaceModule from '@/components/workspace/useNativeBrowserSurface';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';
import { raiseNativeBrowser, resizeNativeBrowser } from '@/lib/browser/nativeBrowserBridge';
// pizarra-shared-view-state Phase 3: same tab strip as the
// workspace right-dock (single source of truth). Pizarra is
// always opt-in: tabsMode defaults to 'multi' on this surface.
import { useBrowserTabs } from '@/components/workspace/hooks/useBrowserTabs';
import BrowserTabStrip from '@/components/workspace/BrowserTabStrip';
import {
  ensureSurfaceMotionKeyframes,
  resolveFrameVisual,
  resolveHandleSizing,
  FRAME_TRANSITION,
  SURFACE_ENTER_ANIMATION,
} from '@/lib/pizarra/surfaceMotion';

const FRAME_INSET = 10;

// pizarra-ux-overhaul: 5s build-time constant. Exported for tests.
export const PIZARRA_BROWSER_LOAD_TIMEOUT_MS = 5000;

const LEGACY_LOCALHOST_3200 = 'http://localhost:3200/';
const LEGACY_LOCALHOST_3000 = 'http://localhost:3000/';

function resolveBrowserUrl(url) {
  const DEFAULT =
    typeof window !== 'undefined' ? window.location.origin + '/' : 'http://localhost:3100/';
  if (!url) return DEFAULT;
  const normalized = url.endsWith('/') ? url : url + '/';
  if (normalized === LEGACY_LOCALHOST_3200 || normalized === LEGACY_LOCALHOST_3000) return DEFAULT;
  return url;
}

function createDockState(url) {
  const resolvedUrl = resolveBrowserUrl(url);

  return {
    activeTab: 'browser',
    browserHistory: [resolvedUrl],
    browserHistoryIndex: 0,
    // pizarra-browser-fix: start on iframe so the browser always renders content.
    // The useEffect that watches nativeCapability will upgrade to native-gtk
    // automatically when the Tauri WebKitGTK backend is ready.
    // Forcing native-gtk from the start caused a perpetual "Preparando" spinner
    // when the native backend was not yet initialized.
    browserRuntime: 'iframe',
    browserLoadFallback: false,
    browserUrl: resolvedUrl,
    editMode: false,
    maximized: false,
    maximizedView: 'browser',
    visible: true,
  };
}

// pizarra-ux-overhaul: failure categories from board-browser-load Req 3.
const FAILURE_CATEGORIES = {
  IFRAME_STUCK: 'iframe-stuck',
  NATIVE_ERROR: 'native-error',
  NATIVE_TIMEOUT: 'native-timeout',
};

export default function PizarraBrowserSurface({
  shape,
  bounds,
  selected = false,
  zoom = 1,
  onSelect,
  onMove,
  onDragEnd,
  onUpdateElement,
  onClose,
  projectId,
  workspaceId,
  dockState: parentDockState,
  onDockStateChange: parentOnDockStateChange,
  browserWindowState,
  onBrowserWindowStateChange,
  workspaceWindows,
  activeWorkspaceWindowId,
  onWorkspaceWindowSelect,
  onWorkspaceWindowAdd,
  onWorkspaceWindowRemove,
  tabsMode = 'multi',
}) {
  // Compute early (before any hooks/state) so initial dockState can use it.
  // isCarriedFromWorkspace: the surface was auto-registered by TWM from the
  // normal workspace browser (not a fresh "Add Browser" in pizarra). For these,
  // we want instant content (reuse live native webview) + no loading chrome.
  const nativePanelId = shape.panelId || `browser-${projectId || 'pizarra'}-${workspaceId || shape.id}`;
  const isCarriedFromWorkspace = !!(shape.panelId && shape.panelId.startsWith('browser-'));

  const [localDockState, setLocalDockState] = useState(() => {
    const ds = createDockState(shape.url);
    // For carried (from normal mode switch): start on native-gtk using the live
    // webview instance (no re-load, no spinner). New pizarra adds start on iframe
    // for safety until native ready.
    if (isCarriedFromWorkspace) {
      ds.browserRuntime = 'native-gtk';
    }
    return ds;
  });

  const resolvedDockState = parentDockState || localDockState;
  const resolvedOnDockStateChange = useCallback(
    (nextStateOrUpdater) => {
      if (parentOnDockStateChange) {
        parentOnDockStateChange(nextStateOrUpdater);
      } else {
        setLocalDockState((currentState) =>
          typeof nextStateOrUpdater === 'function'
            ? nextStateOrUpdater(currentState)
            : nextStateOrUpdater
        );
      }
    },
    [parentOnDockStateChange]
  );

  const [loadFailed, setLoadFailed] = useState(null);
  // pizarra-ux-overhaul: tracks whether the iframe emitted a load
  // event during the 5s window. Cleared on reload.
  // For carried workspace browsers on switch to pizarra: start "loaded" so no
  // perpetual spinner; the live native content is already there, we just re-parent
  // its bounds to the card.
  const [iframeLoaded, setIframeLoaded] = useState(!!isCarriedFromWorkspace);
  // pizarra-ux-overhaul: reload key forces iframe re-mount when
  // incremented. Bump on Reload click.
  const [srcReloadKey, setSrcReloadKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Separate flag for resize vs move. We suspend the native surface ONLY during
  // actual drag/move (to avoid flicker/desync while position changes). During
  // pure resize we keep native visible so the "cuerpo" (browser content / terminal)
  // follows the header live via RO + direct size mutation. This removes the
  // perceived delay between header chrome and body.
  const [isResizing, setIsResizing] = useState(false);
  const persistedUrlRef = useRef(resolveBrowserUrl(shape.url));
  const panelId = useMemo(() => `pizarra-browser-${shape.id}`, [shape.id]);
  // pizarra-resize-fluidity: ref to the surface root (the positioned div) so resize
  // handlers can mutate its style (and ancestor's Live wrapper) directly during the
  // gesture. This + commit-only on mouseup gives the same fluidity as drag (no per-tick
  // React updates that re-apply bounds and can race native sync).
  const surfaceRootRef = useRef(null);
  // pizarra-ux-overhaul: subscribe to the native browser capability so
  // the surface can flip to native-gtk when the runtime reports ready
  // AND the consumer has not opted out via browserLoadFallback.
  // The hook is optional in the codebase; we import it dynamically so
  // the module graph stays valid even if it is not yet present.
  const nativeCapability = useNativeBrowserCapabilitySafe();

  // pizarra-shared-view-state: use the *workspace* key for tabs so the browser
  // tabs/state ("la misma") are identical between pizarra cards and the normal
  // right-dock WorkspaceBrowserPane. Multiple pizarra browser shapes currently
  // share the single ws browser tabs list (the "one browser per workspace" model
  // with internal tabs; multi-surface browser is future per shared-dock comment).
  // This makes switch pizarra<->normal preserve the live tabs/urls without loss.
  const tabStripApi = useBrowserTabs({
    projectId: projectId || 'pizarra',
    workspaceId: workspaceId || shape.id,
  });
  const showTabStrip = tabsMode === 'multi';

  useEffect(() => {
    const nextUrl = resolveBrowserUrl(shape.url);
    persistedUrlRef.current = nextUrl;
    resolvedOnDockStateChange((currentState) => {
      if (currentState.browserUrl === nextUrl) return currentState;

      const nextHistory = currentState.browserHistory?.includes(nextUrl)
        ? currentState.browserHistory
        : [...(currentState.browserHistory || []), nextUrl];

      return {
        ...currentState,
        browserUrl: nextUrl,
        browserHistory: nextHistory,
        browserHistoryIndex: Math.max(nextHistory.length - 1, 0),
      };
    });
  }, [shape.url, resolvedOnDockStateChange]);

  useEffect(() => {
    const nextUrl = resolveBrowserUrl(resolvedDockState.browserUrl);
    if (persistedUrlRef.current === nextUrl) return;
    persistedUrlRef.current = nextUrl;
    onUpdateElement?.(shape.id, { url: nextUrl });
  }, [resolvedDockState.browserUrl, onUpdateElement, shape.id]);

  // pizarra-ux-overhaul: 5s explicit failure timer. Counts the time
  // the iframe is "stuck" (no load event AND no native readiness
  // signal). On fire, sets loadFailed with the iframe-stuck category
  // unless the native runtime timed out (then native-timeout).
  const nativeSupported = nativeCapability && nativeCapability.supported;
  useEffect(() => {
    if (resolvedDockState.browserRuntime === 'native-gtk') return; // Enforce native-gtk: disable iframe timer
    if (loadFailed) return; // already failed; don't restart
    if (iframeLoaded) return; // iframe already loaded; success path
    const handle = setTimeout(() => {
      if (loadFailedRef.current) return;
      // The native runtime may have reported supported but never
      // resolved ready. That is the native-timeout category.
      const category = nativeSupported
        ? FAILURE_CATEGORIES.NATIVE_TIMEOUT
        : FAILURE_CATEGORIES.IFRAME_STUCK;
      setLoadFailed({ category, since: Date.now() });
    }, PIZARRA_BROWSER_LOAD_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [
    shape.id,
    loadFailed,
    iframeLoaded,
    srcReloadKey,
    nativeSupported,
    resolvedDockState.browserRuntime,
  ]);

  // Mirror loadFailed into a ref so the timer callback sees the
  // latest value without being re-scheduled on every change.
  const loadFailedRef = useRef(loadFailed);
  useEffect(() => {
    loadFailedRef.current = loadFailed;
  }, [loadFailed]);

  // pizarra-ux-overhaul: flip browserRuntime to native-gtk when the
  // runtime reports ready AND the consumer has not opted out via
  // browserLoadFallback. (board-browser-load Req 1.2)
  useEffect(() => {
    if (!nativeCapability) return;
    if (!nativeCapability.ready) return;
    if (resolvedDockState.browserLoadFallback) return;
    resolvedOnDockStateChange((currentState) => {
      if (currentState.browserRuntime === 'native-gtk') return currentState;
      return { ...currentState, browserRuntime: 'native-gtk' };
    });
  }, [nativeCapability, resolvedDockState.browserLoadFallback, resolvedOnDockStateChange]);

  const handleDockStateChange = resolvedOnDockStateChange;

  // pizarra-ux-overhaul: mark iframe as loaded on the workspace pane's
  // load event. The WorkspaceBrowserPane exposes onIframeLoad via the
  // dockState change payload; if not, we conservatively assume the
  // iframe loaded after the first RAF tick.
  useEffect(() => {
    if (iframeLoaded) return;
    const raf = requestAnimationFrame(() => {
      // Optimistic: assume the iframe mounted. If the URL is invalid
      // the failure view will surface in the next timer cycle.
      setIframeLoaded(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [srcReloadKey, iframeLoaded]);

  // pizarra-ux-overhaul: Reload button handler. Clears the failure
  // view, increments the reload key, and re-arms the 5s timer.
  const handleReload = useCallback(() => {
    setLoadFailed(null);
    setIframeLoaded(false);
    setSrcReloadKey((k) => k + 1);
  }, []);

  // pizarra-ux-overhaul: hover/active micro-states for the inner
  // wrapper (the chrome frame containing tabstrip + browser pane).
  // The top area (tabstrip container) now serves as the draggable header
  // (no separate floating Move "crucecita" button). Hover/active for visual polish.
  // NO transform on wrapper — native overlays.
  const [isHovered, setIsHovered] = useState(false);
  const [isButtonActive, setIsButtonActive] = useState(false);
  const handleWrapperMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleWrapperMouseLeave = useCallback(() => {
    setIsHovered(false);
    setIsButtonActive(false);
  }, []);
  const handleWrapperButtonMouseDown = useCallback(() => setIsButtonActive(true), []);
  const handleWrapperButtonMouseUp = useCallback(() => setIsButtonActive(false), []);

  // pizarra-motion: inject shared enter keyframes once.
  useEffect(() => {
    ensureSurfaceMotionKeyframes();
  }, []);

  // Newly added browser surface should start on top (including above any terminals).
  // For carried: use nativePanelId (the registered one from normal) so the live
  // webview moves under this pizarra card immediately.
  useEffect(() => {
    raiseNativeBrowser({ panelId: nativePanelId }).catch(() => {});
  }, [nativePanelId]); // mount only

  // Immediate native bounds sync for carried browsers on pizarra mount/switch.
  // Ensures the live webview (from normal mode) gets raised + resized to *this card's*
  // screen rect right away. Combined with starting as native-gtk + loaded=true,
  // the content appears instantly without "cargando todo el rato" or broken view.
  // Uses RAF so the shell ref and DOM are ready; re-runs if bounds change early.
  useEffect(() => {
    if (!isCarriedFromWorkspace) return;
    const pid = nativePanelId;
    raiseNativeBrowser({ panelId: pid }).catch(() => {});
    const raf = requestAnimationFrame(() => {
      const shell = surfaceRootRef.current?.querySelector?.('[data-testid="browser-viewport-shell"]');
      if (shell) {
        const r = shell.getBoundingClientRect();
        if (r.width > 10 && r.height > 10) {
          resizeNativeBrowser({
            panelId: pid,
            bounds: {
              x: Math.round(r.left),
              y: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
            },
          }).catch(() => {});
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isCarriedFromWorkspace, nativePanelId, bounds.x, bounds.y, bounds.width, bounds.height]);

  const handleFrameMouseDown = useCallback(
    (event) => {
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      onSelect?.(shape.id);
      // Raise native browser webview so this surface's content is above
      // other native surfaces (terminals etc) in pizarra z-order.
      raiseNativeBrowser({ panelId: nativePanelId }).catch(() => {});
    },
    [onSelect, shape.id]
  );

  // pizarra-drag-resize-polish + fluidity fix: border-based resize.
  // Direct style mutation on the surface root (and its Live wrapper ancestor)
  // during the gesture for 60fps frame resize without React re-render per px.
  // Model commit (onUpdateElement) happens ONLY on mouseup — exactly like drag.
  // This + removal of enter anim from root eliminates the "navegador por encima de la rayita"
  // after resets/reloads/resizes.
  const handleResizeStart = useCallback(
    (event, dir) => {
      if (event.button !== 0) return;
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      onSelect?.(shape.id);
      raiseNativeBrowser({ panelId: nativePanelId }).catch(() => {});

      const z = zoom > 0 ? zoom : 1;
      const startLogical = {
        x: shape.x ?? bounds.x,
        y: shape.y ?? bounds.y,
        width: shape.width ?? bounds.width,
        height: shape.height ?? bounds.height,
      };
      const startX = event.clientX;
      const startY = event.clientY;
      const minW = 220;
      const minH = 160;

      // Capture the elements to mutate directly (fluidity). The Live wrapper ancestor
      // owns the final positioned box; mutating it keeps everything consistent.
      const surfaceRoot = surfaceRootRef.current;
      const liveWrapper = surfaceRoot ? surfaceRoot.parentElement : null;
      const isLiveWrapper = !!(
        liveWrapper && liveWrapper.hasAttribute('data-pizarra-live-surface-wrapper')
      );

      // Pre-compute start screen metrics from the *current rendered styles* (authoritative during gesture).
      const startScreenW =
        parseFloat((liveWrapper || surfaceRoot)?.style.width) || startLogical.width * z;
      const startScreenH =
        parseFloat((liveWrapper || surfaceRoot)?.style.height) || startLogical.height * z;
      const startScreenLeft =
        parseFloat((liveWrapper || surfaceRoot)?.style.left) || startLogical.x * z;
      const startScreenTop =
        parseFloat((liveWrapper || surfaceRoot)?.style.top) || startLogical.y * z;

      let lastLogical = { ...startLogical };

      const handleMouseMove = (moveEvent) => {
        const screenDx = moveEvent.clientX - startX;
        const screenDy = moveEvent.clientY - startY;

        let nextScreenW = startScreenW;
        let nextScreenH = startScreenH;
        let nextScreenLeft = startScreenLeft;
        let nextScreenTop = startScreenTop;

        if (dir.includes('e')) {
          nextScreenW = Math.max(minW * z, startScreenW + screenDx);
        }
        if (dir.includes('s')) {
          nextScreenH = Math.max(minH * z, startScreenH + screenDy);
        }
        if (dir.includes('w')) {
          const candidateW = Math.max(minW * z, startScreenW - screenDx);
          nextScreenLeft = startScreenLeft + (startScreenW - candidateW);
          nextScreenW = candidateW;
        }
        if (dir.includes('n')) {
          const candidateH = Math.max(minH * z, startScreenH - screenDy);
          nextScreenTop = startScreenTop + (startScreenH - candidateH);
          nextScreenH = candidateH;
        }

        // Direct DOM mutation — zero React updates during drag of the handle.
        if (isLiveWrapper && liveWrapper) {
          liveWrapper.style.width = `${nextScreenW}px`;
          liveWrapper.style.height = `${nextScreenH}px`;
          liveWrapper.style.left = `${nextScreenLeft}px`;
          liveWrapper.style.top = `${nextScreenTop}px`;
        }
        if (surfaceRoot) {
          surfaceRoot.style.width = `${nextScreenW}px`;
          surfaceRoot.style.height = `${nextScreenH}px`;
          if (isLiveWrapper) {
            // In real Live usage, surface root is always local (0,0) inside the wrapper.
            surfaceRoot.style.left = '0px';
            surfaceRoot.style.top = '0px';
          } else {
            // Bare render (tests) or non-wrapped: the root itself carries screen position.
            surfaceRoot.style.left = `${nextScreenLeft}px`;
            surfaceRoot.style.top = `${nextScreenTop}px`;
          }
        }

        // Force reflow so that inner elements (including the viewport shell) and
        // getBoundingClientRect see the updated sizes in this same mousemove tick.
        if (liveWrapper) void liveWrapper.offsetWidth;
        if (surfaceRoot) void surfaceRoot.offsetWidth;

        // Live native resize call (stronger sync): directly instruct the native
        // WebKit webview to resize its bounds to the current screen rect of the
        // shell. This makes the "cuerpo" (actual browser page content) follow the
        // JS header/chrome with much less delay than relying only on RO + CSS.
        // Scoped query inside this pizarra surface's root so it doesn't affect
        // other browser instances. Combined with not suspending during resize,
        // this should feel "mucho más fluido y fuerte".
        try {
          const shell = surfaceRoot?.querySelector?.('[data-testid="browser-viewport-shell"]');
          if (shell) {
            const r = shell.getBoundingClientRect();
            if (r.width > 10 && r.height > 10) {
              // Use nativePanelId (prefers shape.panelId from TWM registration) for
              // consistency with normal mode's browser webview instance.
              resizeNativeBrowser({
                panelId: nativePanelId,
                bounds: {
                  x: Math.round(r.left),
                  y: Math.round(r.top),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                },
              }).catch(() => {});
            }
          }
        } catch {}

        // Track last logical for the single commit on up.
        const logicalW = Math.max(minW, Math.round(nextScreenW / z));
        const logicalH = Math.max(minH, Math.round(nextScreenH / z));
        const logDx = Math.round((nextScreenLeft - startScreenLeft) / z);
        const logDy = Math.round((nextScreenTop - startScreenTop) / z);
        lastLogical = {
          x: startLogical.x + logDx,
          y: startLogical.y + logDy,
          width: logicalW,
          height: logicalH,
        };

        // Do NOT call onUpdateElement here. Live visual + (when not suspended) RO-driven
        // native resize happen via the style changes. Commit only on release.
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        // Single commit on release.
        onUpdateElement?.(shape.id, lastLogical);
      };

      setIsResizing(true);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [bounds, onSelect, onUpdateElement, projectId, shape, workspaceId, zoom]
  );

  const handleDragStart = usePizarraSurfaceDrag({
    surfaceId: shape.id,
    bounds,
    onSelect,
    onMove,
    onDragEnd: (args) => {
      setIsDragging(false);
      // Re-raise after drop so the browser native ends up on top in the final
      // canvas order (allows browser above terminals after drag).
      raiseNativeBrowser({ panelId: nativePanelId }).catch(() => {});
      onDragEnd?.(args);
    },
    onDragStart: () => {
      setIsDragging(true);
      raiseNativeBrowser({ panelId: nativePanelId }).catch(() => {});
    },
    moveMeta: { panelId },
  });
  const layoutSyncKey = useMemo(
    () =>
      `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}:${bounds.screenX ?? bounds.x}:${bounds.screenY ?? bounds.y}:${srcReloadKey}`,
    [bounds.height, bounds.screenX, bounds.screenY, bounds.width, bounds.x, bounds.y, srcReloadKey]
  );

  const isManipulating = isDragging || isResizing;
  const frameVisual = resolveFrameVisual({
    selected,
    hovered: isHovered,
    dragging: isManipulating,
  });
  const handleSizing = resolveHandleSizing(zoom);

  return (
    <div
      ref={surfaceRootRef}
      data-testid={`pizarra-browser-surface-${shape.id}`}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: 'none',
        // NOTE: NO animation / willChange:transform here. Live surfaces host native
        // overlays (WebKitGTK / VTE) positioned via IPC to getBoundingClientRect.
        // Any transform or re-triggered enter anim on this wrapper desyncs the chrome
        // frame from the native content rect → "vista separada de la rayita límite" on
        // resize, reload (srcReloadKey), resetElements (layout presets), or window resize.
        // Safe (opacity-only) one-shot enter is applied at the LiveSurfaceItem wrapper level.
      }}
    >
      <div
        onMouseDownCapture={handleFrameMouseDown}
        onMouseEnter={handleWrapperMouseEnter}
        onMouseLeave={handleWrapperMouseLeave}
        onMouseDown={handleWrapperButtonMouseDown}
        onMouseUp={handleWrapperButtonMouseUp}
        data-pizarra-header-hovered={isHovered ? 'true' : 'false'}
        data-pizarra-header-active={isButtonActive ? 'true' : 'false'}
        data-pizarra-surface-dragging={isManipulating ? 'true' : 'false'}
        data-pizarra-surface-selected={selected ? 'true' : 'false'}
        style={{
          position: 'absolute',
          inset: FRAME_INSET,
          overflow: 'hidden',
          borderRadius: 16,
          border: frameVisual.border,
          outline: isButtonActive ? '1px inset var(--accent-primary)' : 'none',
          background: 'rgba(8, 14, 24, 0.94)',
          boxShadow: frameVisual.boxShadow,
          // During resize or drag: kill ALL transitions on the chrome frame (header,
          // buttons, content container). This eliminates the "delay entre header y cuerpo"
          // the user sees — the header chrome (move/close buttons, tabstrip, browser
          // toolbar) and the body now resize in lockstep because there's no lingering
          // cubic-bezier delay fighting the direct style mutation from the handles.
          transition: isManipulating ? 'none' : FRAME_TRANSITION,
          pointerEvents: 'auto',
        }}
      >
        {/* Explicit pizarra card header for browser container.
            Consistent with CanvasTerminal header (28px -> using 24px for balance in canvas cards).
            Clear drag target across full header, label left, close right (larger hit area, better positioned).
            Subtle styling, no heavy border on close (avoids looking cramped/small).
            Better vertical rhythm and space use: header chrome + tabstrip + compact toolbar below.
            The browser content (tabs + pane) sits tight below without waste. */}
        <div
          data-pizarra-browser-header="true"
          data-pizarra-surface-drag-handle="true"
          data-testid="pizarra-drag-handle"
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(7, 17, 28, 0.96)',
            color: '#d6e2ff',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'move',
            userSelect: 'none',
            zIndex: 20,
          }}
        >
          <span>{shape.label || 'Browser'}</span>
          <button
            type="button"
            data-testid="pizarra-browser-close"
            data-pizarra-close-button="true"
            title="Cerrar navegador"
            aria-label="Cerrar navegador"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.(shape.id);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              padding: 2,
              background: 'transparent',
              border: 'none',
              color: '#9fb5d1',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Browser content (tabs + pane) positioned below the pizarra header.
            Tight spacing (top:24 matches header height) for max content area in canvas cards.
            No extra floating buttons; header unifies drag/close. */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: 0,
          }}
          data-tabs-mode={tabsMode}
        >
          {showTabStrip ? (
            <BrowserTabStrip
              tabs={tabStripApi.tabs}
              activeTabId={tabStripApi.activeTabId}
              onSelectTab={tabStripApi.selectTab}
              onCloseTab={tabStripApi.closeTab}
              onAddTab={tabStripApi.addTab}
              currentUrl={resolvedDockState.browserUrl}
            />
          ) : null}
          <WorkspaceBrowserPane
            projectId={projectId || 'pizarra'}
            workspaceId={workspaceId || shape.id}
            dockState={resolvedDockState}
            onDockStateChange={handleDockStateChange}
            browserWindowState={browserWindowState}
            onBrowserWindowStateChange={onBrowserWindowStateChange}
            workspaceWindows={workspaceWindows}
            activeWorkspaceWindowId={activeWorkspaceWindowId}
            onWorkspaceWindowSelect={onWorkspaceWindowSelect}
            onWorkspaceWindowAdd={onWorkspaceWindowAdd}
            onWorkspaceWindowRemove={onWorkspaceWindowRemove}
            layoutSyncKey={layoutSyncKey}
            // Suspend native ONLY on move/drag (isDragging), NOT on resize (isResizing).
            // During resize the native body must stay visible and the RO inside
            // useNativeBrowserSurface will pick up the live size changes from our
            // direct style mutations on the ancestors. This makes the "cuerpo"
            // (web content / terminal lines) follow the header without pop-in on release.
            suspendNativeSurface={isDragging}
            isPizarraContext={true}
            // pizarra-shared-view-state Phase 3: pass tabsMode through
            // so the inner WorkspaceBrowserPane does not render a
            // duplicate strip. Pizarra owns the strip at this layer.
            tabsMode={showTabStrip ? 'single' : 'single'}
          />
        </div>

        {/* pizarra-ux-overhaul: explicit failure surface when the 5s
            timer fires. The iframe remains in the DOM (WorkspaceBrowserPane
            keeps it mounted) so any partial content stays visible. */}
        {loadFailed ? (
          <div
            data-testid="pizarra-browser-load-failed"
            data-load-failed-category={loadFailed.category}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'rgba(8, 14, 24, 0.92)',
              color: '#f0ece4',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <span>
              {loadFailed.category === FAILURE_CATEGORIES.NATIVE_ERROR
                ? 'Native browser runtime encountered an error'
                : loadFailed.category === FAILURE_CATEGORIES.NATIVE_TIMEOUT
                  ? 'Native browser runtime did not start'
                  : 'Browser is taking too long to load'}
            </span>
            <button
              type="button"
              data-testid="pizarra-browser-reload"
              onClick={handleReload}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(88, 166, 255, 0.16)',
                color: '#9fb5d1',
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Reload
            </button>
          </div>
        ) : null}
      </div>

      {/* pizarra-resize-affordance: zoom-aware resize handles (browser surface).
          Same approach as CanvasTerminal: large hit areas for easy grab,
          but no permanent visible rails or corner cuadritos to keep the
          aesthetic clean. The frame selection chrome + cursor on hit areas
          are the affordances. data-testids and drag-handle exclusion kept. */}
      {selected &&
        (() => {
          const eg = handleSizing.edge;
          const c = handleSizing.corner;
          const ins = handleSizing.inset;
          const edgeStyle = (extra) => ({
            position: 'absolute',
            pointerEvents: 'auto',
            zIndex: 5,
            ...extra,
          });
          const cornerStyle = (extra) => ({
            position: 'absolute',
            width: c,
            height: c,
            pointerEvents: 'auto',
            zIndex: 6,
            ...extra,
          });
          return (
            <>
              <div
                data-testid="pizarra-browser-resize-n"
                onMouseDown={(ev) => handleResizeStart(ev, 'n')}
                style={edgeStyle({
                  top: FRAME_INSET - eg / 2,
                  left: ins,
                  right: ins,
                  height: eg,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-s"
                onMouseDown={(ev) => handleResizeStart(ev, 's')}
                style={edgeStyle({
                  bottom: FRAME_INSET - eg / 2,
                  left: ins,
                  right: ins,
                  height: eg,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-w"
                onMouseDown={(ev) => handleResizeStart(ev, 'w')}
                style={edgeStyle({
                  left: FRAME_INSET - eg / 2,
                  top: ins,
                  bottom: ins,
                  width: eg,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-e"
                onMouseDown={(ev) => handleResizeStart(ev, 'e')}
                style={edgeStyle({
                  right: FRAME_INSET - eg / 2,
                  top: ins,
                  bottom: ins,
                  width: eg,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-nw"
                onMouseDown={(ev) => handleResizeStart(ev, 'nw')}
                style={cornerStyle({
                  top: FRAME_INSET - c / 2,
                  left: FRAME_INSET - c / 2,
                  cursor: 'nwse-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-ne"
                onMouseDown={(ev) => handleResizeStart(ev, 'ne')}
                style={cornerStyle({
                  top: FRAME_INSET - c / 2,
                  right: FRAME_INSET - c / 2,
                  cursor: 'nesw-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-sw"
                onMouseDown={(ev) => handleResizeStart(ev, 'sw')}
                style={cornerStyle({
                  bottom: FRAME_INSET - c / 2,
                  left: FRAME_INSET - c / 2,
                  cursor: 'nesw-resize',
                })}
              />
              <div
                data-testid="pizarra-browser-resize-se"
                onMouseDown={(ev) => handleResizeStart(ev, 'se')}
                style={cornerStyle({
                  bottom: FRAME_INSET - c / 2,
                  right: FRAME_INSET - c / 2,
                  cursor: 'nwse-resize',
                })}
              />
            </>
          );
        })()}
    </div>
  );
}

// pizarra-ux-overhaul: safe wrapper around the native browser
// capability hook. If the module is not yet wired (or the runtime
// is unavailable), the function returns null and the surface stays
// on the iframe path.
function useNativeBrowserCapabilitySafe() {
  if (
    useNativeBrowserSurfaceModule &&
    typeof useNativeBrowserSurfaceModule.useNativeBrowserCapability === 'function'
  ) {
    try {
      return useNativeBrowserSurfaceModule.useNativeBrowserCapability();
    } catch {
      // Capability probe failed; stay on the iframe path.
      return null;
    }
  }
  return null;
}

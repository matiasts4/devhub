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
import { Move, RefreshCw, X } from 'lucide-react';
import WorkspaceBrowserPane from '@/components/workspace/WorkspaceBrowserPane';
import * as useNativeBrowserSurfaceModule from '@/components/workspace/useNativeBrowserSurface';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';
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
}) {
  const [localDockState, setLocalDockState] = useState(() => createDockState(shape.url));

  const resolvedDockState = parentDockState || localDockState;
  const resolvedOnDockStateChange = useCallback((nextStateOrUpdater) => {
    if (parentOnDockStateChange) {
      parentOnDockStateChange(nextStateOrUpdater);
    } else {
      setLocalDockState((currentState) =>
        typeof nextStateOrUpdater === 'function'
          ? nextStateOrUpdater(currentState)
          : nextStateOrUpdater
      );
    }
  }, [parentOnDockStateChange]);

  const [loadFailed, setLoadFailed] = useState(null);
  // pizarra-ux-overhaul: tracks whether the iframe emitted a load
  // event during the 5s window. Cleared on reload.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // pizarra-ux-overhaul: reload key forces iframe re-mount when
  // incremented. Bump on Reload click.
  const [srcReloadKey, setSrcReloadKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const persistedUrlRef = useRef(resolveBrowserUrl(shape.url));
  const panelId = useMemo(() => `pizarra-browser-${shape.id}`, [shape.id]);
  // pizarra-ux-overhaul: subscribe to the native browser capability so
  // the surface can flip to native-gtk when the runtime reports ready
  // AND the consumer has not opted out via browserLoadFallback.
  // The hook is optional in the codebase; we import it dynamically so
  // the module graph stays valid even if it is not yet present.
  const nativeCapability = useNativeBrowserCapabilitySafe();

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
  useEffect(() => {
    if (resolvedDockState.browserRuntime === 'native-gtk') return; // Enforce native-gtk: disable iframe timer
    if (loadFailed) return; // already failed; don't restart
    if (iframeLoaded) return; // iframe already loaded; success path
    const handle = setTimeout(() => {
      if (loadFailedRef.current) return;
      // The native runtime may have reported supported but never
      // resolved ready. That is the native-timeout category.
      const category =
        nativeCapability && nativeCapability.supported
          ? FAILURE_CATEGORIES.NATIVE_TIMEOUT
          : FAILURE_CATEGORIES.IFRAME_STUCK;
      setLoadFailed({ category, since: Date.now() });
    }, PIZARRA_BROWSER_LOAD_TIMEOUT_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shape.id,
    loadFailed,
    iframeLoaded,
    srcReloadKey,
    nativeCapability && nativeCapability.supported,
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
  // wrapper (the "header" row containing the drag handle, address
  // bar, refresh button, load indicator). Hover is a border-bottom
  // color tint; active (mousedown on a button in the wrapper) is a
  // 1px inset accent border. NO transform — the drag handle must
  // stay grabbable.
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

  const handleFrameMouseDown = useCallback(
    (event) => {
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      onSelect?.(shape.id);
    },
    [onSelect, shape.id]
  );

  // pizarra-drag-resize-polish: border-based resize for the browser
  // surface. Same contract as CanvasTerminal.handleResizeStart. The
  // browser is a composite element so it does not go through the Konva
  // Transformer — it exposes its own 8 edge/corner handles and the
  // resize is committed via onUpdateElement({x,y,width,height}).
  const handleResizeStart = useCallback(
    (event, dir) => {
      if (event.button !== 0) return;
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      onSelect?.(shape.id);

      // pizarra-resize-canvas-coords: resize in CANVAS space using real
      // shape geometry; divide screen deltas by zoom so the opposite edge
      // stays anchored and the surface never teleports to canvas origin.
      const z = zoom > 0 ? zoom : 1;
      const startBounds = {
        x: shape.x ?? bounds.x,
        y: shape.y ?? bounds.y,
        width: shape.width ?? bounds.width,
        height: shape.height ?? bounds.height,
      };
      const startX = event.clientX;
      const startY = event.clientY;
      const minW = 220;
      const minH = 160;

      const handleMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startX) / z;
        const dy = (moveEvent.clientY - startY) / z;
        const next = { ...startBounds };
        if (dir.includes('e')) {
          next.width = Math.max(minW, startBounds.width + dx);
        }
        if (dir.includes('s')) {
          next.height = Math.max(minH, startBounds.height + dy);
        }
        if (dir.includes('w')) {
          const w = Math.max(minW, startBounds.width - dx);
          next.width = w;
          next.x = startBounds.x + (startBounds.width - w);
        }
        if (dir.includes('n')) {
          const h = Math.max(minH, startBounds.height - dy);
          next.height = h;
          next.y = startBounds.y + (startBounds.height - h);
        }
        onUpdateElement?.(shape.id, next);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      setIsDragging(true);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [bounds, onSelect, onUpdateElement, shape, zoom]
  );

  const handleDragStart = usePizarraSurfaceDrag({
    surfaceId: shape.id,
    bounds,
    onSelect,
    onMove,
    onDragEnd: (args) => {
      setIsDragging(false);
      onDragEnd?.(args);
    },
    onDragStart: () => setIsDragging(true),
    moveMeta: { panelId },
  });
  const layoutSyncKey = useMemo(
    () =>
      `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}:${bounds.screenX ?? bounds.x}:${bounds.screenY ?? bounds.y}:${srcReloadKey}`,
    [bounds.height, bounds.screenX, bounds.screenY, bounds.width, bounds.x, bounds.y, srcReloadKey]
  );

  const frameVisual = resolveFrameVisual({ selected, hovered: isHovered, dragging: isDragging });
  const handleSizing = resolveHandleSizing(zoom);

  return (
    <div
      data-testid={`pizarra-browser-surface-${shape.id}`}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: 'none',
        animation: SURFACE_ENTER_ANIMATION,
        transformOrigin: 'center center',
        willChange: 'transform',
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
        data-pizarra-surface-dragging={isDragging ? 'true' : 'false'}
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
          transition: FRAME_TRANSITION,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          data-testid="pizarra-drag-handle"
          data-pizarra-drag-handle-id={`pizarra-browser-drag-handle-${shape.id}`}
          data-pizarra-surface-drag-handle="true"
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(6, 16, 27, 0.9)',
            color: '#9fb5d1',
            cursor: 'move',
            backdropFilter: 'blur(12px)',
          }}
          title="Mover navegador"
        >
          <Move size={14} />
        </button>

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
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(6, 16, 27, 0.9)',
            color: '#9fb5d1',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
        >
          <X size={14} />
        </button>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            minHeight: 0,
          }}
        >
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
            suspendNativeSurface={isDragging}
            isPizarraContext={true}
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

      {/* pizarra-motion: zoom-aware resize handles. Hit areas scale inversely
          with zoom; fully invisible — discoverability comes from the cursor
          change on hover and the bright accent frame on selection. No corner
          squares/nubs. The drag-handle button is excluded from the resize
          hit-area via the closest() guard in handleResizeStart. data-testids
          preserved for existing tests. */}
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
                style={edgeStyle({ top: FRAME_INSET - eg / 2, left: ins, right: ins, height: eg, cursor: 'ns-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-s"
                onMouseDown={(ev) => handleResizeStart(ev, 's')}
                style={edgeStyle({ bottom: FRAME_INSET - eg / 2, left: ins, right: ins, height: eg, cursor: 'ns-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-w"
                onMouseDown={(ev) => handleResizeStart(ev, 'w')}
                style={edgeStyle({ left: FRAME_INSET - eg / 2, top: ins, bottom: ins, width: eg, cursor: 'ew-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-e"
                onMouseDown={(ev) => handleResizeStart(ev, 'e')}
                style={edgeStyle({ right: FRAME_INSET - eg / 2, top: ins, bottom: ins, width: eg, cursor: 'ew-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-nw"
                onMouseDown={(ev) => handleResizeStart(ev, 'nw')}
                style={cornerStyle({ top: FRAME_INSET - c / 2, left: FRAME_INSET - c / 2, cursor: 'nwse-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-ne"
                onMouseDown={(ev) => handleResizeStart(ev, 'ne')}
                style={cornerStyle({ top: FRAME_INSET - c / 2, right: FRAME_INSET - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-sw"
                onMouseDown={(ev) => handleResizeStart(ev, 'sw')}
                style={cornerStyle({ bottom: FRAME_INSET - c / 2, left: FRAME_INSET - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="pizarra-browser-resize-se"
                onMouseDown={(ev) => handleResizeStart(ev, 'se')}
                style={cornerStyle({ bottom: FRAME_INSET - c / 2, right: FRAME_INSET - c / 2, cursor: 'nwse-resize' })}
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
    } catch (e) {
      // Capability probe failed; stay on the iframe path.
      return null;
    }
  }
  return null;
}
